import {
  getAuthenticatedUser,
  hasRole,
} from "../_lib/auth.js";
import { getDb } from "../_lib/db.js";
import {
  assertZohoMailConfigured,
  sendCommitteeAccessEmail,
  sendGovernanceInvitationEmail,
} from "../_lib/email.js";
import {
  isTrustedMutationOrigin,
} from "../_lib/hardening.js";
import {
  error,
  getClientIp,
  getUserAgent,
  json,
  readJson,
} from "../_lib/http.js";
import {
  generateToken,
  hashToken,
  isValidEmail,
  normalizeEmail,
} from "../_lib/security.js";

interface BulkInviteBody {
  committeeId?: unknown;
  emails?: unknown;
  chairEmail?: unknown;
  secretaryEmail?: unknown;
  startDate?: unknown;
  endDate?: unknown;
}

type MembershipRole =
  | "CHAIR"
  | "SECRETARY"
  | "MEMBER";

type ResultStatus =
  | "invitation_sent"
  | "invitation_resent"
  | "invitation_email_failed"
  | "access_granted"
  | "access_email_failed"
  | "already_member"
  | "failed";

interface BulkResult {
  email: string;
  status: ResultStatus;
  message: string;
}

function parseDate(
  value: unknown,
  fieldName: string,
): Date {
  if (
    typeof value !==
      "string" ||
    !value.trim()
  ) {
    throw new Error(
      `${fieldName} is required.`,
    );
  }

  const parsed =
    new Date(
      value,
    );

  if (
    Number.isNaN(
      parsed.getTime(),
    )
  ) {
    throw new Error(
      `${fieldName} is invalid.`,
    );
  }

  return parsed;
}

function normaliseOptionalEmail(
  value: unknown,
): string | null {
  if (
    typeof value !==
      "string" ||
    !value.trim()
  ) {
    return null;
  }

  return normalizeEmail(
    value,
  );
}

function placeholderName(
  email: string,
): string {
  const local =
    email
      .split("@")[0]
      ?.replace(
        /[._-]+/g,
        " ",
      )
      .trim() ?? "";

  const derived =
    local
      .split(/\s+/)
      .filter(Boolean)
      .map(
        (part) =>
          part.charAt(0).toUpperCase() +
          part.slice(1),
      )
      .join(" ");

  return (
    derived.length >= 2
      ? derived
      : "Nairobi Club Member"
  ).slice(
    0,
    120,
  );
}

function roleFor(
  email: string,
  chairEmail: string | null,
  secretaryEmail: string | null,
): MembershipRole {
  if (
    email ===
    chairEmail
  ) {
    return "CHAIR";
  }

  if (
    email ===
    secretaryEmail
  ) {
    return "SECRETARY";
  }

  return "MEMBER";
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

  if (
    !isTrustedMutationOrigin(
      request,
    )
  ) {
    return error(
      "Request origin is not permitted.",
      403,
      "ORIGIN_REJECTED",
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

  const actorUserId =
    context.user.id;

  let body: BulkInviteBody;

  try {
    body =
      await readJson<BulkInviteBody>(
        request,
      );
  } catch {
    return error(
      "Invalid request body.",
      400,
    );
  }

  if (
    typeof body.committeeId !==
      "string" ||
    !body.committeeId.trim()
  ) {
    return error(
      "Committee or subcommittee is required.",
      400,
    );
  }

  if (
    !Array.isArray(
      body.emails,
    )
  ) {
    return error(
      "emails must be an array.",
      400,
    );
  }

  const emails =
    Array.from(
      new Set(
        body.emails
          .filter(
            (
              value,
            ): value is string =>
              typeof value ===
              "string",
          )
          .map(
            (value) =>
              normalizeEmail(
                value,
              ),
          )
          .filter(Boolean),
      ),
    );

  if (
    emails.length ===
    0
  ) {
    return error(
      "Enter at least one email address.",
      400,
    );
  }

  if (
    emails.length >
    50
  ) {
    return error(
      "A maximum of 50 email addresses can be onboarded in one batch.",
      400,
    );
  }

  const invalid =
    emails.filter(
      (email) =>
        !isValidEmail(
          email,
        ),
    );

  if (
    invalid.length >
    0
  ) {
    return error(
      `Invalid email address: ${invalid[0]}`,
      400,
    );
  }

  const chairEmail =
    normaliseOptionalEmail(
      body.chairEmail,
    );

  const secretaryEmail =
    normaliseOptionalEmail(
      body.secretaryEmail,
    );

  if (
    chairEmail &&
    !isValidEmail(
      chairEmail,
    )
  ) {
    return error(
      "Chair email is invalid.",
      400,
    );
  }

  if (
    secretaryEmail &&
    !isValidEmail(
      secretaryEmail,
    )
  ) {
    return error(
      "Secretary email is invalid.",
      400,
    );
  }

  const emailSet =
    new Set(
      emails,
    );

  if (
    chairEmail &&
    !emailSet.has(
      chairEmail,
    )
  ) {
    return error(
      "The Chair must also appear in the member email list.",
      400,
    );
  }

  if (
    secretaryEmail &&
    !emailSet.has(
      secretaryEmail,
    )
  ) {
    return error(
      "The Secretary must also appear in the member email list.",
      400,
    );
  }

  if (
    chairEmail &&
    secretaryEmail &&
    chairEmail ===
      secretaryEmail
  ) {
    return error(
      "The same person cannot be both Chair and Secretary.",
      400,
    );
  }

  let startDate: Date;
  let endDate:
    Date | null =
    null;

  try {
    startDate =
      parseDate(
        body.startDate,
        "Start date",
      );

    if (
      typeof body.endDate ===
        "string" &&
      body.endDate.trim()
    ) {
      endDate =
        parseDate(
          body.endDate,
          "End date",
        );

      if (
        endDate <
        startDate
      ) {
        return error(
          "End date cannot be earlier than start date.",
          400,
        );
      }
    }
  } catch (caught) {
    return error(
      caught instanceof Error
        ? caught.message
        : "Invalid membership dates.",
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

  const committeeId =
    body.committeeId.trim();

  const committee =
    await db.committee.findUnique({
      where: {
        id:
          committeeId,
      },
      select: {
        id: true,
        name: true,
        type: true,
        archivedAt: true,
      },
    });

  if (!committee) {
    return error(
      "Committee or subcommittee was not found.",
      404,
    );
  }

  if (
    committee.archivedAt
  ) {
    return error(
      "Archived committees cannot receive new members.",
      409,
    );
  }

  const committeeName =
    committee.name;

  const committeeType =
    committee.type;

  async function processEmail(
    email: string,
  ): Promise<BulkResult> {
    const requestedRole =
      roleFor(
        email,
        chairEmail,
        secretaryEmail,
      );

    try {
      const existingUser =
        await db.user.findUnique({
          where: {
            email,
          },
        });

      if (
        existingUser &&
        !existingUser.isActive
      ) {
        return {
          email,
          status:
            "failed",
          message:
            "This account exists but is inactive. Review or reactivate it before assigning committee access.",
        };
      }

      let existingMembership =
        null;

      if (existingUser) {
        existingMembership =
          await db.membership.findFirst({
            where: {
              userId:
                existingUser.id,
              committeeId,
              OR: [
                {
                  endDate:
                    null,
                },
                {
                  endDate: {
                    gte:
                      startDate,
                  },
                },
              ],
              ...(
                endDate
                  ? {
                      startDate: {
                        lte:
                          endDate,
                      },
                    }
                  : {}
              ),
            },
            orderBy: {
              startDate:
                "desc",
            },
          });
      }

      /*
       * New account.
       */
      if (!existingUser) {
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

        const created =
          await db.$transaction(
            async (tx) => {
              const user =
                await tx.user.create({
                  data: {
                    email,
                    name:
                      placeholderName(
                        email,
                      ),
                    role:
                      "MEMBER",
                    invitedAt:
                      now,
                  },
                });

              const membership =
                await tx.membership.create({
                  data: {
                    userId:
                      user.id,
                    committeeId,
                    role:
                      requestedRole,
                    startDate,
                    endDate,
                  },
                });

              const token =
                await tx.oneTimeToken.create({
                  data: {
                    userId:
                      user.id,
                    purpose:
                      "INVITATION",
                    tokenHash,
                    expiresAt,
                  },
                });

              await tx.auditEvent.create({
                data: {
                  actorType:
                    "USER",
                  actorUserId:
                    actorUserId,
                  action:
                    "BULK_USER_INVITED",
                  entityType:
                    "User",
                  entityId:
                    user.id,
                  metadata: {
                    invitedEmail:
                      email,
                    committeeId,
                    committeeName:
                      committeeName,
                    membershipId:
                      membership.id,
                    membershipRole:
                      requestedRole,
                    startDate:
                      startDate.toISOString(),
                    endDate:
                      endDate?.toISOString() ??
                      null,
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

              return {
                user,
                token,
              };
            },
          );

        try {
          await sendGovernanceInvitationEmail(
            email,
            "Member",
            rawToken,
            {
              committeeName:
                committeeName,
              committeeRole:
                requestedRole,
            },
          );

          await db.auditEvent.create({
            data: {
              actorType:
                "USER",
              actorUserId:
                actorUserId,
              action:
                "BULK_INVITATION_SENT",
              entityType:
                "User",
              entityId:
                created.user.id,
              metadata: {
                email,
                committeeId,
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

          return {
            email,
            status:
              "invitation_sent",
            message:
              "Account and committee access created. Setup instructions were emailed successfully.",
          };
        } catch {
          const failedAt =
            new Date();

          await db.$transaction([
            db.oneTimeToken.update({
              where: {
                id:
                  created.token.id,
              },
              data: {
                usedAt:
                  failedAt,
              },
            }),

            db.auditEvent.create({
              data: {
                actorType:
                  "USER",
                actorUserId:
                  actorUserId,
                action:
                  "BULK_INVITATION_EMAIL_FAILED",
                entityType:
                  "User",
                entityId:
                  created.user.id,
                metadata: {
                  email,
                  committeeId,
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
            }),
          ]);

          return {
            email,
            status:
              "invitation_email_failed",
            message:
              "Account and committee access were created, but the invitation email failed. Use Resend invitation in Administration.",
          };
        }
      }

      /*
       * Existing account that has not yet completed setup.
       */
      if (
        !existingUser.passwordSetAt
      ) {
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

        const effectiveRole =
          existingMembership?.role ??
          requestedRole;

        const token =
          await db.$transaction(
            async (tx) => {
              if (
                !existingMembership
              ) {
                await tx.membership.create({
                  data: {
                    userId:
                      existingUser.id,
                    committeeId,
                    role:
                      requestedRole,
                    startDate,
                    endDate,
                  },
                });
              }

              await tx.user.update({
                where: {
                  id:
                    existingUser.id,
                },
                data: {
                  invitedAt:
                    now,
                },
              });

              await tx.oneTimeToken.updateMany({
                where: {
                  userId:
                    existingUser.id,
                  purpose:
                    "INVITATION",
                  usedAt:
                    null,
                },
                data: {
                  usedAt:
                    now,
                },
              });

              const createdToken =
                await tx.oneTimeToken.create({
                  data: {
                    userId:
                      existingUser.id,
                    purpose:
                      "INVITATION",
                    tokenHash,
                    expiresAt,
                  },
                });

              await tx.auditEvent.create({
                data: {
                  actorType:
                    "USER",
                  actorUserId:
                    actorUserId,
                  action:
                    "BULK_PENDING_INVITATION_REFRESHED",
                  entityType:
                    "User",
                  entityId:
                    existingUser.id,
                  metadata: {
                    email,
                    committeeId,
                    committeeName:
                      committeeName,
                    membershipAdded:
                      !existingMembership,
                    membershipRole:
                      effectiveRole,
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

              return createdToken;
            },
          );

        try {
          await sendGovernanceInvitationEmail(
            email,
            "Member",
            rawToken,
            {
              committeeName:
                committeeName,
              committeeRole:
                effectiveRole,
            },
          );

          return {
            email,
            status:
              "invitation_resent",
            message:
              existingMembership
                ? "Pending account found. A fresh setup invitation was sent."
                : "Committee access was added and a fresh setup invitation was sent.",
          };
        } catch {
          const failedAt =
            new Date();

          await db.$transaction([
            db.oneTimeToken.update({
              where: {
                id:
                  token.id,
              },
              data: {
                usedAt:
                  failedAt,
              },
            }),

            db.auditEvent.create({
              data: {
                actorType:
                  "USER",
                actorUserId:
                  actorUserId,
                action:
                  "BULK_INVITATION_EMAIL_FAILED",
                entityType:
                  "User",
                entityId:
                  existingUser.id,
                metadata: {
                  email,
                  committeeId,
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
            }),
          ]);

          return {
            email,
            status:
              "invitation_email_failed",
            message:
              "The pending account remains in place, but its new invitation email could not be delivered.",
          };
        }
      }

      /*
       * Existing active member of this committee.
       */
      if (
        existingMembership
      ) {
        return {
          email,
          status:
            "already_member",
          message:
            `Existing account already has an overlapping ${existingMembership.role.toLowerCase()} appointment in this committee.`,
        };
      }

      /*
       * Existing activated user receiving an additional committee.
       */
      const membership =
        await db.$transaction(
          async (tx) => {
            const created =
              await tx.membership.create({
                data: {
                  userId:
                    existingUser.id,
                  committeeId,
                  role:
                    requestedRole,
                  startDate,
                  endDate,
                },
              });

            await tx.auditEvent.create({
              data: {
                actorType:
                  "USER",
                actorUserId:
                  actorUserId,
                action:
                  "BULK_EXISTING_USER_COMMITTEE_ACCESS_ADDED",
                entityType:
                  "Membership",
                entityId:
                  created.id,
                metadata: {
                  email,
                  committeeId,
                  committeeName:
                    committeeName,
                  membershipRole:
                    requestedRole,
                  startDate:
                    startDate.toISOString(),
                  endDate:
                    endDate?.toISOString() ??
                    null,
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
        await sendCommitteeAccessEmail(
          existingUser.email,
          existingUser.name,
          committeeName,
          requestedRole,
        );

        return {
          email,
          status:
            "access_granted",
          message:
            "Existing Governance Portal account granted committee access and notified by email.",
        };
      } catch {
        await db.auditEvent.create({
          data: {
            actorType:
              "USER",
            actorUserId:
              actorUserId,
            action:
              "BULK_COMMITTEE_ACCESS_EMAIL_FAILED",
            entityType:
              "Membership",
            entityId:
              membership.id,
            metadata: {
              email,
              committeeId,
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

        return {
          email,
          status:
            "access_email_failed",
          message:
            "Committee access was added successfully, but the notification email could not be delivered.",
        };
      }
    } catch {
      return {
        email,
        status:
          "failed",
        message:
          "This email address could not be processed. Review the user's existing account and committee appointments before retrying.",
      };
    }
  }

  /*
   * Limit concurrent SMTP/DB work so large committees do not
   * create an excessive connection burst.
   */
  const results:
    BulkResult[] = [];

  const batchSize =
    3;

  for (
    let index = 0;
    index < emails.length;
    index += batchSize
  ) {
    const batch =
      emails.slice(
        index,
        index + batchSize,
      );

    const batchResults =
      await Promise.all(
        batch.map(
          (email) =>
            processEmail(
              email,
            ),
        ),
      );

    results.push(
      ...batchResults,
    );
  }

  const counts:
    Partial<
      Record<
        ResultStatus,
        number
      >
    > = {};

  for (
    const result of
    results
  ) {
    counts[
      result.status
    ] =
      (
        counts[
          result.status
        ] ??
        0
      ) + 1;
  }

  await db.auditEvent.create({
    data: {
      actorType:
        "USER",
      actorUserId:
        actorUserId,
      action:
        "BULK_COMMITTEE_ONBOARDING_COMPLETED",
      entityType:
        "Committee",
      entityId:
        committee.id,
      metadata: {
        committeeName:
          committeeName,
        committeeType:
          committeeType,
        requested:
          emails.length,
        counts,
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

  return json({
    success: true,
    committee: {
      id:
        committee.id,
      name:
        committeeName,
      type:
        committeeType,
    },
    requested:
      emails.length,
    counts,
    results,
  });
}