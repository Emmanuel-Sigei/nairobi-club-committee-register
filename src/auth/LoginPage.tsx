import {
  useState,
  type FormEvent,
} from "react";
import {
  login,
  resendOtp,
  verifyOtp,
} from "./auth-api";
import { useAuth } from "./AuthContext";

type Step = "credentials" | "otp";

export default function LoginPage() {
  const { refreshUser } = useAuth();

  const [step, setStep] =
    useState<Step>("credentials");

  const [email, setEmail] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [otp, setOtp] =
    useState("");

  const [challengeId, setChallengeId] =
    useState<string | null>(null);

  const [busy, setBusy] =
    useState(false);

  const [message, setMessage] =
    useState("");

  const [errorMessage, setErrorMessage] =
    useState("");

  async function handleLogin(
    event: FormEvent,
  ) {
    event.preventDefault();
    setBusy(true);
    setErrorMessage("");
    setMessage("");

    try {
      const result = await login(
        email,
        password,
      );

      if (!result.otpChallengeId) {
        throw new Error(
          "The server did not return a verification challenge.",
        );
      }

      setChallengeId(
        result.otpChallengeId,
      );

      setStep("otp");
      setMessage(
        result.message ??
          "A verification code has been sent to your email.",
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to sign in.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify(
    event: FormEvent,
  ) {
    event.preventDefault();

    if (!challengeId) {
      setErrorMessage(
        "Verification session is missing.",
      );
      return;
    }

    setBusy(true);
    setErrorMessage("");
    setMessage("");

    try {
      await verifyOtp(
        challengeId,
        otp,
      );

      await refreshUser();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to verify the code.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleResend() {
    if (!challengeId) {
      return;
    }

    setBusy(true);
    setErrorMessage("");
    setMessage("");

    try {
      await resendOtp(
        challengeId,
      );

      setMessage(
        "A new verification code has been sent.",
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to resend the code.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 flex items-center justify-center px-6">
      <section className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
            Nairobi Club
          </p>

          <h1 className="mt-2 text-2xl font-semibold text-slate-900">
            Committee Register
          </h1>

          <p className="mt-2 text-sm text-slate-600">
            Secure committee attendance and governance register.
          </p>
        </div>

        {step === "credentials" ? (
          <form
            onSubmit={handleLogin}
            className="space-y-5"
          >
            <div>
              <label
                htmlFor="email"
                className="mb-2 block text-sm font-medium text-slate-700"
              >
                Email address
              </label>

              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) =>
                  setEmail(event.target.value)
                }
                required
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-slate-900"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-2 block text-sm font-medium text-slate-700"
              >
                Password
              </label>

              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) =>
                  setPassword(event.target.value)
                }
                required
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-slate-900"
              />
            </div>

            {errorMessage && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {errorMessage}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy
                ? "Signing in..."
                : "Continue"}
            </button>
          </form>
        ) : (
          <form
            onSubmit={handleVerify}
            className="space-y-5"
          >
            <div>
              <label
                htmlFor="otp"
                className="mb-2 block text-sm font-medium text-slate-700"
              >
                Verification code
              </label>

              <input
                id="otp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                pattern="\d{6}"
                value={otp}
                onChange={(event) =>
                  setOtp(
                    event.target.value.replace(
                      /\D/g,
                      "",
                    ),
                  )
                }
                required
                className="w-full rounded-lg border border-slate-300 px-3 py-3 text-center text-2xl tracking-[0.4em] outline-none focus:border-slate-900"
              />

              <p className="mt-2 text-xs text-slate-500">
                Enter the 6-digit code sent to your email.
              </p>
            </div>

            {message && (
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                {message}
              </p>
            )}

            {errorMessage && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {errorMessage}
              </p>
            )}

            <button
              type="submit"
              disabled={
                busy || otp.length !== 6
              }
              className="w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy
                ? "Verifying..."
                : "Verify and sign in"}
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={() => void handleResend()}
              className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 disabled:opacity-50"
            >
              Resend code
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setStep("credentials");
                setOtp("");
                setChallengeId(null);
                setMessage("");
                setErrorMessage("");
              }}
              className="w-full text-sm text-slate-500 hover:text-slate-900"
            >
              Back to login
            </button>
          </form>
        )}
      </section>
    </main>
  );
}