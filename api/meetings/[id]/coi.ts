import { getAuthenticatedUser } from "../../_lib/auth";
import { writeAuditEvent } from "../../_lib/audit";
import { getDb } from "../../_lib/db";
import { error, json, readJson } from "../../_lib/http";
import { canViewCommittee } from "../../_lib/permissions";

type COIStatus = "NO_CONFLICT" | "CONFLICT_DECLARED" | "DECLARATION_NOT_SUBMITTED";
type COISource = "SELF" | "ADMIN" | "SYSTEM";

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
  const trimmed = value.trim();
  return trimmed || undefined;
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
      },
    }),
  );
}

async function isPresent(meetingId: string, userId: string) {
  const attendance = await getDb().meetingAttendance.findUnique({
    where: {
      meetingId_userId: {
        meetingId,
        userId,
      },
    },
    select: {
      status: true,
    },
  });

  return attendance?.status === "PRESENT";
}

async function getViewerScope(
  request: Request,
  meetingId: string,
) {
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

async function getRegister(
  request: Request,
  meetingId: string,
) {
  const scope = await getViewerScope(request, meetingId);

  if (scope.response) return scope.response;

  const context = scope.context!;
  const meeting = scope.meeting!;

  const eligibleMemberships = await getDb().membership.findMany({
    where: {
      committeeId: meeting.committeeId,
      startDate: { lte: meeting.startAt },
      OR: [{ endDate: null }, { endDate: { gte: meeting.startAt } }],
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

  const eligibleMap = new Map<
    string,
    (typeof eligibleMemberships)[number]
  >();

  for (const membership of eligibleMemberships) {
    eligibleMap.set(membership.userId, membership);
  }

  const eligible = Array.from(eligibleMap.values());

  const declarations = await getDb().meetingConflictOfInterest.findMany({
    where: {
      meetingId,
    },
    orderBy: {
      user: {
        name: "asc",
      },
    },
  });

  const declarationByUser = new Map(
    declarations.map((declaration) => [
      declaration.userId,
      declaration,
    ]),
  );

  const attendance = await getDb().meetingAttendance.findMany({
    where: {
      meetingId,
    },
    select: {
      userId: true,
      status: true,
    },
  });

  const attendanceByUser = new Map(
    attendance.map((record) => [
      record.userId,
      record.status,
    ]),
  );

  const isAdmin = context.user.role === "ADMIN";
  const isExco = context.user.role === "EXCO_MANAGEMENT";

  const rows = eligible
    .filter((membership) => {
      if (isAdmin || isExco) return true;
      return membership.userId === context.user.id;
    })
    .map((membership) => {
      const declaration = declarationByUser.get(membership.userId);

      return {
        user: {
          id: membership.user.id,
          name: membership.user.name,
          email: membership.user.email,
          membershipRole: membership.role,
        },
        attendanceStatus: attendanceByUser.get(membership.user.id) ?? null,
        declaration: declaration
          ? {
              id: declaration.id,
              status: declaration.status,
              source: declaration.source,
              interestTypes: declaration.interestTypes,
              details: declaration.details,
              agendaItemIds: declaration.agendaItemIds,
              recusalIntent: declaration.recusalIntent,
              declaredAt: declaration.declaredAt,
              createdAt: declaration.createdAt,
              updatedAt: declaration.updatedAt,
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
    },
    declarations: rows,
  });
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
    if (
      context.user.role !== "MEMBER" &&
      context.user.role !== "ADMIN"
    ) {
      return error(
        "Only a member or administrator may submit a personal declaration.",
        403,
      );
    }

    if (targetUserId !== context.user.id) {
      return error(
        "You can only submit your own conflict-of-interest declaration.",
        403,
      );
    }

    if (!(await isEligibleMember(meeting, context.user.id))) {
      return error(
        "You were not an eligible committee member for this meeting.",
        403,
      );
    }

    if (meeting.status !== "SCHEDULED") {
      return error(
        "Conflict-of-interest declarations can only be submitted while the meeting is scheduled.",
        409,
      );
    }

    if (!(await isPresent(meeting.id, context.user.id))) {
      return error(
        "You must be recorded as present before submitting a conflict-of-interest declaration.",
        409,
      );
    }

    const existing =
      await getDb().meetingConflictOfInterest.findUnique({
        where: {
          meetingId_userId: {
            meetingId: meeting.id,
            userId: context.user.id,
          },
        },
      });

    if (existing) {
      return error(
        "A conflict-of-interest declaration already exists for this meeting.",
        409,
      );
    }

    const hasConflict = body.status === "CONFLICT_DECLARED";

    if (body.status !== "NO_CONFLICT" && !hasConflict) {
      return error(
        "Choose either No conflict or Conflict declared.",
        400,
      );
    }

    let interestTypes: string[] = [];
    let details: string | undefined;
    let agendaItemIds: string[] = [];
    let recusalIntent: boolean | undefined;

    if (hasConflict) {
      interestTypes = parseInterestTypes(body.interestTypes);
      details = optionalString(body.details);

      if (!details) {
        return error(
          "Details are required when a conflict is declared.",
          400,
        );
      }

      agendaItemIds = parseAgendaItemIds(body.agendaItemIds);
      recusalIntent = parseBoolean(
        body.recusalIntent,
        "Recusal intent",
      );
    }

    const declaration =
      await getDb().meetingConflictOfInterest.create({
        data: {
          meetingId: meeting.id,
          userId: context.user.id,
          status: hasConflict
            ? "CONFLICT_DECLARED"
            : "NO_CONFLICT",
          source: "SELF",
          interestTypes:
            interestTypes.length > 0
              ? interestTypes
              : undefined,
          details: details ?? undefined,
          agendaItemIds:
            agendaItemIds.length > 0
              ? agendaItemIds
              : undefined,
          recusalIntent:
            hasConflict
              ? recusalIntent
              : undefined,
          declaredAt: new Date(),
        },
      });

    await writeAuditEvent({
      request,
      context,
      action: "COI_DECLARED",
      entityType: "MeetingConflictOfInterest",
      entityId: declaration.id,
      metadata: {
        meetingId: meeting.id,
        userId: context.user.id,
        status: declaration.status,
        source: "SELF",
        interestTypes,
        details: details ?? null,
        agendaItemIds,
        recusalIntent:
          recusalIntent ?? null,
      },
    });

    return getRegister(request, meetingId);
  }

  if (action === "record") {
    if (context.user.role !== "ADMIN") {
      return error("Administrator access required.", 403);
    }

    if (meeting.status !== "SCHEDULED") {
      return error(
        "Administrative COI recording is only available while the meeting is scheduled.",
        409,
      );
    }

    if (!(await isEligibleMember(meeting, targetUserId))) {
      return error(
        "The selected user was not an eligible committee member for this meeting.",
        400,
      );
    }

    if (!(await isPresent(meeting.id, targetUserId))) {
      return error(
        "The selected member must be recorded as present before the COI declaration can be recorded.",
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
        "A conflict-of-interest declaration already exists for this member.",
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
          status,
          source: "ADMIN",
          interestTypes:
            interestTypes.length > 0
              ? interestTypes
              : undefined,
          details: details ?? undefined,
          agendaItemIds:
            agendaItemIds.length > 0
              ? agendaItemIds
              : undefined,
          recusalIntent:
            status === "CONFLICT_DECLARED"
              ? recusalIntent
              : undefined,
          declaredAt: new Date(),
        },
      });

    await writeAuditEvent({
      request,
      context,
      action: "COI_RECORDED",
      entityType: "MeetingConflictOfInterest",
      entityId: declaration.id,
      metadata: {
        meetingId: meeting.id,
        userId: targetUserId,
        status,
        source: "ADMIN",
        interestTypes,
        details: details ?? null,
        agendaItemIds,
        recusalIntent:
          recusalIntent ?? null,
      },
    });

    return getRegister(request, meetingId);
  }

  if (action === "correct") {
    if (context.user.role !== "ADMIN") {
      return error("Administrator access required.", 403);
    }

    if (meeting.status !== "CLOSED") {
      return error(
        "Post-close COI correction is only available after the meeting is closed.",
        409,
      );
    }

    const correctionReason = optionalString(
      body.correctionReason,
    );

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

    const existing =
      await getDb().meetingConflictOfInterest.findUnique({
        where: {
          meetingId_userId: {
            meetingId: meeting.id,
            userId: targetUserId,
          },
        },
      });

    if (!existing) {
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
        "A post-close correction must resolve to No conflict or Conflict declared.",
        400,
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
      recusalIntent = parseBoolean(
        body.recusalIntent,
        "Recusal intent",
      );
    }

    const updated =
      await getDb().meetingConflictOfInterest.update({
        where: {
          id: existing.id,
        },
        data: {
          status,
          source: "ADMIN",
          interestTypes:
            interestTypes.length > 0
              ? interestTypes
              : null,
          details: details ?? null,
          agendaItemIds:
            agendaItemIds.length > 0
              ? agendaItemIds
              : null,
          recusalIntent:
            status === "CONFLICT_DECLARED"
              ? recusalIntent
              : null,
          declaredAt: new Date(),
        },
      });

    await writeAuditEvent({
      request,
      context,
      action: "COI_CORRECTED",
      entityType: "MeetingConflictOfInterest",
      entityId: updated.id,
      metadata: {
        meetingId: meeting.id,
        userId: targetUserId,
        correctionReason,
        previous: {
          status: existing.status,
          source: existing.source,
          interestTypes: existing.interestTypes,
          details: existing.details,
          agendaItemIds: existing.agendaItemIds,
          recusalIntent: existing.recusalIntent,
          declaredAt: existing.declaredAt,
        },
        current: {
          status: updated.status,
          source: updated.source,
          interestTypes: updated.interestTypes,
          details: updated.details,
          agendaItemIds: updated.agendaItemIds,
          recusalIntent: updated.recusalIntent,
          declaredAt: updated.declaredAt,
        },
      },
    });

    return getRegister(request, meetingId);
  }

  return error(
    "A valid COI action is required.",
    400,
  );
}

export default async function handler(request: Request) {
  const url = new URL(request.url);
  const segments = url.pathname.split("/").filter(Boolean);

  const meetingsIndex = segments.indexOf("meetings");
  const meetingId =
    meetingsIndex >= 0
      ? segments[meetingsIndex + 1]
      : undefined;

  if (!meetingId) {
    return error("Meeting ID is required.", 400);
  }

  try {
    if (request.method === "GET") {
      return getRegister(request, meetingId);
    }

    if (request.method === "POST") {
      return handleWrite(request, meetingId);
    }

    return error("Method not allowed.", 405);
  } catch (caught) {
    if (caught instanceof SyntaxError) {
      return error("Invalid request body.", 400);
    }

    if (caught instanceof Error) {
      return error(caught.message, 400);
    }

    console.error("COI request failed.", caught);
    return error(
      "Unable to process the conflict-of-interest request.",
      500,
    );
  }
}