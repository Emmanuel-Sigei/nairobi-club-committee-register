import { getAuthenticatedUser } from "../_lib/auth";
import { getDb } from "../_lib/db";
import {
  canViewGovernance,
} from "../_lib/governance";
import {
  error,
  json,
} from "../_lib/http";

type ReportType =
  | "attendance"
  | "coi"
  | "absence"
  | "document-access";

interface ReportRow {
  [key: string]:
    | string
    | number
    | boolean
    | null;
}

function parseReportType(
  value: string | null,
): ReportType | null {
  if (
    value === "attendance" ||
    value === "coi" ||
    value === "absence" ||
    value === "document-access"
  ) {
    return value;
  }

  return null;
}

function csvCell(
  value:
    | string
    | number
    | boolean
    | null
    | undefined,
): string {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  const text = String(value);

  if (
    text.includes(",") ||
    text.includes('"') ||
    text.includes("\n") ||
    text.includes("\r")
  ) {
    return `"${text.replaceAll('"', '""')}"`;
  }

  return text;
}

function toCsv(
  rows: ReportRow[],
): string {
  if (rows.length === 0) {
    return "";
  }

  const columns =
    Object.keys(rows[0]);

  const output = [
    columns
      .map(csvCell)
      .join(","),
  ];

  for (const row of rows) {
    output.push(
      columns
        .map((column) =>
          csvCell(row[column]),
        )
        .join(","),
    );
  }

  return output.join("\r\n");
}

function csvResponse(
  name: string,
  rows: ReportRow[],
): Response {
  const csv =
    "\uFEFF" + toCsv(rows);

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type":
        "text/csv; charset=utf-8",
      "Content-Disposition":
        `attachment; filename="${name}.csv"`,
      "Cache-Control":
        "private, no-store",
    },
  });
}

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

function dynamicString(
  record: Record<string, unknown>,
  keys: string[],
): string {
  for (const key of keys) {
    const value = record[key];

    if (
      typeof value === "string" &&
      value.trim()
    ) {
      return value.trim();
    }
  }

  return "";
}

function dynamicStringArray(
  record: Record<string, unknown>,
  keys: string[],
): string[] {
  for (const key of keys) {
    const value = record[key];

    if (Array.isArray(value)) {
      return value.filter(
        (item): item is string =>
          typeof item === "string",
      );
    }
  }

  return [];
}

function dynamicBoolean(
  record: Record<string, unknown>,
  keys: string[],
): boolean | null {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "boolean") {
      return value;
    }
  }

  return null;
}

function formatDate(
  value: Date | null | undefined,
): string {
  if (!value) {
    return "";
  }

  return value.toISOString();
}

async function attendanceRows():
  Promise<ReportRow[]> {
  const records =
    await getDb().meetingAttendance.findMany({
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        meeting: {
          include: {
            committee: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: [
        {
          meeting: {
            startAt: "desc",
          },
        },
        {
          user: {
            name: "asc",
          },
        },
      ],
    });

  return records.map(
    (record) => ({
      committee:
        record.meeting.committee.name,
      meeting:
        record.meeting.title,
      meetingDate:
        formatDate(
          record.meeting.startAt,
        ),
      member:
        record.user.name,
      email:
        record.user.email,
      status:
        record.status,
      source:
        record.source,
      reason:
        record.reason ?? "",
      markedAt:
        formatDate(
          record.markedAt,
        ),
    }),
  );
}

async function coiRows():
  Promise<ReportRow[]> {
  const declarations =
    await getDb()
      .meetingConflictOfInterest
      .findMany({
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          meeting: {
            include: {
              committee: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          revisions: {
            orderBy: {
              createdAt: "desc",
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      });

  return declarations.map(
    (declaration) => {
      const latest =
        asRecord(
          declaration.revisions[0],
        );

      const interestTypes =
        dynamicStringArray(
          latest,
          [
            "interestTypes",
            "conflictTypes",
            "types",
          ],
        );

      const agendaItems =
        dynamicStringArray(
          latest,
          [
            "agendaItemIds",
            "agendaItems",
          ],
        );

      const detail =
        dynamicString(
          latest,
          [
            "detail",
            "details",
            "description",
          ],
        );

      const recusal =
        dynamicBoolean(
          latest,
          [
            "recusalIntended",
            "willRecuse",
            "recusal",
            "recuse",
          ],
        );

      return {
        committee:
          declaration.meeting
            .committee.name,
        meeting:
          declaration.meeting.title,
        meetingDate:
          formatDate(
            declaration.meeting.startAt,
          ),
        member:
          declaration.user.name,
        email:
          declaration.user.email,
        status:
          dynamicString(
            latest,
            ["status"],
          ),
        interestTypes:
          interestTypes.join("; "),
        detail,
        agendaReferences:
          agendaItems.join("; "),
        recusal:
          recusal === null
            ? ""
            : recusal
              ? "Yes"
              : "No",
        revisionCount:
          declaration.revisions.length,
      };
    },
  );
}

async function absenceRows():
  Promise<ReportRow[]> {
  const records =
    await getDb().meetingAttendance.findMany({
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        meeting: {
          include: {
            committee: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

  interface Summary {
    committee: string;
    member: string;
    email: string;
    meetings: number;
    present: number;
    apologies: number;
    excused: number;
    absent: number;
    unexplainedAbsence: number;
  }

  const summaries =
    new Map<string, Summary>();

  for (const record of records) {
    const key =
      `${record.meeting.committee.id}:` +
      record.user.id;

    let summary =
      summaries.get(key);

    if (!summary) {
      summary = {
        committee:
          record.meeting
            .committee.name,
        member:
          record.user.name,
        email:
          record.user.email,
        meetings: 0,
        present: 0,
        apologies: 0,
        excused: 0,
        absent: 0,
        unexplainedAbsence: 0,
      };

      summaries.set(
        key,
        summary,
      );
    }

    summary.meetings += 1;

    if (
      record.status ===
      "PRESENT"
    ) {
      summary.present += 1;
    }

    if (
      record.status ===
        "APOLOGY" ||
      record.status ===
        "APOLOGY_DRAFT"
    ) {
      summary.apologies += 1;
    }

    if (
      record.status ===
      "EXCUSED"
    ) {
      summary.excused += 1;
    }

    if (
      record.status ===
        "ABSENT" ||
      record.status ===
        "ABSENT_NO_APOLOGY"
    ) {
      summary.absent += 1;
    }

    if (
      record.status ===
        "ABSENT_NO_APOLOGY" ||
      record.status ===
        "ABSENT"
    ) {
      summary.unexplainedAbsence += 1;
    }
  }

  return Array.from(
    summaries.values(),
  )
    .sort((a, b) =>
      b.unexplainedAbsence -
      a.unexplainedAbsence,
    )
    .map(
      (summary) => ({
        committee:
          summary.committee,
        member:
          summary.member,
        email:
          summary.email,
        meetings:
          summary.meetings,
        present:
          summary.present,
        apologies:
          summary.apologies,
        excused:
          summary.excused,
        absent:
          summary.absent,
        unexplainedAbsence:
          summary.unexplainedAbsence,
      }),
    );
}

async function documentAccessRows():
  Promise<ReportRow[]> {
  const events =
    await getDb().auditEvent.findMany({
      where: {
        action: {
          in: [
            "DOCUMENT_VIEW",
            "DOCUMENT_DOWNLOAD",
            "DOCUMENT_ACCESS_DENIED",
          ],
        },
      },
      include: {
        actor: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

  return events.map(
    (event) => {
      const metadata =
        asRecord(event.metadata);

      return {
        occurredAt:
          formatDate(
            event.createdAt,
          ),
        action:
          event.action,
        actor:
          event.actor?.name ??
          "System",
        actorEmail:
          event.actor?.email ?? "",
        actorRole:
          event.actor?.role ??
          "",
        documentId:
          dynamicString(
            metadata,
            ["documentId"],
          ),
        committeeId:
          dynamicString(
            metadata,
            ["committeeId"],
          ),
        meetingId:
          dynamicString(
            metadata,
            ["meetingId"],
          ),
        title:
          dynamicString(
            metadata,
            ["title"],
          ),
        fileName:
          dynamicString(
            metadata,
            ["fileName"],
          ),
        version:
          typeof metadata.version ===
          "number"
            ? metadata.version
            : "",
        reason:
          dynamicString(
            metadata,
            ["reason"],
          ),
        ipAddress:
          event.ipAddress ?? "",
      };
    },
  );
}

export default async function handler(
  request: Request,
): Promise<Response> {
  if (request.method !== "GET") {
    return error(
      "Reports are read-only.",
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
      "Reports require Administrator or Exco/Management access.",
      403,
    );
  }

  const url =
    new URL(request.url);

  const type =
    parseReportType(
      url.searchParams.get("type"),
    );

  if (!type) {
    return error(
      "type must be attendance, coi, absence or document-access.",
      400,
    );
  }

  const format =
    url.searchParams.get("format") ===
    "csv"
      ? "csv"
      : "json";

  let rows: ReportRow[];

  if (type === "attendance") {
    rows =
      await attendanceRows();
  } else if (type === "coi") {
    rows =
      await coiRows();
  } else if (
    type === "absence"
  ) {
    rows =
      await absenceRows();
  } else {
    rows =
      await documentAccessRows();
  }

  if (format === "csv") {
    return csvResponse(
      `nairobi-club-${type}-report`,
      rows,
    );
  }

  return json({
    success: true,
    readOnly: true,
    type,
    total: rows.length,
    rows,
  });
}