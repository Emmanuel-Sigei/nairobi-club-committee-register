import {
  useEffect,
  useMemo,
  useState,
} from "react";

type UserRole =
  | "MEMBER"
  | "ADMIN"
  | "EXCO_MANAGEMENT";

type ActiveTab =
  | "overview"
  | "meetings"
  | "committees"
  | "reports"
  | "notifications"
  | "admin";

interface Committee {
  id: string;
  name: string;
  type: string;
}

interface Meeting {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  timezone: string;
  location: string;
  status:
    | "SCHEDULED"
    | "CLOSED"
    | "CANCELLED";
  committee: Committee;
  agendaItems: Array<{
    id?: string;
    position: number;
    title: string;
  }>;
}

interface NotificationRecord {
  id: string;
  title: string;
  body: string;
  href?: string | null;
  readAt?: string | null;
  createdAt: string;
}

interface NotificationResponse {
  success: boolean;
  notifications: NotificationRecord[];
  unreadCount: number;
}

function roleLabel(
  role: UserRole,
): string {
  if (role === "ADMIN") {
    return "Administrator";
  }

  if (
    role ===
    "EXCO_MANAGEMENT"
  ) {
    return "Exco / Management";
  }

  return "Committee member";
}

function committeeTypeLabel(
  value: string,
): string {
  if (value === "MAIN") {
    return "Main Committee";
  }

  if (
    value ===
    "SUBCOMMITTEE"
  ) {
    return "Subcommittee";
  }

  return value
    .replaceAll(
      "_",
      " ",
    )
    .toLowerCase()
    .replace(
      /\b\w/g,
      (character) =>
        character.toUpperCase(),
    );
}

function formatDate(
  value: string,
  timezone: string,
): string {
  try {
    return new Intl.DateTimeFormat(
      "en-GB",
      {
        weekday:
          "short",
        day:
          "numeric",
        month:
          "short",
        year:
          "numeric",
        timeZone:
          timezone,
      },
    ).format(
      new Date(
        value,
      ),
    );
  } catch {
    return new Date(
      value,
    ).toLocaleDateString(
      "en-GB",
    );
  }
}

function formatTime(
  value: string,
  timezone: string,
): string {
  try {
    return new Intl.DateTimeFormat(
      "en-GB",
      {
        hour:
          "2-digit",
        minute:
          "2-digit",
        timeZone:
          timezone,
      },
    ).format(
      new Date(
        value,
      ),
    );
  } catch {
    return new Date(
      value,
    ).toLocaleTimeString(
      "en-GB",
      {
        hour:
          "2-digit",
        minute:
          "2-digit",
      },
    );
  }
}

function formatNotificationDate(
  value: string,
): string {
  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return "";
  }

  return new Intl.DateTimeFormat(
    "en-GB",
    {
      day:
        "numeric",
      month:
        "short",
      hour:
        "2-digit",
      minute:
        "2-digit",
    },
  ).format(date);
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="portal-panel px-4 py-4 sm:px-5">
      <p className="text-[12px] font-medium text-slate-500">
        {label}
      </p>

      <div className="mt-2 flex items-end justify-between gap-3">
        <p className="text-[28px] font-semibold leading-none tracking-[-0.045em] text-[#07172A]">
          {value}
        </p>

        <p className="max-w-[120px] text-right text-[10px] leading-4 text-slate-400">
          {detail}
        </p>
      </div>
    </div>
  );
}

export default function DashboardPanel({
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
  const [
    now,
  ] =
    useState(
      () =>
        Date.now(),
    );

  const [
    notifications,
    setNotifications,
  ] =
    useState<
      NotificationRecord[]
    >([]);

  const [
    unreadCount,
    setUnreadCount,
  ] =
    useState(0);

  const [
    loadingUpdates,
    setLoadingUpdates,
  ] =
    useState(true);

  const [
    notificationError,
    setNotificationError,
  ] =
    useState("");

  useEffect(
    () => {
      let cancelled =
        false;

      void fetch(
        "/api/notifications",
        {
          credentials:
            "include",
        },
      )
        .then(
          async (
            response,
          ) => {
            const text =
              await response.text();

            let payload:
              unknown = {};

            if (text) {
              try {
                payload =
                  JSON.parse(
                    text,
                  );
              } catch {
                payload = {};
              }
            }

            if (
              !response.ok
            ) {
              throw new Error(
                typeof payload ===
                  "object" &&
                payload !== null &&
                "error" in
                  payload &&
                typeof payload.error ===
                  "string"
                  ? payload.error
                  : "Updates are temporarily unavailable.",
              );
            }

            return payload as
              NotificationResponse;
          },
        )
        .then(
          (
            response,
          ) => {
            if (
              cancelled
            ) {
              return;
            }

            setNotifications(
              response.notifications,
            );

            setUnreadCount(
              response.unreadCount,
            );
          },
        )
        .catch(
          (
            cause:
              unknown,
          ) => {
            if (
              cancelled
            ) {
              return;
            }

            setNotificationError(
              cause instanceof
                Error
                ? cause.message
                : "Updates are temporarily unavailable.",
            );
          },
        )
        .finally(
          () => {
            if (
              !cancelled
            ) {
              setLoadingUpdates(
                false,
              );
            }
          },
        );

      return () => {
        cancelled =
          true;
      };
    },
    [],
  );

  const upcoming =
    useMemo(
      () =>
        meetings
          .filter(
            (
              meeting,
            ) =>
              meeting.status ===
                "SCHEDULED" &&
              +new Date(
                meeting.startAt,
              ) >=
                now,
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
        now,
      ],
    );

  const nextMeeting =
    upcoming[0] ??
    null;

  const nextSevenDays =
    upcoming.filter(
      (meeting) =>
        +new Date(
          meeting.startAt,
        ) <=
        now +
          7 *
            24 *
            60 *
            60 *
            1000,
    ).length;

  const firstName =
    user.name
      .trim()
      .split(/\s+/)[0] ||
    user.name;

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

    onNavigate(
      "meetings",
    );
  }

  function openNotification(
    notification:
      NotificationRecord,
  ) {
    if (
      notification.href
    ) {
      window.location.assign(
        notification.href,
      );

      return;
    }

    onNavigate(
      "notifications",
    );
  }

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-[18px] bg-[#0B1F3A] text-white shadow-[0_16px_44px_rgba(7,23,42,0.12)]">
        <div className="grid lg:grid-cols-[1.16fr_0.84fr]">
          <div className="px-6 py-7 sm:px-8 sm:py-9">
            <p className="text-[12px] font-semibold text-[#D8BC7A]">
              {roleLabel(
                user.role,
              )}
            </p>

            <h2 className="mt-3 max-w-2xl text-[31px] font-semibold leading-[1.06] tracking-[-0.05em] text-white sm:text-[40px]">
              Welcome back,
              {" "}
              {firstName}.
            </h2>

            <p className="mt-4 max-w-[650px] text-[14px] leading-6 text-slate-300">
              Your next meeting, current committee workload, governance updates and frequently used actions are brought together here.
            </p>

            <div className="mt-6 flex flex-wrap gap-2.5">
              {user.role ===
                "ADMIN" && (
                <button
                  type="button"
                  onClick={
                    onCreateMeeting
                  }
                  className="rounded-lg bg-[#C8A45D] px-4 py-2.5 text-[13px] font-bold text-[#07172A] transition hover:bg-[#D8B970]"
                >
                  Schedule meeting
                </button>
              )}

              <button
                type="button"
                onClick={() =>
                  onNavigate(
                    "meetings",
                  )
                }
                className="rounded-lg border border-white/20 bg-white/[0.06] px-4 py-2.5 text-[13px] font-semibold text-white transition hover:bg-white/10"
              >
                View meetings
              </button>

              <button
                type="button"
                onClick={() =>
                  onNavigate(
                    "committees",
                  )
                }
                className="rounded-lg border border-white/20 bg-white/[0.06] px-4 py-2.5 text-[13px] font-semibold text-white transition hover:bg-white/10"
              >
                My committees
              </button>
            </div>
          </div>

          <div className="border-t border-white/10 bg-white/[0.045] px-6 py-7 sm:px-8 lg:border-l lg:border-t-0">
            <p className="text-[11px] font-semibold text-[#D8BC7A]">
              Next meeting
            </p>

            {nextMeeting ? (
              <>
                <p className="mt-3 text-[12px] font-semibold text-slate-300">
                  {
                    nextMeeting
                      .committee
                      .name
                  }
                </p>

                <h3 className="mt-1.5 text-[20px] font-semibold leading-tight text-white">
                  {
                    nextMeeting
                      .title
                  }
                </h3>

                <div className="mt-5 grid grid-cols-2 gap-4 text-[13px]">
                  <div>
                    <p className="text-[10px] text-slate-400">
                      Date
                    </p>

                    <p className="mt-1 font-medium text-white">
                      {formatDate(
                        nextMeeting
                          .startAt,
                        nextMeeting
                          .timezone,
                      )}
                    </p>
                  </div>

                  <div>
                    <p className="text-[10px] text-slate-400">
                      Time
                    </p>

                    <p className="mt-1 font-medium text-white">
                      {formatTime(
                        nextMeeting
                          .startAt,
                        nextMeeting
                          .timezone,
                      )}
                    </p>
                  </div>

                  <div className="col-span-2">
                    <p className="text-[10px] text-slate-400">
                      Location
                    </p>

                    <p className="mt-1 font-medium text-white">
                      {
                        nextMeeting
                          .location ||
                        "To be confirmed"
                      }
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    openMeeting(
                      nextMeeting.id,
                    )
                  }
                  className="mt-5 text-[13px] font-semibold text-[#D8BC7A] transition hover:text-white"
                >
                  Open meeting →
                </button>
              </>
            ) : (
              <div className="mt-4">
                <p className="text-lg font-semibold text-white">
                  Nothing scheduled
                </p>

                <p className="mt-2 text-sm leading-6 text-slate-300">
                  New meetings will appear here when they are scheduled.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric
          label="Committees"
          value={
            String(
              committees.length,
            )
          }
          detail="Available to you"
        />

        <Metric
          label="Upcoming"
          value={
            String(
              upcoming.length,
            )
          }
          detail="Scheduled meetings"
        />

        <Metric
          label="Next 7 days"
          value={
            String(
              nextSevenDays,
            )
          }
          detail="Immediate workload"
        />

        <Metric
          label="Unread updates"
          value={
            String(
              unreadCount,
            )
          }
          detail="Governance notifications"
        />
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.22fr_0.78fr]">
        <div className="portal-panel">
          <div className="flex items-center justify-between border-b border-[#E4E4DF] px-5 py-4 sm:px-6">
            <div>
              <h3 className="text-[17px] font-semibold text-[#07172A]">
                Upcoming schedule
              </h3>

              <p className="mt-1 text-[12px] text-slate-500">
                Your next committee meetings.
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                onNavigate(
                  "meetings",
                )
              }
              className="text-[12px] font-semibold text-[#17365F] hover:text-[#07172A]"
            >
              View all
            </button>
          </div>

          {upcoming.length ===
          0 ? (
            <div className="px-6 py-10 text-sm text-slate-500">
              No upcoming meetings.
            </div>
          ) : (
            <div className="divide-y divide-[#EDECE7]">
              {upcoming
                .slice(
                  0,
                  5,
                )
                .map(
                  (
                    meeting,
                    index,
                  ) => (
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
                      className="grid w-full gap-3 px-5 py-4 text-left transition hover:bg-[#FAF9F6] sm:grid-cols-[38px_1fr_auto] sm:items-center sm:px-6"
                    >
                      <div className="hidden h-9 w-9 items-center justify-center rounded-lg bg-[#F2EAD7] text-[11px] font-bold text-[#806027] sm:flex">
                        {String(
                          index +
                            1,
                        ).padStart(
                          2,
                          "0",
                        )}
                      </div>

                      <div className="min-w-0">
                        <p className="truncate text-[11px] font-semibold text-[#987534]">
                          {
                            meeting
                              .committee
                              .name
                          }
                        </p>

                        <p className="mt-0.5 truncate text-[14px] font-semibold text-[#07172A]">
                          {
                            meeting
                              .title
                          }
                        </p>

                        <p className="mt-1 text-[12px] text-slate-500">
                          {formatDate(
                            meeting
                              .startAt,
                            meeting
                              .timezone,
                          )}
                          {" · "}
                          {formatTime(
                            meeting
                              .startAt,
                            meeting
                              .timezone,
                          )}
                          {" · "}
                          {
                            meeting.location
                          }
                        </p>
                      </div>

                      <div className="text-[10px] font-medium text-slate-400">
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
                      </div>
                    </button>
                  ),
                )}
            </div>
          )}
        </div>

        <div className="portal-panel">
          <div className="flex items-center justify-between border-b border-[#E4E4DF] px-5 py-4">
            <div>
              <h3 className="text-[17px] font-semibold text-[#07172A]">
                Recent updates
              </h3>

              <p className="mt-1 text-[12px] text-slate-500">
                What changed since your last visit.
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                onNavigate(
                  "notifications",
                )
              }
              className="text-[12px] font-semibold text-[#17365F]"
            >
              All updates
            </button>
          </div>

          {loadingUpdates ? (
            <div className="px-5 py-8 text-sm text-slate-500">
              Loading updates...
            </div>
          ) : notificationError ? (
            <div className="px-5 py-6 text-[12px] leading-5 text-slate-500">
              {
                notificationError
              }
            </div>
          ) : notifications
              .length ===
            0 ? (
            <div className="px-5 py-8">
              <p className="text-sm font-semibold text-[#07172A]">
                You're up to date
              </p>

              <p className="mt-1 text-[12px] text-slate-500">
                New governance activity will appear here.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#EDECE7]">
              {notifications
                .slice(
                  0,
                  5,
                )
                .map(
                  (
                    notification,
                  ) => (
                    <button
                      key={
                        notification.id
                      }
                      type="button"
                      onClick={() =>
                        openNotification(
                          notification,
                        )
                      }
                      className="block w-full px-5 py-3.5 text-left transition hover:bg-[#FAF9F6]"
                    >
                      <div className="flex gap-3">
                        <span
                          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                            notification.readAt
                              ? "bg-slate-300"
                              : "bg-[#C8A45D]"
                          }`}
                        />

                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <p className="truncate text-[13px] font-semibold text-[#07172A]">
                              {
                                notification.title
                              }
                            </p>

                            <span className="shrink-0 text-[9px] text-slate-400">
                              {formatNotificationDate(
                                notification.createdAt,
                              )}
                            </span>
                          </div>

                          <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-slate-500">
                            {
                              notification.body
                            }
                          </p>
                        </div>
                      </div>
                    </button>
                  ),
                )}
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <div className="portal-panel">
          <div className="flex items-center justify-between border-b border-[#E4E4DF] px-5 py-4 sm:px-6">
            <div>
              <h3 className="text-[17px] font-semibold text-[#07172A]">
                Your committees
              </h3>

              <p className="mt-1 text-[12px] text-slate-500">
                Direct access to your current governance areas.
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                onNavigate(
                  "committees",
                )
              }
              className="text-[12px] font-semibold text-[#17365F]"
            >
              View all
            </button>
          </div>

          {committees.length ===
          0 ? (
            <div className="px-6 py-8 text-sm text-slate-500">
              No committees are currently assigned to your account.
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3">
              {committees
                .slice(
                  0,
                  6,
                )
                .map(
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
                        onNavigate(
                          "committees",
                        )
                      }
                      className="border-b border-[#EDECE7] px-5 py-5 text-left transition hover:bg-[#FAF9F6] sm:border-r"
                    >
                      <span className="text-[10px] font-bold text-[#987534]">
                        {String(
                          index +
                            1,
                        ).padStart(
                          2,
                          "0",
                        )}
                      </span>

                      <p className="mt-2 text-[14px] font-semibold text-[#07172A]">
                        {
                          committee.name
                        }
                      </p>

                      <p className="mt-1 text-[11px] text-slate-500">
                        {committeeTypeLabel(
                          committee.type,
                        )}
                      </p>
                    </button>
                  ),
                )}
            </div>
          )}
        </div>

        <aside className="portal-panel-soft p-5">
          <p className="text-[11px] font-bold text-[#987534]">
            Quick access
          </p>

          <div className="mt-3 divide-y divide-[#E7E4DB]">
            <button
              type="button"
              onClick={() =>
                onNavigate(
                  "meetings",
                )
              }
              className="flex w-full items-center justify-between py-3 text-left text-[13px] font-semibold text-[#07172A]"
            >
              Meetings
              <span className="text-slate-400">
                →
              </span>
            </button>

            <button
              type="button"
              onClick={() =>
                onNavigate(
                  "committees",
                )
              }
              className="flex w-full items-center justify-between py-3 text-left text-[13px] font-semibold text-[#07172A]"
            >
              Committees
              <span className="text-slate-400">
                →
              </span>
            </button>

            <button
              type="button"
              onClick={() =>
                onNavigate(
                  "notifications",
                )
              }
              className="flex w-full items-center justify-between py-3 text-left text-[13px] font-semibold text-[#07172A]"
            >
              Updates
              <span className="text-slate-400">
                →
              </span>
            </button>

            <button
              type="button"
              onClick={() =>
                onNavigate(
                  "reports",
                )
              }
              className="flex w-full items-center justify-between py-3 text-left text-[13px] font-semibold text-[#07172A]"
            >
              Governance reports
              <span className="text-slate-400">
                →
              </span>
            </button>

            {user.role ===
              "ADMIN" && (
                <button
                  type="button"
                  onClick={() =>
                    onNavigate(
                      "admin",
                    )
                  }
                  className="flex w-full items-center justify-between py-3 text-left text-[13px] font-semibold text-[#07172A]"
                >
                  Administration
                  <span className="text-slate-400">
                    →
                  </span>
                </button>
              )}
          </div>
        </aside>
      </section>
    </div>
  );
}