import {
  useCallback,
  useEffect,
  useState,
} from "react";

interface NotificationRecord {
  id: string;
  kind: string;
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
  error?: string;
}

async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response =
    await fetch(
      path,
      {
        ...options,
        credentials:
          "include",
        headers: {
          "Content-Type":
            "application/json",
          ...(options.headers ??
            {}),
        },
      },
    );

  const text =
    await response.text();

  let data:
    unknown = {};

  if (text) {
    try {
      data =
        JSON.parse(
          text,
        );
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
      ).error ===
        "string"
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

function formatDate(
  value: string,
): string {
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
      timeStyle:
        "short",
    },
  ).format(date);
}

export default function NotificationsPanel() {
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
    errorMessage,
    setErrorMessage,
  ] =
    useState("");

  const load =
    useCallback(
      async () => {
        setLoading(
          true,
        );

        setErrorMessage(
          "",
        );

        try {
          const response =
            await apiRequest<NotificationResponse>(
              "/api/notifications",
            );

          setNotifications(
            response.notifications,
          );

          setUnreadCount(
            response.unreadCount,
          );
        } catch (caught) {
          setErrorMessage(
            caught instanceof Error
              ? caught.message
              : "We couldn't load your updates.",
          );
        } finally {
          setLoading(
            false,
          );
        }
      },
      [],
    );

  useEffect(
    () => {
      void Promise.resolve().then(
        () =>
          load(),
      );
    },
    [load],
  );

  async function markAllRead() {
    setWorking(
      true,
    );

    setErrorMessage(
      "",
    );

    try {
      await apiRequest(
        "/api/notifications",
        {
          method:
            "PATCH",
          body:
            JSON.stringify({
              action:
                "read-all",
            }),
        },
      );

      await load();
    } catch (caught) {
      setErrorMessage(
        caught instanceof Error
          ? caught.message
          : "We couldn't mark your updates as read.",
      );
    } finally {
      setWorking(
        false,
      );
    }
  }

  async function openNotification(
    notification:
      NotificationRecord,
  ) {
    setWorking(
      true,
    );

    setErrorMessage(
      "",
    );

    try {
      if (
        !notification.readAt
      ) {
        await apiRequest(
          `/api/notifications/${encodeURIComponent(
            notification.id,
          )}`,
          {
            method:
              "PATCH",
          },
        );
      }

      if (
        notification.href
      ) {
        window.location.assign(
          notification.href,
        );

        return;
      }

      await load();
    } catch (caught) {
      setErrorMessage(
        caught instanceof Error
          ? caught.message
          : "We couldn't open that update.",
      );
    } finally {
      setWorking(
        false,
      );
    }
  }

  return (
    <div className="space-y-5">
      <section className="portal-page-header sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="portal-kicker">
            Activity
          </p>

          <h2 className="portal-page-title mt-2">
            Updates & notifications
          </h2>

          <p className="portal-page-copy mt-2">
            Meeting changes, committee activity and governance actions that need your attention.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="rounded-full bg-[#F2EAD7] px-3 py-1.5 text-[11px] font-semibold text-[#806027]">
            {unreadCount} unread
          </span>

          <button
            type="button"
            disabled={
              loading ||
              working
            }
            onClick={() =>
              void load()
            }
            className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-[12px] font-semibold text-slate-700 transition hover:bg-[#FAF9F6] disabled:opacity-50"
          >
            Refresh
          </button>

          <button
            type="button"
            disabled={
              working ||
              unreadCount ===
                0
            }
            onClick={() =>
              void markAllRead()
            }
            className="rounded-lg bg-[#0B1F3A] px-3.5 py-2 text-[12px] font-semibold text-white transition hover:bg-[#17365F] disabled:opacity-50"
          >
            Mark all read
          </button>
        </div>
      </section>

      {errorMessage && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[12px] text-red-800">
          {errorMessage}
        </div>
      )}

      <section className="portal-panel">
        {loading ? (
          <div className="p-10 text-center text-sm text-slate-500">
            Loading updates...
          </div>
        ) : notifications.length ===
          0 ? (
          <div className="p-12 text-center">
            <div className="mx-auto h-2.5 w-2.5 rounded-full bg-emerald-500" />

            <h3 className="mt-4 text-[16px] font-semibold">
              You're all caught up
            </h3>

            <p className="mt-2 text-[12px] text-slate-500">
              New meeting and governance updates will appear here.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#EDECE7]">
            {notifications.map(
              (
                notification,
              ) => (
                <button
                  key={
                    notification.id
                  }
                  type="button"
                  disabled={
                    working
                  }
                  onClick={() =>
                    void openNotification(
                      notification,
                    )
                  }
                  className={`block w-full px-5 py-4 text-left transition sm:px-6 ${
                    notification.readAt
                      ? "bg-white hover:bg-[#FAF9F6]"
                      : "bg-[#FCF8EE] hover:bg-[#F9F2E1]"
                  }`}
                >
                  <div className="flex gap-3.5">
                    <span
                      className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${
                        notification.readAt
                          ? "bg-slate-300"
                          : "bg-[#C8A45D]"
                      }`}
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <h3 className="truncate text-[13px] font-semibold text-[#07172A]">
                            {
                              notification.title
                            }
                          </h3>

                          <p className="mt-1 max-w-4xl text-[12px] leading-5 text-slate-600">
                            {
                              notification.body
                            }
                          </p>
                        </div>

                        <p className="shrink-0 text-[10px] text-slate-400">
                          {formatDate(
                            notification.createdAt,
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                </button>
              ),
            )}
          </div>
        )}
      </section>
    </div>
  );
}