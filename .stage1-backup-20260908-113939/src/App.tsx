import LoginPage from "./auth/LoginPage";
import { AuthProvider, useAuth } from "./auth/AuthContext";

function AuthenticatedApp() {
  const { user, loading, logout } = useAuth();

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 flex items-center justify-center text-white">
        Loading...
      </main>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <main className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
              Nairobi Club
            </p>
            <h1 className="text-xl font-semibold text-slate-900">
              Committee Register
            </h1>
          </div>

          <button
            type="button"
            onClick={() => void logout()}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
          >
            Sign out
          </button>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-10">
        <div className="rounded-2xl bg-white p-8 shadow-sm">
          <p className="text-sm text-slate-500">
            Signed in as
          </p>

          <h2 className="mt-1 text-2xl font-semibold text-slate-900">
            {user.name}
          </h2>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="text-xs uppercase tracking-wider text-slate-500">
                Email
              </p>
              <p className="mt-1 text-sm font-medium text-slate-900">
                {user.email}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 p-4">
              <p className="text-xs uppercase tracking-wider text-slate-500">
                Role
              </p>
              <p className="mt-1 text-sm font-medium text-slate-900">
                {user.role}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 p-4">
              <p className="text-xs uppercase tracking-wider text-slate-500">
                Account
              </p>
              <p className="mt-1 text-sm font-medium text-emerald-700">
                Active
              </p>
            </div>
          </div>
        </div>
      </section>
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