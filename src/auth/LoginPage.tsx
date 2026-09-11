import {
  useEffect,
  useState,
  type FormEvent,
} from "react";
import {
  acceptInvitation,
  completePasswordReset,
  login,
  requestPasswordReset,
  resendOtp,
  verifyOtp,
} from "./auth-api";
import {
  useAuth,
} from "./AuthContext";
import {
  CLUB_LOGO_URL,
} from "../branding";

type Step =
  | "credentials"
  | "otp"
  | "forgot-email"
  | "forgot-reset"
  | "forgot-complete"
  | "invite"
  | "invite-complete";

function EyeIcon({
  visible,
}: {
  visible: boolean;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
    >
      {visible ? (
        <>
          <path
            d="M3 12s3.2-5 9-5 9 5 9 5-3.2 5-9 5-9-5-9-5Z"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle
            cx="12"
            cy="12"
            r="2.5"
          />
        </>
      ) : (
        <>
          <path
            d="M4 4l16 16"
            strokeLinecap="round"
          />
          <path
            d="M10.6 7.2A9.4 9.4 0 0 1 12 7c5.8 0 9 5 9 5a15 15 0 0 1-2.5 2.9M6.3 8.3A14.4 14.4 0 0 0 3 12s3.2 5 9 5c1 0 1.9-.1 2.7-.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
    </svg>
  );
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (
    value: string,
  ) => void;
  autoComplete:
    | "current-password"
    | "new-password";
  hint?: string;
}) {
  const [
    visible,
    setVisible,
  ] =
    useState(false);

  return (
    <label
      htmlFor={id}
      className="block"
    >
      <span className="mb-2 block text-sm font-semibold text-slate-800">
        {label}
      </span>

      <div className="relative">
        <input
          id={id}
          type={
            visible
              ? "text"
              : "password"
          }
          autoComplete={
            autoComplete
          }
          value={value}
          onChange={(
            event,
          ) =>
            onChange(
              event.target.value,
            )
          }
          required
          className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3.5 pr-12 text-sm text-slate-900 outline-none transition focus:border-[#C8A45D] focus:ring-2 focus:ring-[#C8A45D]/20"
        />

        <button
          type="button"
          onClick={() =>
            setVisible(
              (current) =>
                !current,
            )
          }
          aria-label={
            visible
              ? "Hide password"
              : "Show password"
          }
          aria-pressed={
            visible
          }
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-400 transition hover:text-[#0B2A50]"
        >
          <EyeIcon
            visible={
              visible
            }
          />
        </button>
      </div>

      {hint && (
        <span className="mt-2 block text-xs leading-5 text-slate-500">
          {hint}
        </span>
      )}
    </label>
  );
}

function Feedback({
  message,
  error,
}: {
  message: string;
  error: string;
}) {
  return (
    <>
      {message && (
        <div className="rounded-lg border border-[#E4D2A9] bg-[#FAF6EC] px-4 py-3 text-sm leading-6 text-[#654E1D]">
          {message}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800">
          {error}
        </div>
      )}
    </>
  );
}

function strongPassword(
  value: string,
): boolean {
  return (
    value.length >= 12 &&
    /[a-z]/.test(
      value,
    ) &&
    /[A-Z]/.test(
      value,
    ) &&
    /\d/.test(
      value,
    ) &&
    /[^A-Za-z0-9]/.test(
      value,
    )
  );
}

export default function LoginPage() {
  const {
    refreshUser,
  } =
    useAuth();

  const invitationToken =
    window.location.pathname ===
      "/set-password"
      ? (
          new URLSearchParams(
            window.location.search,
          )
            .get("token")
            ?.trim() ??
          ""
        )
      : "";

  const [
    step,
    setStep,
  ] =
    useState<Step>(
      window.location.pathname ===
        "/set-password"
        ? "invite"
        : "credentials",
    );

  const [
    email,
    setEmail,
  ] =
    useState("");

  const [
    password,
    setPassword,
  ] =
    useState("");

  const [
    otp,
    setOtp,
  ] =
    useState("");

  const [
    challengeId,
    setChallengeId,
  ] =
    useState<string | null>(
      null,
    );

  const [
    newPassword,
    setNewPassword,
  ] =
    useState("");

  const [
    confirmPassword,
    setConfirmPassword,
  ] =
    useState("");

  const [
    inviteName,
    setInviteName,
  ] =
    useState("");

  const [
    busy,
    setBusy,
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
    resendSeconds,
    setResendSeconds,
  ] =
    useState(0);

  useEffect(
    () => {
      if (
        resendSeconds <=
        0
      ) {
        return;
      }

      const timer =
        window.setTimeout(
          () =>
            setResendSeconds(
              (current) =>
                Math.max(
                  0,
                  current - 1,
                ),
            ),
          1000,
        );

      return () =>
        window.clearTimeout(
          timer,
        );
    },
    [resendSeconds],
  );

  function clearFeedback() {
    setMessage("");
    setErrorMessage("");
  }

  function goToSignIn() {
    window.history.replaceState(
      {},
      "",
      "/",
    );

    setStep(
      "credentials",
    );

    setPassword("");
    setOtp("");
    setNewPassword("");
    setConfirmPassword("");
    setChallengeId(
      null,
    );

    clearFeedback();
  }

  async function handleLogin(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setBusy(true);
    clearFeedback();

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

      setOtp("");

      setStep(
        "otp",
      );

      setMessage(
        result.message ??
          "A verification code has been sent to your registered email address.",
      );
    } catch (caught) {
      setErrorMessage(
        caught instanceof Error
          ? caught.message
          : "Unable to sign in.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!challengeId) {
      setErrorMessage(
        "Verification session is missing.",
      );
      return;
    }

    setBusy(true);
    clearFeedback();

    try {
      await verifyOtp(
        challengeId,
        otp,
      );

      await refreshUser();
    } catch (caught) {
      setErrorMessage(
        caught instanceof Error
          ? caught.message
          : "Unable to verify the code.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleLoginResend() {
    if (!challengeId) {
      return;
    }

    setBusy(true);
    clearFeedback();

    try {
      await resendOtp(
        challengeId,
      );

      setMessage(
        "A new sign-in verification code has been sent.",
      );
    } catch (caught) {
      setErrorMessage(
        caught instanceof Error
          ? caught.message
          : "Unable to resend the code.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleForgotRequest(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setBusy(true);
    clearFeedback();

    try {
      const result =
        await requestPasswordReset(
          email,
        );

      setOtp("");
      setNewPassword("");
      setConfirmPassword("");
      setResendSeconds(
        60,
      );

      setStep(
        "forgot-reset",
      );

      setMessage(
        result.message ??
          "If the account exists, a reset code has been sent.",
      );
    } catch (caught) {
      setErrorMessage(
        caught instanceof Error
          ? caught.message
          : "Unable to request a password reset.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleResetResend() {
    if (
      resendSeconds >
      0
    ) {
      return;
    }

    setBusy(true);
    clearFeedback();

    try {
      const result =
        await requestPasswordReset(
          email,
        );

      setResendSeconds(
        60,
      );

      setMessage(
        result.message ??
          "A new password reset code has been sent.",
      );
    } catch (caught) {
      setErrorMessage(
        caught instanceof Error
          ? caught.message
          : "Unable to resend the reset code.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handlePasswordReset(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    clearFeedback();

    if (
      otp.length !==
      6
    ) {
      setErrorMessage(
        "Enter the 6-digit verification code.",
      );
      return;
    }

    if (
      newPassword !==
      confirmPassword
    ) {
      setErrorMessage(
        "The passwords do not match.",
      );
      return;
    }

    if (
      !strongPassword(
        newPassword,
      )
    ) {
      setErrorMessage(
        "Password must be at least 12 characters and include uppercase, lowercase, a number and a special character.",
      );
      return;
    }

    setBusy(true);

    try {
      const result =
        await completePasswordReset(
          email,
          otp,
          newPassword,
        );

      setStep(
        "forgot-complete",
      );

      setMessage(
        result.message ??
          "Your password has been reset successfully.",
      );

      setPassword("");
      setOtp("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (caught) {
      setErrorMessage(
        caught instanceof Error
          ? caught.message
          : "Unable to reset your password.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleInvitation(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    clearFeedback();

    if (
      !invitationToken
    ) {
      setErrorMessage(
        "This invitation link is incomplete. Ask an administrator to resend your invitation.",
      );
      return;
    }

    if (
      inviteName.trim().length <
      2
    ) {
      setErrorMessage(
        "Enter your full name.",
      );
      return;
    }

    if (
      newPassword !==
      confirmPassword
    ) {
      setErrorMessage(
        "The passwords do not match.",
      );
      return;
    }

    if (
      !strongPassword(
        newPassword,
      )
    ) {
      setErrorMessage(
        "Password must be at least 12 characters and include uppercase, lowercase, a number and a special character.",
      );
      return;
    }

    setBusy(true);

    try {
      const result =
        await acceptInvitation(
          invitationToken,
          inviteName.trim(),
          newPassword,
        );

      window.history.replaceState(
        {},
        "",
        "/",
      );

      setStep(
        "invite-complete",
      );

      setMessage(
        result.message ??
          "Your account is ready.",
      );

      setNewPassword("");
      setConfirmPassword("");
    } catch (caught) {
      setErrorMessage(
        caught instanceof Error
          ? caught.message
          : "Unable to complete account setup.",
      );
    } finally {
      setBusy(false);
    }
  }

  const heading =
    step === "credentials"
      ? "Sign in to continue"
      : step === "otp"
        ? "Verify your sign-in"
        : step === "forgot-email"
          ? "Forgot your password?"
          : step === "forgot-reset"
            ? "Create a new password"
            : step === "forgot-complete"
              ? "Password reset complete"
              : step === "invite"
                ? "Complete your account"
                : "Account setup complete";

  const description =
    step === "credentials"
      ? "Use your Nairobi Club credentials to access the Governance Portal."
      : step === "otp"
        ? "Enter the 6-digit verification code sent to your registered email address."
        : step === "forgot-email"
          ? "Enter your registered email address and we will send a secure password reset code."
          : step === "forgot-reset"
            ? "Enter the code from your email and create a new private password."
            : step === "forgot-complete"
              ? "Your new password is active and previous sessions have been invalidated."
              : step === "invite"
                ? "Confirm your full name and create your private password. Nairobi Club administrators do not know or set your password."
                : "Your Nairobi Club Governance Portal account is ready.";

  return (
    <main className="min-h-screen bg-[#F4F6F8] px-4 py-8 sm:px-6 lg:flex lg:items-center">
      <section className="mx-auto grid w-full max-w-6xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl lg:grid-cols-[1.15fr_0.85fr]">
        <div className="hidden bg-[#0B1F3A] p-12 text-white lg:flex lg:min-h-[680px] lg:flex-col lg:justify-between">
          <div>
            <div className="flex items-center gap-4">
              <img
                src={CLUB_LOGO_URL}
                alt="Nairobi Club"
                className="h-20 w-20 object-contain"
              />

              <div>
                <p className="text-xl font-semibold">
                  Nairobi Club
                </p>

                <p className="mt-1 text-xs font-semibold uppercase tracking-[0.2em] text-[#D8BC7A]">
                  Governance Portal
                </p>
              </div>
            </div>

            <div className="mt-24 max-w-xl">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#D8BC7A]">
                Committee Governance
              </p>

              <h1 className="mt-4 text-4xl font-semibold leading-tight">
                Meetings, attendance
                <br />
                and governance records
              </h1>

              <p className="mt-6 max-w-lg text-sm leading-7 text-slate-300">
                A secure Nairobi Club workspace for committee and subcommittee meetings, attendance, apologies, conflict-of-interest declarations, documents and governance records.
              </p>
            </div>
          </div>

          <p className="text-xs leading-6 text-slate-400">
            Access is restricted to authorised Nairobi Club users. Security and governance activity is logged.
          </p>
        </div>

        <div className="flex min-h-[620px] items-center px-7 py-10 sm:px-12">
          <div className="mx-auto w-full max-w-md">
            <div className="mb-8 flex items-center gap-3 lg:hidden">
              <img
                src={CLUB_LOGO_URL}
                alt="Nairobi Club"
                className="h-14 w-14 object-contain"
              />

              <div>
                <p className="font-semibold text-[#0B1F3A]">
                  Nairobi Club
                </p>

                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#86682D]">
                  Governance Portal
                </p>
              </div>
            </div>

            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#86682D]">
              Secure access
            </p>

            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[#07172A]">
              {heading}
            </h2>

            <p className="mt-3 text-sm leading-6 text-slate-600">
              {description}
            </p>

            {step === "credentials" && (
              <form
                onSubmit={handleLogin}
                className="mt-8 space-y-5"
              >
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-slate-800">
                    Email
                  </span>

                  <input
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) =>
                      setEmail(
                        event.target.value,
                      )
                    }
                    required
                    className="h-11 w-full rounded-lg border border-slate-300 px-3.5 text-sm outline-none focus:border-[#C8A45D] focus:ring-2 focus:ring-[#C8A45D]/20"
                  />
                </label>

                <PasswordField
                  id="login-password"
                  label="Password"
                  value={password}
                  onChange={setPassword}
                  autoComplete="current-password"
                />

                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      clearFeedback();
                      setStep(
                        "forgot-email",
                      );
                    }}
                    className="text-sm font-semibold text-[#17365F] hover:text-[#0B2A50]"
                  >
                    Forgot password?
                  </button>
                </div>

                <Feedback
                  message={message}
                  error={errorMessage}
                />

                <button
                  type="submit"
                  disabled={busy}
                  className="h-11 w-full rounded-lg bg-[#0B2A50] px-4 text-sm font-semibold text-white transition hover:bg-[#143D6B] disabled:opacity-50"
                >
                  {busy
                    ? "Signing in..."
                    : "Sign in"}
                </button>
              </form>
            )}

            {step === "otp" && (
              <form
                onSubmit={handleVerify}
                className="mt-8 space-y-5"
              >
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-slate-800">
                    Verification code
                  </span>

                  <input
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
                    className="h-14 w-full rounded-lg border border-slate-300 px-3 text-center text-2xl font-semibold tracking-[0.35em] text-[#0B2A50] outline-none focus:border-[#C8A45D] focus:ring-2 focus:ring-[#C8A45D]/20"
                  />
                </label>

                <p className="text-xs leading-5 text-slate-500">
                  The code expires after 10 minutes.
                </p>

                <Feedback
                  message={message}
                  error={errorMessage}
                />

                <button
                  type="submit"
                  disabled={
                    busy ||
                    otp.length !== 6
                  }
                  className="h-11 w-full rounded-lg bg-[#0B2A50] text-sm font-semibold text-white disabled:opacity-50"
                >
                  {busy
                    ? "Verifying..."
                    : "Verify and sign in"}
                </button>

                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void handleLoginResend()
                  }
                  className="h-11 w-full rounded-lg border border-slate-300 bg-white text-sm font-semibold text-[#17365F] disabled:opacity-50"
                >
                  Resend code
                </button>

                <button
                  type="button"
                  disabled={busy}
                  onClick={goToSignIn}
                  className="w-full text-sm font-medium text-slate-500"
                >
                  Back to sign in
                </button>
              </form>
            )}

            {step === "forgot-email" && (
              <form
                onSubmit={handleForgotRequest}
                className="mt-8 space-y-5"
              >
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-slate-800">
                    Registered email address
                  </span>

                  <input
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) =>
                      setEmail(
                        event.target.value,
                      )
                    }
                    required
                    className="h-11 w-full rounded-lg border border-slate-300 px-3.5 text-sm outline-none focus:border-[#C8A45D] focus:ring-2 focus:ring-[#C8A45D]/20"
                  />
                </label>

                <p className="text-xs leading-5 text-slate-500">
                  If you have never completed your first-time account setup, use your invitation email or ask an Administrator to resend the invitation instead.
                </p>

                <Feedback
                  message={message}
                  error={errorMessage}
                />

                <button
                  type="submit"
                  disabled={busy}
                  className="h-11 w-full rounded-lg bg-[#0B2A50] text-sm font-semibold text-white disabled:opacity-50"
                >
                  {busy
                    ? "Sending code..."
                    : "Send reset code"}
                </button>

                <button
                  type="button"
                  disabled={busy}
                  onClick={goToSignIn}
                  className="w-full text-sm font-medium text-slate-500"
                >
                  Back to sign in
                </button>
              </form>
            )}

            {step === "forgot-reset" && (
              <form
                onSubmit={handlePasswordReset}
                className="mt-8 space-y-5"
              >
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
                    Reset account
                  </p>

                  <p className="mt-1 text-sm font-medium text-slate-800">
                    {email}
                  </p>
                </div>

                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-slate-800">
                    6-digit reset code
                  </span>

                  <input
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
                    className="h-14 w-full rounded-lg border border-slate-300 px-3 text-center text-2xl font-semibold tracking-[0.35em] text-[#0B2A50] outline-none focus:border-[#C8A45D] focus:ring-2 focus:ring-[#C8A45D]/20"
                  />

                  <span className="mt-2 block text-xs text-slate-500">
                    This code expires after 10 minutes.
                  </span>
                </label>

                <PasswordField
                  id="new-password"
                  label="New password"
                  value={newPassword}
                  onChange={setNewPassword}
                  autoComplete="new-password"
                  hint="At least 12 characters with uppercase, lowercase, a number and a special character."
                />

                <PasswordField
                  id="confirm-new-password"
                  label="Confirm new password"
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  autoComplete="new-password"
                />

                <Feedback
                  message={message}
                  error={errorMessage}
                />

                <button
                  type="submit"
                  disabled={
                    busy ||
                    otp.length !== 6
                  }
                  className="h-11 w-full rounded-lg bg-[#0B2A50] text-sm font-semibold text-white disabled:opacity-50"
                >
                  {busy
                    ? "Resetting password..."
                    : "Reset password"}
                </button>

                <button
                  type="button"
                  disabled={
                    busy ||
                    resendSeconds > 0
                  }
                  onClick={() =>
                    void handleResetResend()
                  }
                  className="h-11 w-full rounded-lg border border-slate-300 bg-white text-sm font-semibold text-[#17365F] disabled:opacity-50"
                >
                  {resendSeconds > 0
                    ? `Resend code in ${resendSeconds}s`
                    : "Resend reset code"}
                </button>

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    clearFeedback();
                    setStep(
                      "forgot-email",
                    );
                  }}
                  className="w-full text-sm font-medium text-slate-500"
                >
                  Use a different email
                </button>
              </form>
            )}

            {step === "forgot-complete" && (
              <div className="mt-8 space-y-5">
                <Feedback
                  message={message}
                  error={errorMessage}
                />

                <button
                  type="button"
                  onClick={goToSignIn}
                  className="h-11 w-full rounded-lg bg-[#0B2A50] text-sm font-semibold text-white"
                >
                  Continue to sign in
                </button>
              </div>
            )}

            {step === "invite" && (
              <form
                onSubmit={handleInvitation}
                className="mt-8 space-y-5"
              >
                {!invitationToken && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                    This invitation link is missing its security token. Ask an Administrator to resend your invitation.
                  </div>
                )}

                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-slate-800">
                    Full name
                  </span>

                  <input
                    type="text"
                    autoComplete="name"
                    maxLength={120}
                    value={inviteName}
                    onChange={(event) =>
                      setInviteName(
                        event.target.value,
                      )
                    }
                    required
                    className="h-11 w-full rounded-lg border border-slate-300 px-3.5 text-sm outline-none focus:border-[#C8A45D] focus:ring-2 focus:ring-[#C8A45D]/20"
                  />
                </label>

                <PasswordField
                  id="invite-password"
                  label="Create your password"
                  value={newPassword}
                  onChange={setNewPassword}
                  autoComplete="new-password"
                  hint="At least 12 characters with uppercase, lowercase, a number and a special character."
                />

                <PasswordField
                  id="invite-confirm-password"
                  label="Confirm password"
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  autoComplete="new-password"
                />

                <Feedback
                  message={message}
                  error={errorMessage}
                />

                <button
                  type="submit"
                  disabled={
                    busy ||
                    !invitationToken
                  }
                  className="h-11 w-full rounded-lg bg-[#0B2A50] text-sm font-semibold text-white disabled:opacity-50"
                >
                  {busy
                    ? "Creating account..."
                    : "Complete account setup"}
                </button>
              </form>
            )}

            {step === "invite-complete" && (
              <div className="mt-8 space-y-5">
                <Feedback
                  message={message}
                  error={errorMessage}
                />

                <button
                  type="button"
                  onClick={goToSignIn}
                  className="h-11 w-full rounded-lg bg-[#0B2A50] text-sm font-semibold text-white"
                >
                  Continue to sign in
                </button>
              </div>
            )}

            <div className="mt-8 border-t border-slate-200 pt-5">
              <p className="text-xs leading-5 text-slate-500">
                Never share your password or verification codes. Nairobi Club administrators do not need to know your password.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}