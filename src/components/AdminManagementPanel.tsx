import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from "react";

type UserRole =
  | "MEMBER"
  | "ADMIN"
  | "EXCO_MANAGEMENT";

type MembershipRole =
  | "CHAIR"
  | "SECRETARY"
  | "MEMBER";

interface Committee {
  id: string;
  name: string;
  slug: string;
  type: "MAIN" | "SUBCOMMITTEE";
  parentId?: string | null;
  zohoCalendarId?: string | null;
  archivedAt?: string | null;
}

interface Membership {
  id: string;
  role: MembershipRole;
  startDate: string;
  endDate?: string | null;
  committee: {
    id: string;
    name: string;
    archivedAt?: string | null;
  };
}

interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  invitedAt?: string | null;
  passwordSetAt?: string | null;
  deactivatedAt?: string | null;
  createdAt: string;
  memberships: Membership[];
}

interface UsersResponse {
  success: boolean;
  users: AdminUser[];
}

interface CommitteesResponse {
  success: boolean;
  committees: Committee[];
}

interface ApiResponse {
  success: boolean;
  error?: string;
  warnings?: string[];
}

async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response =
    await fetch(path, {
      ...options,
      credentials:
        "include",
      headers: {
        "Content-Type":
          "application/json",
        ...(options.headers ??
          {}),
      },
    });

  const text =
    await response.text();

  let data:
    unknown = {};

  if (text) {
    try {
      data =
        JSON.parse(text);
    } catch {
      data = {
        error:
          "Unexpected server response.",
      };
    }
  }

  if (!response.ok) {
    const message =
      typeof data ===
        "object" &&
      data !== null &&
      "error" in data &&
      typeof (
        data as {
          error?: unknown;
        }
      ).error === "string"
        ? (
            data as {
              error: string;
            }
          ).error
        : "Request failed.";

    throw new Error(
      message,
    );
  }

  return data as T;
}

function todayValue(): string {
  return new Date()
    .toISOString()
    .slice(0, 10);
}

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200";

const buttonClass =
  "inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";

const primaryButtonClass =
  "inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-900 bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50";

const dangerButtonClass =
  "inline-flex min-h-10 items-center justify-center rounded-lg border border-red-700 bg-red-700 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50";

function formatDate(
  value?: string | null,
): string {
  if (!value) {
    return "-";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return value;
  }

  return new Intl.DateTimeFormat(
    "en-GB",
    {
      dateStyle:
        "medium",
    },
  ).format(date);
}

export default function AdminManagementPanel({
  currentUserId,
}: {
  currentUserId: string;
}) {
  const [
    users,
    setUsers,
  ] =
    useState<AdminUser[]>(
      [],
    );

  const [
    committees,
    setCommittees,
  ] =
    useState<Committee[]>(
      [],
    );

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    working,
    setWorking,
  ] =
    useState(false);

  const [
    message,
    setMessage,
  ] =
    useState("");

  const [
    errorMessage,
    setErrorMessage,
  ] =
    useState("");

  const [
    invite,
    setInvite,
  ] =
    useState({
      name: "",
      email: "",
      role:
        "MEMBER" as UserRole,
      committeeId: "",
      membershipRole:
        "MEMBER" as MembershipRole,
      startDate:
        todayValue(),
      endDate: "",
    });

  const [
    membership,
    setMembership,
  ] =
    useState({
      userId: "",
      committeeId: "",
      role:
        "MEMBER" as MembershipRole,
      startDate:
        todayValue(),
      endDate: "",
    });

  const [
    committeeForm,
    setCommitteeForm,
  ] =
    useState({
      name: "",
      slug: "",
      type:
        "SUBCOMMITTEE" as
          | "MAIN"
          | "SUBCOMMITTEE",
      parentId: "",
    });

  const load =
    useCallback(
      async () => {
        setLoading(true);
        setErrorMessage("");

        try {
          const [
            userResponse,
            committeeResponse,
          ] =
            await Promise.all([
              apiRequest<UsersResponse>(
                "/api/users",
              ),
              apiRequest<CommitteesResponse>(
                "/api/committees",
              ),
            ]);

          setUsers(
            userResponse.users,
          );

          setCommittees(
            committeeResponse.committees,
          );
        } catch (caught) {
          setErrorMessage(
            caught instanceof Error
              ? caught.message
              : "We couldn't load the administration area.",
          );
        } finally {
          setLoading(false);
        }
      },
      [],
    );

  useEffect(() => {
    void Promise.resolve().then(
      () => load(),
    );
  }, [load]);

  function beginAction() {
    setWorking(true);
    setMessage("");
    setErrorMessage("");
  }

  function failAction(
    caught: unknown,
  ) {
    setErrorMessage(
      caught instanceof Error
        ? caught.message
        : "We couldn't complete that action.",
    );
  }

  async function submitInvite(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (
      !invite.name.trim() ||
      !invite.email.trim()
    ) {
      setErrorMessage(
        "Name and email are required.",
      );
      return;
    }

    if (
      invite.role ===
        "MEMBER" &&
      !invite.committeeId
    ) {
      setErrorMessage(
        "Members must be assigned to at least one committee.",
      );
      return;
    }

    if (
      invite.committeeId &&
      !invite.startDate
    ) {
      setErrorMessage(
        "Please choose a start date.",
      );
      return;
    }

    beginAction();

    try {
      const memberships =
        invite.committeeId
          ? [
              {
                committeeId:
                  invite.committeeId,
                role:
                  invite.membershipRole,
                startDate:
                  invite.startDate,
                endDate:
                  invite.endDate ||
                  undefined,
              },
            ]
          : [];

      await apiRequest<ApiResponse>(
        "/api/auth/invite",
        {
          method:
            "POST",
          body:
            JSON.stringify({
              name:
                invite.name.trim(),
              email:
                invite.email.trim(),
              role:
                invite.role,
              memberships,
            }),
        },
      );

      setInvite({
        name: "",
        email: "",
        role:
          "MEMBER",
        committeeId:
          "",
        membershipRole:
          "MEMBER",
        startDate:
          todayValue(),
        endDate: "",
      });

      setMessage(
        "Invitation sent.",
      );

      await load();
    } catch (caught) {
      failAction(caught);
    } finally {
      setWorking(false);
    }
  }

  async function submitMembership(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (
      !membership.userId ||
      !membership.committeeId ||
      !membership.startDate
    ) {
      setErrorMessage(
        "Choose a user, committee and start date.",
      );
      return;
    }

    beginAction();

    try {
      await apiRequest<ApiResponse>(
        "/api/memberships",
        {
          method:
            "POST",
          body:
            JSON.stringify({
              userId:
                membership.userId,
              committeeId:
                membership.committeeId,
              role:
                membership.role,
              startDate:
                membership.startDate,
              endDate:
                membership.endDate ||
                undefined,
            }),
        },
      );

      setMembership({
        userId: "",
        committeeId:
          "",
        role:
          "MEMBER",
        startDate:
          todayValue(),
        endDate: "",
      });

      setMessage(
        "Committee appointment added.",
      );

      await load();
    } catch (caught) {
      failAction(caught);
    } finally {
      setWorking(false);
    }
  }

  async function resendInvitation(
    user: AdminUser,
  ) {
    beginAction();

    try {
      await apiRequest<ApiResponse>(
        "/api/auth/resend-invite",
        {
          method:
            "POST",
          body:
            JSON.stringify({
              userId:
                user.id,
            }),
        },
      );

      setMessage(
        `Invitation resent to ${user.email}.`,
      );

      await load();
    } catch (caught) {
      failAction(caught);
    } finally {
      setWorking(false);
    }
  }

  async function deactivateUser(
    user: AdminUser,
  ) {
    if (
      !window.confirm(
        `Deactivate ${user.name}? They will be signed out immediately and will no longer have access.`,
      )
    ) {
      return;
    }

    beginAction();

    try {
      const response =
        await apiRequest<ApiResponse>(
          `/api/users/${encodeURIComponent(user.id)}/deactivate`,
          {
            method:
              "POST",
          },
        );

      setMessage(
        response.warnings?.length
          ? `User deactivated. ${response.warnings.join(" ")}`
          : "User deactivated.",
      );

      await load();
    } catch (caught) {
      failAction(caught);
    } finally {
      setWorking(false);
    }
  }

  async function endMembership(
    item: Membership,
  ) {
    if (
      !window.confirm(
        `End the ${item.role} term for ${item.committee.name}?`,
      )
    ) {
      return;
    }

    beginAction();

    try {
      await apiRequest<ApiResponse>(
        `/api/memberships/${encodeURIComponent(item.id)}`,
        {
          method:
            "PATCH",
          body:
            JSON.stringify({
              action:
                "end",
            }),
        },
      );

      setMessage(
        "Committee appointment ended.",
      );

      await load();
    } catch (caught) {
      failAction(caught);
    } finally {
      setWorking(false);
    }
  }

  async function changeMembershipRole(
    item: Membership,
  ) {
    const value =
      window.prompt(
        "New committee role: CHAIR, SECRETARY or MEMBER",
        item.role,
      );

    if (value === null) {
      return;
    }

    const role =
      value
        .trim()
        .toUpperCase();

    if (
      role !== "CHAIR" &&
      role !==
        "SECRETARY" &&
      role !== "MEMBER"
    ) {
      setErrorMessage(
        "Committee role must be CHAIR, SECRETARY or MEMBER.",
      );
      return;
    }

    beginAction();

    try {
      await apiRequest<ApiResponse>(
        `/api/memberships/${encodeURIComponent(item.id)}`,
        {
          method:
            "PATCH",
          body:
            JSON.stringify({
              role,
            }),
        },
      );

      setMessage(
        "Committee role updated.",
      );

      await load();
    } catch (caught) {
      failAction(caught);
    } finally {
      setWorking(false);
    }
  }

  async function createCommittee(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (
      !committeeForm.name.trim() ||
      !committeeForm.slug.trim()
    ) {
      setErrorMessage(
        "Committee name and short code are required.",
      );
      return;
    }

    if (
      committeeForm.type ===
        "SUBCOMMITTEE" &&
      !committeeForm.parentId
    ) {
      setErrorMessage(
        "A subcommittee requires a parent committee.",
      );
      return;
    }

    beginAction();

    try {
      await apiRequest<ApiResponse>(
        "/api/committees",
        {
          method:
            "POST",
          body:
            JSON.stringify({
              name:
                committeeForm.name.trim(),
              slug:
                committeeForm.slug
                  .trim()
                  .toLowerCase(),
              type:
                committeeForm.type,
              parentId:
                committeeForm.type ===
                  "SUBCOMMITTEE"
                  ? committeeForm.parentId
                  : undefined,
            }),
        },
      );

      setCommitteeForm({
        name: "",
        slug: "",
        type:
          "SUBCOMMITTEE",
        parentId: "",
      });

      setMessage(
        "Committee created and calendar connected.",
      );

      await load();
    } catch (caught) {
      failAction(caught);
    } finally {
      setWorking(false);
    }
  }

  async function editCommittee(
    committee:
      Committee,
  ) {
    const nextName =
      window.prompt(
        "Committee name",
        committee.name,
      );

    if (
      nextName === null
    ) {
      return;
    }

    if (
      !nextName.trim()
    ) {
      setErrorMessage(
        "Committee name cannot be empty.",
      );
      return;
    }

    beginAction();

    try {
      await apiRequest<ApiResponse>(
        `/api/committees/${encodeURIComponent(committee.id)}`,
        {
          method:
            "PATCH",
          body:
            JSON.stringify({
              name:
                nextName.trim(),
            }),
        },
      );

      setMessage(
        "Committee and calendar updated.",
      );

      await load();
    } catch (caught) {
      failAction(caught);
    } finally {
      setWorking(false);
    }
  }

  async function archiveCommittee(
    committee:
      Committee,
  ) {
    if (
      !window.confirm(
        `Archive ${committee.name}? New meetings and committee appointments will be disabled.`,
      )
    ) {
      return;
    }

    beginAction();

    try {
      await apiRequest<ApiResponse>(
        `/api/committees/${encodeURIComponent(committee.id)}`,
        {
          method:
            "PATCH",
          body:
            JSON.stringify({
              action:
                "archive",
            }),
        },
      );

      setMessage(
        "Committee archived.",
      );

      await load();
    } catch (caught) {
      failAction(caught);
    } finally {
      setWorking(false);
    }
  }

  const activeCommittees =
    committees.filter(
      (committee) =>
        !committee.archivedAt,
    );

  const activeUsers =
    users.filter(
      (user) =>
        user.isActive,
    );

  const mainCommittees =
    activeCommittees.filter(
      (committee) =>
        committee.type ===
        "MAIN",
    );

  if (loading) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 shadow-sm">
        Loading administration...
      </section>
    );
  }

  return (
    <div className="space-y-8">
      <section>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
          Administration
        </p>

        <h2 className="mt-2 text-[26px] font-semibold">
          People & committees
        </h2>

        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Invite users, manage committee appointments and keep committee settings up to date.
        </p>
      </section>

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

      <section className="grid gap-6 xl:grid-cols-2">
        <form
          onSubmit={
            submitInvite
          }
          className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <h3 className="font-semibold">
            Invite user
          </h3>

          <p className="mt-1 text-sm text-slate-500">
            Invitations expire after 48 hours.
          </p>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
                Name
              </span>
              <input
                className={
                  inputClass
                }
                value={
                  invite.name
                }
                disabled={
                  working
                }
                onChange={(
                  event,
                ) =>
                  setInvite(
                    (
                      current,
                    ) => ({
                      ...current,
                      name:
                        event
                          .target
                          .value,
                    }),
                  )
                }
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
                Email
              </span>
              <input
                className={
                  inputClass
                }
                type="email"
                value={
                  invite.email
                }
                disabled={
                  working
                }
                onChange={(
                  event,
                ) =>
                  setInvite(
                    (
                      current,
                    ) => ({
                      ...current,
                      email:
                        event
                          .target
                          .value,
                    }),
                  )
                }
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
                Access level
              </span>
              <select
                className={
                  inputClass
                }
                value={
                  invite.role
                }
                disabled={
                  working
                }
                onChange={(
                  event,
                ) =>
                  setInvite(
                    (
                      current,
                    ) => ({
                      ...current,
                      role:
                        event
                          .target
                          .value as UserRole,
                    }),
                  )
                }
              >
                <option value="MEMBER">
                  Member
                </option>
                <option value="ADMIN">
                  Administrator
                </option>
                <option value="EXCO_MANAGEMENT">
                  Exco / Management
                </option>
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
                Committee
              </span>
              <select
                className={
                  inputClass
                }
                value={
                  invite.committeeId
                }
                disabled={
                  working
                }
                onChange={(
                  event,
                ) =>
                  setInvite(
                    (
                      current,
                    ) => ({
                      ...current,
                      committeeId:
                        event
                          .target
                          .value,
                    }),
                  )
                }
              >
                <option value="">
                  Add committee later
                </option>
                {activeCommittees.map(
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
              </select>
            </label>

            {invite.committeeId && (
              <>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
                    Committee role
                  </span>
                  <select
                    className={
                      inputClass
                    }
                    value={
                      invite.membershipRole
                    }
                    disabled={
                      working
                    }
                    onChange={(
                      event,
                    ) =>
                      setInvite(
                        (
                          current,
                        ) => ({
                          ...current,
                          membershipRole:
                            event
                              .target
                              .value as MembershipRole,
                        }),
                      )
                    }
                  >
                    <option value="MEMBER">
                      Member
                    </option>
                    <option value="CHAIR">
                      Chair
                    </option>
                    <option value="SECRETARY">
                      Secretary
                    </option>
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
                    Start date
                  </span>
                  <input
                    className={
                      inputClass
                    }
                    type="date"
                    value={
                      invite.startDate
                    }
                    disabled={
                      working
                    }
                    onChange={(
                      event,
                    ) =>
                      setInvite(
                        (
                          current,
                        ) => ({
                          ...current,
                          startDate:
                            event
                              .target
                              .value,
                        }),
                      )
                    }
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
                    End date
                  </span>
                  <input
                    className={
                      inputClass
                    }
                    type="date"
                    value={
                      invite.endDate
                    }
                    disabled={
                      working
                    }
                    onChange={(
                      event,
                    ) =>
                      setInvite(
                        (
                          current,
                        ) => ({
                          ...current,
                          endDate:
                            event
                              .target
                              .value,
                        }),
                      )
                    }
                  />
                </label>
              </>
            )}
          </div>

          <div className="mt-5">
            <button
              className={
                primaryButtonClass
              }
              disabled={
                working
              }
              type="submit"
            >
              Send invitation
            </button>
          </div>
        </form>

        <form
          onSubmit={
            submitMembership
          }
          className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <h3 className="font-semibold">
            Add committee appointment
          </h3>

          <p className="mt-1 text-sm text-slate-500">
            Assign an active user to another committee and set the appointment dates.
          </p>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="block md:col-span-2">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
                User
              </span>
              <select
                className={
                  inputClass
                }
                value={
                  membership.userId
                }
                disabled={
                  working
                }
                onChange={(
                  event,
                ) =>
                  setMembership(
                    (
                      current,
                    ) => ({
                      ...current,
                      userId:
                        event
                          .target
                          .value,
                    }),
                  )
                }
              >
                <option value="">
                  Select user
                </option>
                {activeUsers.map(
                  (user) => (
                    <option
                      key={
                        user.id
                      }
                      value={
                        user.id
                      }
                    >
                      {user.name} - {user.email}
                    </option>
                  ),
                )}
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
                Committee
              </span>
              <select
                className={
                  inputClass
                }
                value={
                  membership.committeeId
                }
                disabled={
                  working
                }
                onChange={(
                  event,
                ) =>
                  setMembership(
                    (
                      current,
                    ) => ({
                      ...current,
                      committeeId:
                        event
                          .target
                          .value,
                    }),
                  )
                }
              >
                <option value="">
                  Select committee
                </option>
                {activeCommittees.map(
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
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
                Committee role
              </span>
              <select
                className={
                  inputClass
                }
                value={
                  membership.role
                }
                disabled={
                  working
                }
                onChange={(
                  event,
                ) =>
                  setMembership(
                    (
                      current,
                    ) => ({
                      ...current,
                      role:
                        event
                          .target
                          .value as MembershipRole,
                    }),
                  )
                }
              >
                <option value="MEMBER">
                  Member
                </option>
                <option value="CHAIR">
                  Chair
                </option>
                <option value="SECRETARY">
                  Secretary
                </option>
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
                Start date
              </span>
              <input
                className={
                  inputClass
                }
                type="date"
                value={
                  membership.startDate
                }
                disabled={
                  working
                }
                onChange={(
                  event,
                ) =>
                  setMembership(
                    (
                      current,
                    ) => ({
                      ...current,
                      startDate:
                        event
                          .target
                          .value,
                    }),
                  )
                }
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
                End date
              </span>
              <input
                className={
                  inputClass
                }
                type="date"
                value={
                  membership.endDate
                }
                disabled={
                  working
                }
                onChange={(
                  event,
                ) =>
                  setMembership(
                    (
                      current,
                    ) => ({
                      ...current,
                      endDate:
                        event
                          .target
                          .value,
                    }),
                  )
                }
              />
            </label>
          </div>

          <div className="mt-5">
            <button
              className={
                primaryButtonClass
              }
              disabled={
                working
              }
              type="submit"
            >
              Add membership
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-5">
          <h3 className="font-semibold">
            User directory
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            {users.length} registered account{users.length === 1 ? "" : "s"}.
          </p>
        </div>

        <div className="divide-y divide-slate-100">
          {users.map(
            (user) => (
              <div
                key={
                  user.id
                }
                className="p-6"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-semibold text-slate-950">
                        {
                          user.name
                        }
                      </h4>

                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                        {
                          user.role
                        }
                      </span>

                      <span
                        className={
                          user.isActive
                            ? "rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700"
                            : "rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700"
                        }
                      >
                        {user.isActive
                          ? "Active"
                          : "Inactive"}
                      </span>

                      {!user.passwordSetAt &&
                        user.isActive && (
                          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
                            Invitation pending
                          </span>
                        )}
                    </div>

                    <p className="mt-1 text-sm text-slate-500">
                      {
                        user.email
                      }
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {user.isActive &&
                      !user.passwordSetAt && (
                        <button
                          className={
                            buttonClass
                          }
                          disabled={
                            working
                          }
                          type="button"
                          onClick={() =>
                            void resendInvitation(
                              user,
                            )
                          }
                        >
                          Resend invite
                        </button>
                      )}

                    {user.isActive &&
                      user.id !==
                        currentUserId && (
                        <button
                          className={
                            dangerButtonClass
                          }
                          disabled={
                            working
                          }
                          type="button"
                          onClick={() =>
                            void deactivateUser(
                              user,
                            )
                          }
                        >
                          Deactivate
                        </button>
                      )}
                  </div>
                </div>

                <div className="mt-5 space-y-2">
                  {user.memberships.length ===
                  0 ? (
                    <p className="text-sm text-slate-400">
                      No committee terms.
                    </p>
                  ) : (
                    user.memberships.map(
                      (
                        item,
                      ) => (
                        <div
                          key={
                            item.id
                          }
                          className="flex flex-col gap-3 rounded-xl border border-slate-200 px-4 py-3 md:flex-row md:items-center md:justify-between"
                        >
                          <div>
                            <p className="text-sm font-semibold">
                              {
                                item.committee.name
                              }
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {item.role} - {formatDate(item.startDate)} to {item.endDate ? formatDate(item.endDate) : "open-ended"}
                            </p>
                          </div>

                          {user.isActive &&
                            !item.endDate && (
                              <div className="flex flex-wrap gap-2">
                                <button
                                  className={
                                    buttonClass
                                  }
                                  disabled={
                                    working
                                  }
                                  type="button"
                                  onClick={() =>
                                    void changeMembershipRole(
                                      item,
                                    )
                                  }
                                >
                                  Change role
                                </button>

                                <button
                                  className={
                                    buttonClass
                                  }
                                  disabled={
                                    working
                                  }
                                  type="button"
                                  onClick={() =>
                                    void endMembership(
                                      item,
                                    )
                                  }
                                >
                                  End term
                                </button>
                              </div>
                            )}
                        </div>
                      ),
                    )
                  )}
                </div>
              </div>
            ),
          )}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <form
          onSubmit={
            createCommittee
          }
          className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <h3 className="font-semibold">
            Create committee
          </h3>

          <p className="mt-1 text-sm text-slate-500">
            A private Nairobi Club calendar is created and connected automatically.
          </p>

          <div className="mt-5 space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
                Name
              </span>
              <input
                className={
                  inputClass
                }
                value={
                  committeeForm.name
                }
                disabled={
                  working
                }
                onChange={(
                  event,
                ) =>
                  setCommitteeForm(
                    (
                      current,
                    ) => ({
                      ...current,
                      name:
                        event
                          .target
                          .value,
                    }),
                  )
                }
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Short code</span>
              <input
                className={
                  inputClass
                }
                value={
                  committeeForm.slug
                }
                disabled={
                  working
                }
                placeholder="finance-subcommittee"
                onChange={(
                  event,
                ) =>
                  setCommitteeForm(
                    (
                      current,
                    ) => ({
                      ...current,
                      slug:
                        event
                          .target
                          .value,
                    }),
                  )
                }
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
                Type
              </span>
              <select
                className={
                  inputClass
                }
                value={
                  committeeForm.type
                }
                disabled={
                  working
                }
                onChange={(
                  event,
                ) =>
                  setCommitteeForm(
                    (
                      current,
                    ) => ({
                      ...current,
                      type:
                        event
                          .target
                          .value as
                          | "MAIN"
                          | "SUBCOMMITTEE",
                      parentId:
                        event
                          .target
                          .value ===
                        "MAIN"
                          ? ""
                          : current.parentId,
                    }),
                  )
                }
              >
                <option value="MAIN">
                  Main committee
                </option>
                <option value="SUBCOMMITTEE">
                  Subcommittee
                </option>
              </select>
            </label>

            {committeeForm.type ===
              "SUBCOMMITTEE" && (
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
                  Parent
                </span>
                <select
                  className={
                    inputClass
                  }
                  value={
                    committeeForm.parentId
                  }
                  disabled={
                    working
                  }
                  onChange={(
                    event,
                  ) =>
                    setCommitteeForm(
                      (
                        current,
                      ) => ({
                        ...current,
                        parentId:
                          event
                            .target
                            .value,
                      }),
                    )
                  }
                >
                  <option value="">
                    Select parent
                  </option>
                  {mainCommittees.map(
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
                </select>
              </label>
            )}


          </div>

          <div className="mt-5">
            <button
              className={
                primaryButtonClass
              }
              disabled={
                working
              }
              type="submit"
            >
              Create committee
            </button>
          </div>
        </form>

        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-6 py-5">
            <h3 className="font-semibold">
              Committee configuration
            </h3>
          </div>

          <div className="divide-y divide-slate-100">
            {committees.map(
              (
                committee,
              ) => (
                <div
                  key={
                    committee.id
                  }
                  className="flex flex-col gap-4 px-6 py-5 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">
                        {
                          committee.name
                        }
                      </p>

                      <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                        {
                          committee.type
                        }
                      </span>

                      {committee.archivedAt && (
                        <span className="rounded-full bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">
                          Archived
                        </span>
                      )}
                    </div>

                    <p className="mt-1 text-xs text-slate-500">
                      {committee.slug} | {committee.zohoCalendarId ? "Calendar connected" : "Calendar pending"}
                    </p>
                  </div>

                  {!committee.archivedAt && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        className={
                          buttonClass
                        }
                        disabled={
                          working
                        }
                        type="button"
                        onClick={() =>
                          void editCommittee(
                            committee,
                          )
                        }
                      >
                        Edit
                      </button>

                      <button
                        className={
                          dangerButtonClass
                        }
                        disabled={
                          working
                        }
                        type="button"
                        onClick={() =>
                          void archiveCommittee(
                            committee,
                          )
                        }
                      >
                        Archive
                      </button>
                    </div>
                  )}
                </div>
              ),
            )}
          </div>
        </section>
      </section>
    </div>
  );
}