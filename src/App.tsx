import {
  QRCodeSVG,
} from "qrcode.react";
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import LoginPage from "./auth/LoginPage";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import ConflictOfInterestPanel from "./components/ConflictOfInterestPanel";
import DocumentsPanel from "./components/DocumentsPanel";

import GovernanceReportsPanel from "./components/GovernanceReportsPanel";
import AdminManagementPanel from "./components/AdminManagementPanel";
import NotificationsPanel from "./components/NotificationsPanel";
import DashboardPanel from "./components/DashboardPanel";
import PortalHeader from "./components/PortalHeader";
type UserRole = "MEMBER" | "ADMIN" | "EXCO_MANAGEMENT";
type MeetingStatus = "SCHEDULED" | "CLOSED" | "CANCELLED";
type AttendanceStatus = "PRESENT" | "ABSENT" | "EXCUSED" | "APOLOGY" | "ABSENT_NO_APOLOGY" | "APOLOGY_DRAFT" | "APOLOGY_DRAFT_REJECTED";
type ZohoRsvp = "ACCEPTED" | "DECLINED" | "TENTATIVE" | "NEEDS-ACTION" | null;
interface Committee { id: string; name: string; slug: string; type: string; }
interface AgendaItem { id?: string; position: number; title: string; description?: string | null; }
interface Meeting { id: string; committeeId: string; title: string; description?: string | null; startAt: string; endAt: string; timezone: string; location: string; status: MeetingStatus; zohoEventUid?: string | null; lastSyncedAt?: string | null; closedAt?: string | null; cancelledAt?: string | null; cancelledById?: string | null; createdById: string; createdAt: string; updatedAt: string; committee: Committee; agendaItems: AgendaItem[]; }
interface AttendanceRecord { id: string; meetingId: string; userId: string; status: AttendanceStatus; source: "SELF" | "ADMIN" | "ZOHO_SYNC" | "SYSTEM"; reason?: string | null; markedAt: string; markedBy?: { id: string; name: string } | null; }
interface AttendanceRow { user: { id: string; name: string; email: string; membershipRole: string }; attendance: AttendanceRecord | null; zohoRsvp: ZohoRsvp; }
interface AttendanceResponse { success: boolean; meeting: { id: string; status: MeetingStatus; startAt: string; endAt: string; committeeId: string; lastSyncedAt: string | null; closedAt: string | null }; attendance: AttendanceRow[]; sync: { synced: boolean; createdDrafts: number; lastSyncedAt: string | null }; }
interface ApiResponse<T = unknown> { success: boolean; error?: string; code?: string; warnings?: string[]; meetings?: T; committees?: T; meeting?: T; }
interface MeetingFormState { committeeId: string; title: string; description: string; startAt: string; endAt: string; timezone: string; location: string; agendaItems: Array<{ title: string; description: string }>; }
type ActiveTab = "overview" | "meetings" | "committees" | "reports" | "notifications" | "admin";
type MeetingFilter = "upcoming" | "past" | "cancelled" | "closed" | "all";

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> { const response = await fetch(path, { ...options, credentials: "include", headers: { "Content-Type": "application/json", ...(options.headers ?? {}) } }); const text = await response.text(); let data: unknown = {}; if (text) { try { data = JSON.parse(text); } catch { data = { error: "Unexpected server response." }; } } if (!response.ok) { const message = typeof data === "object" && data !== null && "error" in data && typeof data.error === "string" ? data.error : "Request failed."; throw new Error(message); } return data as T; }
function formatDateTime(value: string, timezone: string): string { try { return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(new Date(value)); } catch { return new Date(value).toLocaleString("en-GB"); } }
function formatDate(value: string, timezone: string): string { try { return new Intl.DateTimeFormat("en-GB", { dateStyle: "full", timeZone: timezone }).format(new Date(value)); } catch { return new Date(value).toLocaleDateString("en-GB"); } }
function formatTime(value: string, timezone: string): string { try { return new Intl.DateTimeFormat("en-GB", { timeStyle: "short", timeZone: timezone }).format(new Date(value)); } catch { return new Date(value).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }); } }
function meetingStatusLabel(status: MeetingStatus): string {
  if (status === "SCHEDULED") return "Scheduled";
  if (status === "CLOSED") return "Closed";
  return "Cancelled";
}

function committeeTypeLabel(value: string): string {
  if (value === "MAIN") return "Main Committee";
  if (value === "SUBCOMMITTEE") return "Subcommittee";

  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (character) =>
      character.toUpperCase(),
    );
}
function statusLabel(status: AttendanceStatus): string { return status.replaceAll("_", " ").toLowerCase().replace(/(^| )\S/g, (v) => v.toUpperCase()); }
function statusTone(status: AttendanceStatus): "neutral" | "success" | "danger" | "gold" { if (status === "PRESENT") return "success"; if (status === "ABSENT" || status === "ABSENT_NO_APOLOGY") return "danger"; if (status === "APOLOGY" || status === "EXCUSED") return "gold"; return "neutral"; }
function rsvpLabel(value: ZohoRsvp): string { if (!value) return "Not recorded"; return value === "ACCEPTED" ? "Yes" : value === "DECLINED" ? "No" : value === "TENTATIVE" ? "Maybe" : "Awaiting response"; }
function emptyForm(committeeId = ""): MeetingFormState { return { committeeId, title: "", description: "", startAt: "", endAt: "", timezone: "Africa/Nairobi", location: "", agendaItems: [{ title: "", description: "" }] }; }
function toDateTimeLocal(value: string): string { const date = new Date(value); if (Number.isNaN(date.getTime())) return ""; const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000); return local.toISOString().slice(0, 16); }
function Button({
  children,
  onClick,
  type = "button",
  variant = "secondary",
  disabled = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  variant?:
    | "primary"
    | "secondary"
    | "danger"
    | "ghost";
  disabled?: boolean;
}) {
  const classes = {
    primary:
      "border-[#0B1F3A] bg-[#0B1F3A] text-white hover:bg-[#17365F]",
    secondary:
      "border-slate-300 bg-white text-[#172033] hover:border-[#C8A45D]/70 hover:bg-[#FAF9F6]",
    danger:
      "border-red-700 bg-red-700 text-white hover:bg-red-800",
    ghost:
      "border-transparent bg-transparent text-[#17365F] hover:bg-[#F5EDDB]",
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-10 items-center justify-center rounded-lg border px-4 py-2 text-[12px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${classes[variant]}`}
    >
      {children}
    </button>
  );
}

function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?:
    | "neutral"
    | "success"
    | "danger"
    | "gold";
}) {
  const classes = {
    neutral:
      "border-slate-200 bg-slate-50 text-slate-600",
    success:
      "border-emerald-200 bg-emerald-50 text-emerald-700",
    danger:
      "border-red-200 bg-red-50 text-red-700",
    gold:
      "border-amber-200 bg-amber-50 text-amber-800",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold ${classes[tone]}`}
    >
      {children}
    </span>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-semibold text-slate-700">
        {label}
      </span>

      {children}
    </label>
  );
}

function TextInput(
  props:
    React.InputHTMLAttributes<HTMLInputElement>,
) {
  return (
    <input
      {...props}
      className={`w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#C8A45D] focus:ring-2 focus:ring-[#C8A45D]/15 ${props.className ?? ""}`}
    />
  );
}

function TextArea(
  props:
    React.TextareaHTMLAttributes<HTMLTextAreaElement>,
) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#C8A45D] focus:ring-2 focus:ring-[#C8A45D]/15 ${props.className ?? ""}`}
    />
  );
}

function Select(
  props:
    React.SelectHTMLAttributes<HTMLSelectElement>,
) {
  return (
    <select
      {...props}
      className={`w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-[#C8A45D] focus:ring-2 focus:ring-[#C8A45D]/15 ${props.className ?? ""}`}
    />
  );
}
function Header({
  user,
  activeTab,
  onTabChange,
  onLogout,
}: {
  user: {
    name: string;
    email: string;
    role: UserRole;
  };
  activeTab: ActiveTab;
  onTabChange: (
    tab: ActiveTab,
  ) => void;
  onLogout: () => void;
}) {
  return (
    <PortalHeader
      user={user}
      activeTab={activeTab}
      onTabChange={
        onTabChange
      }
      onLogout={
        onLogout
      }
    />
  );
}
function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="px-6 py-14 text-center">
      <div className="mx-auto h-2.5 w-2.5 rounded-full bg-[#C8A45D]" />

      <h3 className="mt-4 text-[16px] font-semibold text-[#07172A]">
        {title}
      </h3>

      <p className="mx-auto mt-2 max-w-lg text-[12px] leading-5 text-slate-500">
        {description}
      </p>
    </div>
  );
}

function DetailCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-[#E4E4DF] bg-[#FAF9F6] px-4 py-3.5">
      <p className="text-[10px] font-semibold text-slate-500">
        {label}
      </p>

      <p className="mt-1 text-[13px] font-semibold leading-5 text-[#07172A]">
        {value}
      </p>
    </div>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#07172A]/55 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onMouseDown={(
        event,
      ) => {
        if (
          event.target ===
          event.currentTarget
        ) {
          onClose();
        }
      }}
    >
      <div className="w-full max-w-lg rounded-2xl border border-[#E4E4DF] bg-white p-6 shadow-[0_26px_80px_rgba(7,23,42,0.20)]">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-[20px] font-semibold tracking-[-0.035em] text-[#07172A]">
            {title}
          </h2>

          <button
            type="button"
            onClick={
              onClose
            }
            className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-lg text-slate-500 transition hover:bg-slate-200 hover:text-[#07172A]"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {children}
      </div>
    </div>
  );
}
function Overview({
  user,
  meetings,
  committees,
  onNavigate,
  onCreateMeeting,
}: {
  user: {
    name: string;
    role: UserRole;
  };
  meetings: Meeting[];
  committees: Committee[];
  onNavigate: (
    tab: ActiveTab,
  ) => void;
  onCreateMeeting: () => void;
}) {
  return (
    <DashboardPanel
      user={user}
      meetings={meetings}
      committees={committees}
      onNavigate={
        onNavigate
      }
      onCreateMeeting={
        onCreateMeeting
      }
    />
  );
}
function MeetingsView({
  meetings,
  committees,
  user,
  onRefresh,
  onCreate,
}: {
  meetings: Meeting[];
  committees: Committee[];
  user: {
    id: string;
    role: UserRole;
  };
  onRefresh: () => Promise<void>;
  onCreate: () => void;
}) {
  const initialMatch =
    window.location.pathname.match(
      /^\/meetings\/([^/]+)$/,
    );

  const initialPathMeetingId =
    initialMatch?.[1]
      ? decodeURIComponent(
          initialMatch[1],
        )
      : null;

  const [
    filter,
    setFilter,
  ] =
    useState<MeetingFilter>(
      "upcoming",
    );

  const [
    committeeId,
    setCommitteeId,
  ] =
    useState("");

  const [
    selectedId,
    setSelectedId,
  ] =
    useState<
      string | null
    >(
      initialPathMeetingId,
    );

  const [
    now,
  ] =
    useState(
      () =>
        Date.now(),
    );

  const filtered =
    useMemo(
      () =>
        [
          ...meetings,
        ]
          .filter(
            (
              meeting,
            ) => {
              if (
                committeeId &&
                meeting.committeeId !==
                  committeeId
              ) {
                return false;
              }

              if (
                filter ===
                "cancelled"
              ) {
                return (
                  meeting.status ===
                  "CANCELLED"
                );
              }

              if (
                filter ===
                "closed"
              ) {
                return (
                  meeting.status ===
                  "CLOSED"
                );
              }

              if (
                filter ===
                "upcoming"
              ) {
                return (
                  meeting.status ===
                    "SCHEDULED" &&
                  +new Date(
                    meeting.startAt,
                  ) >=
                    now
                );
              }

              if (
                filter ===
                "past"
              ) {
                return (
                  meeting.status ===
                    "SCHEDULED" &&
                  +new Date(
                    meeting.endAt,
                  ) <
                    now
                );
              }

              return true;
            },
          )
          .sort(
            (
              first,
              second,
            ) =>
              +new Date(
                first.startAt,
              ) -
              +new Date(
                second.startAt,
              ),
          ),
      [
        meetings,
        filter,
        committeeId,
        now,
      ],
    );

  const selected =
    selectedId
      ? meetings.find(
          (
            meeting,
          ) =>
            meeting.id ===
            selectedId,
        ) ??
        null
      : null;

  function openMeeting(
    meetingId: string,
  ) {
    window.history.replaceState(
      {},
      "",
      `/meetings/${encodeURIComponent(
        meetingId,
      )}`,
    );

    setSelectedId(
      meetingId,
    );
  }

  if (selected) {
    return (
      <MeetingDetail
        meeting={
          selected
        }
        user={user}
        onBack={() => {
          setSelectedId(
            null,
          );

          if (
            window.location
              .pathname !==
            "/"
          ) {
            window.history.replaceState(
              {},
              "",
              "/",
            );
          }
        }}
        onRefresh={
          onRefresh
        }
      />
    );
  }

  const filterOptions:
    Array<
      [
        MeetingFilter,
        string,
      ]
    > = [
      [
        "upcoming",
        "Upcoming",
      ],
      [
        "past",
        "Past",
      ],
      [
        "closed",
        "Closed",
      ],
      [
        "cancelled",
        "Cancelled",
      ],
      [
        "all",
        "All",
      ],
    ];

  return (
    <div className="space-y-5">
      <section className="portal-page-header lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="portal-kicker">
            Meetings
          </p>

          <h2 className="portal-page-title mt-2">
            Committee meetings
          </h2>

          <p className="portal-page-copy mt-2">
            Review schedules, agenda items, attendance, declarations and supporting records from one place.
          </p>
        </div>

        {user.role ===
          "ADMIN" && (
            <Button
              variant="primary"
              onClick={
                onCreate
              }
            >
              Schedule meeting
            </Button>
          )}
      </section>

      <section className="portal-toolbar">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="flex flex-wrap gap-1.5">
            {filterOptions.map(
              (
                [
                  value,
                  label,
                ],
              ) => (
                <button
                  key={
                    value
                  }
                  type="button"
                  onClick={() =>
                    setFilter(
                      value,
                    )
                  }
                  className={`rounded-lg px-3 py-2 text-[11px] font-semibold transition ${
                    filter ===
                    value
                      ? "bg-[#0B1F3A] text-white"
                      : "text-slate-600 hover:bg-[#F2EAD7] hover:text-[#07172A]"
                  }`}
                >
                  {label}
                </button>
              ),
            )}
          </div>

          <div className="lg:ml-auto lg:w-72">
            <Select
              value={
                committeeId
              }
              onChange={(
                event,
              ) =>
                setCommitteeId(
                  event
                    .target
                    .value,
                )
              }
            >
              <option value="">
                All committees
              </option>

              {committees.map(
                (
                  committee,
                ) => (
                  <option
                    key={
                      committee.id
                    }
                    value={
                      committee.id
                    }
                  >
                    {
                      committee.name
                    }
                  </option>
                ),
              )}
            </Select>
          </div>
        </div>
      </section>

      <section className="portal-panel">
        <div className="flex items-center justify-between border-b border-[#E4E4DF] px-5 py-4 sm:px-6">
          <p className="text-[12px] font-semibold text-[#07172A]">
            {filtered.length} meeting
            {filtered.length ===
            1
              ? ""
              : "s"}
          </p>

          <p className="text-[10px] text-slate-400">
            Select a meeting to open its complete governance record.
          </p>
        </div>

        {filtered.length ===
        0 ? (
          <EmptyState
            title="No meetings found"
            description="No meetings match the current filters."
          />
        ) : (
          <div className="divide-y divide-[#EDECE7]">
            {filtered.map(
              (
                meeting,
              ) => {
                const startDate =
                  new Date(
                    meeting.startAt,
                  );

                let day: string;
                let month: string;

                try {
                  day =
                    new Intl.DateTimeFormat(
                      "en-GB",
                      {
                        day:
                          "2-digit",
                        timeZone:
                          meeting.timezone,
                      },
                    ).format(
                      startDate,
                    );

                  month =
                    new Intl.DateTimeFormat(
                      "en-GB",
                      {
                        month:
                          "short",
                        timeZone:
                          meeting.timezone,
                      },
                    )
                      .format(
                        startDate,
                      )
                      .toUpperCase();
                } catch {
                  day =
                    String(
                      startDate.getDate(),
                    );

                  month =
                    startDate
                      .toLocaleString(
                        "en-GB",
                        {
                          month:
                            "short",
                        },
                      )
                      .toUpperCase();
                }

                return (
                  <button
                    key={
                      meeting.id
                    }
                    type="button"
                    onClick={() =>
                      openMeeting(
                        meeting.id,
                      )
                    }
                    className="grid w-full gap-4 px-5 py-4 text-left transition hover:bg-[#FAF9F6] sm:grid-cols-[54px_1fr_auto] sm:items-center sm:px-6"
                  >
                    <div className="hidden rounded-xl bg-[#F2EAD7] px-2 py-2 text-center sm:block">
                      <p className="text-[18px] font-semibold leading-none text-[#07172A]">
                        {day}
                      </p>

                      <p className="mt-1 text-[9px] font-bold text-[#806027]">
                        {month}
                      </p>
                    </div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-[11px] font-semibold text-[#987534]">
                          {
                            meeting
                              .committee
                              .name
                          }
                        </p>

                        <Badge
                          tone={
                            meeting.status ===
                            "CANCELLED"
                              ? "danger"
                              : meeting.status ===
                                  "CLOSED"
                                ? "gold"
                                : "success"
                          }
                        >
                          {meetingStatusLabel(
                            meeting.status,
                          )}
                        </Badge>
                      </div>

                      <h3 className="mt-1 text-[15px] font-semibold text-[#07172A]">
                        {
                          meeting.title
                        }
                      </h3>

                      <p className="mt-1 text-[11px] text-slate-500">
                        {formatDateTime(
                          meeting.startAt,
                          meeting.timezone,
                        )}
                        {" · "}
                        {
                          meeting.location
                        }
                      </p>
                    </div>

                    <div className="flex items-center gap-4">
                      <span className="text-[10px] font-medium text-slate-400">
                        {
                          meeting
                            .agendaItems
                            .length
                        }{" "}
                        agenda{" "}
                        {meeting
                          .agendaItems
                          .length ===
                        1
                          ? "item"
                          : "items"}
                      </span>

                      <span className="text-slate-300">
                        →
                      </span>
                    </div>
                  </button>
                );
              },
            )}
          </div>
        )}
      </section>
    </div>
  );
}
function AttendancePanel({ meeting, user }: { meeting: Meeting; user: { id: string; role: UserRole } }) { const [data, setData] = useState<AttendanceResponse | null>(null); const [loading, setLoading] = useState(true); const [working, setWorking] = useState(false); const [errorMessage, setErrorMessage] = useState(""); const [message, setMessage] = useState(""); const [modal, setModal] = useState<{ type: "mark" | "correct" | "apology" | "reject"; row?: AttendanceRow } | null>(null); const [status, setStatus] = useState<AttendanceStatus>("PRESENT"); const [reason, setReason] = useState(""); const canAdmin = user.role === "ADMIN"; const canSelf = user.role === "MEMBER";
  const load = useCallback(async () => { setLoading(true); setErrorMessage(""); try { setData(await apiRequest<AttendanceResponse>(`/api/meetings/${encodeURIComponent(meeting.id)}/attendance`)); } catch (e) { setErrorMessage(e instanceof Error ? e.message : "Unable to load attendance."); } finally { setLoading(false); } }, [meeting.id]); useEffect(() => { void Promise.resolve().then(() => load()); }, [load]);
  async function action(body: Record<string, unknown>) { setWorking(true); setErrorMessage(""); setMessage(""); try { await apiRequest(`/api/meetings/${encodeURIComponent(meeting.id)}/attendance`, { method: "POST", body: JSON.stringify(body) }); await load(); await Promise.resolve(); setMessage("Attendance register refreshed from the server."); setModal(null); setReason(""); } catch (e) { setErrorMessage(e instanceof Error ? e.message : "Unable to complete attendance action."); } finally { setWorking(false); } }
  const own = data?.attendance.find((r) => r.user.id === user.id); const locked = data?.meeting.status === "CLOSED" || data?.meeting.status === "CANCELLED"; const selfCanAct = !locked && (!own?.attendance || own.attendance.status === "APOLOGY_DRAFT" || own.attendance.status === "APOLOGY_DRAFT_REJECTED");
  return <section className="rounded-xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-col gap-4 border-b border-slate-200 px-6 py-5 lg:flex-row lg:items-center lg:justify-between"><div><h3 className="font-semibold">Attendance & RSVP</h3><p className="mt-1 text-sm text-slate-500">Attendance is authoritative in the application. Zoho RSVP is an external signal used for on-demand apology drafts.</p>{data?.meeting.lastSyncedAt && <p className="mt-1 text-xs text-slate-400">Last Zoho sync: {formatDateTime(data.meeting.lastSyncedAt, meeting.timezone)}</p>}</div><div className="flex flex-wrap gap-2">{canAdmin && !locked && <><Button onClick={() => void action({ action: "sync" })}>Sync Zoho RSVPs</Button><Button variant="primary" onClick={() => void action({ action: "close" })}>Close meeting</Button><Button onClick={() => { const overrideReason = window.prompt("Mandatory reason for closing without successful Zoho RSVP synchronization:"); if (!overrideReason?.trim()) return; void action({ action: "close", forceClose: true, reason: overrideReason.trim() }); }}>Close without Zoho sync</Button></>}{canSelf && selfCanAct && <><Button variant="primary" onClick={() => void action({ action: "check-in" })}>Check in</Button><Button onClick={() => { setModal({ type: "apology" }); setReason(""); }}>Submit apology</Button></>}</div></div>{message && <div className="mx-6 mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</div>}{errorMessage && <div className="mx-6 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{errorMessage}</div>}{loading ? <div className="p-8 text-center text-sm text-slate-500">Loading attendance register </div> : <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-[0.1em] text-slate-500"><tr><th className="px-6 py-3">Member</th><th className="px-6 py-3">Zoho RSVP</th><th className="px-6 py-3">Attendance</th><th className="px-6 py-3">Source</th><th className="px-6 py-3 text-right">Action</th></tr></thead><tbody className="divide-y divide-slate-100">{data?.attendance.map((row) => <tr key={row.user.id}><td className="px-6 py-4"><p className="font-semibold text-slate-900">{row.user.name}</p><p className="text-xs text-slate-500">{row.user.email} - {row.user.membershipRole}</p></td><td className="px-6 py-4"><Badge tone={row.zohoRsvp === "ACCEPTED" ? "success" : row.zohoRsvp === "DECLINED" ? "danger" : "neutral"}>{rsvpLabel(row.zohoRsvp)}</Badge></td><td className="px-6 py-4">{row.attendance ? <Badge tone={statusTone(row.attendance.status)}>{statusLabel(row.attendance.status)}</Badge> : <span className="text-slate-400">Not recorded</span>}</td><td className="px-6 py-4 text-xs text-slate-500">{row.attendance?.source ?? " "}</td><td className="px-6 py-4 text-right">{canAdmin && !locked && <div className="flex justify-end gap-2">{row.attendance?.status === "APOLOGY_DRAFT" && <Button onClick={() => void action({ action: "confirm-draft", userId: row.user.id })}>Confirm apology</Button>}{row.attendance?.status === "APOLOGY_DRAFT" && <Button variant="ghost" onClick={() => { setModal({ type: "reject", row }); setReason(""); }}>Reject draft</Button>}{row.attendance?.status !== "APOLOGY_DRAFT" && <Button variant="ghost" onClick={() => { setModal({ type: "mark", row }); setStatus(row.attendance?.status === "EXCUSED" ? "EXCUSED" : row.attendance?.status === "ABSENT" || row.attendance?.status === "ABSENT_NO_APOLOGY" ? "ABSENT" : "PRESENT"); setReason(""); }}>Mark</Button>}</div>}{canAdmin && locked && row.attendance && <Button variant="ghost" onClick={() => { setModal({ type: "correct", row }); setStatus(row.attendance?.status === "EXCUSED" ? "EXCUSED" : row.attendance?.status === "ABSENT" || row.attendance?.status === "ABSENT_NO_APOLOGY" ? "ABSENT" : "PRESENT"); setReason(""); }}>Correct</Button>}</td></tr>)}</tbody></table></div>}{modal && <Modal title={modal.type === "correct" ? "Correct locked attendance" : modal.type === "reject" ? "Reject apology draft" : modal.type === "apology" ? "Submit apology" : "Manage attendance"} onClose={() => !working && setModal(null)}><p className="mt-3 text-sm leading-6 text-slate-600">{modal.type === "correct" ? "This creates an appended correction audit event. The previous value remains preserved in audit history." : modal.type === "reject" ? "Rejecting this draft preserves the decision and prevents it being converted to an apology at meeting close." : modal.type === "apology" ? "Your in-app apology is the authoritative application record and takes precedence over a Zoho RSVP decline." : "Choose the authoritative attendance state."}</p><div className="mt-5 space-y-4">{modal.type !== "apology" && modal.type !== "reject" && <Field label="Attendance"><Select value={status} onChange={(e) => setStatus(e.target.value as AttendanceStatus)}><option value="PRESENT">Present</option><option value="ABSENT">Absent</option><option value="EXCUSED">Excused</option></Select></Field>}<Field label={modal.type === "correct" ? "Mandatory correction reason" : modal.type === "apology" ? "Optional reason" : "Reason / note"}><TextArea rows={4} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={modal.type === "correct" ? "Why is this record being corrected?" : "Optional explanation"} /></Field></div><div className="mt-6 flex justify-end gap-2"><Button disabled={working} onClick={() => setModal(null)}>Cancel</Button><Button variant="primary" disabled={working} onClick={() => { if (modal.type === "apology") void action({ action: "apology", reason }); else if (modal.type === "correct") void action({ action: "mark", userId: modal.row?.user.id, status, correctionReason: reason }); else if (modal.type === "reject") void action({ action: "reject-draft", userId: modal.row?.user.id, reason }); else void action({ action: "mark", userId: modal.row?.user.id, status, reason }); }}>{working ? "Saving " : modal.type === "correct" ? "Save correction" : modal.type === "apology" ? "Submit apology" : modal.type === "reject" ? "Reject draft" : "Save attendance"}</Button></div></Modal>}</section>; }

function MeetingCheckInQr({
  meeting,
}: {
  meeting: Meeting;
}) {
  const checkInUrl =
    `${window.location.origin}/meetings/${encodeURIComponent(meeting.id)}?checkin=1`;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-6 md:flex-row md:items-center">
        <div className="shrink-0 rounded-xl border border-slate-200 bg-white p-3">
          <QRCodeSVG
            value={checkInUrl}
            size={180}
            level="M"
          />
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
            Meeting check-in
          </p>

          <h3 className="mt-2 text-lg font-semibold text-slate-950">
            Authenticated QR check-in
          </h3>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Members scan this code to open the meeting in the
            Governance Portal. Authentication and committee
            eligibility are still required. Scanning the QR does
            not itself mark attendance.
          </p>

          <p className="mt-3 break-all text-xs text-slate-400">
            {checkInUrl}
          </p>
        </div>
      </div>
    </section>
  );
}
function MeetingDetail({
  meeting,
  user,
  onBack,
  onRefresh,
}: {
  meeting: Meeting;
  user: {
    id: string;
    role: UserRole;
  };
  onBack: () => void;
  onRefresh: () => Promise<void>;
}) {
  const [
    showEdit,
    setShowEdit,
  ] =
    useState(false);

  const [
    showCancel,
    setShowCancel,
  ] =
    useState(false);

  const [
    working,
    setWorking,
  ] =
    useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] =
    useState("");

  const [
    message,
    setMessage,
  ] =
    useState("");

  const canManage =
    user.role ===
    "ADMIN";

  async function cancelMeeting() {
    setWorking(
      true,
    );

    setErrorMessage(
      "",
    );

    try {
      const response =
        await apiRequest<
          ApiResponse<Meeting>
        >(
          `/api/meetings/${encodeURIComponent(
            meeting.id,
          )}`,
          {
            method:
              "DELETE",
          },
        );

      await onRefresh();

      setShowCancel(
        false,
      );

      setMessage(
        response.warnings
          ?.length
          ? `Meeting cancelled. ${response.warnings.join(" ")}`
          : "Meeting cancelled.",
      );
    } catch (error) {
      setErrorMessage(
        error instanceof
          Error
          ? error.message
          : "Unable to cancel meeting.",
      );
    } finally {
      setWorking(
        false,
      );
    }
  }

  if (showEdit) {
    return (
      <MeetingForm
        committees={[
          meeting.committee,
        ]}
        initialMeeting={
          meeting
        }
        onCancel={() =>
          setShowEdit(
            false,
          )
        }
        onSaved={async () => {
          setShowEdit(
            false,
          );

          await onRefresh();
        }}
      />
    );
  }

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={
          onBack
        }
        className="portal-back"
      >
        ← Back to meetings
      </button>

      {message && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[12px] text-emerald-800">
          {message}
        </div>
      )}

      {errorMessage && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[12px] text-red-800">
          {errorMessage}
        </div>
      )}

      <section className="portal-panel">
        <div className="px-5 py-6 sm:px-7 sm:py-7">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
            <div className="max-w-4xl">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[11px] font-semibold text-[#987534]">
                  {
                    meeting
                      .committee
                      .name
                  }
                </p>

                <Badge
                  tone={
                    meeting.status ===
                    "CANCELLED"
                      ? "danger"
                      : meeting.status ===
                          "CLOSED"
                        ? "gold"
                        : "success"
                  }
                >
                  {meetingStatusLabel(
                    meeting.status,
                  )}
                </Badge>
              </div>

              <h2 className="mt-3 text-[28px] font-semibold leading-[1.08] tracking-[-0.045em] text-[#07172A] sm:text-[34px]">
                {
                  meeting.title
                }
              </h2>

              {meeting.description && (
                <p className="mt-4 max-w-3xl whitespace-pre-wrap text-[13px] leading-6 text-slate-600">
                  {
                    meeting.description
                  }
                </p>
              )}
            </div>

            {canManage &&
              meeting.status ===
                "SCHEDULED" && (
                <div className="flex shrink-0 gap-2">
                  <Button
                    onClick={() =>
                      setShowEdit(
                        true,
                      )
                    }
                  >
                    Edit
                  </Button>

                  <Button
                    variant="danger"
                    onClick={() =>
                      setShowCancel(
                        true,
                      )
                    }
                  >
                    Cancel meeting
                  </Button>
                </div>
              )}
          </div>

          <div className="mt-6 grid gap-3 border-t border-[#EDECE7] pt-5 sm:grid-cols-2 xl:grid-cols-4">
            <DetailCard
              label="Date"
              value={formatDate(
                meeting.startAt,
                meeting.timezone,
              )}
            />

            <DetailCard
              label="Time"
              value={`${formatTime(
                meeting.startAt,
                meeting.timezone,
              )} - ${formatTime(
                meeting.endAt,
                meeting.timezone,
              )}`}
            />

            <DetailCard
              label="Location"
              value={
                meeting.location
              }
            />

            <DetailCard
              label="Timezone"
              value={
                meeting.timezone
              }
            />
          </div>
        </div>
      </section>

      <section className="portal-panel">
        <div className="border-b border-[#E4E4DF] px-5 py-4 sm:px-6">
          <h3 className="text-[16px] font-semibold text-[#07172A]">
            Agenda
          </h3>

          <p className="mt-1 text-[11px] text-slate-500">
            Items scheduled for discussion.
          </p>
        </div>

        {meeting.agendaItems
          .length ===
        0 ? (
          <EmptyState
            title="No agenda items"
            description="No agenda has been recorded for this meeting."
          />
        ) : (
          <div className="divide-y divide-[#EDECE7]">
            {meeting.agendaItems.map(
              (
                item,
              ) => (
                <div
                  key={
                    item.id ??
                    item.position
                  }
                  className="flex gap-4 px-5 py-4 sm:px-6"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F2EAD7] text-[11px] font-bold text-[#806027]">
                    {
                      item.position
                    }
                  </div>

                  <div className="min-w-0">
                    <h4 className="text-[13px] font-semibold text-[#07172A]">
                      {
                        item.title
                      }
                    </h4>

                    {item.description && (
                      <p className="mt-1 whitespace-pre-wrap text-[12px] leading-5 text-slate-600">
                        {
                          item.description
                        }
                      </p>
                    )}
                  </div>
                </div>
              ),
            )}
          </div>
        )}
      </section>

      {canManage &&
        meeting.status ===
          "SCHEDULED" && (
          <MeetingCheckInQr
            meeting={
              meeting
            }
          />
        )}

      <AttendancePanel
        meeting={
          meeting
        }
        user={user}
      />

      <ConflictOfInterestPanel
        meetingId={
          meeting.id
        }
        timezone={
          meeting.timezone
        }
        user={user}
      />

      <DocumentsPanel
        committeeId={
          meeting.committeeId
        }
        meetingId={
          meeting.id
        }
        meetingStatus={
          meeting.status
        }
        user={user}
      />

      <section className="portal-panel px-5 py-5 sm:px-6">
        <div>
          <h3 className="text-[15px] font-semibold text-[#07172A]">
            Meeting history
          </h3>

          <p className="mt-1 text-[11px] text-slate-500">
            System dates retained with this governance record.
          </p>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <DetailCard
            label="Created"
            value={formatDateTime(
              meeting.createdAt,
              meeting.timezone,
            )}
          />

          <DetailCard
            label="Last updated"
            value={formatDateTime(
              meeting.updatedAt,
              meeting.timezone,
            )}
          />

          {meeting.closedAt && (
            <DetailCard
              label="Closed"
              value={formatDateTime(
                meeting.closedAt,
                meeting.timezone,
              )}
            />
          )}

          {meeting.cancelledAt && (
            <DetailCard
              label="Cancelled"
              value={formatDateTime(
                meeting.cancelledAt,
                meeting.timezone,
              )}
            />
          )}
        </div>
      </section>

      {showCancel && (
        <Modal
          title="Cancel this meeting?"
          onClose={() =>
            !working &&
            setShowCancel(
              false,
            )
          }
        >
          <p className="mt-3 text-[13px] leading-6 text-slate-600">
            This removes the calendar event and marks the meeting as cancelled. Existing attendance, apologies and governance records remain preserved.
          </p>

          <div className="mt-6 flex justify-end gap-2">
            <Button
              disabled={
                working
              }
              onClick={() =>
                setShowCancel(
                  false,
                )
              }
            >
              Keep meeting
            </Button>

            <Button
              variant="danger"
              disabled={
                working
              }
              onClick={() =>
                void cancelMeeting()
              }
            >
              {working
                ? "Cancelling..."
                : "Cancel meeting"}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
function MeetingForm({ committees, initialMeeting, onCancel, onSaved }: { committees: Committee[]; initialMeeting?: Meeting; onCancel: () => void; onSaved: () => Promise<void> }) { const [form, setForm] = useState<MeetingFormState>(() => initialMeeting ? { committeeId: initialMeeting.committeeId, title: initialMeeting.title, description: initialMeeting.description ?? "", startAt: toDateTimeLocal(initialMeeting.startAt), endAt: toDateTimeLocal(initialMeeting.endAt), timezone: initialMeeting.timezone, location: initialMeeting.location, agendaItems: initialMeeting.agendaItems.length ? initialMeeting.agendaItems.map((i) => ({ title: i.title, description: i.description ?? "" })) : [{ title: "", description: "" }] } : emptyForm(committees[0]?.id ?? "")); const [saving, setSaving] = useState(false); const [errorMessage, setErrorMessage] = useState(""); function update<K extends keyof MeetingFormState>(field: K, value: MeetingFormState[K]) { setForm((f) => ({ ...f, [field]: value })); } function updateAgenda(index: number, field: "title" | "description", value: string) { setForm((f) => ({ ...f, agendaItems: f.agendaItems.map((item, i) => i === index ? { ...item, [field]: value } : item) })); } async function submit(e: FormEvent<HTMLFormElement>) { e.preventDefault(); setErrorMessage(""); if (!form.committeeId || !form.title.trim() || !form.startAt || !form.endAt || !form.location.trim()) { setErrorMessage("Choose a committee and enter the meeting title, date, time and location."); return; } const start = new Date(form.startAt); const end = new Date(form.endAt); if (end <= start) { setErrorMessage("The meeting end time must be later than the start time."); return; } const agendaItems = form.agendaItems.map((i) => ({ title: i.title.trim(), description: i.description.trim() })); if (agendaItems.some((i) => !i.title)) { setErrorMessage("Please give each agenda item a title."); return; } setSaving(true); try { const endpoint = initialMeeting ? `/api/meetings/${encodeURIComponent(initialMeeting.id)}` : "/api/meetings"; await apiRequest(endpoint, { method: initialMeeting ? "PATCH" : "POST", body: JSON.stringify({ committeeId: form.committeeId, title: form.title.trim(), description: form.description.trim() || undefined, startAt: start.toISOString(), endAt: end.toISOString(), timezone: form.timezone, location: form.location.trim(), agendaItems }) }); await onSaved(); } catch (e) { setErrorMessage(e instanceof Error ? e.message : "We couldn't save this meeting. Please try again."); } finally { setSaving(false); } } return <div className="space-y-6"><Button variant="ghost" onClick={onCancel}>Back</Button><section><p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{initialMeeting ? "Edit meeting" : "New meeting"}</p><h2 className="mt-2 text-[26px] font-semibold">{initialMeeting ? "Update meeting" : "Schedule a committee meeting"}</h2></section>{errorMessage && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{errorMessage}</div>}<form onSubmit={submit} className="space-y-6"><section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"><div className="grid gap-5 md:grid-cols-2"><Field label="Committee"><Select value={form.committeeId} disabled={Boolean(initialMeeting) || saving} onChange={(e) => update("committeeId", e.target.value)}>{committees.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field><Field label="Title"><TextInput value={form.title} disabled={saving} onChange={(e) => update("title", e.target.value)} /></Field><div className="md:col-span-2"><Field label="Description"><TextArea rows={4} value={form.description} disabled={saving} onChange={(e) => update("description", e.target.value)} /></Field></div><Field label="Start"><TextInput type="datetime-local" value={form.startAt} disabled={saving} onChange={(e) => update("startAt", e.target.value)} /></Field><Field label="End"><TextInput type="datetime-local" value={form.endAt} disabled={saving} onChange={(e) => update("endAt", e.target.value)} /></Field><Field label="Timezone"><Select value={form.timezone} disabled={saving} onChange={(e) => update("timezone", e.target.value)}><option>Africa/Nairobi</option><option>UTC</option></Select></Field><Field label="Location"><TextInput value={form.location} disabled={saving} onChange={(e) => update("location", e.target.value)} /></Field></div></section><section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex justify-between"><div><h3 className="font-semibold">Agenda</h3><p className="mt-1 text-sm text-slate-500">Add the items to be discussed at this meeting.</p></div><Button onClick={() => update("agendaItems", [...form.agendaItems, { title: "", description: "" }])}>Add item</Button></div><div className="mt-5 space-y-4">{form.agendaItems.map((item, index) => <div key={index} className="rounded-xl border border-slate-200 p-4"><div className="grid gap-4"><Field label={`Agenda item ${index + 1}`}><TextInput value={item.title} disabled={saving} onChange={(e) => updateAgenda(index, "title", e.target.value)} /></Field><Field label="Description"><TextArea rows={3} value={item.description} disabled={saving} onChange={(e) => updateAgenda(index, "description", e.target.value)} /></Field>{form.agendaItems.length > 1 && <Button variant="ghost" onClick={() => update("agendaItems", form.agendaItems.filter((_, i) => i !== index))}>Remove</Button>}</div></div>)}</div></section><div className="flex justify-end gap-2"><Button onClick={onCancel} disabled={saving}>Cancel</Button><Button type="submit" variant="primary" disabled={saving}>{saving ? "Saving " : initialMeeting ? "Save changes" : "Schedule meeting"}</Button></div></form></div>; }
function CommitteesView({
  committees,
  user,
}: {
  committees: Committee[];
  user: {
    id: string;
    role: UserRole;
  };
}) {
  const [
    selectedCommitteeId,
    setSelectedCommitteeId,
  ] =
    useState<
      string | null
    >(
      null,
    );

  const selected =
    selectedCommitteeId
      ? committees.find(
          (
            committee,
          ) =>
            committee.id ===
            selectedCommitteeId,
        ) ??
        null
      : null;

  if (selected) {
    return (
      <div className="space-y-5">
        <button
          type="button"
          onClick={() =>
            setSelectedCommitteeId(
              null,
            )
          }
          className="portal-back"
        >
          ← Back to committees
        </button>

        <section className="portal-panel px-5 py-6 sm:px-7">
          <p className="portal-kicker">
            {committeeTypeLabel(
              selected.type,
            )}
          </p>

          <h2 className="portal-page-title mt-2">
            {selected.name}
          </h2>

          <p className="portal-page-copy mt-2">
            Committee documents and governance records available to your account.
          </p>
        </section>

        <DocumentsPanel
          committeeId={
            selected.id
          }
          user={user}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="portal-page-header">
        <div>
          <p className="portal-kicker">
            Governance areas
          </p>

          <h2 className="portal-page-title mt-2">
            Committees
          </h2>

          <p className="portal-page-copy mt-2">
            Open a committee or subcommittee to review its shared governance documents.
          </p>
        </div>
      </section>

      {committees.length ===
      0 ? (
        <section className="portal-panel">
          <EmptyState
            title="No committees available"
            description="No committees are currently available to your account."
          />
        </section>
      ) : (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {committees.map(
            (
              committee,
              index,
            ) => (
              <button
                key={
                  committee.id
                }
                type="button"
                onClick={() =>
                  setSelectedCommitteeId(
                    committee.id,
                  )
                }
                className="group rounded-2xl border border-[#E4E4DF] bg-white p-5 text-left shadow-[0_1px_2px_rgba(7,23,42,0.02)] transition hover:-translate-y-0.5 hover:border-[#D5C293] hover:shadow-[0_10px_30px_rgba(7,23,42,0.06)]"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F2EAD7] text-[11px] font-bold text-[#806027]">
                    {String(
                      index +
                        1,
                    ).padStart(
                      2,
                      "0",
                    )}
                  </div>

                  <span className="text-[10px] font-semibold text-slate-400 transition group-hover:text-[#806027]">
                    Open →
                  </span>
                </div>

                <p className="mt-5 text-[11px] font-semibold text-[#987534]">
                  {committeeTypeLabel(
                    committee.type,
                  )}
                </p>

                <h3 className="mt-1 text-[16px] font-semibold text-[#07172A]">
                  {
                    committee.name
                  }
                </h3>

                <p className="mt-2 text-[11px] leading-5 text-slate-500">
                  View committee documents and governance records.
                </p>
              </button>
            ),
          )}
        </section>
      )}
    </div>
  );
}
function AuthenticatedApp() { const { user, loading, logout } = useAuth(); const [activeTab, setActiveTab] = useState<ActiveTab>(window.location.pathname.startsWith("/meetings/") ? "meetings" : "overview"); const [meetings, setMeetings] = useState<Meeting[]>([]); const [committees, setCommittees] = useState<Committee[]>([]); const [loadingData, setLoadingData] = useState(false); const [dataError, setDataError] = useState(""); const [showCreate, setShowCreate] = useState(false); const loadData = useCallback(async () => { if (!user) return; setLoadingData(true); setDataError(""); try { const [m, c] = await Promise.all([apiRequest<ApiResponse<Meeting[]>>("/api/meetings"), apiRequest<ApiResponse<Committee[]>>("/api/committees")]); setMeetings(Array.isArray(m.meetings) ? m.meetings : []); setCommittees(Array.isArray(c.committees) ? c.committees : []); } catch (e) { setDataError(e instanceof Error ? e.message : "Unable to load application data."); } finally { setLoadingData(false); } }, [user]); useEffect(() => { if (user) void Promise.resolve().then(() => loadData()); }, [user, loadData]); if (loading) return <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white"><p className="text-sm text-slate-300">Loading Governance Portal...</p></main>; if (!user) return <LoginPage />; const refresh = async () => { await loadData(); }; return <main className="min-h-screen bg-[#F5F4EF] text-slate-950"><Header user={user} activeTab={activeTab} onTabChange={(tab) => { setShowCreate(false); setActiveTab(tab); }} onLogout={() => void logout()} /><div className="mx-auto max-w-[1480px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">{dataError && <div className="mb-6 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"><span>{dataError}</span><Button onClick={() => void loadData()}>Retry</Button></div>}{loadingData && meetings.length === 0 ? <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">Loading Governance Portal...</div> : showCreate ? <MeetingForm committees={committees} onCancel={() => setShowCreate(false)} onSaved={async () => { await refresh(); setShowCreate(false); setActiveTab("meetings"); }} /> : activeTab === "overview" ? <Overview user={user} meetings={meetings} committees={committees} onNavigate={setActiveTab} onCreateMeeting={() => setShowCreate(true)} /> : activeTab === "meetings" ? <MeetingsView meetings={meetings} committees={committees} user={user} onRefresh={refresh} onCreate={() => setShowCreate(true)} /> : activeTab === "committees" ? <CommitteesView committees={committees} user={user} /> : activeTab === "reports" ? <GovernanceReportsPanel /> : activeTab === "notifications" ? <NotificationsPanel /> : activeTab === "admin" && user.role === "ADMIN" ? <AdminManagementPanel currentUserId={user.id} /> : <Overview user={user} meetings={meetings} committees={committees} onNavigate={setActiveTab} onCreateMeeting={() => setShowCreate(true)} />}</div></main>; }
function RoutedApp() {
  if (
    window.location.pathname ===
    "/set-password"
  ) {
    return <LoginPage />;
  }

  return <AuthenticatedApp />;
}

export default function App() {
  return (
    <AuthProvider>
      <RoutedApp />
    </AuthProvider>
  );
}
