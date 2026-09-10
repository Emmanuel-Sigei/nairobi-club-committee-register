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
        setLoading(true);
        setErrorMessage("");

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
              : "We couldn't load your notifications.",
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

  async function markAllRead() {
    setWorking(true);
    setErrorMessage("");

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
          : "We couldn't mark your notifications as read.",
      );
    } finally {
      setWorking(false);
    }
  }

  async function openNotification(
    notification:
      NotificationRecord,
  ) {
    setWorking(true);
    setErrorMessage("");

    try {
      if (
        !notification.readAt
      ) {
        await apiRequest(
          `/api/notifications/${encodeURIComponent(notification.id)}`,
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
          : "We couldn't open that notification.",
      );
      setWorking(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            Notifications
          </p>

          <h2 className="mt-2 text-[26px] font-semibold">
            Notifications
          </h2>

          <p className="mt-2 text-sm text-slate-600">
            {unreadCount} unread notification{unreadCount === 1 ? "" : "s"}.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            disabled={
              loading ||
              working
            }
            onClick={() =>
              void load()
            }
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
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
            className="rounded-lg border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            Mark all read
          </button>
        </div>
      </section>

      {errorMessage && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {errorMessage}
        </div>
      )}

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="p-10 text-center text-sm text-slate-500">
            Loading notifications...
          </div>
        ) : notifications.length ===
          0 ? (
          <div className="p-10 text-center">
            <h3 className="font-semibold">
              You're all caught up
            </h3>
            <p className="mt-2 text-sm text-slate-500">
              New meeting and committee updates will appear here.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
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
                  className={
                    notification.readAt
                      ? "block w-full px-6 py-5 text-left transition hover:bg-slate-50"
                      : "block w-full bg-amber-50/50 px-6 py-5 text-left transition hover:bg-amber-50"
                  }
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-slate-950">
                          {
                            notification.title
                          }
                        </h3>

                        {!notification.readAt && (
                          <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">
                            New
                          </span>
                        )}
                      </div>

                      <p className="mt-2 text-sm text-slate-600">
                        {
                          notification.body
                        }
                      </p>
                    </div>

                    <p className="shrink-0 text-xs text-slate-400">
                      {formatDate(
                        notification.createdAt,
                      )}
                    </p>
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