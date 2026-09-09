import {
  useEffect,
  useMemo,
  useState,
} from "react";

type UserRole =
  | "MEMBER"
  | "ADMIN"
  | "EXCO_MANAGEMENT";

type MeetingStatus =
  | "SCHEDULED"
  | "CLOSED"
  | "CANCELLED";

type COIStatus =
  | "NO_CONFLICT"
  | "CONFLICT_DECLARED"
  | "DECLARATION_NOT_SUBMITTED";

interface AgendaItem {
  id: string;
  position: number;
  title: string;
}

interface CoiDeclaration {
  id: string;
  status: COIStatus;
  source: "SELF" | "ADMIN" | "SYSTEM";
  revisionKind:
    | "INITIAL"
    | "CORRECTION"
    | "SYSTEM_CLOSE";
  interestTypes: string[];
  details: string | null;
  agendaItemIds: string[];
  recusalIntent: boolean | null;
  correctionReason: string | null;
  declaredAt: string;
  createdAt: string;
}

interface CoiRow {
  user: {
    id: string;
    name: string;
    email: string;
    membershipRole: string;
  };
  attendanceStatus: string | null;
  declaration: CoiDeclaration | null;
}

interface CoiResponse {
  success: boolean;
  warnings?: string[];
  meeting: {
    id: string;
    title: string;
    status: MeetingStatus;
    startAt: string;
    endAt: string;
    committeeId: string;
    committeeName: string;
    agendaItems: AgendaItem[];
  };
  viewer: {
    userId: string;
    role: UserRole;
    canViewFullRegister: boolean;
    isChair: boolean;
  };
  declarations: CoiRow[];
}

interface Props {
  meetingId: string;
  timezone: string;
  user: {
    id: string;
    role: UserRole;
  };
}

const conflictTypes = [
  "Financial",
  "Business",
  "Family / Personal",
  "Employment / Professional",
  "Supplier / Vendor",
  "Other",
];

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(path, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  const text = await response.text();
  let payload: unknown = {};

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = {};
    }
  }

  if (!response.ok) {
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : "Request failed.";

    throw new Error(message);
  }

  return payload as T;
}

function statusLabel(status: COIStatus): string {
  if (status === "NO_CONFLICT") {
    return "No conflict";
  }

  if (status === "CONFLICT_DECLARED") {
    return "Conflict declared";
  }

  return "Declaration not submitted";
}

function statusClasses(status: COIStatus): string {
  if (status === "NO_CONFLICT") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }

  if (status === "CONFLICT_DECLARED") {
    return "border-red-200 bg-red-50 text-red-800";
  }

  return "border-amber-200 bg-amber-50 text-amber-800";
}

export default function ConflictOfInterestPanel({
  meetingId,
  timezone,
  user,
}: Props) {
  const [data, setData] =
    useState<CoiResponse | null>(null);
  const [initialLoading, setInitialLoading] =
    useState(true);
  const [working, setWorking] =
    useState(false);
  const [errorMessage, setErrorMessage] =
    useState("");
  const [message, setMessage] =
    useState("");
  const [targetUserId, setTargetUserId] =
    useState<string | null>(null);
  const [mode, setMode] =
    useState<"record" | "correct" | null>(null);
  const [status, setStatus] =
    useState<
      "NO_CONFLICT" | "CONFLICT_DECLARED"
    >("NO_CONFLICT");
  const [interestTypes, setInterestTypes] =
    useState<string[]>([]);
  const [details, setDetails] =
    useState("");
  const [agendaItemIds, setAgendaItemIds] =
    useState<string[]>([]);
  const [recusalIntent, setRecusalIntent] =
    useState(false);
  const [correctionReason, setCorrectionReason] =
    useState("");

  useEffect(() => {
    let cancelled = false;

    void request<CoiResponse>(
      `/api/meetings/${encodeURIComponent(meetingId)}/coi`,
    )
      .then((response) => {
        if (cancelled) return;
        setData(response);
        setErrorMessage("");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to load conflict-of-interest declarations.",
        );
      })
      .finally(() => {
        if (!cancelled) {
          setInitialLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [meetingId]);

  const ownRow = useMemo(
    () =>
      data?.declarations.find(
        (row) => row.user.id === user.id,
      ) ?? null,
    [data, user.id],
  );

  function resetEditor() {
    setTargetUserId(null);
    setMode(null);
    setStatus("NO_CONFLICT");
    setInterestTypes([]);
    setDetails("");
    setAgendaItemIds([]);
    setRecusalIntent(false);
    setCorrectionReason("");
  }

  function openEditor(
    row: CoiRow,
    nextMode: "record" | "correct",
  ) {
    setTargetUserId(row.user.id);
    setMode(nextMode);

    if (
      nextMode === "correct" &&
      row.declaration
    ) {
      setStatus(
        row.declaration.status ===
          "CONFLICT_DECLARED"
          ? "CONFLICT_DECLARED"
          : "NO_CONFLICT",
      );
      setInterestTypes(
        row.declaration.interestTypes,
      );
      setDetails(
        row.declaration.details ?? "",
      );
      setAgendaItemIds(
        row.declaration.agendaItemIds,
      );
      setRecusalIntent(
        row.declaration.recusalIntent ?? false,
      );
    } else {
      setStatus("NO_CONFLICT");
      setInterestTypes([]);
      setDetails("");
      setAgendaItemIds([]);
      setRecusalIntent(false);
    }

    setCorrectionReason("");
    setMessage("");
    setErrorMessage("");
  }

  async function submit(
    action:
      | "declare"
      | "record"
      | "correct",
    requestedStatus:
      | "NO_CONFLICT"
      | "CONFLICT_DECLARED",
    requestedUserId?: string,
  ) {
    setWorking(true);
    setErrorMessage("");
    setMessage("");

    try {
      const payload =
        await request<CoiResponse>(
          `/api/meetings/${encodeURIComponent(meetingId)}/coi`,
          {
            method: "POST",
            body: JSON.stringify({
              action,
              userId: requestedUserId,
              status: requestedStatus,
              interestTypes:
                requestedStatus ===
                "CONFLICT_DECLARED"
                  ? interestTypes
                  : [],
              details:
                requestedStatus ===
                "CONFLICT_DECLARED"
                  ? details
                  : undefined,
              agendaItemIds:
                requestedStatus ===
                "CONFLICT_DECLARED"
                  ? agendaItemIds
                  : [],
              recusalIntent:
                requestedStatus ===
                "CONFLICT_DECLARED"
                  ? recusalIntent
                  : undefined,
              correctionReason:
                action === "correct"
                  ? correctionReason
                  : undefined,
            }),
          },
        );

      setData(payload);
      setMessage(
        payload.warnings?.length
          ? `Conflict-of-interest record saved. ${payload.warnings.join(" ")}`
          : "Conflict-of-interest record saved.",
      );
      resetEditor();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to save conflict-of-interest declaration.",
      );
    } finally {
      setWorking(false);
    }
  }

  function toggleType(value: string) {
    setInterestTypes((current) =>
      current.includes(value)
        ? current.filter(
            (item) => item !== value,
          )
        : [...current, value],
    );
  }

  function toggleAgenda(value: string) {
    setAgendaItemIds((current) =>
      current.includes(value)
        ? current.filter(
            (item) => item !== value,
          )
        : [...current, value],
    );
  }

  if (initialLoading) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-500">
          Loading conflict-of-interest registerÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦
        </p>
      </section>
    );
  }

  if (!data) {
    return (
      <section className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">
        {errorMessage ||
          "Conflict-of-interest register is unavailable."}
      </section>
    );
  }

  const locked =
    data.meeting.status !== "SCHEDULED";

  const canSelfDeclare =
    user.role === "MEMBER" &&
    !locked &&
    ownRow?.attendanceStatus ===
      "PRESENT" &&
    !ownRow.declaration;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-6 py-5">
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
          <div>
            <h3 className="font-semibold">
              Conflict of Interest
            </h3>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
              One declaration applies to the
              whole meeting. Agenda references
              identify affected items.
              Declarations lock when the meeting
              closes.
            </p>
          </div>

          {data.viewer.isChair && (
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
              Chair view
            </span>
          )}
        </div>
      </div>

      {message && (
        <div className="mx-6 mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </div>
      )}

      {errorMessage && (
        <div className="mx-6 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {errorMessage}
        </div>
      )}

      {canSelfDeclare && (
        <div className="border-b border-slate-100 p-6">
          <p className="text-sm font-semibold text-slate-900">
            Your declaration is required
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Confirm that you have no conflict,
            or declare the conflict before the
            meeting is closed.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={working}
              onClick={() =>
                void submit(
                  "declare",
                  "NO_CONFLICT",
                )
              }
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              No conflict
            </button>

            <button
              type="button"
              disabled={working}
              onClick={() => {
                setTargetUserId(user.id);
                setMode("record");
                setStatus(
                  "CONFLICT_DECLARED",
                );
              }}
              className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Declare conflict
            </button>
          </div>
        </div>
      )}

      <div className="divide-y divide-slate-100">
        {data.declarations.map((row) => (
          <div
            key={row.user.id}
            className="px-6 py-5"
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="font-semibold text-slate-900">
                  {row.user.name}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {row.user.membershipRole} ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â·
                  Attendance:{" "}
                  {row.attendanceStatus ??
                    "Not recorded"}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {row.declaration ? (
                  <span
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusClasses(row.declaration.status)}`}
                  >
                    {statusLabel(
                      row.declaration.status,
                    )}
                  </span>
                ) : (
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500">
                    Not submitted
                  </span>
                )}

                {user.role === "ADMIN" &&
                  data.meeting.status ===
                    "SCHEDULED" &&
                  row.attendanceStatus ===
                    "PRESENT" &&
                  !row.declaration && (
                    <button
                      type="button"
                      onClick={() =>
                        openEditor(
                          row,
                          "record",
                        )
                      }
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700"
                    >
                      Record
                    </button>
                  )}

                {user.role === "ADMIN" &&
                  data.meeting.status ===
                    "CLOSED" &&
                  row.declaration && (
                    <button
                      type="button"
                      onClick={() =>
                        openEditor(
                          row,
                          "correct",
                        )
                      }
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700"
                    >
                      Correct
                    </button>
                  )}
              </div>
            </div>

            {row.declaration?.status ===
              "CONFLICT_DECLARED" && (
              <div className="mt-4 rounded-xl border border-red-100 bg-red-50/50 p-4 text-sm text-slate-700">
                <p>
                  <strong>Type:</strong>{" "}
                  {row.declaration.interestTypes.join(
                    ", ",
                  )}
                </p>

                <p className="mt-1">
                  <strong>Details:</strong>{" "}
                  {row.declaration.details}
                </p>

                <p className="mt-1">
                  <strong>Recusal:</strong>{" "}
                  {row.declaration.recusalIntent
                    ? "Yes"
                    : "No"}
                </p>

                {row.declaration.agendaItemIds
                  .length > 0 && (
                  <p className="mt-1">
                    <strong>Agenda:</strong>{" "}
                    {data.meeting.agendaItems
                      .filter((item) =>
                        row.declaration?.agendaItemIds.includes(
                          item.id,
                        ),
                      )
                      .map(
                        (item) =>
                          `${item.position}. ${item.title}`,
                      )
                      .join(", ")}
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {mode && targetUserId && (
        <div className="border-t border-slate-200 bg-slate-50 p-6">
          <h4 className="font-semibold text-slate-900">
            {mode === "correct"
              ? "Correct locked declaration"
              : "Record conflict-of-interest declaration"}
          </h4>

          <div className="mt-4 grid gap-4">
            <label className="text-sm font-medium text-slate-700">
              Declaration
              <select
                value={status}
                onChange={(event) =>
                  setStatus(
                    event.target.value as
                      | "NO_CONFLICT"
                      | "CONFLICT_DECLARED",
                  )
                }
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
              >
                <option value="NO_CONFLICT">
                  No conflict
                </option>
                <option value="CONFLICT_DECLARED">
                  Conflict declared
                </option>
              </select>
            </label>

            {status ===
              "CONFLICT_DECLARED" && (
              <>
                <fieldset>
                  <legend className="text-sm font-medium text-slate-700">
                    Conflict type
                  </legend>

                  <div className="mt-2 flex flex-wrap gap-2">
                    {conflictTypes.map(
                      (item) => (
                        <label
                          key={item}
                          className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={interestTypes.includes(
                              item,
                            )}
                            onChange={() =>
                              toggleType(item)
                            }
                          />
                          {item}
                        </label>
                      ),
                    )}
                  </div>
                </fieldset>

                <label className="text-sm font-medium text-slate-700">
                  Details
                  <textarea
                    rows={4}
                    value={details}
                    onChange={(event) =>
                      setDetails(
                        event.target.value,
                      )
                    }
                    className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                    placeholder="Describe the nature of the conflict."
                  />
                </label>

                <fieldset>
                  <legend className="text-sm font-medium text-slate-700">
                    Related agenda items
                    (optional)
                  </legend>

                  <div className="mt-2 grid gap-2">
                    {data.meeting.agendaItems.map(
                      (item) => (
                        <label
                          key={item.id}
                          className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={agendaItemIds.includes(
                              item.id,
                            )}
                            onChange={() =>
                              toggleAgenda(
                                item.id,
                              )
                            }
                          />
                          <span>
                            {item.position}.{" "}
                            {item.title}
                          </span>
                        </label>
                      ),
                    )}
                  </div>
                </fieldset>

                <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={recusalIntent}
                    onChange={(event) =>
                      setRecusalIntent(
                        event.target.checked,
                      )
                    }
                  />
                  Member intends to recuse from
                  affected agenda items
                </label>
              </>
            )}

            {mode === "correct" && (
              <label className="text-sm font-medium text-slate-700">
                Mandatory correction reason
                <textarea
                  rows={3}
                  value={correctionReason}
                  onChange={(event) =>
                    setCorrectionReason(
                      event.target.value,
                    )
                  }
                  className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                  placeholder="Why is the locked declaration being corrected?"
                />
              </label>
            )}
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              disabled={working}
              onClick={resetEditor}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="button"
              disabled={working}
              onClick={() =>
                void submit(
                  mode === "correct"
                    ? "correct"
                    : targetUserId ===
                          user.id &&
                        user.role ===
                          "MEMBER"
                      ? "declare"
                      : "record",
                  status,
                  targetUserId,
                )
              }
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {working
                ? "SavingÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦"
                : "Save declaration"}
            </button>
          </div>
        </div>
      )}

      <div className="border-t border-slate-100 px-6 py-4 text-xs text-slate-400">
        Meeting timezone: {timezone}.
        Corrections create new immutable
        revisions; original declarations are
        retained.
      </div>
    </section>
  );
}