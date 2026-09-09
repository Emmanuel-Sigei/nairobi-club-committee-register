import {
  getAuthenticatedUser,
  hasRole,
} from "../_lib/auth";
import { getDb } from "../_lib/db";
import {
  assertZohoMailConfigured,
  sendInvitationEmail,
} from "../_lib/email";
import {
  error,
  getClientIp,
  getUserAgent,
  json,
  readJson,
} from "../_lib/http";
import {
  generateToken,
  hashToken,
  isValidEmail,
  normalizeEmail,
} from "../_lib/security";

interface MembershipInput {
  committeeId?: unknown;
  role?: unknown;
  startDate?: unknown;
  endDate?: unknown;
}

interface InviteBody {
  name?: unknown;
  email?: unknown;
  role?: unknown;
  memberships?: unknown;
}

const allowedRoles = [
  "MEMBER",
  "ADMIN",
  "EXCO_MANAGEMENT",
] as const;

const allowedMembershipRoles = [
  "CHAIR",
  "SECRETARY",
  "MEMBER",
] as const;

type UserRole =
  (typeof allowedRoles)[number];

type CommitteeRole =
  (typeof allowedMembershipRoles)[number];

interface ParsedMembership {
  committeeId: string;
  role: CommitteeRole;
  startDate: Date;
  endDate: Date | null;
}

function parseDate(
  value: unknown,
  field: string,
): Date {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    throw new Error(
      `${field} is required.`,
    );
  }

  const date = new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    throw new Error(
      `${field} must be a valid date.`,
    );
  }

  return date;
}

function parseMemberships(
  value: unknown,
): ParsedMembership[] {
  if (
    value === undefined ||
    value === null
  ) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error(
      "memberships must be an array.",
    );
  }

  const seen =
    new Set<string>();

  return value.map(
    (
      raw: MembershipInput,
      index,
    ) => {
      if (
        typeof raw?.committeeId !==
          "string" ||
        !raw.committeeId.trim()
      ) {
        throw new Error(
          `Membership ${index + 1}: committeeId is required.`,
        );
      }

      const committeeId =
        raw.committeeId.trim();

      if (
        seen.has(
          committeeId,
        )
      ) {
        throw new Error(
          "A committee can only appear once in the invitation.",
        );
      }

      seen.add(
        committeeId,
      );

      const role =
        typeof raw.role ===
          "string" &&
        allowedMembershipRoles.includes(
          raw.role as CommitteeRole,
        )
          ? (raw.role as CommitteeRole)
          : "MEMBER";

      const startDate =
        parseDate(
          raw.startDate,
          `Membership ${index + 1} startDate`,
        );

      let endDate: Date | null =
        null;

      if (
        raw.endDate !==
          undefined &&
        raw.endDate !==
          null &&
        raw.endDate !== ""
      ) {
        endDate =
          parseDate(
            raw.endDate,
            `Membership ${index + 1} endDate`,
          );

        if (
          endDate <
          startDate
        ) {
          throw new Error(
            `Membership ${index + 1}: endDate cannot be earlier than startDate.`,
          );
        }
      }

      return {
        committeeId,
        role,
        startDate,
        endDate,
      };
    },
  );
}

export default async function handler(
  request: Request,
): Promise<Response> {
  if (
    request.method !== "POST"
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
    !hasRole(
      context,
      ["ADMIN"],
    )
  ) {
    return error(
      "Administrator access required.",
      403,
    );
  }

  let body: InviteBody;

  try {
    body =
      await readJson<InviteBody>(
        request,
      );
  } catch {
    return error(
      "Invalid request body.",
      400,
    );
  }

  if (
    typeof body.name !==
      "string" ||
    body.name.trim().length <
      2 ||
    typeof body.email !==
      "string"
  ) {
    return error(
      "Name and email are required.",
      400,
    );
  }

  const email =
    normalizeEmail(
      body.email,
    );

  const name =
    body.name.trim();

  if (
    !isValidEmail(email)
  ) {
    return error(
      "Invalid email address.",
      400,
    );
  }

  const role: UserRole =
    typeof body.role ===
      "string" &&
    allowedRoles.includes(
      body.role as UserRole,
    )
      ? (body.role as UserRole)
      : "MEMBER";

  let memberships:
    ParsedMembership[];

  try {
    memberships =
      parseMemberships(
        body.memberships,
      );
  } catch (caught) {
    return error(
      caught instanceof Error
        ? caught.message
        : "Invalid memberships.",
      400,
    );
  }

  if (
    role === "MEMBER" &&
    memberships.length === 0
  ) {
    return error(
      "A Member invitation must include at least one committee membership.",
      400,
    );
  }

  try {
    assertZohoMailConfigured();
  } catch {
    return error(
      "Zoho Mail is not configured.",
      503,
    );
  }

  const db =
    getDb();

  const existing =
    await db.user.findUnique({
      where: {
        email,
      },
    });

  if (existing) {
    return error(
      "An account with that email already exists.",
      409,
    );
  }

  if (
    memberships.length > 0
  ) {
    const committees =
      await db.committee.findMany({
        where: {
          id: {
            in: memberships.map(
              (
                membership,
              ) =>
                membership.committeeId,
            ),
          },
        },
        select: {
          id: true,
          archivedAt: true,
        },
      });

    if (
      committees.length !==
      memberships.length
    ) {
      return error(
        "One or more selected committees do not exist.",
        400,
      );
    }

    if (
      committees.some(
        (
          committee,
        ) =>
          committee.archivedAt !==
          null,
      )
    ) {
      return error(
        "Archived committees cannot receive new memberships.",
        409,
      );
    }
  }

  const rawToken =
    generateToken();

  const tokenHash =
    hashToken(
      rawToken,
    );

  const now =
    new Date();

  const expiresAt =
    new Date(
      now.getTime() +
        48 *
          60 *
          60_000,
    );

  const user =
    await db.$transaction(
      async (tx) => {
        const created =
          await tx.user.create({
            data: {
              email,
              name,
              role,
              invitedAt: now,
              memberships: {
                create:
                  memberships.map(
                    (
                      membership,
                    ) => ({
                      committeeId:
                        membership.committeeId,
                      role:
                        membership.role,
                      startDate:
                        membership.startDate,
                      endDate:
                        membership.endDate,
                    }),
                  ),
              },
              oneTimeTokens: {
                create: {
                  purpose:
                    "INVITATION",
                  tokenHash,
                  expiresAt,
                },
              },
            },
          });

        await tx.auditEvent.create({
          data: {
            actorType:
              "USER",
            actorUserId:
              context.user.id,
            action:
              "USER_INVITED",
            entityType:
              "User",
            entityId:
              created.id,
            metadata: {
              invitedEmail:
                email,
              invitedRole:
                role,
              memberships:
                memberships.map(
                  (
                    membership,
                  ) => ({
                    committeeId:
                      membership.committeeId,
                    role:
                      membership.role,
                    startDate:
                      membership.startDate.toISOString(),
                    endDate:
                      membership.endDate?.toISOString() ??
                      null,
                  }),
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

        return created;
      },
    );

  try {
    await sendInvitationEmail(
      email,
      name,
      rawToken,
    );
  } catch {
    /*
     * Invitation delivery failed before the user can use the
     * account. Remove the newly-created invitation atomically.
     * The USER_INVITED audit event must be removed first because
     * its actor/entity history was created inside this transaction
     * solely for the failed invitation.
     */
    await db.$transaction(
      async (tx) => {
        await tx.auditEvent.deleteMany({
          where: {
            action:
              "USER_INVITED",
            entityType:
              "User",
            entityId:
              user.id,
          },
        });

        await tx.oneTimeToken.deleteMany({
          where: {
            userId:
              user.id,
          },
        });

        await tx.membership.deleteMany({
          where: {
            userId:
              user.id,
          },
        });

        await tx.user.delete({
          where: {
            id:
              user.id,
          },
        });
      },
    );

    return error(
      "Invitation could not be sent. Please try again later.",
      503,
    );
  }

  return json({
    success: true,
    userId:
      user.id,
    membershipCount:
      memberships.length,
  });
}