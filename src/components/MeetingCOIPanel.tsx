import { useEffect, useMemo, useState } from "react";

type UserRole = "MEMBER" | "ADMIN" | "EXCO_MANAGEMENT";
type MeetingStatus = "SCHEDULED" | "CLOSED" | "CANCELLED";
type COIStatus =
  | "NO_CONFLICT"
  | "CONFLICT_DECLARED"
  | "DECLARATION_NOT_SUBMITTED";

interface AgendaItem {
  id?: string;
  position: number;
  title: string;
  description?: string | null;
}

interface Declaration {
  id: string;
  status: COIStatus;
  source: "SELF" | "ADMIN" | "SYSTEM";
  interestTypes?: unknown;
  details?: string | null;
  agendaItemIds?: unknown;
  recusalIntent?: boolean | null;
  declaredAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface DeclarationRow {
  user: {
    id: string;
    name: string;
    email: string;
    membershipRole: string;
  };
  attendanceStatus:
    | "PRESENT"
    | "ABSENT"
    | "EXCUSED"
    | "APOLOGY"
    | "ABSENT_NO_APOLOGY"
    | "APOLOGY_DRAFT"
    | "APOLOGY_DRAFT_REJECTED"
    | null;
  declaration: Declaration | null;
}

interface RegisterResponse {
  success: boolean;
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
  };
  declarations: DeclarationRow[];
}

interface Props {
  meetingId: string;
  agendaItems: AgendaItem[];
}

const INTEREST_TYPES = [
  "Financial interest",
  "Family / close relationship",
  "Business relationship",
  "Supplier / contractor relationship",
  "Personal interest",
  "Other",
];

async function requestJson<T>(
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

  let data: unknown = {};

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = {
        error: "Unexpected server response.",
      };
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

function statusLabel(status: COIStatus): string {
  if (status === "NO_CONFLICT") return "No conflict";
  if (status === "CONFLICT_DECLARED") return "Conflict declared";
  return "Declaration not submitted";
}

function statusClass(status: COIStatus): string {
  if (status === "CONFLICT_DECLARED") {
    return "bg-red-50 text-red-700";
  }

  if (status === "NO_CONFLICT") {
    return "bg-emerald-50 text-emerald-700";
  }

  return "bg-amber-50 text-amber-800";
}

function extractStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value.filter(
    (item): item is string =>
      typeof item === "string",
  );
}

export default function MeetingCOIPanel({
  meetingId,
  agendaItems,
}: Props) {
  const [data, setData] = useState<RegisterResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const [choice, setChoice] = useState<
    "NO_CONFLICT" | "CONFLICT_DECLARED" | ""
  >("");

  const [interestTypes, setInterestTypes] =
    useState<string[]>([]);

  const [details, setDetails] = useState("");
  const [selectedAgendaItems, setSelectedAgendaItems] =
    useState<string[]>([]);
  const [recusalIntent, setRecusalIntent] =
    useState<boolean | null>(null);

  const [correctionUserId, setCorrectionUserId] =
    useState<string | null>(null);

  const [correctionStatus, setCorrectionStatus] =
    useState<
      "NO_CONFLICT" | "CONFLICT_DECLARED"
    >("NO_CONFLICT");

  const [correctionReason, setCorrectionReason] =
    useState("");

  const [correctionDetails, setCorrectionDetails] =
    useState("");

  const [correctionInterestTypes, setCorrectionInterestTypes] =
    useState<string[]>([]);

  const [correctionAgendaItems, setCorrectionAgendaItems] =
    useState<string[]>([]);

  const [correctionRecusalIntent, setCorrectionRecusalIntent] =
    useState<boolean | null>(null);

  const load = async () => {
    if (!meetingId) return;

    setLoading(true);
    setErrorMessage("");

    try {
      const result = await requestJson<RegisterResponse>(
        `/api/meetings/${encodeURIComponent(meetingId)}/coi`,
      );

      setData(result);

      const ownRow = result.declarations.find(
        (row) =>
          row.user.id === result.viewer.userId,
      );

      if (ownRow?.declaration) {
        setChoice(
          ownRow.declaration.status ===
            "CONFLICT_DECLARED"
            ? "CONFLICT_DECLARED"
            : ownRow.declaration.status ===
                "NO_CONFLICT"
              ? "NO_CONFLICT"
              : "",
        );

        setInterestTypes(
          extractStringArray(
            ownRow.declaration.interestTypes,
          ),
        );

        setDetails(
          ownRow.declaration.details ?? "",
        );

        setSelectedAgendaItems(
          extractStringArray(
            ownRow.declaration.agendaItemIds,
          ),
        );

        setRecusalIntent(
          ownRow.declaration.recusalIntent ?? null,
        );
      }
    } catch (caught) {
      setErrorMessage(
        caught instanceof Error
          ? caught.message
          : "Unable to load the conflict-of-interest register.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [meetingId]);

  const ownRow = useMemo(
    () =>
      data?.declarations.find(
        (row) =>
          row.user.id === data.viewer.userId,
      ) ?? null,
    [data],
  );

  const canSelfDeclare =
    data?.viewer.role === "MEMBER" ||
    data?.viewer.role === "ADMIN";

  const isAdmin =
    data?.viewer.role === "ADMIN";

  const isReadOnly =
    data?.viewer.role === "EXCO_MANAGEMENT";

  const meetingClosed =
    data?.meeting.status === "CLOSED";

  const meetingCancelled =
    data?.meeting.status === "CANCELLED";

  const ownAttendanceIsPresent =
    ownRow?.attendanceStatus === "PRESENT";

  const hasOwnDeclaration =
    Boolean(ownRow?.declaration);

  const submitDeclaration = async () => {
    if (!choice) {
      setErrorMessage(
        "Choose No conflict or Yes — I have a conflict.",
      );
      return;
    }

    if (
      choice === "CONFLICT_DECLARED" &&
      interestTypes.length === 0
    ) {
      setErrorMessage(
        "Select at least one conflict-of-interest type.",
      );
      return;
    }

    if (
      choice === "CONFLICT_DECLARED" &&
      !details.trim()
    ) {
      setErrorMessage(
        "Provide details for the declared conflict.",
      );
      return;
    }

    if (
      choice === "CONFLICT_DECLARED" &&
      recusalIntent === null
    ) {
      setErrorMessage(
        "Indicate whether you intend to recuse yourself.",
      );
      return;
    }

    setSaving(true);
    setErrorMessage("");

    try {
      await requestJson(
        `/api/meetings/${encodeURIComponent(meetingId)}/coi`,
        {
          method: "POST",
          body: JSON.stringify({
            action: "declare",
            status: choice,
            interestTypes,
            details,
            agendaItemIds: selectedAgendaItems,
            recusalIntent,
          }),
        },
      );

      await load();
    } catch (caught) {
      setErrorMessage(
        caught instanceof Error
          ? caught.message
          : "Unable to save the declaration.",
      );
    } finally {
      setSaving(false);
    }
  };

  const startCorrection = (row: DeclarationRow) => {
    setCorrectionUserId(row.user.id);
    setCorrectionStatus(
      row.declaration?.status === "CONFLICT_DECLARED"
        ? "CONFLICT_DECLARED"
        : "NO_CONFLICT",
    );

    setCorrectionReason("");
    setCorrectionDetails(
      row.declaration?.details ?? "",
    );

    setCorrectionInterestTypes(
      extractStringArray(
        row.declaration?.interestTypes,
      ),
    );

    setCorrectionAgendaItems(
      extractStringArray(
        row.declaration?.agendaItemIds,
      ),
    );

    setCorrectionRecusalIntent(
      row.declaration?.recusalIntent ?? null,
    );
  };

  const submitCorrection = async () => {
    if (!correctionUserId) return;

    if (!correctionReason.trim()) {
      setErrorMessage(
        "A correction reason is mandatory.",
      );
      return;
    }

    if (
      correctionStatus === "CONFLICT_DECLARED" &&
      correctionInterestTypes.length === 0
    ) {
      setErrorMessage(
        "Select at least one conflict-of-interest type.",
      );
      return;
    }

    if (
      correctionStatus === "CONFLICT_DECLARED" &&
      !correctionDetails.trim()
    ) {
      setErrorMessage(
        "Provide details for the declared conflict.",
      );
      return;
    }

    if (
      correctionStatus === "CONFLICT_DECLARED" &&
      correctionRecusalIntent === null
    ) {
      setErrorMessage(
        "Indicate whether the member intends to recuse.",
      );
      return;
    }

    setSaving(true);
    setErrorMessage("");

    try {
      await requestJson(
        `/api/meetings/${encodeURIComponent(meetingId)}/coi`,
        {
          method: "POST",
          body: JSON.stringify({
            action: "correct",
            userId: correctionUserId,
            status: correctionStatus,
            interestTypes: correctionInterestTypes,
            details: correctionDetails,
            agendaItemIds: correctionAgendaItems,
            recusalIntent:
              correctionRecusalIntent,
            correctionReason,
          }),
        },
      );

      setCorrectionUserId(null);
      setCorrectionReason("");

      await load();
    } catch (caught) {
      setErrorMessage(
        caught instanceof Error
          ? caught.message
          : "Unable to correct the declaration.",
      );
    } finally {
      setSaving(false);
    }
  };

  if (!meetingId) return null;

  if (loading) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-500">
          Loading conflict-of-interest register…
        </p>
      </section>
    );
  }

  if (!data) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="font-semibold text-slate-900">
          Conflict of interest
        </p>
        <p className="mt-2 text-sm text-red-600">
          {errorMessage ||
            "The conflict-of-interest register could not be loaded."}
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-6 py-5">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
              Governance declaration
            </p>
            <h3 className="mt-1 text-lg font-semibold text-slate-950">
              Conflict of interest
            </h3>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Any conflict of interest relating to this meeting’s agenda?
            </p>
          </div>

          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            {data.meeting.status}
          </span>
        </div>
      </div>

      <div className="space-y-6 p-6">
        {errorMessage && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        {canSelfDeclare &&
          !hasOwnDeclaration &&
          !meetingClosed &&
          !meetingCancelled &&
          ownAttendanceIsPresent && (
            <div className="space-y-5 rounded-xl border border-slate-200 bg-slate-50 p-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => {
                    setChoice("NO_CONFLICT");
                    setInterestTypes([]);
                    setDetails("");
                    setSelectedAgendaItems([]);
                    setRecusalIntent(null);
                  }}
                  className={`rounded-xl border px-4 py-3 text-left text-sm font-semibold transition ${
                    choice === "NO_CONFLICT"
                      ? "border-slate-900 bg-white text-slate-950"
                      : "border-slate-300 bg-white text-slate-700 hover:border-slate-500"
                  }`}
                >
                  No — I have no conflict
                </button>

                <button
                  type="button"
                  onClick={() => setChoice("CONFLICT_DECLARED")}
                  className={`rounded-xl border px-4 py-3 text-left text-sm font-semibold transition ${
                    choice === "CONFLICT_DECLARED"
                      ? "border-slate-900 bg-white text-slate-950"
                      : "border-slate-300 bg-white text-slate-700 hover:border-slate-500"
                  }`}
                >
                  Yes — I have a conflict
                </button>
              </div>

              {choice === "CONFLICT_DECLARED" && (
                <div className="space-y-5">
                  <div>
                    <p className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                      Conflict type
                    </p>

                    <div className="grid gap-2 sm:grid-cols-2">
                      {INTEREST_TYPES.map((type) => (
                        <label
                          key={type}
                          className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700"
                        >
                          <input
                            type="checkbox"
                            checked={interestTypes.includes(type)}
                            onChange={(event) => {
                              setInterestTypes((current) =>
                                event.target.checked
                                  ? [...current, type]
                                  : current.filter(
                                      (item) =>
                                        item !== type,
                                    ),
                              );
                            }}
                          />
                          {type}
                        </label>
                      ))}
                    </div>
                  </div>

                  <label className="block">
                    <span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                      Details
                    </span>

                    <textarea
                      value={details}
                      onChange={(event) =>
                        setDetails(event.target.value)
                      }
                      rows={4}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                      placeholder="Describe the nature of the conflict."
                    />
                  </label>

                  {agendaItems.length > 0 && (
                    <div>
                      <p className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                        Relevant agenda items
                      </p>

                      <div className="space-y-2">
                        {agendaItems.map((item) =>
                          item.id ? (
                            <label
                              key={item.id}
                              className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700"
                            >
                              <input
                                type="checkbox"
                                checked={selectedAgendaItems.includes(
                                  item.id,
                                )}
                                onChange={(event) => {
                                  setSelectedAgendaItems(
                                    (current) =>
                                      event.target.checked
                                        ? [
                                            ...current,
                                            item.id!,
                                          ]
                                        : current.filter(
                                            (id) =>
                                              id !==
                                              item.id,
                                          ),
                                  );
                                }}
                              />

                              <span>
                                <span className="font-semibold text-slate-900">
                                  {item.position}.{" "}
                                  {item.title}
                                </span>
                              </span>
                            </label>
                          ) : null,
                        )}
                      </div>
                    </div>
                  )}

                  <div>
                    <p className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                      Recusal
                    </p>

                    <div className="grid gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() =>
                          setRecusalIntent(true)
                        }
                        className={`rounded-lg border px-3 py-2.5 text-sm font-semibold ${
                          recusalIntent === true
                            ? "border-slate-900 bg-white"
                            : "border-slate-300 bg-white"
                        }`}
                      >
                        I intend to recuse
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setRecusalIntent(false)
                        }
                        className={`rounded-lg border px-3 py-2.5 text-sm font-semibold ${
                          recusalIntent === false
                            ? "border-slate-900 bg-white"
                            : "border-slate-300 bg-white"
                        }`}
                      >
                        I do not intend to recuse
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <button
                type="button"
                disabled={saving}
                onClick={() => void submitDeclaration()}
                className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving
                  ? "Saving…"
                  : "Submit declaration"}
              </button>
            </div>
          )}

        {canSelfDeclare &&
          !ownAttendanceIsPresent &&
          !hasOwnDeclaration &&
          !meetingClosed &&
          !meetingCancelled && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
              The conflict-of-interest declaration becomes available after you are recorded as present.
            </div>
          )}

        {ownRow?.declaration && (
          <div className="rounded-xl border border-slate-200 p-5">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                  Your declaration
                </p>

                <span
                  className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(
                    ownRow.declaration.status,
                  )}`}
                >
                  {statusLabel(
                    ownRow.declaration.status,
                  )}
                </span>
              </div>

              <span className="text-xs text-slate-500">
                Source:{" "}
                {ownRow.declaration.source}
              </span>
            </div>

            {ownRow.declaration.status ===
              "CONFLICT_DECLARED" && (
              <div className="mt-4 space-y-3 text-sm text-slate-700">
                <div>
                  <span className="font-semibold">
                    Types:
                  </span>{" "}
                  {extractStringArray(
                    ownRow.declaration
                      .interestTypes,
                  ).join(", ") || "Not recorded"}
                </div>

                <div>
                  <span className="font-semibold">
                    Details:
                  </span>{" "}
                  {ownRow.declaration.details ||
                    "Not recorded"}
                </div>

                <div>
                  <span className="font-semibold">
                    Recusal intent:
                  </span>{" "}
                  {ownRow.declaration.recusalIntent
                    ? "Yes"
                    : "No"}
                </div>
              </div>
            )}
          </div>
        )}

        {(isAdmin || isReadOnly) && (
          <div>
            <div className="mb-4">
              <h4 className="font-semibold text-slate-950">
                COI register
              </h4>
              <p className="mt-1 text-sm text-slate-500">
                {isReadOnly
                  ? "Read-only governance view across this committee."
                  : "Review declarations and identify unresolved declarations."}
              </p>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">
                      Member
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">
                      Attendance
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">
                      Declaration
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">
                      Source
                    </th>
                    {isAdmin && meetingClosed && (
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">
                        Action
                      </th>
                    )}
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 bg-white">
                  {data.declarations.map((row) => (
                    <tr key={row.user.id}>
                      <td className="px-4 py-4">
                        <p className="font-semibold text-slate-900">
                          {row.user.name}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {row.user.membershipRole}
                        </p>
                      </td>

                      <td className="px-4 py-4 text-slate-600">
                        {row.attendanceStatus ??
                          "Not recorded"}
                      </td>

                      <td className="px-4 py-4">
                        {row.declaration ? (
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(
                              row.declaration.status,
                            )}`}
                          >
                            {statusLabel(
                              row.declaration.status,
                            )}
                          </span>
                        ) : (
                          <span className="text-slate-400">
                            Not submitted
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-4 text-slate-600">
                        {row.declaration?.source ??
                          "—"}
                      </td>

                      {isAdmin &&
                        meetingClosed && (
                          <td className="px-4 py-4">
                            {row.declaration && (
                              <button
                                type="button"
                                onClick={() =>
                                  startCorrection(row)
                                }
                                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                              >
                                Correct
                              </button>
                            )}
                          </td>
                        )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {isAdmin &&
          meetingClosed &&
          correctionUserId && (
            <div className="rounded-xl border border-slate-300 bg-slate-50 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h4 className="font-semibold text-slate-950">
                    Correct declaration
                  </h4>
                  <p className="mt-1 text-sm text-slate-500">
                    Post-close corrections are permanently audited.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setCorrectionUserId(null)
                  }
                  className="text-slate-400 hover:text-slate-900"
                >
                  ×
                </button>
              </div>

              <div className="mt-5 space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() =>
                      setCorrectionStatus("NO_CONFLICT")
                    }
                    className={`rounded-lg border px-3 py-3 text-sm font-semibold ${
                      correctionStatus ===
                      "NO_CONFLICT"
                        ? "border-slate-900 bg-white"
                        : "border-slate-300 bg-white"
                    }`}
                  >
                    No conflict
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setCorrectionStatus(
                        "CONFLICT_DECLARED",
                      )
                    }
                    className={`rounded-lg border px-3 py-3 text-sm font-semibold ${
                      correctionStatus ===
                      "CONFLICT_DECLARED"
                        ? "border-slate-900 bg-white"
                        : "border-slate-300 bg-white"
                    }`}
                  >
                    Conflict declared
                  </button>
                </div>

                {correctionStatus ===
                  "CONFLICT_DECLARED" && (
                  <>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {INTEREST_TYPES.map((type) => (
                        <label
                          key={type}
                          className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={correctionInterestTypes.includes(
                              type,
                            )}
                            onChange={(event) => {
                              setCorrectionInterestTypes(
                                (current) =>
                                  event.target.checked
                                    ? [
                                        ...current,
                                        type,
                                      ]
                                    : current.filter(
                                        (item) =>
                                          item !== type,
                                      ),
                              );
                            }}
                          />
                          {type}
                        </label>
                      ))}
                    </div>

                    <textarea
                      value={correctionDetails}
                      onChange={(event) =>
                        setCorrectionDetails(
                          event.target.value,
                        )
                      }
                      rows={4}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm"
                      placeholder="Corrected conflict details"
                    />

                    <div className="grid gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() =>
                          setCorrectionRecusalIntent(
                            true,
                          )
                        }
                        className={`rounded-lg border px-3 py-2.5 text-sm font-semibold ${
                          correctionRecusalIntent ===
                          true
                            ? "border-slate-900 bg-white"
                            : "border-slate-300 bg-white"
                        }`}
                      >
                        Recusal intended
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setCorrectionRecusalIntent(
                            false,
                          )
                        }
                        className={`rounded-lg border px-3 py-2.5 text-sm font-semibold ${
                          correctionRecusalIntent ===
                          false
                            ? "border-slate-900 bg-white"
                            : "border-slate-300 bg-white"
                        }`}
                      >
                        No recusal intended
                      </button>
                    </div>
                  </>
                )}

                <textarea
                  value={correctionReason}
                  onChange={(event) =>
                    setCorrectionReason(
                      event.target.value,
                    )
                  }
                  rows={3}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm"
                  placeholder="Mandatory reason for correction"
                />

                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() =>
                      void submitCorrection()
                    }
                    className="rounded-lg border border-slate-900 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {saving
                      ? "Saving…"
                      : "Save correction"}
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setCorrectionUserId(null)
                    }
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

        {meetingCancelled && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
            This meeting was cancelled. Historical conflict-of-interest records remain available, but no new declarations or corrections can be made.
          </div>
        )}

        {meetingClosed && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
            The meeting is closed. Conflict-of-interest declarations are locked. Administrators may make audited corrections where required.
          </div>
        )}
      </div>
    </section>
  );
}