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
import {
  CLUB_LOGO_URL,
} from "../branding";

type Step =
  | "credentials"
  | "otp";

function ShieldIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
    >
      <path
        d="M12 3.5 18 6v5.2c0 4.1-2.5 7.5-6 9.3-3.5-1.8-6-5.2-6-9.3V6l6-2.5Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="m9.6 12 1.5 1.5 3.4-3.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
    >
      <rect
        x="6"
        y="10"
        width="12"
        height="10"
        rx="2"
      />
      <path
        d="M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10"
        strokeLinecap="round"
      />
      <path
        d="M12 14v2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path
        d="M5 12h14M14 7l5 5-5 5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function LoginPage() {
  const { refreshUser } =
    useAuth();

  const [step, setStep] =
    useState<Step>("credentials");

  const [email, setEmail] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [otp, setOtp] =
    useState("");

  const [
    challengeId,
    setChallengeId,
  ] =
    useState<string | null>(
      null,
    );

  const [busy, setBusy] =
    useState(false);

  const [message, setMessage] =
    useState("");

  const [
    errorMessage,
    setErrorMessage,
  ] =
    useState("");

  async function handleLogin(
    event: FormEvent,
  ) {
    event.preventDefault();
    setBusy(true);
    setErrorMessage("");
    setMessage("");

    try {
      const result =
        await login(
          email,
          password,
        );

      if (
        !result.otpChallengeId
      ) {
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
    <main className="min-h-screen bg-[#F5F6F8] px-4 py-6 sm:px-6 lg:flex lg:items-center lg:px-8">
      <section className="mx-auto grid w-full max-w-[1180px] overflow-hidden border border-slate-200 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.08)] lg:min-h-[690px] lg:grid-cols-[1.6fr_1fr]">
        <div className="relative hidden border-r border-slate-200 bg-[#F7F8FA] p-12 lg:flex lg:flex-col lg:justify-between">
          <div>
            <div className="flex items-center gap-4">
              <img
                src={CLUB_LOGO_URL}
                alt="Nairobi Club"
                className="h-16 w-16 object-contain"
              />

              <div>
                <p className="text-[17px] font-semibold text-[#17365F]">
                  Nairobi Club
                </p>

                <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#86682D]">
                  Committee Register
                </p>
              </div>
            </div>

            <div className="mt-24 max-w-[520px]">
              <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#355079]">
                Internal Platform
              </p>

              <h1 className="mt-4 text-[36px] font-semibold leading-[1.08] tracking-[-0.035em] text-[#07172A]">
                Committee Attendance
                <br />
                &amp; Governance
              </h1>

              <p className="mt-5 max-w-[470px] text-[15px] leading-7 text-slate-600">
                Manage committee meetings,
                attendance, declarations and
                records through one secure
                Nairobi Club platform.
              </p>
            </div>
          </div>

          <div className="border-t border-slate-200 pt-5">
            <div className="grid grid-cols-3 gap-7">
              <div>
                <p className="text-[12px] font-semibold text-[#17365F]">
                  Meetings
                </p>
                <p className="mt-2 text-[12px] text-slate-500">
                  Structured records
                </p>
              </div>

              <div>
                <p className="text-[12px] font-semibold text-[#17365F]">
                  Attendance
                </p>
                <p className="mt-2 text-[12px] text-slate-500">
                  Verified register
                </p>
              </div>

              <div>
                <p className="text-[12px] font-semibold text-[#17365F]">
                  Governance
                </p>
                <p className="mt-2 text-[12px] text-slate-500">
                  Traceable declarations
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col justify-center px-7 py-10 sm:px-12 lg:px-11">
          <div className="mb-9 flex items-center gap-3 lg:hidden">
            <img
              src={CLUB_LOGO_URL}
              alt="Nairobi Club"
              className="h-14 w-14 object-contain"
            />

            <div>
              <p className="font-semibold text-[#17365F]">
                Nairobi Club
              </p>
              <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#86682D]">
                Committee Register
              </p>
            </div>
          </div>

          <div className="max-w-[390px]">
            <div className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-500">
              <LockIcon />
            </div>

            <p className="mt-6 text-[12px] font-semibold uppercase tracking-[0.16em] text-[#355079]">
              Staff Sign-In
            </p>

            <h2 className="mt-3 text-[28px] font-semibold tracking-[-0.025em] text-[#07172A]">
              {step === "credentials"
                ? "Sign in to continue"
                : "Verify your sign-in"}
            </h2>

            <p className="mt-3 text-[14px] leading-6 text-slate-600">
              {step === "credentials"
                ? "Use your Nairobi Club credentials to access the Committee Register."
                : "Enter the verification code sent to your Nairobi Club email address."}
            </p>
          </div>

          {step === "credentials" ? (
            <form
              onSubmit={handleLogin}
              className="mt-8 max-w-[390px] space-y-6"
            >
              <div>
                <label
                  htmlFor="email"
                  className="mb-2 block text-[13px] font-semibold text-[#172033]"
                >
                  Email
                </label>

                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) =>
                    setEmail(
                      event.target.value,
                    )
                  }
                  required
                  className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-[#C8A45D] focus:ring-2 focus:ring-[#C8A45D]/15"
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="mb-2 block text-[13px] font-semibold text-[#172033]"
                >
                  Password
                </label>

                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) =>
                    setPassword(
                      event.target.value,
                    )
                  }
                  required
                  className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-[#C8A45D] focus:ring-2 focus:ring-[#C8A45D]/15"
                />
              </div>

              {errorMessage && (
                <p className="rounded-md border border-red-100 bg-red-50 px-3 py-2.5 text-sm leading-5 text-red-700">
                  {errorMessage}
                </p>
              )}

              <button
                type="submit"
                disabled={busy}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[#0B2A50] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#143D6B] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span>
                  {busy
                    ? "Signing in..."
                    : "Sign in"}
                </span>

                {!busy && (
                  <ArrowIcon />
                )}
              </button>
            </form>
          ) : (
            <form
              onSubmit={handleVerify}
              className="mt-8 max-w-[390px] space-y-5"
            >
              <div>
                <label
                  htmlFor="otp"
                  className="mb-2 block text-[13px] font-semibold text-[#172033]"
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
                  className="h-14 w-full rounded-md border border-slate-300 bg-white px-3 text-center text-2xl font-semibold tracking-[0.32em] text-[#0B2A50] outline-none transition focus:border-[#C8A45D] focus:ring-2 focus:ring-[#C8A45D]/15"
                />

                <p className="mt-2 text-xs leading-5 text-slate-500">
                  The 6-digit code expires after
                  10 minutes.
                </p>
              </div>

              {message && (
                <p className="rounded-md border border-[#E4D2A9] bg-[#FAF6EC] px-3 py-2.5 text-sm leading-5 text-[#654E1D]">
                  {message}
                </p>
              )}

              {errorMessage && (
                <p className="rounded-md border border-red-100 bg-red-50 px-3 py-2.5 text-sm leading-5 text-red-700">
                  {errorMessage}
                </p>
              )}

              <button
                type="submit"
                disabled={
                  busy ||
                  otp.length !== 6
                }
                className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[#0B2A50] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#143D6B] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span>
                  {busy
                    ? "Verifying..."
                    : "Verify and sign in"}
                </span>

                {!busy && (
                  <ArrowIcon />
                )}
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void handleResend()
                }
                className="h-11 w-full rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-[#17365F] transition hover:bg-slate-50 disabled:opacity-50"
              >
                Resend code
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setStep(
                    "credentials",
                  );
                  setOtp("");
                  setChallengeId(
                    null,
                  );
                  setMessage("");
                  setErrorMessage(
                    "",
                  );
                }}
                className="w-full text-sm font-medium text-slate-500 hover:text-[#17365F]"
              >
                Back to sign in
              </button>
            </form>
          )}

          <div className="mt-8 max-w-[390px] border-t border-slate-200 pt-5">
            <div className="flex items-start gap-2.5 text-slate-500">
              <div className="mt-0.5 text-slate-400">
                <ShieldIcon />
              </div>

              <p className="text-[11px] leading-5">
                Authorised Nairobi Club users
                only. Access to this system is
                logged for security and
                governance purposes.
              </p>
            </div>

            <p className="mt-7 text-[11px] text-[#526887]">
              Nairobi Club · Committee Register
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}