import {
  CalendarNotConfiguredError,
  createCommitteeCalendar,
  deleteCommitteeCalendar,
  updateCommitteeCalendar,
} from "../_lib/calendar.js";
import {
  getAuthenticatedUser,
} from "../_lib/auth.js";
import {
  getDb,
} from "../_lib/db.js";
import {
  error,
  getClientIp,
  getUserAgent,
  json,
  readJson,
} from "../_lib/http.js";

interface CommitteePatch {
  name?: unknown;
  zohoCalendarId?: unknown;
  action?: unknown;
}

function idFromRequest(
  request: Request,
): string {
  const url =
    new URL(
      request.url,
    );

  const parts =
    url.pathname
      .split("/")
      .filter(Boolean);

  return decodeURIComponent(
    parts.at(-1) ?? "",
  );
}

function hasManualCalendarId(
  body: CommitteePatch,
): boolean {
  return Object.prototype.hasOwnProperty.call(
    body,
    "zohoCalendarId",
  );
}

function isZohoCalendarFailure(
  caught: unknown,
): boolean {
  return Boolean(
    caught instanceof Error &&
      caught.message.startsWith(
        "Zoho Calendar",
      ),
  );
}

export default async function handler(
  request: Request,
): Promise<Response> {
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

  if (
    request.method !==
    "PATCH"
  ) {
    return error(
      "Method not allowed.",
      405,
    );
  }

  const id =
    idFromRequest(
      request,
    );

  if (!id) {
    return error(
      "Committee id is required.",
      400,
    );
  }

  const db =
    getDb();

  const existing =
    await db
      .committee
      .findUnique({
        where: {
          id,
        },
      });

  if (!existing) {
    return error(
      "Committee not found.",
      404,
    );
  }

  let body:
    CommitteePatch;

  try {
    body =
      await readJson<CommitteePatch>(
        request,
      );
  } catch (caught) {
    return error(
      caught instanceof Error
        ? caught.message
        : "Invalid request.",
      400,
    );
  }

  if (
    hasManualCalendarId(
      body,
    )
  ) {
    return error(
      "Calendar connections are managed automatically.",
      400,
    );
  }

  if (
    body.action !==
      undefined &&
    body.action !==
      "archive"
  ) {
    return error(
      "Unsupported committee action.",
      400,
    );
  }

  if (
    body.action ===
    "archive"
  ) {
    if (
      existing.archivedAt
    ) {
      return error(
        "Committee is already archived.",
        409,
      );
    }

    try {
      const committee =
        await db.$transaction(
          async (
            tx,
          ) => {
            const updated =
              await tx
                .committee
                .update({
                  where: {
                    id,
                  },
                  data: {
                    archivedAt:
                      new Date(),
                  },
                });

            await tx
              .auditEvent
              .create({
                data: {
                  actorType:
                    "USER",
                  actorUserId:
                    context.user.id,
                  action:
                    "COMMITTEE_ARCHIVED",
                  entityType:
                    "Committee",
                  entityId:
                    id,
                  metadata: {
                    zohoCalendarId:
                      existing.zohoCalendarId,
                    calendarPreserved:
                      true,
                  },
                  ipAddress:
                    getClientIp(
                      request,
                    ),
                  userAgent:
                    getUserAgent(
                      request,
                    ),
                },
              });

            return updated;
          },
        );

      return json({
        success:
          true,
        committee,
      });
    } catch (caught) {
      console.error(
        "Committee archive failed.",
        caught,
      );

      return error(
        "We couldn't archive the committee.",
        500,
      );
    }
  }

  if (
    typeof body.name !==
      "string" ||
    !body.name.trim()
  ) {
    return error(
      "Committee name is required.",
      400,
    );
  }

  const name =
    body.name.trim();

  if (
    name ===
    existing.name
  ) {
    return json({
      success:
        true,
      committee:
        existing,
    });
  }

  let createdCalendarId:
    string | null =
      null;

  let renamedExistingCalendar =
    false;

  let rollbackFailed =
    false;

  try {
    let calendarId =
      existing.zohoCalendarId;

    if (calendarId) {
      await updateCommitteeCalendar(
        calendarId,
        name,
      );

      renamedExistingCalendar =
        true;
    } else {
      calendarId =
        await createCommitteeCalendar(
          name,
        );

      createdCalendarId =
        calendarId;
    }

    try {
      const committee =
        await db.$transaction(
          async (
            tx,
          ) => {
            const updated =
              await tx
                .committee
                .update({
                  where: {
                    id,
                  },
                  data: {
                    name,
                    zohoCalendarId:
                      calendarId,
                  },
                });

            await tx
              .auditEvent
              .create({
                data: {
                  actorType:
                    "USER",
                  actorUserId:
                    context.user.id,
                  action:
                    "COMMITTEE_UPDATED",
                  entityType:
                    "Committee",
                  entityId:
                    id,
                  metadata: {
                    previousName:
                      existing.name,
                    name,
                    zohoCalendarId:
                      calendarId,
                    calendarProvisioned:
                      !existing.zohoCalendarId,
                    calendarRenamed:
                      Boolean(
                        existing.zohoCalendarId,
                      ),
                  },
                  ipAddress:
                    getClientIp(
                      request,
                    ),
                  userAgent:
                    getUserAgent(
                      request,
                    ),
                },
              });

            return updated;
          },
        );

      return json({
        success:
          true,
        committee,
      });
    } catch (databaseError) {
      try {
        if (
          createdCalendarId
        ) {
          await deleteCommitteeCalendar(
            createdCalendarId,
          );
        } else if (
          renamedExistingCalendar &&
          existing.zohoCalendarId
        ) {
          await updateCommitteeCalendar(
            existing.zohoCalendarId,
            existing.name,
          );
        }
      } catch (
        rollbackError
      ) {
        rollbackFailed =
          true;

        console.error(
          "Committee Calendar rollback failed.",
          rollbackError,
        );
      }

      if (
        rollbackFailed
      ) {
        throw new Error(
          "Committee update failed and Calendar rollback also failed. ICT review is required.",
          {
            cause:
              databaseError,
          },
        );
      }

      throw databaseError;
    }
  } catch (caught) {
    if (
      caught instanceof
      CalendarNotConfiguredError
    ) {
      return error(
        "Committee changes are temporarily unavailable because Calendar integration is not configured.",
        503,
      );
    }

    if (
      isZohoCalendarFailure(
        caught,
      )
    ) {
      console.error(
        "Committee Calendar update failed.",
        caught,
      );

      return error(
        "We couldn't update the committee calendar. The committee was not changed.",
        502,
      );
    }

    console.error(
      "Committee update failed.",
      caught,
    );

    return error(
      caught instanceof Error &&
        caught.message.includes(
          "ICT review is required",
        )
        ? caught.message
        : "We couldn't update the committee.",
      500,
    );
  }
}