import {
  getAuthenticatedUser,
} from "../../_lib/auth";
import {
  writeAuditEvent,
} from "../../_lib/audit";
import {
  isCalendarConfigured,
  updateCalendarEvent,
} from "../../_lib/calendar";
import {
  getDb,
} from "../../_lib/db";
import {
  error,
  json,
} from "../../_lib/http";

function idFromRequest(
  request: Request,
): string {
  const parts =
    new URL(
      request.url,
    ).pathname
      .split("/")
      .filter(Boolean);

  return decodeURIComponent(
    parts.at(-2) ?? "",
  );
}

export default async function handler(
  request: Request,
): Promise<Response> {
  if (
    request.method !==
    "POST"
  ) {
    return error(
      "Method not allowed.",
      405,
    );
  }

  const context =
    await getAuthenticatedUser(
      request,
    );

  if (!context) {
    return error(
      "Authentication required.",
      401,
    );
  }

  if (
    context.user.role !==
    "ADMIN"
  ) {
    return error(
      "Administrator access required.",
      403,
    );
  }

  const userId =
    idFromRequest(
      request,
    );

  if (!userId) {
    return error(
      "User id is required.",
      400,
    );
  }

  if (
    userId ===
    context.user.id
  ) {
    return error(
      "You cannot deactivate your own account.",
      409,
    );
  }

  const db =
    getDb();

  const existing =
    await db.user.findUnique({
      where: {
        id: userId,
      },
      include: {
        memberships: {
          select: {
            committeeId: true,
          },
        },
      },
    });

  if (!existing) {
    return error(
      "User not found.",
      404,
    );
  }

  if (
    !existing.isActive
  ) {
    return error(
      "User is already inactive.",
      409,
    );
  }

  const now =
    new Date();

  const committeeIds =
    Array.from(
      new Set(
        existing.memberships.map(
          (
            membership,
          ) =>
            membership.committeeId,
        ),
      ),
    );

  await db.$transaction(
    async (tx) => {
      await tx.user.update({
        where: {
          id: userId,
        },
        data: {
          isActive: false,
          deactivatedAt:
            now,
        },
      });

      await tx.session.updateMany({
        where: {
          userId,
          revokedAt: null,
        },
        data: {
          revokedAt:
            now,
        },
      });

      await tx.membership.updateMany({
        where: {
          userId,
          startDate: {
            lte: now,
          },
          OR: [
            {
              endDate: null,
            },
            {
              endDate: {
                gt: now,
              },
            },
          ],
        },
        data: {
          endDate:
            now,
        },
      });
    },
  );

  const warnings:
    string[] = [];

  let reconciledMeetings =
    0;

  if (
    committeeIds.length >
      0 &&
    isCalendarConfigured()
  ) {
    const futureMeetings =
      await db.meeting.findMany({
        where: {
          committeeId: {
            in: committeeIds,
          },
          status:
            "SCHEDULED",
          startAt: {
            gt: now,
          },
          zohoEventUid: {
            not: null,
          },
          committee: {
            zohoCalendarId: {
              not: null,
            },
          },
        },
        include: {
          committee: {
            select: {
              id: true,
              zohoCalendarId:
                true,
            },
          },
        },
      });

    for (
      const meeting of
      futureMeetings
    ) {
      const calendarId =
        meeting.committee
          .zohoCalendarId;

      const eventUid =
        meeting.zohoEventUid;

      if (
        !calendarId ||
        !eventUid
      ) {
        continue;
      }

      const memberships =
        await db.membership.findMany({
          where: {
            committeeId:
              meeting.committeeId,
            startDate: {
              lte:
                meeting.startAt,
            },
            OR: [
              {
                endDate: null,
              },
              {
                endDate: {
                  gte:
                    meeting.startAt,
                },
              },
            ],
            user: {
              isActive:
                true,
            },
          },
          select: {
            user: {
              select: {
                email:
                  true,
              },
            },
          },
        });

      const attendees =
        Array.from(
          new Set(
            memberships.map(
              (
                membership,
              ) =>
                membership.user.email
                  .trim()
                  .toLowerCase(),
            ),
          ),
        ).map(
          (
            email,
          ) => ({
            email,
          }),
        );

      try {
        await updateCalendarEvent({
          calendarId,
          eventUid,
          title:
            meeting.title,
          description:
            meeting.description ??
            undefined,
          startAt:
            meeting.startAt,
          endAt:
            meeting.endAt,
          timezone:
            meeting.timezone,
          location:
            meeting.location,
          attendees,
        });

        reconciledMeetings +=
          1;
      } catch (caught) {
        console.error(
          "DEACTIVATION_CALENDAR_RECONCILIATION_FAILED",
          caught,
        );

        warnings.push(
          `Calendar attendee reconciliation failed for meeting ${meeting.id}.`,
        );
      }
    }
  } else if (
    committeeIds.length >
      0 &&
    !isCalendarConfigured()
  ) {
    warnings.push(
      "Zoho Calendar is not configured; future event attendee reconciliation is pending.",
    );
  }

  await writeAuditEvent({
    request,
    context,
    action:
      "USER_DEACTIVATED",
    entityType:
      "User",
    entityId:
      userId,
    metadata: {
      membershipsEndedAt:
        now.toISOString(),
      affectedCommittees:
        committeeIds,
      reconciledMeetings,
      reconciliationWarnings:
        warnings.length,
    },
  });

  return json({
    success: true,
    deactivatedAt:
      now,
    reconciledMeetings,
    warnings,
  });
}