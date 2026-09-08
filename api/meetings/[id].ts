import { db } from "../_lib/db";
import { requireAuth } from "../_lib/auth";
import { canViewCommittee } from "../_lib/permissions";
import {
  CalendarNotConfiguredError,
  deleteCalendarEvent,
  getCalendarEvent,
  restoreCalendarEvent,
  updateCalendarEvent,
} from "../_lib/calendar";
import { writeAuditEvent } from "../_lib/audit";
import { sendMeetingNotification } from "../_lib/email";
import {
  badRequest,
  forbidden,
  json,
  notFound,
  serverError,
  serviceUnavailable,
} from "../_lib/http";

type AgendaInput = {
  title?: unknown;
  description?: unknown;
};

type MeetingPatchInput = {
  title?: unknown;
  description?: unknown;
  startAt?: unknown;
  endAt?: unknown;
  timezone?: unknown;
  location?: unknown;
  agendaItems?: unknown;
};

function asOptionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  return typeof value === "string" ? value.trim() : undefined;
}

function validateAgendaItems(value: unknown) {
  if (!Array.isArray(value) || value.length < 1) {
    throw new Error("At least one agenda item is required.");
  }

  return value.map((item: AgendaInput, index) => {
    const title = typeof item?.title === "string" ? item.title.trim() : "";
    const description =
      typeof item?.description === "string"
        ? item.description.trim()
        : undefined;

    if (!title) {
      throw new Error(`Agenda item ${index + 1} requires a title.`);
    }

    return {
      position: index + 1,
      title,
      description: description || null,
    };
  });
}

function parseDate(value: unknown, field: string): Date | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} must be a valid ISO date.`);
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`${field} must be a valid ISO date.`);
  }

  return date;
}

function getId(request: Request): string | null {
  const pathname = new URL(request.url).pathname;
  const parts = pathname.split("/").filter(Boolean);
  const id = parts.at(-1);

  return id && id !== "meetings" ? id : null;
}

export async function GET(request: Request) {
  const context = await requireAuth(request);

  const id = getId(request);

  if (!id) {
    return badRequest("Meeting ID is required.");
  }

  const meeting = await db.meeting.findUnique({
    where: { id },
    include: {
      committee: true,
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

  if (!meeting) {
    return notFound("Meeting not found.");
  }

  const allowed = await canViewCommittee(context, meeting.committeeId);

  if (!allowed) {
    return forbidden();
  }

  return json({ meeting });
}

export async function PATCH(request: Request) {
  const context = await requireAuth(request);

  if (context.user.role !== "ADMIN") {
    return forbidden();
  }

  const id = getId(request);

  if (!id) {
    return badRequest("Meeting ID is required.");
  }

  let body: MeetingPatchInput;

  try {
    body = (await request.json()) as MeetingPatchInput;
  } catch {
    return badRequest("Invalid JSON body.");
  }

  const meeting = await db.meeting.findUnique({
    where: { id },
    include: {
      committee: true,
    },
  });

  if (!meeting) {
    return notFound("Meeting not found.");
  }

  if (meeting.status !== "SCHEDULED") {
    return badRequest("Only scheduled meetings can be edited.");
  }

  if (!meeting.zohoEventUid || !meeting.committee.zohoCalendarUid) {
    return serviceUnavailable(
      "This meeting is missing its Zoho Calendar event reference.",
    );
  }

  const title =
    body.title === undefined
      ? meeting.title
      : asOptionalString(body.title);

  const description =
    body.description === undefined
      ? meeting.description
      : asOptionalString(body.description) || null;

  const startAt = parseDate(body.startAt, "startAt") ?? meeting.startAt;
  const endAt = parseDate(body.endAt, "endAt") ?? meeting.endAt;

  const timezone =
    body.timezone === undefined
      ? meeting.timezone
      : asOptionalString(body.timezone);

  const location =
    body.location === undefined
      ? meeting.location
      : asOptionalString(body.location);

  if (!title) {
    return badRequest("Title is required.");
  }

  if (!timezone) {
    return badRequest("Timezone is required.");
  }

  if (!location) {
    return badRequest("Location is required.");
  }

  if (endAt <= startAt) {
    return badRequest("End time must be after start time.");
  }

  let agendaItems;

  try {
    agendaItems =
      body.agendaItems === undefined
        ? null
        : validateAgendaItems(body.agendaItems);
  } catch (error) {
    return badRequest(
      error instanceof Error ? error.message : "Invalid agenda.",
    );
  }

  try {
    /*
     * Zoho PUT replaces the event resource. Therefore obtain the complete
     * provider snapshot before changing anything so that a DB failure can
     * restore the provider state exactly rather than reconstructing it from
     * application data.
     */
    const providerSnapshot = await getCalendarEvent(
      meeting.committee.zohoCalendarUid,
      meeting.zohoEventUid,
    );

    const updatedProviderEvent = await updateCalendarEvent(
      meeting.committee.zohoCalendarUid,
      meeting.zohoEventUid,
      {
        title,
        description: description ?? undefined,
        startAt,
        endAt,
        timezone,
        location,
      },
      providerSnapshot.etag,
    );

    try {
      const updatedMeeting = await db.$transaction(async (tx) => {
        if (agendaItems) {
          await tx.agendaItem.deleteMany({
            where: { meetingId: meeting.id },
          });

          await tx.agendaItem.createMany({
            data: agendaItems.map((item) => ({
              meetingId: meeting.id,
              position: item.position,
              title: item.title,
              description: item.description,
            })),
          });
        }

        return tx.meeting.update({
          where: { id: meeting.id },
          data: {
            title,
            description,
            startAt,
            endAt,
            timezone,
            location,
          },
          include: {
            committee: true,
            createdBy: {
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
      });

      let warning: string | undefined;

      try {
        await writeAuditEvent({
          request,
          context,
          action: "MEETING_UPDATED",
          entityType: "Meeting",
          entityId: meeting.id,
          metadata: {
            title,
            startAt: startAt.toISOString(),
            endAt: endAt.toISOString(),
          },
        });
      } catch (auditError) {
        console.error("Meeting update audit failed:", auditError);
        warning =
          "The meeting was updated successfully, but the audit record could not be written.";
      }

      try {
        await sendMeetingNotification({
          type: "UPDATED",
          meetingId: meeting.id,
          title: updatedMeeting.title,
          startAt: updatedMeeting.startAt,
          endAt: updatedMeeting.endAt,
          timezone: updatedMeeting.timezone,
          location: updatedMeeting.location,
        });
      } catch (mailError) {
        console.warn("Meeting update notification failed:", mailError);
        warning =
          warning ??
          "The meeting was updated successfully, but the email notification could not be sent.";
      }

      return json({
        meeting: updatedMeeting,
        providerEventUid:
          updatedProviderEvent.uid ?? meeting.zohoEventUid,
        ...(warning ? { warning } : {}),
      });
    } catch (dbError) {
      console.error("Meeting DB update failed; restoring Zoho event:", dbError);

      try {
        await restoreCalendarEvent(
          meeting.committee.zohoCalendarUid,
          meeting.zohoEventUid,
          providerSnapshot,
        );
      } catch (restoreError) {
        console.error(
          "CRITICAL: Zoho event restoration failed:",
          restoreError,
        );

        try {
          await writeAuditEvent({
            request,
            context,
            action: "MEETING_UPDATE_RECOVERY_FAILED",
            entityType: "Meeting",
            entityId: meeting.id,
            metadata: {
              reason: "database_update_failed_and_provider_restore_failed",
              providerEventUid: meeting.zohoEventUid,
            },
          });
        } catch (auditError) {
          console.error(
            "Recovery-failure audit could not be written:",
            auditError,
          );
        }

        return serverError(
          "The meeting update could not be persisted and the Zoho Calendar event could not be restored. Manual recovery is required.",
        );
      }

      return serverError(
        "The meeting update could not be persisted. The Zoho Calendar event was restored.",
      );
    }
  } catch (error) {
    if (error instanceof CalendarNotConfiguredError) {
      return serviceUnavailable("Zoho Calendar is not configured.");
    }

    console.error("Meeting update failed:", error);
    return serverError("Unable to update meeting.");
  }
}

export async function DELETE(request: Request) {
  const context = await requireAuth(request);

  if (context.user.role !== "ADMIN") {
    return forbidden();
  }

  const id = getId(request);

  if (!id) {
    return badRequest("Meeting ID is required.");
  }

  const meeting = await db.meeting.findUnique({
    where: { id },
    include: {
      committee: true,
    },
  });

  if (!meeting) {
    return notFound("Meeting not found.");
  }

  if (meeting.status === "CANCELLED") {
    return badRequest("Meeting is already cancelled.");
  }

  if (!meeting.zohoEventUid || !meeting.committee.zohoCalendarUid) {
    return serviceUnavailable(
      "This meeting is missing its Zoho Calendar event reference.",
    );
  }

  try {
    /*
     * Keep the complete provider event before deleting it. The schema does not
     * currently contain a PENDING_CANCEL state, so if DB persistence fails
     * after the external deletion, the only safe compensation is recreation.
     */
    const providerSnapshot = await getCalendarEvent(
      meeting.committee.zohoCalendarUid,
      meeting.zohoEventUid,
    );

    await deleteCalendarEvent(
      meeting.committee.zohoCalendarUid,
      meeting.zohoEventUid,
      providerSnapshot.etag,
    );

    try {
      const cancelledMeeting = await db.meeting.update({
        where: {
          id: meeting.id,
        },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
          cancelledById: context.user.id,
        },
        include: {
          committee: true,
          cancelledBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      let warning: string | undefined;

      try {
        await writeAuditEvent({
          request,
          context,
          action: "MEETING_CANCELLED",
          entityType: "Meeting",
          entityId: meeting.id,
          metadata: {
            title: meeting.title,
            zohoEventUid: meeting.zohoEventUid,
          },
        });
      } catch (auditError) {
        console.error("Meeting cancellation audit failed:", auditError);
        warning =
          "The meeting was cancelled successfully, but the audit record could not be written.";
      }

      try {
        await sendMeetingNotification({
          type: "CANCELLED",
          meetingId: meeting.id,
          title: meeting.title,
          startAt: meeting.startAt,
          endAt: meeting.endAt,
          timezone: meeting.timezone,
          location: meeting.location,
        });
      } catch (mailError) {
        console.warn("Meeting cancellation notification failed:", mailError);
        warning =
          warning ??
          "The meeting was cancelled successfully, but the email notification could not be sent.";
      }

      return json({
        meeting: cancelledMeeting,
        ...(warning ? { warning } : {}),
      });
    } catch (dbError) {
      console.error(
        "CRITICAL: Meeting cancellation DB update failed after Zoho deletion:",
        dbError,
      );

      try {
        const recreated = await restoreCalendarEvent(
          meeting.committee.zohoCalendarUid,
          null,
          providerSnapshot,
        );

        const recreatedUid = recreated.uid;

        if (!recreatedUid) {
          throw new Error(
            "Zoho recreation succeeded without returning an event UID.",
          );
        }

        try {
          await db.meeting.update({
            where: { id: meeting.id },
            data: {
              zohoEventUid: recreatedUid,
            },
          });
        } catch (repairError) {
          console.error(
            "CRITICAL: Recreated Zoho event could not be linked back to meeting:",
            repairError,
          );

          try {
            await writeAuditEvent({
              request,
              context,
              action: "MEETING_CANCEL_RECOVERY_FAILED",
              entityType: "Meeting",
              entityId: meeting.id,
              metadata: {
                reason:
                  "database_cancellation_failed_and_provider_recreation_link_failed",
                recreatedZohoEventUid: recreatedUid,
              },
            });
          } catch (auditError) {
            console.error(
              "Cancellation recovery audit could not be written:",
              auditError,
            );
          }

          return serverError(
            "The cancellation could not be persisted and the Zoho Calendar event was recreated but could not be linked back to the meeting. Manual recovery is required.",
          );
        }

        try {
          await writeAuditEvent({
            request,
            context,
            action: "MEETING_CANCEL_ROLLBACK",
            entityType: "Meeting",
            entityId: meeting.id,
            metadata: {
              reason: "database_cancellation_failed",
              recreatedZohoEventUid: recreatedUid,
            },
          });
        } catch (auditError) {
          console.error(
            "Cancellation rollback audit could not be written:",
            auditError,
          );
        }

        return serverError(
          "The meeting cancellation could not be persisted. The Zoho Calendar event was restored.",
        );
      } catch (restoreError) {
        console.error(
          "CRITICAL: Zoho Calendar recreation failed:",
          restoreError,
        );

        try {
          await writeAuditEvent({
            request,
            context,
            action: "MEETING_CANCEL_RECOVERY_FAILED",
            entityType: "Meeting",
            entityId: meeting.id,
            metadata: {
              reason:
                "database_cancellation_failed_and_provider_recreation_failed",
              originalZohoEventUid: meeting.zohoEventUid,
            },
          });
        } catch (auditError) {
          console.error(
            "Cancellation recovery-failure audit could not be written:",
            auditError,
          );
        }

        return serverError(
          "The meeting cancellation could not be persisted and the Zoho Calendar event could not be restored. Manual recovery is required.",
        );
      }
    }
  } catch (error) {
    if (error instanceof CalendarNotConfiguredError) {
      return serviceUnavailable("Zoho Calendar is not configured.");
    }

    console.error("Meeting cancellation failed:", error);
    return serverError("Unable to cancel meeting.");
  }
}
