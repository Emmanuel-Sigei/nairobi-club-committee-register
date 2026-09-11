import {

  useMemo,
  useState,
  type FormEvent,
} from "react";

interface Committee {
  id: string;
  name: string;
  type: "MAIN" | "SUBCOMMITTEE";
  archivedAt?: string | null;
}

type ResultStatus =
  | "invitation_sent"
  | "invitation_resent"
  | "invitation_email_failed"
  | "access_granted"
  | "access_email_failed"
  | "already_member"
  | "failed";

interface BulkResult {
  email: string;
  status: ResultStatus;
  message: string;
}

interface BulkResponse {
  success: boolean;
  requested: number;
  committee: {
    id: string;
    name: string;
    type: string;
  };
  counts: Partial<
    Record<
      ResultStatus,
      number
    >
  >;
  results: BulkResult[];
}

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200";

function todayValue(): string {
  return new Date()
    .toISOString()
    .slice(
      0,
      10,
    );
}

function parseEmails(
  value: string,
): string[] {
  return Array.from(
    new Set(
      value
        .split(
          /[\s,;]+/,
        )
        .map(
          (email) =>
            email
              .trim()
              .toLowerCase(),
        )
        .filter(Boolean),
    ),
  );
}

function validEmail(
  value: string,
): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    value,
  );
}

function resultLabel(
  status: ResultStatus,
): string {
  if (
    status ===
    "invitation_sent"
  ) {
    return "Invitation sent";
  }

  if (
    status ===
    "invitation_resent"
  ) {
    return "Invitation refreshed";
  }

  if (
    status ===
    "access_granted"
  ) {
    return "Access granted";
  }

  if (
    status ===
    "already_member"
  ) {
    return "Already assigned";
  }

  if (
    status ===
    "invitation_email_failed"
  ) {
    return "Invitation email failed";
  }

  if (
    status ===
    "access_email_failed"
  ) {
    return "Access added / email failed";
  }

  return "Failed";
}

function resultClass(
  status: ResultStatus,
): string {
  if (
    status ===
      "invitation_sent" ||
    status ===
      "invitation_resent" ||
    status ===
      "access_granted"
  ) {
    return "bg-emerald-50 text-emerald-700";
  }

  if (
    status ===
    "already_member"
  ) {
    return "bg-slate-100 text-slate-700";
  }

  if (
    status ===
      "invitation_email_failed" ||
    status ===
      "access_email_failed"
  ) {
    return "bg-amber-50 text-amber-800";
  }

  return "bg-red-50 text-red-700";
}

async function submitBulk(
  input: {
    committeeId: string;
    emails: string[];
    chairEmail?: string;
    secretaryEmail?: string;
    startDate: string;
    endDate?: string;
  },
): Promise<BulkResponse> {
  const response =
    await fetch(
      "/api/auth/bulk-invite",
      {
        method:
          "POST",
        credentials:
          "include",
        headers: {
          "Content-Type":
            "application/json",
        },
        body:
          JSON.stringify(
            input,
          ),
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
        : "Bulk onboarding failed.";

    throw new Error(
      message,
    );
  }

  return data as BulkResponse;
}

export default function BulkOnboardingPanel({
  committees,
  onRefresh,
}: {
  committees: Committee[];
  onRefresh: () => Promise<void>;
}) {
  const [
    committeeId,
    setCommitteeId,
  ] =
    useState("");

  const [
    emailText,
    setEmailText,
  ] =
    useState("");

  const [
    chairEmail,
    setChairEmail,
  ] =
    useState("");

  const [
    secretaryEmail,
    setSecretaryEmail,
  ] =
    useState("");

  const [
    startDate,
    setStartDate,
  ] =
    useState(
      todayValue(),
    );

  const [
    endDate,
    setEndDate,
  ] =
    useState("");

  const [
    busy,
    setBusy,
  ] =
    useState(false);

  const [
    refreshing,
    setRefreshing,
  ] =
    useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] =
    useState("");

  const [
    response,
    setResponse,
  ] =
    useState<BulkResponse | null>(
      null,
    );

  const emails =
    useMemo(
      () =>
        parseEmails(
          emailText,
        ),
      [emailText],
    );

  const invalidEmails =
    useMemo(
      () =>
        emails.filter(
          (email) =>
            !validEmail(
              email,
            ),
        ),
      [emails],
    );


  async function submit(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setErrorMessage("");
    setResponse(
      null,
    );

    if (!committeeId) {
      setErrorMessage(
        "Select the committee or subcommittee being onboarded.",
      );
      return;
    }

    if (
      emails.length ===
      0
    ) {
      setErrorMessage(
        "Paste at least one member email address.",
      );
      return;
    }

    if (
      emails.length >
      50
    ) {
      setErrorMessage(
        "A maximum of 50 email addresses can be processed in one batch.",
      );
      return;
    }

    if (
      invalidEmails.length >
      0
    ) {
      setErrorMessage(
        `Invalid email address: ${invalidEmails[0]}`,
      );
      return;
    }

    if (
      chairEmail &&
      secretaryEmail &&
      chairEmail ===
        secretaryEmail
    ) {
      setErrorMessage(
        "The same person cannot be both Chair and Secretary.",
      );
      return;
    }

    if (!startDate) {
      setErrorMessage(
        "Select a membership start date.",
      );
      return;
    }

    if (
      endDate &&
      endDate <
        startDate
    ) {
      setErrorMessage(
        "End date cannot be earlier than start date.",
      );
      return;
    }

    setBusy(
      true,
    );

    try {
      const result =
        await submitBulk({
          committeeId,
          emails,
          chairEmail:
            chairEmail ||
            undefined,
          secretaryEmail:
            secretaryEmail ||
            undefined,
          startDate,
          endDate:
            endDate ||
            undefined,
        });

      setResponse(
        result,
      );
    } catch (caught) {
      setErrorMessage(
        caught instanceof Error
          ? caught.message
          : "Bulk onboarding could not be completed.",
      );
    } finally {
      setBusy(
        false,
      );
    }
  }

  const completed =
    response
      ? (
          response.counts
            .invitation_sent ??
          0
        ) +
        (
          response.counts
            .invitation_resent ??
          0
        ) +
        (
          response.counts
            .access_granted ??
          0
        )
      : 0;

  const review =
    response
      ? (
          response.counts
            .already_member ??
          0
        ) +
        (
          response.counts
            .invitation_email_failed ??
          0
        ) +
        (
          response.counts
            .access_email_failed ??
          0
        )
      : 0;

  const failed =
    response?.counts
      .failed ??
    0;

  return (
    <section className="rounded-xl border border-[#D8C28D] bg-[#FFFCF5] p-6 shadow-sm">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#86682D]">
            Committee onboarding
          </p>

          <h3 className="mt-2 text-xl font-semibold text-[#0B1F3A]">
            Onboard Committee Members
          </h3>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Select the committee or subcommittee and paste the email addresses of everyone who should have access. New users receive their own secure account setup instructions and create their own passwords. Existing Governance Portal users are simply given the additional committee access.
          </p>
        </div>

        <div className="rounded-lg border border-[#E8D7B1] bg-white px-4 py-3 text-xs leading-5 text-slate-600">
          Maximum 50 addresses per batch
        </div>
      </div>

      <form
        onSubmit={submit}
        className="mt-6"
      >
        <div className="grid gap-5 lg:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
              Committee / Subcommittee
            </span>

            <select
              className={inputClass}
              value={committeeId}
              disabled={busy}
              onChange={(event) =>
                setCommitteeId(
                  event.target.value,
                )
              }
            >
              <option value="">
                Select committee
              </option>

              {committees.map(
                (committee) => (
                  <option
                    key={committee.id}
                    value={committee.id}
                  >
                    {committee.name}
                  </option>
                ),
              )}
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
              Membership start date
            </span>

            <input
              className={inputClass}
              type="date"
              value={startDate}
              disabled={busy}
              onChange={(event) =>
                setStartDate(
                  event.target.value,
                )
              }
            />
          </label>

          <label className="block lg:col-span-2">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
              Member email addresses
            </span>

            <textarea
              className={`${inputClass} min-h-40 resize-y`}
              value={emailText}
              disabled={busy}
              placeholder={"member1@nairobiclub.com\nmember2@nairobiclub.com\nmember3@nairobiclub.com"}
              onChange={(event) => {
                const nextText =
                  event.target.value;

                const nextEmails =
                  parseEmails(
                    nextText,
                  );

                setEmailText(
                  nextText,
                );

                if (
                  chairEmail &&
                  !nextEmails.includes(
                    chairEmail,
                  )
                ) {
                  setChairEmail("");
                }

                if (
                  secretaryEmail &&
                  !nextEmails.includes(
                    secretaryEmail,
                  )
                ) {
                  setSecretaryEmail("");
                }
              }}
            />

            <span className="mt-2 block text-xs leading-5 text-slate-500">
              Paste one email per line, or separate addresses using commas, semicolons or spaces. Duplicate addresses are removed automatically.
            </span>

            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                {emails.length} unique address{emails.length === 1 ? "" : "es"}
              </span>

              {invalidEmails.length > 0 && (
                <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">
                  {invalidEmails.length} invalid
                </span>
              )}
            </div>

            {emails.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {emails
                  .slice(
                    0,
                    8,
                  )
                  .map(
                    (email) => (
                      <span
                        key={email}
                        className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600"
                      >
                        {email}
                      </span>
                    ),
                  )}

                {emails.length > 8 && (
                  <span className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-500">
                    +{emails.length - 8} more
                  </span>
                )}
              </div>
            )}
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
              Chair (optional)
            </span>

            <select
              className={inputClass}
              value={chairEmail}
              disabled={
                busy ||
                emails.length === 0
              }
              onChange={(event) =>
                setChairEmail(
                  event.target.value,
                )
              }
            >
              <option value="">
                No Chair selected
              </option>

              {emails.map(
                (email) => (
                  <option
                    key={email}
                    value={email}
                  >
                    {email}
                  </option>
                ),
              )}
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
              Secretary (optional)
            </span>

            <select
              className={inputClass}
              value={secretaryEmail}
              disabled={
                busy ||
                emails.length === 0
              }
              onChange={(event) =>
                setSecretaryEmail(
                  event.target.value,
                )
              }
            >
              <option value="">
                No Secretary selected
              </option>

              {emails.map(
                (email) => (
                  <option
                    key={email}
                    value={email}
                  >
                    {email}
                  </option>
                ),
              )}
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
              Membership end date (optional)
            </span>

            <input
              className={inputClass}
              type="date"
              value={endDate}
              disabled={busy}
              onChange={(event) =>
                setEndDate(
                  event.target.value,
                )
              }
            />
          </label>

          <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600">
            Everyone defaults to <strong>Member</strong>. Select the Chair and Secretary from the pasted list where applicable.
          </div>
        </div>

        {errorMessage && (
          <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {errorMessage}
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={
              busy ||
              emails.length === 0
            }
            className="inline-flex min-h-10 items-center justify-center rounded-lg bg-[#0B2A50] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#143D6B] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy
              ? "Onboarding members..."
              : emails.length === 1
                ? "Send 1 invitation"
                : `Send ${emails.length} invitations`}
          </button>

          <p className="text-xs leading-5 text-slate-500">
            New-user setup links expire after 48 hours.
          </p>
        </div>
      </form>

      {response && (
        <div className="mt-7 border-t border-[#E8D7B1] pt-6">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h4 className="font-semibold text-[#0B1F3A]">
                Onboarding results
              </h4>

              <p className="mt-1 text-sm text-slate-500">
                {response.committee.name}
              </p>
            </div>

            <button
              type="button"
              disabled={refreshing}
              onClick={() => {
                setRefreshing(
                  true,
                );

                void onRefresh()
                  .finally(
                    () =>
                      setRefreshing(
                        false,
                      ),
                  );
              }}
              className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
            >
              {refreshing
                ? "Refreshing..."
                : "Refresh user directory"}
            </button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-emerald-700">
                Completed
              </p>

              <p className="mt-1 text-2xl font-semibold text-emerald-900">
                {completed}
              </p>
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-amber-700">
                Review
              </p>

              <p className="mt-1 text-2xl font-semibold text-amber-900">
                {review}
              </p>
            </div>

            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-red-700">
                Failed
              </p>

              <p className="mt-1 text-2xl font-semibold text-red-900">
                {failed}
              </p>
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
            {response.results.map(
              (result) => (
                <div
                  key={result.email}
                  className="flex flex-col gap-2 border-b border-slate-100 px-4 py-3 last:border-b-0 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {result.email}
                    </p>

                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      {result.message}
                    </p>
                  </div>

                  <span
                    className={`inline-flex w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${resultClass(result.status)}`}
                  >
                    {resultLabel(
                      result.status,
                    )}
                  </span>
                </div>
              ),
            )}
          </div>
        </div>
      )}
    </section>
  );
}