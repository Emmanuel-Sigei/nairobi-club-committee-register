import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

type ReportType =
  | "attendance"
  | "coi"
  | "absence"
  | "document-access";

interface DashboardResponse {
  success: boolean;
  readOnly: boolean;
  generatedAt: string;
  summary: {
    activeCommittees: number;
    archivedCommittees: number;
    activeUsers: number;
    meetings: {
      scheduled: number;
      closed: number;
      cancelled: number;
    };
    attendance: {
      present: number;
      apologies: number;
      excused: number;
      absent: number;
      absentNoApology: number;
    };
    coi: {
      totalDeclarations: number;
      conflictsDeclared: number;
      noConflict: number;
      declarationNotSubmitted: number;
    };
    documents: {
      documents: number;
      versions: number;
    };
  };
}

interface AuditEvent {
  id: string;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: unknown;
  ipAddress?: string | null;
  createdAt: string;
  actor?: {
    name: string;
    email: string;
    role: string;
  } | null;
}

interface AuditResponse {
  success: boolean;
  total: number;
  events: AuditEvent[];
}

interface ReportResponse {
  success: boolean;
  type: ReportType;
  total: number;
  rows: Array<
    Record<
      string,
      string | number | boolean | null
    >
  >;
}

async function api<T>(
  path: string,
): Promise<T> {
  const response =
    await fetch(path, {
      credentials: "include",
    });

  const text =
    await response.text();

  let data: unknown = {};

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = {};
    }
  }

  if (!response.ok) {
    const message =
      typeof data === "object" &&
      data !== null &&
      "error" in data &&
      typeof data.error === "string"
        ? data.error
        : "Request failed.";

    throw new Error(message);
  }

  return data as T;
}

function formatLabel(
  value: string,
): string {
  return value
    .replaceAll("-", " ")
    .replaceAll("_", " ")
    .replace(
      /\b\w/g,
      (character) =>
        character.toUpperCase(),
    );
}

function formatValue(
  value:
    | string
    | number
    | boolean
    | null,
): string {
  if (value === null) {
    return "";
  }

  if (typeof value === "boolean") {
    return value
      ? "Yes"
      : "No";
  }

  return String(value);
}

function StatCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>

      <p className="mt-3 text-3xl font-semibold text-slate-950">
        {value}
      </p>

      <p className="mt-1 text-xs text-slate-500">
        {detail}
      </p>
    </div>
  );
}

export default function GovernanceReportsPanel() {
  const [dashboard, setDashboard] =
    useState<DashboardResponse | null>(
      null,
    );

  const [audit, setAudit] =
    useState<AuditResponse | null>(
      null,
    );

  const [reportType, setReportType] =
    useState<ReportType>(
      "attendance",
    );

  const [report, setReport] =
    useState<ReportResponse | null>(
      null,
    );

  const [loading, setLoading] =
    useState(true);

  const [reportLoading, setReportLoading] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState("");

  const loadReport =
    useCallback(
      async (
        type: ReportType,
      ) => {
        setReportLoading(true);

        try {
          const response =
            await api<ReportResponse>(
              `/api/reports?type=${encodeURIComponent(type)}`,
            );

          setReport(response);
          setErrorMessage("");
        } catch (cause) {
          setErrorMessage(
            cause instanceof Error
              ? cause.message
              : "Unable to load report.",
          );
        } finally {
          setReportLoading(false);
        }
      },
      [],
    );

  useEffect(() => {
    let cancelled = false;

    void Promise.all([
      api<DashboardResponse>(
        "/api/exco/dashboard",
      ),
      api<AuditResponse>(
        "/api/audit?limit=30",
      ),
      api<ReportResponse>(
        "/api/reports?type=attendance",
      ),
    ])
      .then(
        ([
          dashboardResponse,
          auditResponse,
          reportResponse,
        ]) => {
          if (cancelled) {
            return;
          }

          setDashboard(
            dashboardResponse,
          );

          setAudit(
            auditResponse,
          );

          setReport(
            reportResponse,
          );

          setErrorMessage("");
        },
      )
      .catch(
        (cause: unknown) => {
          if (cancelled) {
            return;
          }

          setErrorMessage(
            cause instanceof Error
              ? cause.message
              : "Unable to load governance information.",
          );
        },
      )
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const columns =
    useMemo(() => {
      const first =
        report?.rows[0];

      return first
        ? Object.keys(first)
        : [];
    }, [report]);

  async function selectReport(
    type: ReportType,
  ) {
    setReportType(type);
    await loadReport(type);
  }

  async function downloadCsv() {
    setErrorMessage("");

    try {
      const response =
        await fetch(
          `/api/reports?type=${encodeURIComponent(reportType)}&format=csv`,
          {
            credentials: "include",
          },
        );

      if (!response.ok) {
        let message =
          "Unable to export CSV.";

        try {
          const payload =
            (await response.json()) as {
              error?: string;
            };

          if (payload.error) {
            message =
              payload.error;
          }
        } catch {
          // Keep default message.
        }

        throw new Error(message);
      }

      const blob =
        await response.blob();

      const url =
        URL.createObjectURL(blob);

      const anchor =
        document.createElement("a");

      anchor.href = url;
      anchor.download =
        `nairobi-club-${reportType}-report.csv`;

      document.body.appendChild(
        anchor,
      );

      anchor.click();
      anchor.remove();

      URL.revokeObjectURL(url);
    } catch (cause) {
      setErrorMessage(
        cause instanceof Error
          ? cause.message
          : "Unable to export CSV.",
      );
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 shadow-sm">
        Loading governance dashboard...
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
          Governance & Oversight
        </p>

        <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight text-slate-950">
              Audit, reports & Exco overview
            </h2>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Read-only oversight across all Nairobi Club committees.
              Access, exports and governance data are enforced by the server.
            </p>
          </div>

          <span className="inline-flex rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">
            Read only
          </span>
        </div>
      </section>

      {errorMessage && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {errorMessage}
        </div>
      )}

      {dashboard && (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Active committees"
              value={
                dashboard.summary
                  .activeCommittees
              }
              detail={`${dashboard.summary.archivedCommittees} archived`}
            />

            <StatCard
              label="Active users"
              value={
                dashboard.summary
                  .activeUsers
              }
              detail="Current active accounts"
            />

            <StatCard
              label="Scheduled meetings"
              value={
                dashboard.summary
                  .meetings.scheduled
              }
              detail={`${dashboard.summary.meetings.closed} closed`}
            />

            <StatCard
              label="Documents"
              value={
                dashboard.summary
                  .documents.documents
              }
              detail={`${dashboard.summary.documents.versions} immutable versions`}
            />
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="font-semibold text-slate-950">
                Attendance overview
              </h3>

              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <StatCard
                  label="Present"
                  value={
                    dashboard.summary
                      .attendance.present
                  }
                  detail="Recorded present"
                />

                <StatCard
                  label="Apologies"
                  value={
                    dashboard.summary
                      .attendance.apologies
                  }
                  detail="Recorded apologies"
                />

                <StatCard
                  label="No apology"
                  value={
                    dashboard.summary
                      .attendance
                      .absentNoApology
                  }
                  detail="Unexplained absence"
                />
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="font-semibold text-slate-950">
                Conflict-of-interest overview
              </h3>

              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <StatCard
                  label="Declared"
                  value={
                    dashboard.summary
                      .coi
                      .conflictsDeclared
                  }
                  detail="Conflict declared"
                />

                <StatCard
                  label="No conflict"
                  value={
                    dashboard.summary
                      .coi.noConflict
                  }
                  detail="No conflict declared"
                />

                <StatCard
                  label="Outstanding"
                  value={
                    dashboard.summary
                      .coi
                      .declarationNotSubmitted
                  }
                  detail="Not submitted"
                />
              </div>
            </div>
          </section>
        </>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-200 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="font-semibold text-slate-950">
              Governance reports
            </h3>

            <p className="mt-1 text-sm text-slate-500">
              Review data in the application or export the current report to CSV.
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              void downloadCsv()
            }
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
          >
            Export CSV
          </button>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-slate-100 px-6 py-4">
          {(
            [
              [
                "attendance",
                "Attendance",
              ],
              [
                "coi",
                "COI Register",
              ],
              [
                "absence",
                "Apology vs Absence",
              ],
              [
                "document-access",
                "Document Access",
              ],
            ] as Array<
              [ReportType, string]
            >
          ).map(
            ([type, label]) => (
              <button
                key={type}
                type="button"
                onClick={() =>
                  void selectReport(
                    type,
                  )
                }
                className={
                  reportType === type
                    ? "rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white"
                    : "rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                }
              >
                {label}
              </button>
            ),
          )}
        </div>

        {reportLoading ? (
          <div className="p-8 text-center text-sm text-slate-500">
            Loading report...
          </div>
        ) : report &&
          report.rows.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-[0.08em] text-slate-500">
                <tr>
                  {columns.map(
                    (column) => (
                      <th
                        key={column}
                        className="whitespace-nowrap px-4 py-3"
                      >
                        {formatLabel(
                          column,
                        )}
                      </th>
                    ),
                  )}
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {report.rows
                  .slice(0, 100)
                  .map(
                    (row, index) => (
                      <tr key={index}>
                        {columns.map(
                          (column) => (
                            <td
                              key={
                                column
                              }
                              className="max-w-xs whitespace-nowrap px-4 py-3 text-slate-700"
                            >
                              {formatValue(
                                row[
                                  column
                                ],
                              )}
                            </td>
                          ),
                        )}
                      </tr>
                    ),
                  )}
              </tbody>
            </table>

            {report.rows.length >
              100 && (
              <div className="border-t border-slate-100 px-6 py-4 text-xs text-slate-500">
                Showing the first 100 rows.
                Export CSV for the full report.
              </div>
            )}
          </div>
        ) : (
          <div className="p-8 text-center text-sm text-slate-500">
            No records exist for this report yet.
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-5">
          <h3 className="font-semibold text-slate-950">
            Recent audit activity
          </h3>

          <p className="mt-1 text-sm text-slate-500">
            Most recent immutable application audit events.
          </p>
        </div>

        {audit?.events.length ? (
          <div className="divide-y divide-slate-100">
            {audit.events.map(
              (event) => (
                <div
                  key={event.id}
                  className="flex flex-col gap-2 px-6 py-4 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {formatLabel(
                        event.action,
                      )}
                    </p>

                    <p className="mt-1 text-xs text-slate-500">
                      {event.actor?.name ??
                        "System"}
                      {event.entityType
                        ? ` · ${event.entityType}`
                        : ""}
                    </p>
                  </div>

                  <time className="text-xs text-slate-500">
                    {new Date(
                      event.createdAt,
                    ).toLocaleString(
                      "en-KE",
                    )}
                  </time>
                </div>
              ),
            )}
          </div>
        ) : (
          <div className="p-8 text-center text-sm text-slate-500">
            No audit events recorded yet.
          </div>
        )}
      </section>
    </div>
  );
}