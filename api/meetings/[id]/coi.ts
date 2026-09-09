import { getAuthenticatedUser } from "../../_lib/auth";
import { writeAuditEvent } from "../../_lib/audit";
import {
  currentAttendanceStatus,
} from "../../_lib/attendance-current";
import { getDb } from "../../_lib/db";
import {
  isZohoMailConfigured,
  sendCoiCorrectionNotification,
} from "../../_lib/email";
import { error, json, readJson } from "../../_lib/http";
import { canViewCommittee } from "../../_lib/permissions";

type COIStatus =
  | "NO_CONFLICT"
  | "CONFLICT_DECLARED"
  | "DECLARATION_NOT_SUBMITTED";

interface COIInput {
  action?: unknown;
  userId?: unknown;
  status?: unknown;
  interestTypes?: unknown;
  details?: unknown;
  agendaItemIds?: unknown;
  recusalIntent?: unknown;
  correctionReason?: unknown;
}

function optionalString(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new Error("Value must be a string.");
  return value.trim() || undefined;
}

function parseStatus(value: unknown): COIStatus {
  if (
    value === "NO_CONFLICT" ||
    value === "CONFLICT_DECLARED" ||
    value === "DECLARATION_NOT_SUBMITTED"
  ) {
    return value;
  }

  throw new Error("A valid conflict-of-interest status is required.");
}

function parseInterestTypes(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new Error("At least one conflict-of-interest type is required.");
  }

  const values = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);

  if (values.length === 0) {
    throw new Error("At least one conflict-of-interest type is required.");
  }

  return Array.from(new Set(values));
}

function parseAgendaItemIds(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new Error("Agenda references must be an array.");
  }

  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function parseBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${fieldName} must be true or false.`);
  }

  return value;
}

async function getMeeting(meetingId: string) {
  return getDb().meeting.findUnique({
    where: { id: meetingId },
    include: {
      committee: {
        select: {
          id: true,
          name: true,
        },
      },
      agendaItems: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          position: true,
          title: true,
        },
      },
    },
  });
}

async function isEligibleMember(
  meeting: NonNullable<Awaited<ReturnType<typeof getMeeting>>>,
  userId: string,
) {
  return Boolean(
    await getDb().membership.findFirst({
      where: {
        userId,
        committeeId: meeting.committeeId,
        startDate: { lte: meeting.startAt },
        OR: [{ endDate: null }, { endDate: { gte: meeting.startAt } }],
        user: {
          OR: [
            { isActive: true },
            { deactivatedAt: { gte: meeting.startAt } },
          ],
        },
      },
    }),
  );
}

async function isChairForMeeting(
  meeting: NonNullable<Awaited<ReturnType<typeof getMeeting>>>,
  userId: string,
) {
  return Boolean(
    await getDb().membership.findFirst({
      where: {
        userId,
        committeeId: meeting.committeeId,
        role: "CHAIR",
        startDate: { lte: meeting.startAt },
        OR: [{ endDate: null }, { endDate: { gte: meeting.startAt } }],
        user: {
          OR: [
            { isActive: true },
            { deactivatedAt: { gte: meeting.startAt } },
          ],
        },
      },
    }),
  );
}

async function isPresent(
  meetingId: string,
  userId: string,
) {
  const attendance =
    await getDb().meetingAttendance.findUnique({
      where: {
        meetingId_userId: {
          meetingId,
          userId,
        },
      },
      include: {
        corrections: {
          orderBy: {
            createdAt:
              "desc",
          },
          take: 1,
        },
      },
    });

  return (
    attendance !== null &&
    currentAttendanceStatus(
      attendance,
    ) === "PRESENT"
  );
}

function validateAgendaReferences(
  meeting: NonNullable<Awaited<ReturnType<typeof getMeeting>>>,
  agendaItemIds: string[],
) {
  const validIds = new Set(meeting.agendaItems.map((item) => item.id));
  const invalid = agendaItemIds.filter((id) => !validIds.has(id));

  if (invalid.length > 0) {
    throw new Error(
      "One or more selected agenda references do not belong to this meeting.",
    );
  }
}

async function getViewerScope(request: Request, meetingId: string) {
  const context = await getAuthenticatedUser(request);

  if (!context) {
    return {
      context: null,
      meeting: null,
      response: error("Authentication required.", 401),
    };
  }

  const meeting = await getMeeting(meetingId);

  if (!meeting) {
    return {
      context,
      meeting: null,
      response: error("Meeting not found.", 404),
    };
  }

  if (!(await canViewCommittee(context, meeting.committeeId))) {
    return {
      context,
      meeting,
      response: error("You do not have access to this committee.", 403),
    };
  }

  return {
    context,
    meeting,
    response: null,
  };
}

async function getRegister(request: Request, meetingId: string) {
  const scope = await getViewerScope(request, meetingId);
  if (scope.response) return scope.response;

  const context = scope.context!;
  const meeting = scope.meeting!;

  const memberships = await getDb().membership.findMany({
    where: {
      committeeId: meeting.committeeId,
      startDate: { lte: meeting.startAt },
      OR: [{ endDate: null }, { endDate: { gte: meeting.startAt } }],
        user: {
          OR: [
            { isActive: true },
            { deactivatedAt: { gte: meeting.startAt } },
          ],
        },
    },
    select: {
      userId: true,
      role: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
    orderBy: {
      user: {
        name: "asc",
      },
    },
  });

  const uniqueMemberships = new Map<
    string,
    (typeof memberships)[number]
  >();

  for (const membership of memberships) {
    uniqueMemberships.set(membership.userId, membership);
  }

  const eligible = Array.from(uniqueMemberships.values());

  const declarations =
    await getDb().meetingConflictOfInterest.findMany({
      where: {
        meetingId,
      },
      include: {
        revisions: {
          orderBy: {
            createdAt: "desc",
          },
          take: 1,
        },
      },
    });

  const declarationByUser = new Map(
    declarations.map((declaration) => [
      declaration.userId,
      declaration,
    ]),
  );

  const attendance =
    await getDb().meetingAttendance.findMany({
      where: {
        meetingId,
      },
      include: {
        corrections: {
          orderBy: {
            createdAt:
              "desc",
          },
          take: 1,
        },
      },
    });

  const attendanceByUser =
    new Map(
      attendance.map(
        (record) => [
          record.userId,
          currentAttendanceStatus(
            record,
          ),
        ],
      ),
    );

  const isAdmin = context.user.role === "ADMIN";
  const isExco = context.user.role === "EXCO_MANAGEMENT";
  const isChair =
    context.user.role === "MEMBER" &&
    (await isChairForMeeting(meeting, context.user.id));
  const canViewFullRegister = isAdmin || isExco || isChair;

  const rows = eligible
    .filter((membership) => {
      if (canViewFullRegister) return true;
      return membership.userId === context.user.id;
    })
    .map((membership) => {
      const declaration =
        declarationByUser.get(membership.userId);
      const revision =
        declaration?.revisions[0] ?? null;

      return {
        user: {
          id: membership.user.id,
          name: membership.user.name,
          email: membership.user.email,
          membershipRole: membership.role,
        },
        attendanceStatus:
          attendanceByUser.get(membership.user.id) ?? null,
        declaration:
          declaration && revision
            ? {
                id: declaration.id,
                status: revision.status,
                source: revision.source,
                revisionKind: revision.revisionKind,
                interestTypes: revision.interestTypes,
                details: revision.details,
                agendaItemIds: revision.agendaItemIds,
                recusalIntent: revision.recusalIntent,
                correctionReason: revision.correctionReason,
                declaredAt: revision.createdAt,
                createdAt: declaration.createdAt,
              }
            : null,
      };
    });

  return json({
    success: true,
    meeting: {
      id: meeting.id,
      title: meeting.title,
      status: meeting.status,
      startAt: meeting.startAt,
      endAt: meeting.endAt,
      committeeId: meeting.committeeId,
      committeeName: meeting.committee.name,
      agendaItems: meeting.agendaItems,
    },
    viewer: {
      userId: context.user.id,
      role: context.user.role,
      canViewFullRegister,
      isChair,
    },
    declarations: rows,
  });
}

async function createDeclaration(
  request: Request,
  context: NonNullable<
    Awaited<ReturnType<typeof getAuthenticatedUser>>
  >,
  meeting: NonNullable<
    Awaited<ReturnType<typeof getMeeting>>
  >,
  targetUserId: string,
  source: "SELF" | "ADMIN",
  status: "NO_CONFLICT" | "CONFLICT_DECLARED",
  body: COIInput,
) {
  if (!(await isEligibleMember(meeting, targetUserId))) {
    return error(
      "The selected user was not an eligible committee member for this meeting.",
      400,
    );
  }

  if (!(await isPresent(meeting.id, targetUserId))) {
    return error(
      "The selected member must be recorded as present before the COI declaration can be submitted.",
      409,
    );
  }

  const existing =
    await getDb().meetingConflictOfInterest.findUnique({
      where: {
        meetingId_userId: {
          meetingId: meeting.id,
          userId: targetUserId,
        },
      },
    });

  if (existing) {
    return error(
      "A conflict-of-interest declaration already exists for this meeting.",
      409,
    );
  }

  let interestTypes: string[] = [];
  let details: string | undefined;
  let agendaItemIds: string[] = [];
  let recusalIntent: boolean | undefined;

  if (status === "CONFLICT_DECLARED") {
    interestTypes = parseInterestTypes(body.interestTypes);
    details = optionalString(body.details);

    if (!details) {
      return error(
        "Details are required when a conflict is declared.",
        400,
      );
    }

    agendaItemIds = parseAgendaItemIds(body.agendaItemIds);
    validateAgendaReferences(meeting, agendaItemIds);
    recusalIntent = parseBoolean(
      body.recusalIntent,
      "Recusal intent",
    );
  }

  const declaration =
    await getDb().meetingConflictOfInterest.create({
      data: {
        meetingId: meeting.id,
        userId: targetUserId,
        revisions: {
          create: {
            status,
            source,
            revisionKind: "INITIAL",
            interestTypes,
            details: details ?? null,
            agendaItemIds,
            recusalIntent:
              status === "CONFLICT_DECLARED"
                ? recusalIntent
                : null,
            createdById: context.user.id,
          },
        },
      },
    });

  await writeAuditEvent({
    request,
    context,
    action:
      source === "SELF"
        ? "COI_DECLARED"
        : "COI_RECORDED",
    entityType: "MeetingConflictOfInterest",
    entityId: declaration.id,
    metadata: {
      meetingId: meeting.id,
      userId: targetUserId,
      status,
      source,
      interestTypes,
      details: details ?? null,
      agendaItemIds,
      recusalIntent: recusalIntent ?? null,
    },
  });

  return getRegister(request, meeting.id);
}

async function handleWrite(
  request: Request,
  meetingId: string,
) {
  const scope = await getViewerScope(request, meetingId);
  if (scope.response) return scope.response;

  const context = scope.context!;
  const meeting = scope.meeting!;
  const body = await readJson<COIInput>(request);

  const action =
    typeof body.action === "string"
      ? body.action.trim()
      : "";

  const targetUserId =
    typeof body.userId === "string" && body.userId.trim()
      ? body.userId.trim()
      : context.user.id;

  if (meeting.status === "CANCELLED") {
    return error(
      "Cancelled meetings cannot receive conflict-of-interest changes.",
      409,
    );
  }

  if (action === "declare") {
    if (context.user.role !== "MEMBER") {
      return error(
        "Only committee members may submit a personal conflict-of-interest declaration.",
        403,
      );
    }

    if (targetUserId !== context.user.id) {
      return error(
        "You can only submit your own conflict-of-interest declaration.",
        403,
      );
    }

    if (meeting.status !== "SCHEDULED") {
      return error(
        "Conflict-of-interest declarations are locked because this meeting is not scheduled.",
        409,
      );
    }

    const status = parseStatus(body.status);

    if (
      status !== "NO_CONFLICT" &&
      status !== "CONFLICT_DECLARED"
    ) {
      return error(
        "Choose either No conflict or Conflict declared.",
        400,
      );
    }

    return createDeclaration(
      request,
      context,
      meeting,
      context.user.id,
      "SELF",
      status,
      body,
    );
  }

  if (action === "record") {
    if (context.user.role !== "ADMIN") {
      return error(
        "Administrator access required.",
        403,
      );
    }

    if (meeting.status !== "SCHEDULED") {
      return error(
        "Administrative COI recording is only available while the meeting is scheduled.",
        409,
      );
    }

    const status = parseStatus(body.status);

    if (
      status !== "NO_CONFLICT" &&
      status !== "CONFLICT_DECLARED"
    ) {
      return error(
        "Administrative recording requires No conflict or Conflict declared.",
        400,
      );
    }

    return createDeclaration(
      request,
      context,
      meeting,
      targetUserId,
      "ADMIN",
      status,
      body,
    );
  }

  if (action === "correct") {
    if (context.user.role !== "ADMIN") {
      return error(
        "Administrator access required.",
        403,
      );
    }

    if (meeting.status !== "CLOSED") {
      return error(
        "Post-close COI correction is only available after the meeting is closed.",
        409,
      );
    }

    const correctionReason =
      optionalString(body.correctionReason);

    if (!correctionReason) {
      return error(
        "A reason is required for a post-close COI correction.",
        400,
      );
    }

    if (!(await isEligibleMember(meeting, targetUserId))) {
      return error(
        "The selected user was not an eligible committee member for this meeting.",
        400,
      );
    }

    const declaration =
      await getDb().meetingConflictOfInterest.findUnique({
        where: {
          meetingId_userId: {
            meetingId: meeting.id,
            userId: targetUserId,
          },
        },
        include: {
          revisions: {
            orderBy: {
              createdAt: "desc",
            },
            take: 1,
          },
          user: {
            select: {
              email: true,
              name: true,
            },
          },
        },
      });

    if (
      !declaration ||
      declaration.revisions.length === 0
    ) {
      return error(
        "No conflict-of-interest declaration exists to correct.",
        404,
      );
    }

    const status = parseStatus(body.status);

    if (
      status !== "NO_CONFLICT" &&
      status !== "CONFLICT_DECLARED"
    ) {
      return error(
        "A correction must resolve to No conflict or Conflict declared.",
        400,
      );
    }

    let interestTypes: string[] = [];
    let details: string | undefined;
    let agendaItemIds: string[] = [];
    let recusalIntent: boolean | undefined;

    if (status === "CONFLICT_DECLARED") {
      interestTypes =
        parseInterestTypes(body.interestTypes);
      details = optionalString(body.details);

      if (!details) {
        return error(
          "Details are required when a conflict is declared.",
          400,
        );
      }

      agendaItemIds =
        parseAgendaItemIds(body.agendaItemIds);
      validateAgendaReferences(
        meeting,
        agendaItemIds,
      );
      recusalIntent = parseBoolean(
        body.recusalIntent,
        "Recusal intent",
      );
    }

    const previous = declaration.revisions[0];

    const revision =
      await getDb().meetingConflictOfInterestRevision.create({
        data: {
          declarationId: declaration.id,
          status,
          source: "ADMIN",
          revisionKind: "CORRECTION",
          interestTypes,
          details: details ?? null,
          agendaItemIds,
          recusalIntent:
            status === "CONFLICT_DECLARED"
              ? recusalIntent
              : null,
          correctionReason,
          createdById: context.user.id,
        },
      });

    await writeAuditEvent({
      request,
      context,
      action: "COI_CORRECTED",
      entityType: "MeetingConflictOfInterest",
      entityId: declaration.id,
      metadata: {
        meetingId: meeting.id,
        userId: targetUserId,
        revisionId: revision.id,
        correctionReason,
        previous: {
          revisionId: previous.id,
          status: previous.status,
          source: previous.source,
          interestTypes: previous.interestTypes,
          details: previous.details,
          agendaItemIds: previous.agendaItemIds,
          recusalIntent: previous.recusalIntent,
          createdAt: previous.createdAt,
        },
        current: {
          revisionId: revision.id,
          status: revision.status,
          source: revision.source,
          interestTypes: revision.interestTypes,
          details: revision.details,
          agendaItemIds: revision.agendaItemIds,
          recusalIntent: revision.recusalIntent,
          createdAt: revision.createdAt,
        },
      },
    });

    const warnings: string[] = [];

    if (isZohoMailConfigured()) {
      try {
        await sendCoiCorrectionNotification(
          declaration.user.email,
          declaration.user.name,
          {
            title: meeting.title,
            committeeName: meeting.committee.name,
            startAt: meeting.startAt,
            timezone: meeting.timezone,
            meetingId: meeting.id,
          },
          correctionReason,
        );
      } catch (mailError) {
        console.error(
          "COI correction email failed.",
          mailError,
        );
        warnings.push(
          "The correction was saved, but the member notification email could not be delivered.",
        );
      }
    } else {
      warnings.push(
        "Zoho Mail is not configured; COI correction notification was skipped.",
      );
    }

    const response =
      await getRegister(request, meeting.id);

    if (!response.ok || warnings.length === 0) {
      return response;
    }

    const payload = await response.json();

    return json({
      ...payload,
      warnings,
    });
  }

  return error(
    "A valid COI action is required.",
    400,
  );
}

export default async function handler(
  request: Request,
) {
  const url = new URL(request.url);
  const segments =
    url.pathname.split("/").filter(Boolean);
  const meetingsIndex =
    segments.indexOf("meetings");
  const meetingId =
    meetingsIndex >= 0
      ? segments[meetingsIndex + 1]
      : undefined;

  if (!meetingId) {
    return error(
      "Meeting ID is required.",
      400,
    );
  }

  try {
    if (request.method === "GET") {
      return getRegister(request, meetingId);
    }

    if (request.method === "POST") {
      return handleWrite(request, meetingId);
    }

    return error(
      "Method not allowed.",
      405,
    );
  } catch (caught) {
    if (caught instanceof Error) {
      return error(caught.message, 400);
    }

    return error(
      "Unable to process conflict-of-interest request.",
      500,
    );
  }
}