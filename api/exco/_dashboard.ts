import { getAuthenticatedUser } from "../_lib/auth.js";
import { getDb } from "../_lib/db.js";
import {
  canViewGovernance,
} from "../_lib/governance.js";
import {
  error,
  json,
} from "../_lib/http.js";

function asRecord(
  value: unknown,
): Record<string, unknown> {
  if (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  ) {
    return value as Record<
      string,
      unknown
    >;
  }

  return {};
}

export default async function handler(
  request: Request,
): Promise<Response> {
  if (request.method !== "GET") {
    return error(
      "The Exco/Management dashboard is read-only.",
      405,
    );
  }

  const context =
    await getAuthenticatedUser(request);

  if (!context) {
    return error(
      "Authentication required.",
      401,
    );
  }

  if (!canViewGovernance(context)) {
    return error(
      "Exco/Management dashboard access is restricted.",
      403,
    );
  }

  const [
    activeCommittees,
    archivedCommittees,
    activeUsers,
    meetingGroups,
    attendanceGroups,
    documents,
    documentVersions,
    coiDeclarations,
    recentAudit,
  ] = await Promise.all([
    getDb().committee.count({
      where: {
        archivedAt: null,
      },
    }),

    getDb().committee.count({
      where: {
        archivedAt: {
          not: null,
        },
      },
    }),

    getDb().user.count({
      where: {
        isActive: true,
      },
    }),

    getDb().meeting.groupBy({
      by: ["status"],
      _count: {
        _all: true,
      },
    }),

    getDb().meetingAttendance.findMany({
      select: {
        status: true,
        corrections: {
          orderBy: {
            createdAt: "desc",
          },
          take: 1,
          select: {
            status: true,
          },
        },
      },
    }),

    getDb().document.count(),

    getDb()
      .documentVersion
      .count(),

    getDb()
      .meetingConflictOfInterest
      .findMany({
        include: {
          revisions: {
            orderBy: {
              createdAt: "desc",
            },
            take: 1,
          },
        },
      }),

    getDb().auditEvent.findMany({
      include: {
        actor: {
          select: {
            name: true,
            email: true,
            role: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 15,
    }),
  ]);

  const meetingCounts:
    Record<string, number> = {};

  for (
    const group of meetingGroups
  ) {
    meetingCounts[group.status] =
      group._count._all;
  }

  const attendanceCounts:
    Record<string, number> = {};

  for (
    const record of attendanceGroups
  ) {
    const status =
      record.corrections[0]?.status ??
      record.status;

    attendanceCounts[status] =
      (attendanceCounts[status] ?? 0) +
      1;
  }

  let declarationNotSubmitted = 0;
  let conflictsDeclared = 0;
  let noConflict = 0;

  for (
    const declaration of
      coiDeclarations
  ) {
    const latest =
      asRecord(
        declaration.revisions[0],
      );

    const status =
      typeof latest.status ===
      "string"
        ? latest.status
        : "";

    if (
      status ===
      "DECLARATION_NOT_SUBMITTED"
    ) {
      declarationNotSubmitted += 1;
    }

    if (
      status ===
      "CONFLICT_DECLARED"
    ) {
      conflictsDeclared += 1;
    }

    if (
      status ===
      "NO_CONFLICT"
    ) {
      noConflict += 1;
    }
  }

  return json({
    success: true,
    readOnly: true,
    generatedAt:
      new Date().toISOString(),

    summary: {
      activeCommittees,
      archivedCommittees,
      activeUsers,

      meetings: {
        scheduled:
          meetingCounts.SCHEDULED ??
          0,
        closed:
          meetingCounts.CLOSED ??
          0,
        cancelled:
          meetingCounts.CANCELLED ??
          0,
      },

      attendance: {
        present:
          attendanceCounts.PRESENT ??
          0,
        apologies:
          attendanceCounts.APOLOGY ??
          0,
        excused:
          attendanceCounts.EXCUSED ??
          0,
        absent:
          attendanceCounts.ABSENT ??
          0,
        absentNoApology:
          attendanceCounts
            .ABSENT_NO_APOLOGY ??
          0,
      },

      coi: {
        totalDeclarations:
          coiDeclarations.length,
        conflictsDeclared,
        noConflict,
        declarationNotSubmitted,
      },

      documents: {
        documents,
        versions:
          documentVersions,
      },
    },

    recentAudit,
  });
}