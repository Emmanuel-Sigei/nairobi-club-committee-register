import React, { useEffect, useMemo, useState } from "react";
import LoginPage from "./auth/LoginPage";
import { AuthProvider, useAuth } from "./auth/AuthContext";

type Role = "ADMIN" | "EXCO_MANAGEMENT" | "MEMBER";

type Committee = {
  id: string;
  name: string;
  description?: string | null;
  archivedAt?: string | null;
};

type AgendaItem = {
  id?: string;
  position: number;
  title: string;
  description?: string | null;
};

type Meeting = {
  id: string;
  committeeId: string;
  title: string;
  description?: string | null;
  startAt: string;
  endAt: string;
  timezone: string;
  location: string;
  status: "SCHEDULED" | "CANCELLED";
  createdAt: string;
  cancelledAt?: string | null;
  committee: Committee;
  createdBy?: {
    id: string;
    name: string;
    email: string;
  } | null;
  cancelledBy?: {
    id: string;
    name: string;
    email: string;
  } | null;
  agendaItems: AgendaItem[];
};

type FormState = {
  committeeId: string;
  title: string;
  description: string;
  date: string;
  startTime: string;
  endTime: string;
  timezone: string;
  location: string;
  agendaItems: { title: string; description: string }[];
};

type Tab = "overview" | "meetings" | "committees" | "reports";

const EMPTY_FORM: FormState = {
  committeeId: "",
  title: "",
  description: "",
  date: "",
  startTime: "09:00",
  endTime: "10:00",
  timezone: "Africa/Nairobi",
  location: "",
  agendaItems: [{ title: "", description: "" }],
};

async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(path, {
    credentials: "include",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : null;

  if (!response.ok) {
    const message =
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : "The request could not be completed.";

    throw new Error(message);
  }

  return payload as T;
}

function formatDate(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(value));
}

function StatusBadge({ status }: { status: Meeting["status"] }) {
  const cancelled = status === "CANCELLED";

  return (
    <span
      className={[
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
        cancelled
          ? "bg-red-50 text-red-700"
          : "bg-emerald-50 text-emerald-700",
      ].join(" ")}
    >
      {cancelled ? "Cancelled" : "Scheduled"}
    </span>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
      {text}
    </div>
  );
}

function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
        {label}
      </div>
      <div className="mt-1 text-sm font-medium text-slate-800">{children}</div>
    </div>
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
      <span className="mb-2 block text-sm font-medium text-slate-700">
        {label}
      </span>
      {children}
    </label>
  );
}

function MeetingForm({
  editingMeeting,
  committees,
  form,
  saving,
  onChange,
  onSave,
  onClose,
}: {
  editingMeeting: Meeting | null;
  committees: Committee[];
  form: FormState;
  saving: boolean;
  onChange: React.Dispatch<React.SetStateAction<FormState>>;
  onSave: () => void;
  onClose: () => void;
}) {
  function updateAgenda(
    index: number,
    field: "title" | "description",
    value: string,
  ) {
    onChange((current) => ({
      ...current,
      agendaItems: current.agendaItems.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item,
      ),
    }));
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/40 p-4">
      <div className="mx-auto my-8 max-w-3xl rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
              {editingMeeting ? "Edit meeting" : "New meeting"}
            </div>
            <h2 className="mt-1 text-xl font-semibold text-slate-950">
              {editingMeeting ? "Update meeting" : "Schedule meeting"}
            </h2>
          </div>

          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm text-slate-500 hover:bg-slate-100"
          >
            Close
          </button>
        </div>

        <div className="space-y-6 p-6">
          {!editingMeeting && (
            <Field label="Committee">
              <select
                value={form.committeeId}
                onChange={(event) =>
                  onChange((current) => ({
                    ...current,
                    committeeId: event.target.value,
                  }))
                }
                className="input"
                disabled={saving}
              >
                <option value="">Select committee</option>
                {committees
                  .filter((committee) => !committee.archivedAt)
                  .map((committee) => (
                    <option key={committee.id} value={committee.id}>
                      {committee.name}
                    </option>
                  ))}
              </select>
            </Field>
          )}

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Title">
              <input
                value={form.title}
                onChange={(event) =>
                  onChange((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                className="input"
                disabled={saving}
              />
            </Field>

            <Field label="Location">
              <input
                value={form.location}
                onChange={(event) =>
                  onChange((current) => ({
                    ...current,
                    location: event.target.value,
                  }))
                }
                className="input"
                disabled={saving}
              />
            </Field>
          </div>

          <Field label="Description">
            <textarea
              value={form.description}
              onChange={(event) =>
                onChange((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
              rows={4}
              className="input resize-y"
              disabled={saving}
            />
          </Field>

          <div className="grid gap-5 sm:grid-cols-3">
            <Field label="Date">
              <input
                type="date"
                value={form.date}
                onChange={(event) =>
                  onChange((current) => ({
                    ...current,
                    date: event.target.value,
                  }))
                }
                className="input"
                disabled={saving}
              />
            </Field>

            <Field label="Start time">
              <input
                type="time"
                value={form.startTime}
                onChange={(event) =>
                  onChange((current) => ({
                    ...current,
                    startTime: event.target.value,
                  }))
                }
                className="input"
                disabled={saving}
              />
            </Field>

            <Field label="End time">
              <input
                type="time"
                value={form.endTime}
                onChange={(event) =>
                  onChange((current) => ({
                    ...current,
                    endTime: event.target.value,
                  }))
                }
                className="input"
                disabled={saving}
              />
            </Field>
          </div>

          <Field label="Timezone">
            <input
              value={form.timezone}
              onChange={(event) =>
                onChange((current) => ({
                  ...current,
                  timezone: event.target.value,
                }))
              }
              className="input"
              disabled={saving}
            />
          </Field>

          <div>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-900">
                  Agenda
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  Add at least one agenda item. Items retain their order.
                </div>
              </div>

              <button
                type="button"
                disabled={saving}
                onClick={() =>
                  onChange((current) => ({
                    ...current,
                    agendaItems: [
                      ...current.agendaItems,
                      { title: "", description: "" },
                    ],
                  }))
                }
                className="text-sm font-semibold text-slate-900 hover:underline"
              >
                Add item
              </button>
            </div>

            <div className="space-y-4">
              {form.agendaItems.map((item, index) => (
                <div
                  key={index}
                  className="rounded-xl border border-slate-200 p-4"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Item {index + 1}
                    </span>

                    {form.agendaItems.length > 1 && (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() =>
                          onChange((current) => ({
                            ...current,
                            agendaItems: current.agendaItems.filter(
                              (_, itemIndex) => itemIndex !== index,
                            ),
                          }))
                        }
                        className="text-xs font-semibold text-red-700 hover:underline"
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  <div className="space-y-3">
                    <input
                      value={item.title}
                      onChange={(event) =>
                        updateAgenda(index, "title", event.target.value)
                      }
                      placeholder="Agenda item title"
                      className="input"
                      disabled={saving}
                    />

                    <textarea
                      value={item.description}
                      onChange={(event) =>
                        updateAgenda(
                          index,
                          "description",
                          event.target.value,
                        )
                      }
                      placeholder="Description (optional)"
                      rows={3}
                      className="input resize-y"
                      disabled={saving}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-200 px-6 py-5">
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={saving}
            onClick={onSave}
            className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {saving
              ? "Saving..."
              : editingMeeting
                ? "Save changes"
                : "Schedule meeting"}
          </button>
        </div>
      </div>
    </div>
  );
}

function MeetingDetail({
  meeting,
  cancelling,
  onBack,
  onEdit,
  onCancel,
}: {
  meeting: Meeting;
  canManage: boolean;
  cancelling: boolean;
  onBack: () => void;
  onEdit: () => void;
  onCancel: () => void;
}) {
  return (
    <section>
      <button
        type="button"
        onClick={onBack}
        className="mb-6 text-sm font-semibold text-slate-600 hover:text-slate-950"
      >
        ? Back to meetings
      </button>

      <div className="mb-7 flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status={meeting.status} />
            <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
              {meeting.committee.name}
            </span>
          </div>

          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
            {meeting.title}
          </h1>

          {meeting.description && (
            <p className="mt-3 max-w-3xl whitespace-pre-wrap text-sm leading-6 text-slate-600">
              {meeting.description}
            </p>
          )}
        </div>

        {canManage && meeting.status === "SCHEDULED" && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onEdit}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Edit
            </button>

            <button
              type="button"
              disabled={cancelling}
              onClick={onCancel}
              className="rounded-lg bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50"
            >
              {cancelling ? "Cancelling..." : "Cancel meeting"}
            </button>
          </div>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-6 py-5">
            <h2 className="font-semibold text-slate-950">Meeting details</h2>
          </div>

          <div className="grid gap-6 p-6 sm:grid-cols-2">
            <Detail label="Date & time">
              {formatDate(meeting.startAt, meeting.timezone)} —{" "}
              {new Intl.DateTimeFormat("en-GB", {
                timeStyle: "short",
                timeZone: meeting.timezone,
              }).format(new Date(meeting.endAt))}
            </Detail>

            <Detail label="Timezone">{meeting.timezone}</Detail>
            <Detail label="Location">{meeting.location}</Detail>
            <Detail label="Committee">{meeting.committee.name}</Detail>

            {meeting.createdBy && (
              <Detail label="Created by">{meeting.createdBy.name}</Detail>
            )}

            <Detail label="Created">
              {formatDate(meeting.createdAt, meeting.timezone)}
            </Detail>

            {meeting.cancelledAt && (
              <Detail label="Cancelled">
                {formatDate(meeting.cancelledAt, meeting.timezone)}
              </Detail>
            )}

            {meeting.cancelledBy && (
              <Detail label="Cancelled by">{meeting.cancelledBy.name}</Detail>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-6 py-5">
            <h2 className="font-semibold text-slate-950">Agenda</h2>
          </div>

          {meeting.agendaItems.length === 0 ? (
            <div className="p-6">
              <EmptyState text="No agenda items recorded." />
            </div>
          ) : (
            <ol className="divide-y divide-slate-100">
              {meeting.agendaItems.map((item) => (
                <li key={item.id ?? item.position} className="px-6 py-5">
                  <div className="flex gap-4">
                    <span className="text-sm font-semibold text-slate-400">
                      {String(item.position).padStart(2, "0")}
                    </span>

                    <div>
                      <div className="font-medium text-slate-950">
                        {item.title}
                      </div>

                      {item.description && (
                        <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-500">
                          {item.description}
                        </p>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </section>
  );
}

function AppShell() {
  const { user, loading, logout } = useAuth();

  const [tab, setTab] = useState<Tab>("overview");
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [committees, setCommittees] = useState<Committee[]>([]);
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState<
    "UPCOMING" | "PAST" | "CANCELLED" | "ALL"
  >("UPCOMING");
  const [committeeFilter, setCommitteeFilter] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<Meeting | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const role = user?.role as Role | undefined;
  const canManage = role === "ADMIN";

  async function loadData() {
    if (!user) return;

    setLoadingData(true);
    setError("");

    try {
      const [meetingResponse, committeeResponse] = await Promise.all([
        api<{ meetings: Meeting[] }>("/api/meetings"),
        api<{ committees: Committee[] }>("/api/committees"),
      ]);

      setMeetings(meetingResponse.meetings);
      setCommittees(committeeResponse.committees);

      if (selectedMeeting) {
        const refreshed = meetingResponse.meetings.find(
          (meeting) => meeting.id === selectedMeeting.id,
        );

        setSelectedMeeting(refreshed ?? null);
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to load register data.",
      );
    } finally {
      setLoadingData(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, [user]);

  const visibleMeetings = useMemo(() => {
    const now = Date.now();

    return meetings.filter((meeting) => {
      if (
        committeeFilter &&
        meeting.committeeId !== committeeFilter
      ) {
        return false;
      }

      if (filter === "CANCELLED") {
        return meeting.status === "CANCELLED";
      }

      if (filter === "UPCOMING") {
        return (
          meeting.status === "SCHEDULED" &&
          new Date(meeting.startAt).getTime() >= now
        );
      }

      if (filter === "PAST") {
        return (
          meeting.status === "SCHEDULED" &&
          new Date(meeting.startAt).getTime() < now
        );
      }

      return true;
    });
  }, [meetings, filter, committeeFilter]);

  const upcomingCount = meetings.filter(
    (meeting) =>
      meeting.status === "SCHEDULED" &&
      new Date(meeting.startAt).getTime() >= Date.now(),
  ).length;

  const cancelledCount = meetings.filter(
    (meeting) => meeting.status === "CANCELLED",
  ).length;

  function openCreate() {
    setEditingMeeting(null);
    setForm({
      ...EMPTY_FORM,
      committeeId: committees.find((committee) => !committee.archivedAt)?.id ?? "",
    });
    setError("");
    setNotice("");
    setFormOpen(true);
  }

  function openEdit(meeting: Meeting) {
    const start = new Date(meeting.startAt);
    const end = new Date(meeting.endAt);

    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: meeting.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });

    const timeFormatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: meeting.timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    setEditingMeeting(meeting);
    setForm({
      committeeId: meeting.committeeId,
      title: meeting.title,
      description: meeting.description ?? "",
      date: formatter.format(start),
      startTime: timeFormatter.format(start),
      endTime: timeFormatter.format(end),
      timezone: meeting.timezone,
      location: meeting.location,
      agendaItems:
        meeting.agendaItems.length > 0
          ? meeting.agendaItems.map((item) => ({
              title: item.title,
              description: item.description ?? "",
            }))
          : [{ title: "", description: "" }],
    });
    setError("");
    setNotice("");
    setFormOpen(true);
  }

  function buildDate(date: string, time: string) {
    return new Date(`${date}T${time}:00`).toISOString();
  }

  async function saveMeeting() {
    setError("");
    setNotice("");

    if (!form.committeeId && !editingMeeting) {
      setError("Select a committee.");
      return;
    }

    if (!form.title.trim()) {
      setError("Meeting title is required.");
      return;
    }

    if (!form.date || !form.startTime || !form.endTime) {
      setError("Date, start time and end time are required.");
      return;
    }

    const start = new Date(`${form.date}T${form.startTime}:00`);
    const end = new Date(`${form.date}T${form.endTime}:00`);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      setError("Enter a valid date and time.");
      return;
    }

    if (end <= start) {
      setError("End time must be after start time.");
      return;
    }

    const agendaItems = form.agendaItems
      .map((item) => ({
        title: item.title.trim(),
        description: item.description.trim(),
      }))
      .filter((item) => item.title);

    if (agendaItems.length === 0) {
      setError("Add at least one agenda item with a title.");
      return;
    }

    setSaving(true);

    try {
      if (editingMeeting) {
        await api(`/api/meetings/${editingMeeting.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            title: form.title.trim(),
            description: form.description.trim() || null,
            startAt: buildDate(form.date, form.startTime),
            endAt: buildDate(form.date, form.endTime),
            timezone: form.timezone.trim(),
            location: form.location.trim(),
            agendaItems,
          }),
        });
      } else {
        await api("/api/meetings", {
          method: "POST",
          body: JSON.stringify({
            committeeId: form.committeeId,
            title: form.title.trim(),
            description: form.description.trim() || null,
            startAt: buildDate(form.date, form.startTime),
            endAt: buildDate(form.date, form.endTime),
            timezone: form.timezone.trim(),
            location: form.location.trim(),
            agendaItems,
          }),
        });
      }

      setFormOpen(false);
      setEditingMeeting(null);
      setNotice(
        editingMeeting
          ? "Meeting updated successfully."
          : "Meeting scheduled successfully.",
      );

      await loadData();
      setTab("meetings");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to save meeting.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function cancelMeeting() {
    if (!selectedMeeting) return;

    setCancelling(true);
    setError("");
    setNotice("");

    try {
      await api(`/api/meetings/${selectedMeeting.id}`, {
        method: "DELETE",
      });

      setConfirmCancel(false);
      setNotice("Meeting cancelled successfully.");

      await loadData();

      const refreshed = meetings.find(
        (meeting) => meeting.id === selectedMeeting.id,
      );

      if (refreshed) {
        setSelectedMeeting({
          ...refreshed,
          status: "CANCELLED",
        });
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to cancel meeting.",
      );
    } finally {
      setCancelling(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 text-sm text-slate-500">
        Loading...
      </main>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  if (selectedMeeting) {
    return (
      <main className="min-h-screen bg-slate-100">
        <Header
          user={user}
          onLogout={() => void logout()}
          tab={tab}
          onTab={setTab}
        />

        <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
          {error && <Alert type="error" text={error} />}
          {notice && <Alert type="success" text={notice} />}

          <MeetingDetail
            meeting={selectedMeeting}
            canManage={canManage}
            cancelling={cancelling}
            onBack={() => setSelectedMeeting(null)}
            onEdit={() => openEdit(selectedMeeting)}
            onCancel={() => setConfirmCancel(true)}
          />
        </div>

        {formOpen && (
          <MeetingForm
            editingMeeting={editingMeeting}
            committees={committees}
            form={form}
            saving={saving}
            onChange={setForm}
            onSave={() => void saveMeeting()}
            onClose={() => {
              if (!saving) setFormOpen(false);
            }}
          />
        )}

        {confirmCancel && (
          <ConfirmCancel
            cancelling={cancelling}
            onClose={() => {
              if (!cancelling) setConfirmCancel(false);
            }}
            onConfirm={() => void cancelMeeting()}
          />
        )}
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100">
      <Header
        user={user}
        onLogout={() => void logout()}
        tab={tab}
        onTab={setTab}
      />

      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
        {error && <Alert type="error" text={error} />}
        {notice && <Alert type="success" text={notice} />}

        {tab === "overview" && (
          <section>
            <div className="mb-8">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                Committee Register
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
                Good day, {user.name}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                Committee governance, membership and meeting information in one
                controlled register.
              </p>
            </div>

            <div className="grid gap-5 sm:grid-cols-3">
              <Metric label="Committees" value={committees.length} />
              <Metric label="Upcoming meetings" value={upcomingCount} />
              <Metric label="Cancelled meetings" value={cancelledCount} />
            </div>

            <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                  <h2 className="font-semibold text-slate-950">
                    Upcoming meetings
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    The next scheduled committee meetings available to you.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setTab("meetings")}
                  className="text-sm font-semibold text-slate-900 hover:underline"
                >
                  View all meetings ?
                </button>
              </div>

              <div className="mt-5">
                {loadingData ? (
                  <div className="py-8 text-center text-sm text-slate-500">
                    Loading meetings...
                  </div>
                ) : upcomingCount === 0 ? (
                  <EmptyState text="No upcoming meetings recorded." />
                ) : (
                  <div className="divide-y divide-slate-100">
                    {meetings
                      .filter(
                        (meeting) =>
                          meeting.status === "SCHEDULED" &&
                          new Date(meeting.startAt).getTime() >= Date.now(),
                      )
                      .slice(0, 5)
                      .map((meeting) => (
                        <button
                          type="button"
                          key={meeting.id}
                          onClick={() => setSelectedMeeting(meeting)}
                          className="flex w-full flex-col gap-1 px-1 py-4 text-left hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div>
                            <div className="font-medium text-slate-950">
                              {meeting.title}
                            </div>
                            <div className="mt-1 text-sm text-slate-500">
                              {meeting.committee.name}
                            </div>
                          </div>

                          <div className="text-sm text-slate-500">
                            {formatDate(
                              meeting.startAt,
                              meeting.timezone,
                            )}
                          </div>
                        </button>
                      ))}
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {tab === "meetings" && (
          <section>
            <div className="mb-7 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Meetings
                </p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
                  Committee meetings
                </h1>
                <p className="mt-2 text-sm text-slate-500">
                  Schedule, review and manage committee meetings.
                </p>
              </div>

              {canManage && (
                <button
                  type="button"
                  onClick={openCreate}
                  className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  Schedule meeting
                </button>
              )}
            </div>

            <div className="mb-5 flex flex-col gap-3 sm:flex-row">
              <select
                value={filter}
                onChange={(event) =>
                  setFilter(event.target.value as typeof filter)
                }
                className="input sm:w-48"
              >
                <option value="UPCOMING">Upcoming</option>
                <option value="PAST">Past</option>
                <option value="CANCELLED">Cancelled</option>
                <option value="ALL">All meetings</option>
              </select>

              <select
                value={committeeFilter}
                onChange={(event) => setCommitteeFilter(event.target.value)}
                className="input sm:max-w-xs"
              >
                <option value="">All committees</option>
                {committees.map((committee) => (
                  <option key={committee.id} value={committee.id}>
                    {committee.name}
                  </option>
                ))}
              </select>
            </div>

            {loadingData ? (
              <EmptyState text="Loading meetings..." />
            ) : visibleMeetings.length === 0 ? (
              <EmptyState text="No meetings match the selected filters." />
            ) : (
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="divide-y divide-slate-100">
                  {visibleMeetings.map((meeting) => (
                    <button
                      type="button"
                      key={meeting.id}
                      onClick={() => setSelectedMeeting(meeting)}
                      className="flex w-full flex-col gap-4 px-6 py-5 text-left hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-3">
                          <StatusBadge status={meeting.status} />
                          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                            {meeting.committee.name}
                          </span>
                        </div>

                        <div className="mt-2 truncate font-semibold text-slate-950">
                          {meeting.title}
                        </div>

                        <div className="mt-1 text-sm text-slate-500">
                          {meeting.location}
                        </div>
                      </div>

                      <div className="shrink-0 text-sm text-slate-500">
                        {formatDate(meeting.startAt, meeting.timezone)}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {tab === "committees" && (
          <section>
            <div className="mb-7">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                Register
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
                Committees
              </h1>
              <p className="mt-2 text-sm text-slate-500">
                The committees available within your access scope.
              </p>
            </div>

            {loadingData ? (
              <EmptyState text="Loading committees..." />
            ) : committees.length === 0 ? (
              <EmptyState text="No committees are currently available." />
            ) : (
              <div className="grid gap-5 md:grid-cols-2">
                {committees.map((committee) => (
                  <div
                    key={committee.id}
                    className="rounded-2xl border border-slate-200 bg-white p-6"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <h2 className="font-semibold text-slate-950">
                        {committee.name}
                      </h2>

                      {committee.archivedAt && (
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">
                          Archived
                        </span>
                      )}
                    </div>

                    {committee.description && (
                      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-500">
                        {committee.description}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {tab === "reports" && (
          <section>
            <div className="mb-7">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                Reporting
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
                Reports & intelligence
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                Reporting, audit intelligence, Exco dashboards and exports are
                scheduled for the reporting stage of the platform.
              </p>
            </div>

            <EmptyState text="Reporting and audit dashboards will become available in Stage 7. No fabricated metrics are displayed here." />
          </section>
        )}
      </div>

      {formOpen && (
        <MeetingForm
          editingMeeting={editingMeeting}
          committees={committees}
          form={form}
          saving={saving}
          onChange={setForm}
          onSave={() => void saveMeeting()}
          onClose={() => {
            if (!saving) setFormOpen(false);
          }}
        />
      )}

      {confirmCancel && (
        <ConfirmCancel
          cancelling={cancelling}
          onClose={() => {
            if (!cancelling) setConfirmCancel(false);
          }}
          onConfirm={() => void cancelMeeting()}
        />
      )}
    </main>
  );
}

function Header({
  user,
  onLogout,
  tab,
  onTab,
}: {
  user: { name: string; email: string; role: string };
  onLogout: () => void;
  tab: Tab;
  onTab: (tab: Tab) => void;
}) {
  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "meetings", label: "Meetings" },
    { id: "committees", label: "Committees" },
    { id: "reports", label: "Reports" },
  ];

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-5 px-5 py-4 sm:px-8">
        <button
          type="button"
          onClick={() => onTab("overview")}
          className="text-left"
        >
          <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-slate-400">
            Nairobi Club
          </p>
          <div className="mt-0.5 text-lg font-semibold tracking-tight text-slate-950">
            Committee Register
          </div>
        </button>

        <div className="flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <div className="text-sm font-semibold text-slate-900">
              {user.name}
            </div>
            <div className="text-xs uppercase tracking-wide text-slate-400">
              {user.role}
            </div>
          </div>

          <button
            type="button"
            onClick={onLogout}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Sign out
          </button>
        </div>
      </div>

      <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-5 sm:px-8">
        {tabs.map((item) => (
          <button
            type="button"
            key={item.id}
            onClick={() => onTab(item.id)}
            className={[
              "border-b-2 px-3 py-3 text-sm font-semibold transition",
              tab === item.id
                ? "border-slate-900 text-slate-950"
                : "border-transparent text-slate-400 hover:text-slate-700",
            ].join(" ")}
          >
            {item.label}
          </button>
        ))}
      </div>
    </header>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6">
      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
        {label}
      </div>
      <div className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
        {value}
      </div>
    </div>
  );
}

function Alert({
  type,
  text,
}: {
  type: "error" | "success";
  text: string;
}) {
  return (
    <div
      className={[
        "mb-5 rounded-xl border px-4 py-3 text-sm",
        type === "error"
          ? "border-red-200 bg-red-50 text-red-800"
          : "border-emerald-200 bg-emerald-50 text-emerald-800",
      ].join(" ")}
      role="status"
    >
      {text}
    </div>
  );
}

function ConfirmCancel({
  cancelling,
  onClose,
  onConfirm,
}: {
  cancelling: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <h2 className="text-xl font-semibold text-slate-950">
          Cancel this meeting?
        </h2>

        <p className="mt-3 text-sm leading-6 text-slate-600">
          This will remove the event from Zoho Calendar and mark the meeting
          as cancelled. The meeting record and its history will remain
          available.
        </p>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            disabled={cancelling}
            onClick={onClose}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Keep meeting
          </button>

          <button
            type="button"
            disabled={cancelling}
            onClick={onConfirm}
            className="rounded-lg bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50"
          >
            {cancelling ? "Cancelling..." : "Cancel meeting"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}


