import { useState } from "react";
import type { FormEvent } from "react";

import { useAuth } from "./AuthContext";
import {
  login,
  resendOtp,
  verifyOtp,
} from "./auth-api";

type LoginStep = "credentials" | "otp";

export default function LoginPage() {
  const { refreshUser } = useAuth();

  const [step, setStep] =
    useState<LoginStep>("credentials");

  const [email, setEmail] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [challengeId, setChallengeId] =
    useState("");

  const [otp, setOtp] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  const [resending, setResending] =
    useState(false);

  const [error, setError] =
    useState("");

  const [message, setMessage] =
    useState("");

  async function handleLogin(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setError("");
    setMessage("");
    setLoading(true);

    try {
      const result = await login(
        email.trim(),
        password,
      );

      if (!result.otpChallengeId) {
        throw new Error(
          "Sign-in started, but no OTP challenge was returned. Please try again.",
        );
      }

      setChallengeId(result.otpChallengeId);
      setOtp("");
      setStep("otp");

      setMessage(
        "A verification code has been sent to your registered email address.",
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to sign in. Please check your credentials and try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!challengeId) {
      setError(
        "Your verification session is missing. Please start the sign-in process again.",
      );
      setStep("credentials");
      return;
    }

    setError("");
    setMessage("");
    setLoading(true);

    try {
      await verifyOtp(
        challengeId,
        otp,
      );

      await refreshUser();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "The verification code could not be confirmed.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleResendOtp() {
    if (!challengeId) {
      setError(
        "Your verification session is missing. Please start the sign-in process again.",
      );
      setStep("credentials");
      return;
    }

    setError("");
    setMessage("");
    setResending(true);

    try {
      await resendOtp(challengeId);

      setMessage(
        "A new verification code has been sent to your registered email address.",
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to resend the verification code.",
      );
    } finally {
      setResending(false);
    }
  }

  function returnToCredentials() {
    setStep("credentials");
    setChallengeId("");
    setOtp("");
    setError("");
    setMessage("");
  }

  if (step === "otp") {
    return (
      <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-900">
        <div className="mx-auto flex min-h-[80vh] max-w-md items-center justify-center">
          <section className="w-full rounded-2xl bg-white p-8 shadow-2xl">
            <div className="mb-8">
              <p className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-amber-700">
                Nairobi Club
              </p>

              <h1 className="text-2xl font-semibold text-slate-950">
                Verify your sign-in
              </h1>

              <p className="mt-2 text-sm leading-6 text-slate-600">
                Enter the 6-digit verification code sent to your
                registered email address.
              </p>
            </div>

            {error && (
              <div
                role="alert"
                className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
              >
                {error}
              </div>
            )}

            {message && (
              <div
                role="status"
                className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
              >
                {message}
              </div>
            )}

            <form
              onSubmit={handleVerifyOtp}
              className="space-y-5"
            >
              <div>
                <label
                  htmlFor="otp"
                  className="mb-2 block text-sm font-medium text-slate-800"
                >
                  Verification code
                </label>

                <input
                  id="otp"
                  name="otp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  pattern="[0-9]{6}"
                  value={otp}
                  onChange={(event) =>
                    setOtp(
                      event.target.value
                        .replace(/\D/g, "")
                        .slice(0, 6),
                    )
                  }
                  required
                  autoFocus
                  className="w-full rounded-lg border border-slate-300 px-4 py-3 text-center text-2xl tracking-[0.5em] outline-none transition focus:border-amber-600 focus:ring-2 focus:ring-amber-100"
                  placeholder="000000"
                  aria-describedby="otp-help"
                />

                <p
                  id="otp-help"
                  className="mt-2 text-xs text-slate-500"
                >
                  The verification code expires after 10 minutes.
                </p>
              </div>

              <button
                type="submit"
                disabled={
                  loading ||
                  otp.length !== 6 ||
                  !challengeId
                }
                className="w-full rounded-lg bg-slate-950 px-4 py-3 font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading
                  ? "Verifying..."
                  : "Verify and sign in"}
              </button>
            </form>

            <div className="mt-6 flex flex-col gap-3 text-center text-sm">
              <button
                type="button"
                onClick={handleResendOtp}
                disabled={
                  resending ||
                  loading ||
                  !challengeId
                }
                className="font-medium text-amber-700 hover:text-amber-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {resending
                  ? "Sending..."
                  : "Resend verification code"}
              </button>

              <button
                type="button"
                onClick={returnToCredentials}
                className="text-slate-600 hover:text-slate-900"
              >
                Back to sign in
              </button>
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-900">
      <div className="mx-auto flex min-h-[80vh] max-w-md items-center justify-center">
        <section className="w-full rounded-2xl bg-white p-8 shadow-2xl">
          <div className="mb-8">
            <p className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-amber-700">
              Nairobi Club
            </p>

            <h1 className="text-2xl font-semibold text-slate-950">
              Committee Register
            </h1>

            <p className="mt-2 text-sm leading-6 text-slate-600">
              Sign in to access the Nairobi Club Attendance &amp;
              Conflict of Interest Register.
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {error}
            </div>
          )}

          {message && (
            <div
              role="status"
              className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
            >
              {message}
            </div>
          )}

          <form
            onSubmit={handleLogin}
            className="space-y-5"
          >
            <div>
              <label
                htmlFor="email"
                className="mb-2 block text-sm font-medium text-slate-800"
              >
                Email address
              </label>

              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) =>
                  setEmail(event.target.value)
                }
                required
                className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none transition focus:border-amber-600 focus:ring-2 focus:ring-amber-100"
                placeholder="name@example.com"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-2 block text-sm font-medium text-slate-800"
              >
                Password
              </label>

              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) =>
                  setPassword(event.target.value)
                }
                required
                className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none transition focus:border-amber-600 focus:ring-2 focus:ring-amber-100"
                placeholder="Enter your password"
              />
            </div>

            <button
              type="submit"
              disabled={
                loading ||
                !email.trim() ||
                !password
              }
              className="w-full rounded-lg bg-slate-950 px-4 py-3 font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading
                ? "Signing in..."
                : "Continue"}
            </button>
          </form>

          <p className="mt-6 text-center text-xs leading-5 text-slate-500">
            Multi-factor authentication is required. After your
            password is accepted, a one-time verification code will
            be sent to your registered email address.
          </p>
        </section>
      </div>
    </main>
  );
}
