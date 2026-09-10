import {
  CalendarNotConfiguredError,
  createCommitteeCalendar,
  deleteCommitteeCalendar,
} from "../_lib/calendar";
import {
  getAuthenticatedUser,
} from "../_lib/auth";
import {
  getDb,
} from "../_lib/db";
import {
  error,
  getClientIp,
  getUserAgent,
  json,
  readJson,
} from "../_lib/http";

type CommitteeType =
  | "MAIN"
  | "SUBCOMMITTEE";

interface CommitteeInput {
  name?: unknown;
  slug?: unknown;
  type?: unknown;
  parentId?: unknown;
  zohoCalendarId?: unknown;
}

function hasManualCalendarId(
  body: CommitteeInput,
): boolean {
  return Object.prototype.hasOwnProperty.call(
    body,
    "zohoCalendarId",
  );
}

function isPrismaUniqueFailure(
  caught: unknown,
): boolean {
  return Boolean(
    typeof caught === "object" &&
      caught !== null &&
      "code" in caught &&
      (
        caught as {
          code?: unknown;
        }
      ).code === "P2002",
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
  try {
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
      request.method ===
      "GET"
    ) {
      const now =
        new Date();

      const committees =
        await getDb()
          .committee
          .findMany({
            where:
              context.user.role ===
              "MEMBER"
                ? {
                    memberships: {
                      some: {
                        userId:
                          context.user.id,
                        startDate: {
                          lte:
                            now,
                        },
                        OR: [
                          {
                            endDate:
                              null,
                          },
                          {
                            endDate: {
                              gte:
                                now,
                            },
                          },
                        ],
                      },
                    },
                  }
                : undefined,
            select: {
              id:
                true,
              name:
                true,
              slug:
                true,
              type:
                true,
              parentId:
                true,
              zohoCalendarId:
                true,
              archivedAt:
                true,
            },
            orderBy: [
              {
                archivedAt:
                  "asc",
              },
              {
                name:
                  "asc",
              },
            ],
          });

      return json({
        success:
          true,
        committees,
      });
    }

    if (
      request.method !==
      "POST"
    ) {
      return error(
        "Method not allowed.",
        405,
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

    let body:
      CommitteeInput;

    try {
      body =
        await readJson<CommitteeInput>(
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

    const name =
      typeof body.name ===
        "string"
        ? body.name.trim()
        : "";

    const slug =
      typeof body.slug ===
        "string"
        ? body.slug
            .trim()
            .toLowerCase()
        : "";

    if (!name) {
      return error(
        "Committee name is required.",
        400,
      );
    }

    if (!slug) {
      return error(
        "Committee short code is required.",
        400,
      );
    }

    if (
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(
        slug,
      )
    ) {
      return error(
        "Committee short code may contain lowercase letters, numbers and hyphens only.",
        400,
      );
    }

    if (
      body.type !== "MAIN" &&
      body.type !==
        "SUBCOMMITTEE"
    ) {
      return error(
        "Committee type must be MAIN or SUBCOMMITTEE.",
        400,
      );
    }

    const type:
      CommitteeType =
        body.type;

    let parentId:
      string | undefined;

    if (
      body.parentId !==
        undefined &&
      body.parentId !==
        null &&
      body.parentId !== ""
    ) {
      if (
        typeof body.parentId !==
        "string"
      ) {
        return error(
          "Parent committee is invalid.",
          400,
        );
      }

      parentId =
        body.parentId.trim() ||
        undefined;
    }

    if (
      type === "MAIN" &&
      parentId
    ) {
      return error(
        "A main committee cannot have a parent committee.",
        400,
      );
    }

    if (
      type ===
        "SUBCOMMITTEE" &&
      !parentId
    ) {
      return error(
        "A subcommittee requires a parent committee.",
        400,
      );
    }

    const db =
      getDb();

    const duplicate =
      await db
        .committee
        .findUnique({
          where: {
            slug,
          },
          select: {
            id:
              true,
          },
        });

    if (duplicate) {
      return error(
        "A committee with that short code already exists.",
        409,
      );
    }

    if (parentId) {
      const parent =
        await db
          .committee
          .findUnique({
            where: {
              id:
                parentId,
            },
          });

      if (!parent) {
        return error(
          "Parent committee not found.",
          404,
        );
      }

      if (
        parent.archivedAt
      ) {
        return error(
          "Archived committees cannot be used as parents.",
          409,
        );
      }
    }

    let provisionedCalendarId:
      string | null =
        null;

    let persisted =
      false;

    try {
      const calendarId =
        await createCommitteeCalendar(
          name,
        );

      provisionedCalendarId =
        calendarId;

      const committee =
        await db.$transaction(
          async (
            tx,
          ) => {
            const created =
              await tx
                .committee
                .create({
                  data: {
                    name,
                    slug,
                    type,
                    parentId,
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
                    "COMMITTEE_CREATED",
                  entityType:
                    "Committee",
                  entityId:
                    created.id,
                  metadata: {
                    name,
                    slug,
                    type,
                    parentId:
                      parentId ??
                      null,
                    zohoCalendarId:
                      calendarId,
                    calendarProvisioned:
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

            return created;
          },
        );

      persisted =
        true;

      return json(
        {
          success:
            true,
          committee,
        },
        201,
      );
    } catch (caught) {
      let cleanupFailed =
        false;

      if (
        provisionedCalendarId &&
        !persisted
      ) {
        try {
          await deleteCommitteeCalendar(
            provisionedCalendarId,
          );
        } catch (
          cleanupError
        ) {
          cleanupFailed =
            true;

          console.error(
            "Failed to clean up provisioned Zoho calendar.",
            cleanupError,
          );
        }
      }

      if (cleanupFailed) {
        return error(
          "Committee creation failed after calendar provisioning. ICT review is required before retrying.",
          500,
        );
      }

      if (
        isPrismaUniqueFailure(
          caught,
        )
      ) {
        return error(
          "A committee with that short code already exists.",
          409,
        );
      }

      if (
        caught instanceof
        CalendarNotConfiguredError
      ) {
        return error(
          "Committee creation is temporarily unavailable because Calendar integration is not configured.",
          503,
        );
      }

      if (
        isZohoCalendarFailure(
          caught,
        )
      ) {
        console.error(
          "Committee calendar provisioning failed.",
          caught,
        );

        return error(
          "We couldn't create the committee calendar. No committee was created.",
          502,
        );
      }

      console.error(
        "Committee creation failed.",
        caught,
      );

      return error(
        "We couldn't create the committee.",
        500,
      );
    }
  } catch (caught) {
    console.error(
      "Committee request failed.",
      caught,
    );

    return error(
      "Unable to process committee request.",
      500,
    );
  }
}