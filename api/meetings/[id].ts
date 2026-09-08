import { getAuthenticatedUser } from "../_lib/auth";
import { writeAuditEvent } from "../_lib/audit";
import { updateCalendarEvent, deleteCalendarEvent, CalendarNotConfiguredError } from "../_lib/calendar";
import { getDb } from "../_lib/db";
import { error, json, readJson } from "../_lib/http";
import { isZohoMailConfigured, sendMeetingNotification } from "../_lib/email";

interface MeetingUpdateInput {
  title?: unknown;
  description?: unknown;
  startAt?: unknown;
  endAt?: unknown;
  timezone?: unknown;
  location?: unknown;
  agendaItems?: unknown;
}

function meetingId(request: Request): string | undefined {
  const segments = new URL(request.url).pathname.split("/").filter(Boolean);
  const meetingsIndex = segments.indexOf("meetings");
  const id = meetingsIndex >= 0 ? segments[meetingsIndex + 1] : undefined;
  return id && id !== "[id]" ? decodeURIComponent(id) : undefined;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} is required.`);
  }
  return value.trim();
}

function optionalString(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new Error("Expected a string value.");
  return value.trim();
}

function parseDate(value: unknown, field: string): Date {
  const date = new Date(requiredString(value, field));
  if (Number.isNaN(date.getTime())) throw new Error(`${field} must be a valid ISO date/time.`);
  return date;
}

function parseAgenda(value: unknown): Array<{ position: number; title: string; description?: string }> {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("At least one agenda item is required.");
  }

  return value.map((item, index) => {
    const candidate = item as { title?: unknown; description?: unknown };
    return {
      position: index + 1,
      title: requiredString(candidate?.title, `Agenda item ${index + 1} title`),
      description: optionalString(candidate?.description),
    };
  });
}

async function getMeeting(id: string) {
  return getDb().meeting.findUnique({
    where: { id },
    include: {
      committee: {
        include: {
          memberships: {
            where: {
              startDate: { lte: new Date() },
              OR: [{ endDate: null }, { endDate: { gte: new Date() } }],
              user: { isActive: true },
            },
            include: { user: { select: { email: true, name: true } } },
          },
        },
      },
      agendaItems: { orderBy: { position: "asc" } },
    },
  });
}

async function view(request: Request, id: string) {
  const context = await getAuthenticatedUser(request);
  if (!context) return error("Authentication required.", 401);

  const meeting = await getMeeting(id);
  if (!meeting) return error("Meeting not found.", 404);

  if (context.user.role === "MEMBER") {
    const now = new Date();
    const membership = await getDb().membership.findFirst({
      where: {
        userId: context.user.id,
        committeeId: meeting.committeeId,
        startDate: { lte: now },
        OR: [{ endDate: null }, { endDate: { gte: now } }],
      },
    });
    if (!membership) return error("You do not have access to this meeting.", 403);
  }

  return json({ success: true, meeting });
}

async function update(request: Request, id: string) {
  const context = await getAuthenticatedUser(request);
  if (!context) return error("Authentication required.", 401);
  if (context.user.role !== "ADMIN") return error("Administrator access required.", 403);

  const meeting = await getMeeting(id);
  if (!meeting) return error("Meeting not found.", 404);
  if (meeting.status === "CANCELLED") return error("Cancelled meetings cannot be edited.", 409);
  if (!meeting.zohoEventUid || !meeting.committee.zohoCalendarId) {
    return error("Meeting is missing its Zoho Calendar reference.", 409);
  }

  try {
    const body = await readJson<MeetingUpdateInput>(request);
    const title = requiredString(body.title, "title");
    const description = optionalString(body.description);
    const startAt = parseDate(body.startAt, "startAt");
    const endAt = parseDate(body.endAt, "endAt");
    const timezone = optionalString(body.timezone) ?? meeting.timezone;
    const location = requiredString(body.location, "location");
    const agendaItems = parseAgenda(body.agendaItems);

    if (endAt <= startAt) throw new Error("endAt must be later than startAt.");

    await updateCalendarEvent({
      calendarId: meeting.committee.zohoCalendarId,
      eventUid: meeting.zohoEventUid,
      title,
      description,
      startAt,
      endAt,
      timezone,
      location,
      attendees: meeting.committee.memberships.map(({ user }) => ({ email: user.email })),
    });

    try {
      const updated = await getDb().$transaction(async (tx) => {
        await tx.agendaItem.deleteMany({ where: { meetingId: meeting.id } });
        return tx.meeting.update({
          where: { id: meeting.id },
          data: {
            title,
            description,
            startAt,
            endAt,
            timezone,
            location,
            agendaItems: { create: agendaItems },
          },
          include: {
            committee: { select: { id: true, name: true, slug: true, type: true } },
            agendaItems: { orderBy: { position: "asc" } },
          },
        });
      });

      await writeAuditEvent({
        request,
        context,
        action: "MEETING_UPDATED",
        entityType: "Meeting",
        entityId: meeting.id,
        metadata: { committeeId: meeting.committeeId, zohoEventUid: meeting.zohoEventUid },
      });

      const warnings: string[] = [];
      if (isZohoMailConfigured()) {
        try {
          await sendMeetingNotification(meeting.committee.memberships.map(({ user }) => user), {
            type: "updated",
            title,
            committeeName: meeting.committee.name,
            startAt,
            endAt,
            timezone,
            location,
            meetingId: meeting.id,
          });
        } catch {
          warnings.push("Meeting update email notification could not be delivered.");
        }
      } else {
        warnings.push("Zoho Mail is not configured; meeting update email notification was skipped.");
      }

      return json({ success: true, meeting: updated, warnings });
    } catch (databaseError) {
      await updateCalendarEvent({
        calendarId: meeting.committee.zohoCalendarId,
        eventUid: meeting.zohoEventUid,
        title: meeting.title,
        description: meeting.description ?? undefined,
        startAt: meeting.startAt,
        endAt: meeting.endAt,
        timezone: meeting.timezone,
        location: meeting.location,
        attendees: meeting.committee.memberships.map(({ user }) => ({ email: user.email })),
      }).catch(() => undefined);
      throw databaseError;
    }
  } catch (caught) {
    if (caught instanceof CalendarNotConfiguredError) {
      return error(caught.message, 503, "CALENDAR_NOT_CONFIGURED");
    }
    if (caught instanceof Error) return error(caught.message, 400);
    return error("Unable to update meeting.", 500);
  }
}

async function cancel(request: Request, id: string) {
  const context = await getAuthenticatedUser(request);
  if (!context) return error("Authentication required.", 401);
  if (context.user.role !== "ADMIN") return error("Administrator access required.", 403);

  const meeting = await getMeeting(id);
  if (!meeting) return error("Meeting not found.", 404);
  if (meeting.status === "CANCELLED") return error("Meeting is already cancelled.", 409);
  if (!meeting.zohoEventUid || !meeting.committee.zohoCalendarId) {
    return error("Meeting is missing its Zoho Calendar reference.", 409);
  }

  try {
    await deleteCalendarEvent(meeting.committee.zohoCalendarId, meeting.zohoEventUid);

    const cancelled = await getDb().meeting.update({
      where: { id: meeting.id },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelledById: context.user.id,
      },
      include: {
        committee: { select: { id: true, name: true, slug: true, type: true } },
        agendaItems: { orderBy: { position: "asc" } },
      },
    });

    await writeAuditEvent({
      request,
      context,
      action: "MEETING_CANCELLED",
      entityType: "Meeting",
      entityId: meeting.id,
      metadata: { committeeId: meeting.committeeId, zohoEventUid: meeting.zohoEventUid },
    });

    const warnings: string[] = [];
    if (isZohoMailConfigured()) {
      try {
        await sendMeetingNotification(meeting.committee.memberships.map(({ user }) => user), {
          type: "cancelled",
          title: meeting.title,
          committeeName: meeting.committee.name,
          startAt: meeting.startAt,
          endAt: meeting.endAt,
          timezone: meeting.timezone,
          location: meeting.location,
          meetingId: meeting.id,
        });
      } catch {
        warnings.push("Meeting cancellation email notification could not be delivered.");
      }
    } else {
      warnings.push("Zoho Mail is not configured; meeting cancellation email notification was skipped.");
    }

    return json({ success: true, meeting: cancelled, warnings });
  } catch (caught) {
    if (caught instanceof CalendarNotConfiguredError) {
      return error(caught.message, 503, "CALENDAR_NOT_CONFIGURED");
    }
    console.error("Meeting cancellation failed.", caught);
    return error("Unable to cancel meeting.", 500);
  }
}

export default async function handler(request: Request): Promise<Response> {
  const id = meetingId(request);
  if (!id) return error("Meeting id is required.", 400);

  try {
    if (request.method === "GET") return await view(request, id);
    if (request.method === "PATCH") return await update(request, id);
    if (request.method === "DELETE") return await cancel(request, id);
    return error("Method not allowed.", 405);
  } catch (caught) {
    console.error("Meeting item request failed.", caught);
    return error("Unable to process meeting request.", 500);
  }
}
