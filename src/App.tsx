import { useEffect, useMemo, useState } from "react";
import LoginPage from "./auth/LoginPage";
import { AuthProvider, useAuth } from "./auth/AuthContext";

type UserRole = "MEMBER" | "ADMIN" | "EXCO_MANAGEMENT";
type MeetingStatus = "SCHEDULED" | "CANCELLED";

interface Committee {
  id: string;
  name: string;
  slug: string;
  type: string;
}

interface AgendaItem {
  id?: string;
  position: number;
  title: string;
  description?: string | null;
}

interface Meeting {
  id: string;
  committeeId: string;
  title: string;
  description?: string | null;
  startAt: string;
  endAt: string;
  timezone: string;
  location: string;
  status: MeetingStatus;
  zohoEventUid?: string | null;
  cancelledAt?: string | null;
  cancelledById?: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  committee: Committee;
  agendaItems: AgendaItem[];
}

interface ApiResponse<T> {
  success: boolean;
  error?: string;
  code?: string;
  warnings?: string[];
  warning?: string;
  meeting?: T;
  meetings?: T;
  committee?: T;
  committees?: T;
  [key: string]: unknown;
}

interface MeetingFormState {
  committeeId: string;
  title: string;
  description: string;
  startAt: string;
  endAt: string;
  timezone: string;
  location: string;
  agendaItems: Array<{
    title: string;
    description: string;
  }>;
}

type ActiveTab = "overview" | "meetings" | "committees" | "reports";
type MeetingFilter = "upcoming" | "past" | "cancelled" | "all";

async function apiRequest<T>(
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

function formatDateTime(value: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: timezone,
    }).format(new Date(value));
  } catch {
    return new Date(value).toLocaleString("en-GB");
  }
}

function formatDate(value: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      dateStyle: "full",
      timeZone: timezone,
    }).format(new Date(value));
  } catch {
    return new Date(value).toLocaleDateString("en-GB");
  }
}

function formatTime(value: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeStyle: "short",
      timeZone: timezone,
    }).format(new Date(value));
  } catch {
    return new Date(value).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
}

function roleLabel(role: UserRole): string {
  switch (role) {
    case "ADMIN":
      return "Administrator";
    case "EXCO_MANAGEMENT":
      return "Exco Management";
    case "MEMBER":
      return "Committee Member";
    default:
      return role;
  }
}

function emptyForm(committeeId = ""): MeetingFormState {
  return {
    committeeId,
    title: "",
    description: "",
    startAt: "",
    endAt: "",
    timezone: "Africa/Nairobi",
    location: "",
    agendaItems: [
      {
        title: "",
        description: "",
      },
    ],
  };
}

function toDateTimeLocal(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60 * 1000);

  return local.toISOString().slice(0, 16);
}

function formDateToIso(value: string): string {
  return new Date(value).toISOString();
}

function Button({
  children,
  onClick,
  type = "button",
  variant = "secondary",
  disabled = false,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  variant?: "primary" | "secondary" | "danger" | "ghost";
  disabled?: boolean;
}) {
  const classes = {
    primary:
      "bg-slate-900 text-white hover:bg-slate-800 border-slate-900",
    secondary:
      "bg-white text-slate-800 hover:bg-slate-50 border-slate-300",
    danger:
      "bg-red-700 text-white hover:bg-red-800 border-red-700",
    ghost:
      "bg-transparent text-slate-600 hover:bg-slate-100 border-transparent",
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-10 items-center justify-center rounded-lg border px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${classes[variant]}`}
    >
      {children}
    </button>
  );
}

function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "success" | "danger" | "gold";
}) {
  const classes = {
    neutral: "bg-slate-100 text-slate-700",
    success: "bg-emerald-50 text-emerald-700",
    danger: "bg-red-50 text-red-700",
    gold: "bg-amber-50 text-amber-800",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${classes[tone]}`}
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
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}

function TextInput(
  props: React.InputHTMLAttributes<HTMLInputElement>,
) {
  return (
    <input
      {...props}
      className={`w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-500 focus:ring-2 focus:ring-slate-200 ${props.className ?? ""}`}
    />
  );
}

function TextArea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>,
) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-500 focus:ring-2 focus:ring-slate-200 ${props.className ?? ""}`}
    />
  );
}

function Select(
  props: React.SelectHTMLAttributes<HTMLSelectElement>,
) {
  return (
    <select
      {...props}
      className={`w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200 ${props.className ?? ""}`}
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
  onTabChange: (tab: ActiveTab) => void;
  onLogout: () => void;
}) {
  const navigation: Array<{ id: ActiveTab; label: string }> = [
    { id: "overview", label: "Overview" },
    { id: "meetings", label: "Meetings" },
    { id: "committees", label: "Committees" },
    { id: "reports", label: "Reports" },
  ];

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto max-w-7xl px-6">
        <div className="flex min-h-20 items-center justify-between gap-6">
          <button
            type="button"
            onClick={() => onTabChange("overview")}
            className="text-left"
          >
            <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-slate-500">
              Nairobi Club
            </p>
            <h1 className="mt-0.5 text-xl font-semibold tracking-tight text-slate-950">
              Committee Register
            </h1>
          </button>

          <div className="hidden items-center gap-1 md:flex">
            {navigation.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onTabChange(item.id)}
                className={`rounded-lg px-3.5 py-2 text-sm font-medium transition ${
                  activeTab === item.id
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold text-slate-900">
                {user.name}
              </p>
              <p className="text-xs text-slate-500">
                {roleLabel(user.role)}
              </p>
            </div>

            <Button variant="secondary" onClick={onLogout}>
              Sign out
            </Button>
          </div>
        </div>

        <div className="flex gap-1 overflow-x-auto border-t border-slate-100 py-2 md:hidden">
          {navigation.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onTabChange(item.id)}
              className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${
                activeTab === item.id
                  ? "bg-slate-900 text-white"
                  : "text-slate-600"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}

function Overview({
  user,
  meetings,
  committees,
  onMeetings,
  onCreateMeeting,
}: {
  user: {
    name: string;
    email: string;
    role: UserRole;
  };
  meetings: Meeting[];
  committees: Committee[];
  onMeetings: () => void;
  onCreateMeeting: () => void;
}) {
  const now = Date.now();

  const scheduled = meetings.filter(
    (meeting) => meeting.status === "SCHEDULED",
  );

  const upcoming = scheduled
    .filter((meeting) => new Date(meeting.startAt).getTime() >= now)
    .sort(
      (a, b) =>
        new Date(a.startAt).getTime() -
        new Date(b.startAt).getTime(),
    );

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
              Committee Administration
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
              Good day, {user.name.split(" ")[0]}.
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Manage committee meetings, agendas and the authoritative
              meeting record from one place.
            </p>
          </div>

          {user.role === "ADMIN" && (
            <Button variant="primary" onClick={onCreateMeeting}>
              Schedule meeting
            </Button>
          )}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <StatCard
          label="Committees"
          value={String(committees.length)}
          detail="Accessible committee records"
        />
        <StatCard
          label="Scheduled meetings"
          value={String(scheduled.length)}
          detail="Current meeting records"
        />
        <StatCard
          label="Upcoming"
          value={String(upcoming.length)}
          detail="Future scheduled meetings"
        />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
          <div>
            <h3 className="font-semibold text-slate-950">
              Next meetings
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              The next scheduled committee engagements.
            </p>
          </div>

          <Button variant="ghost" onClick={onMeetings}>
            View all
          </Button>
        </div>

        {upcoming.length === 0 ? (
          <EmptyState
            title="No upcoming meetings"
            description="There are currently no future scheduled meetings in your accessible committees."
          />
        ) : (
          <div className="divide-y divide-slate-100">
            {upcoming.slice(0, 5).map((meeting) => (
              <div
                key={meeting.id}
                className="flex flex-col gap-3 px-6 py-5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    {meeting.committee.name}
                  </p>
                  <h4 className="mt-1 font-semibold text-slate-950">
                    {meeting.title}
                  </h4>
                  <p className="mt-1 text-sm text-slate-600">
                    {formatDateTime(
                      meeting.startAt,
                      meeting.timezone,
                    )}{" "}
                    · {meeting.location}
                  </p>
                </div>

                <Badge tone="success">Scheduled</Badge>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500">
        {label}
      </p>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
        {value}
      </p>
      <p className="mt-1 text-sm text-slate-500">{detail}</p>
    </div>
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
    role: UserRole;
  };
  onRefresh: () => Promise<void>;
  onCreate: () => void;
}) {
  const [filter, setFilter] =
    useState<MeetingFilter>("upcoming");
  const [committeeId, setCommitteeId] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(
    null,
  );

  const filteredMeetings = useMemo(() => {
    const now = Date.now();

    return [...meetings]
      .filter((meeting) => {
        if (committeeId && meeting.committeeId !== committeeId) {
          return false;
        }

        if (filter === "cancelled") {
          return meeting.status === "CANCELLED";
        }

        if (filter === "upcoming") {
          return (
            meeting.status === "SCHEDULED" &&
            new Date(meeting.startAt).getTime() >= now
          );
        }

        if (filter === "past") {
          return (
            meeting.status === "SCHEDULED" &&
            new Date(meeting.endAt).getTime() < now
          );
        }

        return true;
      })
      .sort(
        (a, b) =>
          new Date(a.startAt).getTime() -
          new Date(b.startAt).getTime(),
      );
  }, [meetings, filter, committeeId]);

  const selectedMeeting =
    selectedId === null
      ? null
      : meetings.find((meeting) => meeting.id === selectedId) ??
        null;

  if (selectedMeeting) {
    return (
      <MeetingDetail
        meeting={selectedMeeting}
        user={user}
        onBack={() => setSelectedId(null)}
        onRefresh={onRefresh}
      />
    );
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
            Meetings
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
            Committee meetings
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            The meeting register is synchronized with the configured
            Zoho Calendar events.
          </p>
        </div>

        {user.role === "ADMIN" && (
          <Button variant="primary" onClick={onCreate}>
            Schedule meeting
          </Button>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row">
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["upcoming", "Upcoming"],
                ["past", "Past"],
                ["cancelled", "Cancelled"],
                ["all", "All"],
              ] as Array<[MeetingFilter, string]>
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                  filter === value
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="lg:ml-auto lg:w-72">
            <Select
              value={committeeId}
              onChange={(event) =>
                setCommitteeId(event.target.value)
              }
            >
              <option value="">All committees</option>
              {committees.map((committee) => (
                <option
                  key={committee.id}
                  value={committee.id}
                >
                  {committee.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {filteredMeetings.length === 0 ? (
          <EmptyState
            title="No meetings found"
            description="There are no meetings matching the selected filters."
          />
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredMeetings.map((meeting) => (
              <button
                key={meeting.id}
                type="button"
                onClick={() => setSelectedId(meeting.id)}
                className="block w-full px-6 py-5 text-left transition hover:bg-slate-50"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                        {meeting.committee.name}
                      </p>
                      {meeting.status === "CANCELLED" ? (
                        <Badge tone="danger">Cancelled</Badge>
                      ) : (
                        <Badge tone="success">Scheduled</Badge>
                      )}
                    </div>

                    <h3 className="mt-1 truncate text-lg font-semibold text-slate-950">
                      {meeting.title}
                    </h3>

                    <p className="mt-1 text-sm text-slate-600">
                      {formatDateTime(
                        meeting.startAt,
                        meeting.timezone,
                      )}{" "}
                      · {meeting.location}
                    </p>
                  </div>

                  <div className="shrink-0 text-sm font-semibold text-slate-500">
                    {meeting.agendaItems.length} agenda{" "}
                    {meeting.agendaItems.length === 1
                      ? "item"
                      : "items"}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
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
    role: UserRole;
  };
  onBack: () => void;
  onRefresh: () => Promise<void>;
}) {
  const canManage = user.role === "ADMIN";

  const [showEdit, setShowEdit] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  async function cancelMeeting() {
    setWorking(true);
    setMessage("");
    setErrorMessage("");

    try {
      const response = await apiRequest<ApiResponse<Meeting>>(
        `/api/meetings/${encodeURIComponent(meeting.id)}`,
        {
          method: "DELETE",
        },
      );

      await onRefresh();

      setShowCancel(false);
      setMessage(
        response.warnings?.length
          ? `Meeting cancelled. ${response.warnings.join(" ")}`
          : "Meeting cancelled successfully.",
      );
    } catch (caught) {
      setErrorMessage(
        caught instanceof Error
          ? caught.message
          : "Unable to cancel meeting.",
      );
    } finally {
      setWorking(false);
    }
  }

  if (showEdit) {
    return (
      <MeetingForm
        committees={[meeting.committee]}
        initialMeeting={meeting}
        onCancel={() => setShowEdit(false)}
        onSaved={async () => {
          setShowEdit(false);
          await onRefresh();
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" onClick={onBack}>
          ← Back to meetings
        </Button>
      </div>

      {message && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </div>
      )}

      {errorMessage && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {errorMessage}
        </div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-start">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                {meeting.committee.name}
              </p>

              {meeting.status === "CANCELLED" ? (
                <Badge tone="danger">Cancelled</Badge>
              ) : (
                <Badge tone="success">Scheduled</Badge>
              )}
            </div>

            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
              {meeting.title}
            </h2>

            {meeting.description && (
              <p className="mt-4 max-w-3xl whitespace-pre-wrap text-sm leading-6 text-slate-600">
                {meeting.description}
              </p>
            )}
          </div>

          {canManage &&
            meeting.status === "SCHEDULED" && (
              <div className="flex gap-2">
                <Button onClick={() => setShowEdit(true)}>
                  Edit
                </Button>
                <Button
                  variant="danger"
                  onClick={() => setShowCancel(true)}
                >
                  Cancel meeting
                </Button>
              </div>
            )}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
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
          )} – ${formatTime(
            meeting.endAt,
            meeting.timezone,
          )} (${meeting.timezone})`}
        />
        <DetailCard
          label="Location"
          value={meeting.location}
        />
        <DetailCard
          label="Committee"
          value={meeting.committee.name}
        />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-5">
          <h3 className="font-semibold text-slate-950">
            Agenda
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Ordered agenda items recorded against this meeting.
          </p>
        </div>

        <div className="divide-y divide-slate-100">
          {meeting.agendaItems.map((item) => (
            <div
              key={item.id ?? `${item.position}-${item.title}`}
              className="flex gap-4 px-6 py-5"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-600">
                {item.position}
              </div>

              <div>
                <h4 className="font-semibold text-slate-950">
                  {item.title}
                </h4>

                {item.description && (
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                    {item.description}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="font-semibold text-slate-950">
          Record information
        </h3>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
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
          onClose={() => {
            if (!working) setShowCancel(false);
          }}
        >
          <p className="text-sm leading-6 text-slate-600">
            This will remove the event from Zoho Calendar and
            mark the meeting as cancelled. The meeting record
            and its history will remain available.
          </p>

          <div className="mt-6 flex justify-end gap-2">
            <Button
              disabled={working}
              onClick={() => setShowCancel(false)}
            >
              Keep meeting
            </Button>
            <Button
              variant="danger"
              disabled={working}
              onClick={() => void cancelMeeting()}
            >
              {working ? "Cancelling…" : "Cancel meeting"}
            </Button>
          </div>
        </Modal>
      )}
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
    <div className="rounded-xl border border-slate-200 p-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium leading-6 text-slate-900">
        {value}
      </p>
    </div>
  );
}

function MeetingForm({
  committees,
  initialMeeting,
  onCancel,
  onSaved,
}: {
  committees: Committee[];
  initialMeeting?: Meeting;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState<MeetingFormState>(() => {
    if (!initialMeeting) {
      return emptyForm(committees[0]?.id ?? "");
    }

    return {
      committeeId: initialMeeting.committeeId,
      title: initialMeeting.title,
      description: initialMeeting.description ?? "",
      startAt: toDateTimeLocal(initialMeeting.startAt),
      endAt: toDateTimeLocal(initialMeeting.endAt),
      timezone: initialMeeting.timezone,
      location: initialMeeting.location,
      agendaItems:
        initialMeeting.agendaItems.length > 0
          ? initialMeeting.agendaItems.map((item) => ({
              title: item.title,
              description: item.description ?? "",
            }))
          : [{ title: "", description: "" }],
    };
  });

  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  function updateField<K extends keyof MeetingFormState>(
    field: K,
    value: MeetingFormState[K],
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function updateAgenda(
    index: number,
    field: "title" | "description",
    value: string,
  ) {
    setForm((current) => ({
      ...current,
      agendaItems: current.agendaItems.map(
        (item, itemIndex) =>
          itemIndex === index
            ? {
                ...item,
                [field]: value,
              }
            : item,
      ),
    }));
  }

  function addAgendaItem() {
    setForm((current) => ({
      ...current,
      agendaItems: [
        ...current.agendaItems,
        {
          title: "",
          description: "",
        },
      ],
    }));
  }

  function removeAgendaItem(index: number) {
    setForm((current) => {
      if (current.agendaItems.length === 1) {
        return current;
      }

      return {
        ...current,
        agendaItems: current.agendaItems.filter(
          (_, itemIndex) => itemIndex !== index,
        ),
      };
    });
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setErrorMessage("");
    setSuccessMessage("");

    if (!form.committeeId) {
      setErrorMessage("Select a committee.");
      return;
    }

    if (!form.title.trim()) {
      setErrorMessage("Meeting title is required.");
      return;
    }

    if (!form.startAt || !form.endAt) {
      setErrorMessage(
        "Start and end date/time are required.",
      );
      return;
    }

    const start = new Date(form.startAt);
    const end = new Date(form.endAt);

    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime())
    ) {
      setErrorMessage("Enter valid meeting dates and times.");
      return;
    }

    if (end <= start) {
      setErrorMessage(
        "The meeting end time must be later than the start time.",
      );
      return;
    }

    if (!form.location.trim()) {
      setErrorMessage("Meeting location is required.");
      return;
    }

    const agendaItems = form.agendaItems.map((item) => ({
      title: item.title.trim(),
      description: item.description.trim(),
    }));

    if (agendaItems.some((item) => !item.title)) {
      setErrorMessage(
        "Every agenda item must have a title.",
      );
      return;
    }

    setSaving(true);

    try {
      const payload = {
        committeeId: form.committeeId,
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        startAt: formDateToIso(form.startAt),
        endAt: formDateToIso(form.endAt),
        timezone: form.timezone.trim() || "Africa/Nairobi",
        location: form.location.trim(),
        agendaItems,
      };

      const endpoint = initialMeeting
        ? `/api/meetings/${encodeURIComponent(
            initialMeeting.id,
          )}`
        : "/api/meetings";

      const method = initialMeeting ? "PATCH" : "POST";

      const response = await apiRequest<
        ApiResponse<Meeting>
      >(endpoint, {
        method,
        body: JSON.stringify(payload),
      });

      setSuccessMessage(
        response.warnings?.length
          ? `Meeting saved. ${response.warnings.join(" ")}`
          : initialMeeting
            ? "Meeting updated successfully."
            : "Meeting scheduled successfully.",
      );

      await onSaved();
    } catch (caught) {
      setErrorMessage(
        caught instanceof Error
          ? caught.message
          : "Unable to save meeting.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" onClick={onCancel}>
          ← Back
        </Button>
      </div>

      <section>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
          {initialMeeting ? "Edit meeting" : "New meeting"}
        </p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
          {initialMeeting
            ? "Update meeting"
            : "Schedule a committee meeting"}
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Changes are written to the meeting register and the
          committee's configured Zoho Calendar.
        </p>
      </section>

      {errorMessage && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800">
          {errorMessage}
        </div>
      )}

      {successMessage && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-800">
          {successMessage}
        </div>
      )}

      <form
        onSubmit={submit}
        className="space-y-6"
      >
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="font-semibold text-slate-950">
            Meeting details
          </h3>

          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <Field label="Committee">
              <Select
                value={form.committeeId}
                onChange={(event) =>
                  updateField(
                    "committeeId",
                    event.target.value,
                  )
                }
                disabled={
                  Boolean(initialMeeting) ||
                  saving
                }
              >
                <option value="">
                  Select committee
                </option>

                {committees.map((committee) => (
                  <option
                    key={committee.id}
                    value={committee.id}
                  >
                    {committee.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Title">
              <TextInput
                value={form.title}
                onChange={(event) =>
                  updateField(
                    "title",
                    event.target.value,
                  )
                }
                placeholder="Committee meeting title"
                disabled={saving}
              />
            </Field>

            <div className="md:col-span-2">
              <Field label="Description">
                <TextArea
                  value={form.description}
                  onChange={(event) =>
                    updateField(
                      "description",
                      event.target.value,
                    )
                  }
                  rows={4}
                  placeholder="Meeting purpose, context or notes"
                  disabled={saving}
                />
              </Field>
            </div>

            <Field label="Start">
              <TextInput
                type="datetime-local"
                value={form.startAt}
                onChange={(event) =>
                  updateField(
                    "startAt",
                    event.target.value,
                  )
                }
                disabled={saving}
              />
            </Field>

            <Field label="End">
              <TextInput
                type="datetime-local"
                value={form.endAt}
                onChange={(event) =>
                  updateField(
                    "endAt",
                    event.target.value,
                  )
                }
                disabled={saving}
              />
            </Field>

            <Field label="Timezone">
              <Select
                value={form.timezone}
                onChange={(event) =>
                  updateField(
                    "timezone",
                    event.target.value,
                  )
                }
                disabled={saving}
              >
                <option value="Africa/Nairobi">
                  Africa/Nairobi
                </option>
                <option value="UTC">UTC</option>
              </Select>
            </Field>

            <Field label="Location">
              <TextInput
                value={form.location}
                onChange={(event) =>
                  updateField(
                    "location",
                    event.target.value,
                  )
                }
                placeholder="Meeting room or venue"
                disabled={saving}
              />
            </Field>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-semibold text-slate-950">
                Agenda
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Add the agenda in the order it should appear
                in the official meeting record.
              </p>
            </div>

            <Button
              variant="secondary"
              onClick={addAgendaItem}
              disabled={saving}
            >
              Add item
            </Button>
          </div>

          <div className="mt-5 space-y-4">
            {form.agendaItems.map((item, index) => (
              <div
                key={index}
                className="rounded-xl border border-slate-200 p-4"
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-600">
                    {index + 1}
                  </div>

                  <div className="min-w-0 flex-1 space-y-4">
                    <Field label="Agenda title">
                      <TextInput
                        value={item.title}
                        onChange={(event) =>
                          updateAgenda(
                            index,
                            "title",
                            event.target.value,
                          )
                        }
                        placeholder="Agenda item"
                        disabled={saving}
                      />
                    </Field>

                    <Field label="Description">
                      <TextArea
                        value={item.description}
                        onChange={(event) =>
                          updateAgenda(
                            index,
                            "description",
                            event.target.value,
                          )
                        }
                        rows={3}
                        placeholder="Optional agenda detail"
                        disabled={saving}
                      />
                    </Field>
                  </div>

                  {form.agendaItems.length > 1 && (
                    <Button
                      variant="ghost"
                      onClick={() =>
                        removeAgendaItem(index)
                      }
                      disabled={saving}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            onClick={onCancel}
            disabled={saving}
          >
            Cancel
          </Button>

          <Button
            type="submit"
            variant="primary"
            disabled={saving}
          >
            {saving
              ? "Saving…"
              : initialMeeting
                ? "Save changes"
                : "Schedule meeting"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function CommitteesView({
  committees,
}: {
  committees: Committee[];
}) {
  return (
    <div className="space-y-6">
      <section>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
          Committees
        </p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
          Committee register
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Committees available to your current account.
        </p>
      </section>

      {committees.length === 0 ? (
        <EmptyState
          title="No committees available"
          description="There are no committee records accessible to your account."
        />
      ) : (
        <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {committees.map((committee) => (
            <article
              key={committee.id}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                {committee.type}
              </p>

              <h3 className="mt-2 text-lg font-semibold text-slate-950">
                {committee.name}
              </h3>

              <p className="mt-2 text-sm text-slate-500">
                {committee.slug}
              </p>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}

function ReportsView() {
  return (
    <div className="space-y-6">
      <section>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
          Reports
        </p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
          Reporting & audit
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          Formal reporting, audit exploration, Exco dashboards
          and CSV reporting are scheduled for Stage 7. No
          fabricated metrics are displayed here.
        </p>
      </section>

      <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-8">
        <p className="text-sm font-semibold text-slate-900">
          Stage 7
        </p>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          The reporting surface will be connected to
          authoritative application and audit data when that
          stage is implemented.
        </p>
      </section>
    </div>
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
      <h3 className="font-semibold text-slate-900">
        {title}
      </h3>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">
        {description}
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
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <h2 className="text-xl font-semibold text-slate-950">
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}

function AuthenticatedApp() {
  const { user, loading, logout } = useAuth();

  const [activeTab, setActiveTab] =
    useState<ActiveTab>("overview");

  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [committees, setCommittees] = useState<Committee[]>(
    [],
  );

  const [loadingData, setLoadingData] = useState(false);
  const [dataError, setDataError] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  async function loadData() {
    if (!user) return;

    setLoadingData(true);
    setDataError("");

    try {
      const [meetingResponse, committeeResponse] =
        await Promise.all([
          apiRequest<ApiResponse<Meeting[]>>(
            "/api/meetings",
          ),
          apiRequest<ApiResponse<Committee[]>>(
            "/api/committees",
          ),
        ]);

      const loadedMeetings = Array.isArray(
        meetingResponse.meetings,
      )
        ? (meetingResponse.meetings as Meeting[])
        : [];

      const loadedCommittees = Array.isArray(
        committeeResponse.committees,
      )
        ? (committeeResponse.committees as Committee[])
        : [];

      setMeetings(loadedMeetings);
      setCommittees(loadedCommittees);
    } catch (caught) {
      setDataError(
        caught instanceof Error
          ? caught.message
          : "Unable to load application data.",
      );
    } finally {
      setLoadingData(false);
    }
  }

  useEffect(() => {
    if (!user) return;

    void loadData();
  }, [user]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-slate-400">
            Nairobi Club
          </p>
          <p className="mt-3 text-sm text-slate-300">
            Loading Committee Register…
          </p>
        </div>
      </main>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  async function refreshAfterMutation() {
    await loadData();
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <Header
        user={user}
        activeTab={activeTab}
        onTabChange={(tab) => {
          setShowCreate(false);
          setActiveTab(tab);
        }}
        onLogout={() => void logout()}
      />

      <div className="mx-auto max-w-7xl px-6 py-8">
        {dataError && (
          <div className="mb-6 flex flex-col justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 sm:flex-row sm:items-center">
            <span>{dataError}</span>
            <Button
              variant="secondary"
              onClick={() => void loadData()}
            >
              Retry
            </Button>
          </div>
        )}

        {loadingData && meetings.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-sm">
            <p className="text-sm text-slate-500">
              Loading committee register…
            </p>
          </div>
        ) : showCreate ? (
          <MeetingForm
            committees={committees}
            onCancel={() => setShowCreate(false)}
            onSaved={async () => {
              await refreshAfterMutation();
              setShowCreate(false);
              setActiveTab("meetings");
            }}
          />
        ) : activeTab === "overview" ? (
          <Overview
            user={user}
            meetings={meetings}
            committees={committees}
            onMeetings={() => setActiveTab("meetings")}
            onCreateMeeting={() => setShowCreate(true)}
          />
        ) : activeTab === "meetings" ? (
          <MeetingsView
            meetings={meetings}
            committees={committees}
            user={user}
            onRefresh={refreshAfterMutation}
            onCreate={() => setShowCreate(true)}
          />
        ) : activeTab === "committees" ? (
          <CommitteesView committees={committees} />
        ) : (
          <ReportsView />
        )}
      </div>
    </main>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AuthenticatedApp />
    </AuthProvider>
  );
}