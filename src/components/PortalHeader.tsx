import {
  CLUB_LOGO_URL,
} from "../branding";

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

function initials(
  name: string,
): string {
  const value =
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(
        (part) =>
          part[0]
            ?.toUpperCase() ??
          "",
      )
      .join("");

  return value || "NC";
}

export default function PortalHeader({
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
  const navigation:
    Array<{
      id: ActiveTab;
      label: string;
    }> = [
      {
        id:
          "overview",
        label:
          "Home",
      },
      {
        id:
          "meetings",
        label:
          "Meetings",
      },
      {
        id:
          "committees",
        label:
          "Committees",
      },
      {
        id:
          "notifications",
        label:
          "Updates",
      },
      {
        id:
          "reports",
        label:
          "Reports",
      },
    ];

  if (
    user.role ===
    "ADMIN"
  ) {
    navigation.push({
      id:
        "admin",
      label:
        "Administration",
    });
  }

  function navigate(
    tab: ActiveTab,
  ) {
    if (
      window.location.pathname !==
      "/"
    ) {
      window.history.replaceState(
        {},
        "",
        "/",
      );
    }

    onTabChange(
      tab,
    );
  }

  return (
    <header className="sticky top-0 z-40 border-b border-[#E3E2DC] bg-white/95 backdrop-blur-xl">
      <div className="mx-auto max-w-[1480px] px-4 sm:px-6 lg:px-8">
        <div className="flex h-[72px] items-center gap-5">
          <button
            type="button"
            onClick={() =>
              navigate(
                "overview",
              )
            }
            className="flex shrink-0 items-center gap-3 text-left"
          >
            <img
              src={
                CLUB_LOGO_URL
              }
              alt="Nairobi Club"
              className="h-11 w-11 object-contain"
            />

            <div className="hidden sm:block">
              <p className="text-[11px] font-semibold text-[#987534]">
                Nairobi Club
              </p>

              <p className="mt-0.5 text-[15px] font-semibold tracking-[-0.025em] text-[#07172A]">
                Governance Portal
              </p>
            </div>
          </button>

          <nav className="hidden h-full items-center gap-0.5 lg:flex">
            {navigation.map(
              (item) => (
                <button
                  key={
                    item.id
                  }
                  type="button"
                  onClick={() =>
                    navigate(
                      item.id,
                    )
                  }
                  className={`relative flex h-full items-center px-3 text-[13px] font-semibold transition ${
                    activeTab ===
                    item.id
                      ? "text-[#07172A]"
                      : "text-slate-500 hover:text-[#07172A]"
                  }`}
                >
                  {
                    item.label
                  }

                  {activeTab ===
                    item.id && (
                    <span className="absolute inset-x-3 bottom-0 h-0.5 bg-[#C8A45D]" />
                  )}
                </button>
              ),
            )}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right xl:block">
              <p className="text-[13px] font-semibold text-[#07172A]">
                {
                  user.name
                }
              </p>

              <p className="mt-0.5 text-[11px] text-slate-500">
                {roleLabel(
                  user.role,
                )}
              </p>
            </div>

            <div
              className="flex h-9 w-9 items-center justify-center rounded-full bg-[#F2EAD7] text-[11px] font-bold text-[#806027]"
              title={
                user.email
              }
            >
              {initials(
                user.name,
              )}
            </div>

            <button
              type="button"
              onClick={
                onLogout
              }
              className="hidden h-9 items-center rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-[#FAF9F6] hover:text-[#07172A] sm:inline-flex"
            >
              Sign out
            </button>
          </div>
        </div>

        <nav className="-mx-1 flex gap-1 overflow-x-auto pb-2 lg:hidden">
          {navigation.map(
            (item) => (
              <button
                key={
                  item.id
                }
                type="button"
                onClick={() =>
                  navigate(
                    item.id,
                  )
                }
                className={`whitespace-nowrap rounded-lg px-3 py-2 text-[13px] font-semibold ${
                  activeTab ===
                  item.id
                    ? "bg-[#0B1F3A] text-white"
                    : "text-slate-600"
                }`}
              >
                {
                  item.label
                }
              </button>
            ),
          )}

          <button
            type="button"
            onClick={
              onLogout
            }
            className="whitespace-nowrap rounded-lg px-3 py-2 text-[13px] font-semibold text-slate-500 sm:hidden"
          >
            Sign out
          </button>
        </nav>
      </div>
    </header>
  );
}