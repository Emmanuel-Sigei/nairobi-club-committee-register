import { getAuthenticatedUser } from "../_lib/auth";
import { writeAuditEvent } from "../_lib/audit";
import {
  CalendarNotConfiguredError,
  deleteCalendarEvent,
  getCalendarEventSnapshot,
  restoreCalendarEvent,
  updateCalendarEvent,
} from "../_lib/calendar";
import { getDb } from "../_lib/db";
import { error, json, readJson } from "../_lib/http";
import {
  isZohoMailConfigured,
  sendMeetingNotification,
} from "../_lib/email";
import { canViewCommittee } from "../_lib/permissions";

interface MeetingInput {
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

  const trimmed = value.trim();

  return trimmed || undefined;
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
): Array<{
  position: number;
  title: string;
  description?: string;
}> {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("At least one agenda item is required.");
  }

  return value.map((item: AgendaInput, index) => ({
    position: index + 1,
    title: requiredString(
      item?.title,
      `Agenda item ${index + 1} title`,
    ),
    description: optionalString(item?.description),
  }));
}

function isCalendarConfigurationError(caught: unknown): boolean {
  return caught instanceof CalendarNotConfiguredError;
}

async function getMeeting(
  meetingId: string,
) {
  return getDb().meeting.findUnique({
    where: {
      id: meetingId,
    },
    include: {
      committee: {
        select: {
          id: true,
          name: true,
          slug: true,
          type: true,
          zohoCalendarId: true,
        },
      },
      createdBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      cancelledBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      agendaItems: {
        orderBy: {
          position: "asc",
        },
      },
    },
  });
}

async function getMeetingRecipients(
  committeeId: string,
) {
  const memberships = await getDb().membership.findMany({
    where: {
      committeeId,
      startDate: {
        lte: new Date(),
      },
      OR: [
        {
          endDate: null,
        },
        {
          endDate: {
            gte: new Date(),
          },
        },
      ],
      user: {
        isActive: true,
      },
    },
    include: {
      user: {
        select: {
          email: true,
          name: true,
        },
      },
    },
  });

  return memberships.map(({ user }) => user);
}

async function getMeetingResponse(
  request: Request,
  meetingId: string,
) {
  const context = await getAuthenticatedUser(request);

  if (!context) {
    return error("Authentication required.", 401);
  }

  const meeting = await getMeeting(meetingId);

  if (!meeting) {
    return error("Meeting not found.", 404);
  }

  const allowed = await canViewCommittee(
    context,
    meeting.committeeId,
  );

  if (!allowed) {
    return error(
      "You do not have access to this committee.",
      403,
    );
  }

  return json({
    success: true,
    meeting,
  });
}

async function updateMeeting(
  request: Request,
  meetingId: string,
) {
  const context = await getAuthenticatedUser(request);

  if (!context) {
    return error("Authentication required.", 401);
  }

  if (context.user.role !== "ADMIN") {
    return error("Administrator access required.", 403);
  }

  let providerSnapshot:
    | Awaited<
        ReturnType<typeof getCalendarEventSnapshot>
      >
    | undefined;

  try {
    const existing = await getMeeting(meetingId);

    if (!existing) {
      return error("Meeting not found.", 404);
    }

    if (existing.status !== "SCHEDULED") {
      return error(
        "Cancelled meetings cannot be edited.",
        409,
      );
    }

    const calendarId = existing.committee.zohoCalendarId;
    const eventUid = existing.zohoEventUid;

    if (!calendarId || !eventUid) {
      return error(
        "This meeting is not linked to a Zoho Calendar event.",
        409,
        "CALENDAR_NOT_CONFIGURED",
      );
    }

    const body = await readJson<MeetingInput>(request);

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

    providerSnapshot = await getCalendarEventSnapshot(
      calendarId,
      eventUid,
    );

    await updateCalendarEvent({
      calendarId,
      eventUid,
      title,
      description,
      startAt,
      endAt,
      timezone,
      location,
      attendees: providerSnapshot.resource.attendees
        && Array.isArray(providerSnapshot.resource.attendees)
        ? providerSnapshot.resource.attendees
            .map((attendee) => {
              if (
                typeof attendee !== "object" ||
                attendee === null ||
                typeof (attendee as Record<string, unknown>).email !== "string"
              ) {
                return null;
              }

              return {
                email: String(
                  (attendee as Record<string, unknown>).email,
                ),
              };
            })
            .filter(
              (
                attendee,
              ): attendee is { email: string } =>
                attendee !== null,
            )
        : [],
    });

    let updatedMeeting;

    try {
      updatedMeeting = await getDb().$transaction(
        async (tx) => {
          await tx.agendaItem.deleteMany({
            where: {
              meetingId,
            },
          });

          return tx.meeting.update({
            where: {
              id: meetingId,
              status: "SCHEDULED",
            },
            data: {
              title,
              description,
              startAt,
              endAt,
              timezone,
              location,
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
                  zohoCalendarId: true,
                },
              },
              createdBy: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
              cancelledBy: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
              agendaItems: {
                orderBy: {
                  position: "asc",
                },
              },
            },
          });
        },
      );
    } catch (databaseError) {
      console.error(
        "Meeting database update failed after Zoho Calendar update. Attempting provider restoration.",
        databaseError,
      );

      try {
        await restoreCalendarEvent(
          calendarId,
          providerSnapshot.uid,
          providerSnapshot.resource,
        );
      } catch (restoreError) {
        console.error(
          "CRITICAL: Meeting database update failed and Zoho Calendar restoration also failed.",
          restoreError,
        );

        try {
          await writeAuditEvent({
            request,
            context,
            action: "MEETING_UPDATE_RECONCILIATION_REQUIRED",
            entityType: "Meeting",
            entityId: meetingId,
            metadata: {
              calendarId,
              eventUid,
              message:
                restoreError instanceof Error
                  ? restoreError.message
                  : "Unknown provider restoration failure.",
            },
          });
        } catch (auditError) {
          console.error(
            "CRITICAL: Could not record meeting update reconciliation failure.",
            auditError,
          );
        }

        return error(
          "Meeting update failed and the Zoho Calendar event could not be automatically restored. Manual reconciliation is required.",
          500,
          "EXTERNAL_SYNC_RECONCILIATION_REQUIRED",
        );
      }

      return error(
        "Meeting update failed. The Zoho Calendar event was restored.",
        500,
        "MEETING_UPDATE_ROLLED_BACK",
      );
    }

    const warnings: string[] = [];

    try {
      await writeAuditEvent({
        request,
        context,
        action: "MEETING_UPDATED",
        entityType: "Meeting",
        entityId: meetingId,
        metadata: {
          calendarId,
          eventUid,
        },
      });
    } catch (auditError) {
      console.error(
        "Meeting updated but audit event could not be written.",
        auditError,
      );

      warnings.push(
        "Meeting was updated, but the audit event could not be recorded.",
      );
    }

    if (isZohoMailConfigured()) {
      try {
        const recipients = await getMeetingRecipients(
          existing.committeeId,
        );

        await sendMeetingNotification(
          recipients,
          {
            type: "updated",
            title,
            committeeName: existing.committee.name,
            startAt,
            endAt,
            timezone,
            location,
            meetingId,
          },
        );
      } catch (mailError) {
        console.error(
          "Meeting update email notification failed.",
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
      meeting: updatedMeeting,
      warnings,
    });
  } catch (caught) {
    if (isCalendarConfigurationError(caught)) {
      return error(
        caught instanceof Error
          ? caught.message
          : "Zoho Calendar is not configured.",
        503,
        "CALENDAR_NOT_CONFIGURED",
      );
    }

    if (caught instanceof Error) {
      return error(caught.message, 400);
    }

    console.error(
      "Meeting update failed.",
      caught,
    );

    return error(
      "Unable to update meeting.",
      500,
    );
  }
}

async function cancelMeeting(
  request: Request,
  meetingId: string,
) {
  const context = await getAuthenticatedUser(request);

  if (!context) {
    return error("Authentication required.", 401);
  }

  if (context.user.role !== "ADMIN") {
    return error("Administrator access required.", 403);
  }

  let providerSnapshot:
    | Awaited<
        ReturnType<typeof getCalendarEventSnapshot>
      >
    | undefined;

  try {
    const existing = await getMeeting(meetingId);

    if (!existing) {
      return error("Meeting not found.", 404);
    }

    if (existing.status !== "SCHEDULED") {
      return error(
        "Meeting is already cancelled.",
        409,
      );
    }

    const calendarId = existing.committee.zohoCalendarId;
    const eventUid = existing.zohoEventUid;

    if (!calendarId || !eventUid) {
      return error(
        "This meeting is not linked to a Zoho Calendar event.",
        409,
        "CALENDAR_NOT_CONFIGURED",
      );
    }

    providerSnapshot = await getCalendarEventSnapshot(
      calendarId,
      eventUid,
    );

    await deleteCalendarEvent(
      calendarId,
      eventUid,
    );

    let cancelledMeeting;

    try {
      cancelledMeeting = await getDb().meeting.update({
        where: {
          id: meetingId,
          status: "SCHEDULED",
        },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
          cancelledById: context.user.id,
        },
        include: {
          committee: {
            select: {
              id: true,
              name: true,
              slug: true,
              type: true,
              zohoCalendarId: true,
            },
          },
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          cancelledBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          agendaItems: {
            orderBy: {
              position: "asc",
            },
          },
        },
      });
    } catch (databaseError) {
      console.error(
        "Meeting cancellation database update failed after Zoho Calendar deletion. Attempting provider restoration.",
        databaseError,
      );

      try {
        await restoreCalendarEvent(
          calendarId,
          providerSnapshot.uid,
          providerSnapshot.resource,
        );
      } catch (restoreError) {
        console.error(
          "CRITICAL: Meeting cancellation database update failed and Zoho Calendar restoration also failed.",
          restoreError,
        );

        try {
          await writeAuditEvent({
            request,
            context,
            action: "MEETING_CANCEL_RECONCILIATION_REQUIRED",
            entityType: "Meeting",
            entityId: meetingId,
            metadata: {
              calendarId,
              eventUid,
              message:
                restoreError instanceof Error
                  ? restoreError.message
                  : "Unknown provider restoration failure.",
            },
          });
        } catch (auditError) {
          console.error(
            "CRITICAL: Could not record meeting cancellation reconciliation failure.",
            auditError,
          );
        }

        return error(
          "Meeting cancellation failed and the Zoho Calendar event could not be automatically restored. Manual reconciliation is required.",
          500,
          "EXTERNAL_SYNC_RECONCILIATION_REQUIRED",
        );
      }

      return error(
        "Meeting cancellation failed. The Zoho Calendar event was restored.",
        500,
        "MEETING_CANCEL_ROLLED_BACK",
      );
    }

    const warnings: string[] = [];

    try {
      await writeAuditEvent({
        request,
        context,
        action: "MEETING_CANCELLED",
        entityType: "Meeting",
        entityId: meetingId,
        metadata: {
          calendarId,
          eventUid,
          cancelledAt: cancelledMeeting.cancelledAt,
          cancelledById: context.user.id,
        },
      });
    } catch (auditError) {
      console.error(
        "Meeting cancelled but audit event could not be written.",
        auditError,
      );

      warnings.push(
        "Meeting was cancelled, but the audit event could not be recorded.",
      );
    }

    if (isZohoMailConfigured()) {
      try {
        const recipients = await getMeetingRecipients(
          existing.committeeId,
        );

        await sendMeetingNotification(
          recipients,
          {
            type: "cancelled",
            title: existing.title,
            committeeName: existing.committee.name,
            startAt: existing.startAt,
            endAt: existing.endAt,
            timezone: existing.timezone,
            location: existing.location,
            meetingId,
          },
        );
      } catch (mailError) {
        console.error(
          "Meeting cancellation email notification failed.",
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
      meeting: cancelledMeeting,
      warnings,
    });
  } catch (caught) {
    if (isCalendarConfigurationError(caught)) {
      return error(
        caught instanceof Error
          ? caught.message
          : "Zoho Calendar is not configured.",
        503,
        "CALENDAR_NOT_CONFIGURED",
      );
    }

    if (caught instanceof Error) {
      return error(caught.message, 400);
    }

    console.error(
      "Meeting cancellation failed.",
      caught,
    );

    return error(
      "Unable to cancel meeting.",
      500,
    );
  }
}

export default async function handler(
  request: Request,
  context: {
    params:
      | {
          id?: string;
        }
      | Promise<{
          id?: string;
        }>;
  },
): Promise<Response> {
  try {
    const params = await context.params;
    const meetingId = params.id;

    if (!meetingId) {
      return error("Meeting ID is required.", 400);
    }

    if (request.method === "GET") {
      return await getMeetingResponse(
        request,
        meetingId,
      );
    }

    if (request.method === "PATCH") {
      return await updateMeeting(
        request,
        meetingId,
      );
    }

    if (request.method === "DELETE") {
      return await cancelMeeting(
        request,
        meetingId,
      );
    }

    return error("Method not allowed.", 405);
  } catch (caught) {
    console.error(
      "Meeting detail request failed.",
      caught,
    );

    return error(
      "Unable to process meeting request.",
      500,
    );
  }
}