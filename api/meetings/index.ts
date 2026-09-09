import { getAuthenticatedUser } from "../_lib/auth";
import { writeAuditEvent } from "../_lib/audit";
import {
  CalendarNotConfiguredError,
  createCalendarEvent,
  deleteCalendarEvent,
} from "../_lib/calendar";
import { getDb } from "../_lib/db";
import { error, json, readJson } from "../_lib/http";
import {
  isZohoMailConfigured,
  sendMeetingNotification,
} from "../_lib/email";
import {
  createMeetingInAppNotifications,
} from "../_lib/notifications";

interface MeetingInput {
  committeeId?: unknown;
  title?: unknown;
  description?: unknown;
  startAt?: unknown;
  endAt?: unknown;
  timezone?: unknown;
  location?: unknown;
  agendaItems?: unknown;
}

interface AgendaInput {
  title?: unknown;
  description?: unknown;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} is required.`);
  }

  return value.trim();
}

function optionalString(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new Error("Expected a string value.");
  }

  return value.trim();
}

function parseDate(value: unknown, field: string): Date {
  const stringValue = requiredString(value, field);
  const date = new Date(stringValue);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`${field} must be a valid ISO date/time.`);
  }

  return date;
}

function parseAgenda(
  value: unknown,
): Array<{ position: number; title: string; description?: string }> {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("At least one agenda item is required.");
  }

  return value.map((item: AgendaInput, index) => ({
    position: index + 1,
    title: requiredString(item?.title, `Agenda item ${index + 1} title`),
    description: optionalString(item?.description),
  }));
}

async function getAccessibleCommitteeIds(userId: string): Promise<string[]> {
  const now = new Date();

  const memberships = await getDb().membership.findMany({
    where: {
      userId,
      startDate: { lte: now },
      OR: [{ endDate: null }, { endDate: { gte: now } }],
    },
    select: {
      committeeId: true,
    },
  });

  return memberships.map((membership) => membership.committeeId);
}

async function listMeetings(request: Request) {
  const context = await getAuthenticatedUser(request);

  if (!context) {
    return error("Authentication required.", 401);
  }

  const url = new URL(request.url);
  const requestedCommitteeId = url.searchParams.get("committeeId");
  const status = url.searchParams.get("status");

  let committeeIds: string[] | undefined;

  if (context.user.role === "MEMBER") {
    committeeIds = await getAccessibleCommitteeIds(context.user.id);

    if (
      requestedCommitteeId &&
      !committeeIds.includes(requestedCommitteeId)
    ) {
      return error("You do not have access to this committee.", 403);
    }
  } else if (requestedCommitteeId) {
    committeeIds = [requestedCommitteeId];
  }

  const meetings = await getDb().meeting.findMany({
    where: {
      ...(committeeIds ? { committeeId: { in: committeeIds } } : {}),
      ...(status === "SCHEDULED" || status === "CLOSED" || status === "CANCELLED"
        ? { status }
        : {}),
    },
    include: {
      committee: {
        select: {
          id: true,
          name: true,
          slug: true,
          type: true,
        },
      },
      agendaItems: {
        orderBy: {
          position: "asc",
        },
      },
    },
    orderBy: {
      startAt: "asc",
    },
  });

  return json({
    success: true,
    meetings,
  });
}

async function createMeeting(request: Request) {
  const context = await getAuthenticatedUser(request);

  if (!context) {
    return error("Authentication required.", 401);
  }

  if (context.user.role !== "ADMIN") {
    return error("Administrator access required.", 403);
  }

  let zohoEventUid: string | undefined;
  let calendarId: string | undefined;
  let meetingCreated = false;

  try {
    const body = await readJson<MeetingInput>(request);

    const committeeId = requiredString(body.committeeId, "committeeId");
    const title = requiredString(body.title, "title");
    const description = optionalString(body.description);
    const startAt = parseDate(body.startAt, "startAt");
    const endAt = parseDate(body.endAt, "endAt");
    const timezone =
      optionalString(body.timezone) ?? "Africa/Nairobi";
    const location = requiredString(body.location, "location");
    const agendaItems = parseAgenda(body.agendaItems);

    if (endAt <= startAt) {
      throw new Error("endAt must be later than startAt.");
    }

    const committee = await getDb().committee.findUnique({
      where: {
        id: committeeId,
      },
      include: {
        memberships: {
          where: {
            startDate: { lte: startAt },
            OR: [{ endDate: null }, { endDate: { gte: startAt } }],
            user: {
              isActive: true,
            },
          },
          include: {
            user: {
              select: {
                id: true,
                email: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!committee) {
      return error("Committee not found.", 404);
    }

    if (committee.archivedAt) {
      return error(
        "Archived committees cannot receive new meetings.",
        409,
      );
    }

    if (!committee.zohoCalendarId) {
      return error(
        "This committee has no Zoho Calendar configured.",
        409,
        "CALENDAR_NOT_CONFIGURED",
      );
    }

    calendarId = committee.zohoCalendarId;

    try {
      zohoEventUid = await createCalendarEvent({
        calendarId,
        title,
        description,
        startAt,
        endAt,
        timezone,
        location,
        attendees: committee.memberships.map(({ user }) => ({
          email: user.email,
        })),
      });
    } catch (calendarError) {
      if (calendarError instanceof CalendarNotConfiguredError) {
        return error(
          calendarError.message,
          503,
          "CALENDAR_NOT_CONFIGURED",
        );
      }

      throw calendarError;
    }

    const meeting = await getDb().meeting.create({
      data: {
        committeeId,
        title,
        description,
        startAt,
        endAt,
        timezone,
        location,
        zohoEventUid,
        createdById: context.user.id,
        agendaItems: {
          create: agendaItems,
        },
      },
      include: {
        committee: {
          select: {
            id: true,
            name: true,
            slug: true,
            type: true,
          },
        },
        agendaItems: {
          orderBy: {
            position: "asc",
          },
        },
      },
    });

    meetingCreated = true;

    const warnings: string[] = [];

    try {
      await writeAuditEvent({
        request,
        context,
        action: "MEETING_CREATED",
        entityType: "Meeting",
        entityId: meeting.id,
        metadata: {
          committeeId,
          zohoEventUid,
        },
      });
    } catch (auditError) {
      console.error(
        "Meeting created but audit event could not be written.",
        auditError,
      );

      warnings.push(
        "Meeting was created, but the audit event could not be recorded.",
      );
    }

    try {
      await createMeetingInAppNotifications({
        recipientUserIds:
          committee.memberships.map(
            ({ user }) =>
              user.id,
          ),
        type:
          "scheduled",
        meetingId:
          meeting.id,
        meetingTitle:
          title,
        committeeName:
          committee.name,
      });
    } catch (notificationError) {
      console.error(
        "Meeting created but in-app notifications could not be written.",
        notificationError,
      );

      warnings.push(
        "Meeting was created, but in-app notifications could not be recorded.",
      );
    }

    if (isZohoMailConfigured()) {
      try {
        await sendMeetingNotification(
          committee.memberships.map(({ user }) => user),
          {
            type: "scheduled",
            title,
            committeeName: committee.name,
            startAt,
            endAt,
            timezone,
            location,
            meetingId: meeting.id,
          },
        );
      } catch (mailError) {
        console.error(
          "Meeting creation email notification failed.",
          mailError,
        );

        warnings.push(
          "Meeting email notification could not be delivered.",
        );
      }
    } else {
      warnings.push(
        "Zoho Mail is not configured; meeting email notification was skipped.",
      );
    }

    return json({
      success: true,
      meeting,
      warnings,
    });
  } catch (caught) {
    if (zohoEventUid && calendarId && !meetingCreated) {
      try {
        await deleteCalendarEvent(calendarId, zohoEventUid);
      } catch (compensationError) {
        console.error(
          "CRITICAL: Meeting database creation failed and Zoho Calendar compensation also failed.",
          compensationError,
        );

        try {
          await writeAuditEvent({
            request,
            context,
            action: "MEETING_CREATE_COMPENSATION_FAILED",
            entityType: "Meeting",
            metadata: {
              calendarId,
              zohoEventUid,
              message:
                compensationError instanceof Error
                  ? compensationError.message
                  : "Unknown compensation failure.",
            },
          });
        } catch (auditError) {
          console.error(
            "CRITICAL: Could not record meeting creation compensation failure.",
            auditError,
          );
        }

        return error(
          "Meeting creation failed and the Zoho Calendar event could not be automatically removed. Manual reconciliation is required.",
          500,
          "EXTERNAL_SYNC_RECONCILIATION_REQUIRED",
        );
      }
    }

    if (caught instanceof CalendarNotConfiguredError) {
      return error(
        caught.message,
        503,
        "CALENDAR_NOT_CONFIGURED",
      );
    }

    if (caught instanceof Error) {
      return error(caught.message, 400);
    }

    return error("Unable to create meeting.", 500);
  }
}

export default async function handler(
  request: Request,
): Promise<Response> {
  try {
    if (request.method === "GET") {
      return await listMeetings(request);
    }

    if (request.method === "POST") {
      return await createMeeting(request);
    }

    return error("Method not allowed.", 405);
  } catch (caught) {
    console.error("Meeting collection request failed.", caught);
    return error("Unable to process meeting request.", 500);
  }
}
