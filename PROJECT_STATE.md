# Project State - Nairobi Club Committee Register

## Fixed stack
React + Vite + Tailwind CSS; Prisma + Neon PostgreSQL; Vercel serverless functions; Cloudflare R2; Zoho Calendar; Zoho Mail.

## Fixed constraints
- No Vercel Cron jobs.
- On-demand external synchronization only.
- Admin-only document upload.
- Attendance and COI lock at meeting close; corrections are append-only audit events preserving originals.
- Authenticated/logged document access only.
- One COI declaration per member per meeting.
- In-app apologies take precedence over Zoho RSVP declines.
- Zoho Mail is the only email provider.
- Email OTP is the only MFA factor.
- Vercel Hobby is the current deployment target.
- Windows / PowerShell commands only.

## Current stage
Architecture Freeze Pass C1 implemented; Pass C2 remains before architecture freeze approval.

## Stage 1
- [x] Email/password + email OTP flow exists.
- [x] 10-minute OTP expiry.
- [x] 5 failed OTP attempts -> 15-minute lock.
- [x] 60-second OTP resend gate.
- [x] Session cookie and logout/current-user endpoints.
- [x] Invitation/password-reset token hashing and expiry.
- [x] Zoho Mail integration.
- [x] Invitation atomically creates committee memberships + committee role + term dates.
- [ ] Committee CRUD must be fully validated.
- [ ] Membership administration must be fully validated.
- [ ] Member deactivation/session invalidation must be fully validated.
- [ ] Full login/password-reset rate limiting deferred to Stage 8.

## Stage 2
- [x] Create/update/cancel meetings.
- [x] Ordered agenda items.
- [x] Active members sent to Zoho Calendar.
- [x] Zoho create/update/delete integration.
- [x] Meeting email notifications.
- [x] Mutation audit events.
- [ ] Runtime Zoho Calendar credential/integration validation.

## Stage 3
- [x] One authoritative attendance row per meeting/member.
- [x] Self check-in.
- [x] Self apology.
- [x] Admin marking.
- [x] On-demand RSVP sync; no cron.
- [x] Zoho decline only creates draft apology if no app record exists.
- [x] Auto absent on close.
- [x] Post-close Admin correction is append-only with mandatory reason; original attendance row is preserved.
- [ ] Prisma migration not executed.
- [ ] Neon runtime validation not executed.
- [ ] End-to-end Zoho RSVP validation not executed.
- [ ] QR presentation/generation not implemented.

## Stage 4
- [x] Schema implemented with immutable declaration identity + append-only revisions.
- [x] One declaration identity per member/meeting.
- [x] Yes/No + types/detail/agenda references/recusal intent.
- [x] Live Admin/chair register visibility; Exco remains read-only.
- [x] declaration_not_submitted created at close for present members without a declaration.
- [x] Post-close Admin correction appends a new immutable revision with mandatory reason; member email notification included.

## Stage 5
- [x] R2 signed PUT upload architecture.
- [x] Versioned document records.
- [x] Admin-only upload enforced server-side.
- [x] Authenticated signed GET route.
- [x] View/download/denied access logging.
- [x] Archived display state after close.
- [ ] R2 bucket/CORS/runtime validation deferred to infrastructure phase.

## Stage 6
- [x] Invite.
- [x] MFA OTP.
- [x] Password reset + confirmation.
- [x] Meeting scheduled/updated/cancelled.
- [x] Apology confirmation.
- [x] New document notification.
- [x] Attendance correction notification.
- [x] COI correction notification.
- [ ] Zoho Mail runtime validation deferred to infrastructure phase.

## Stage 7
- [x] Core append-only AuditEvent model.
- [x] Audit viewer.
- [x] Attendance report + CSV.
- [x] COI report + CSV.
- [x] Absence/apology pattern report + CSV.
- [x] Document access report + CSV.
- [x] Dedicated Exco/Management read-only dashboard with server-side enforcement.
- [ ] Stage 7 database runtime validation deferred to infrastructure phase.

## Stage 8
- [x] Login endpoint rate limiting architecture implemented.
- [x] Password-reset endpoint rate limiting architecture implemented.
- [x] Session idle/absolute lifetime policy implemented.
- [x] Security headers and same-origin mutation protection implemented.
- [ ] Production deployment validation.

## Open questions / blockers
- Stage 4 runtime migration/Neon validation is pending; this script does not write to the database.
- Neon database credentials/runtime access are required for migration/runtime validation.
- Zoho Mail/Calendar credentials are required for integration validation.
- R2 credentials are required before Stage 5 runtime validation.
- Decide whether QR should encode the existing authenticated meeting URL (recommended) or a separate expiring check-in token.

## Decisions
- No cron under Vercel Hobby.
- Historical eligibility is based on membership term at meeting start.
- QR should not become an unauthenticated attendance bypass.
- Remediation scripts must write UTF-8 without BOM.
### Stage 8 runtime
- [ ] Stage 8 runtime security validation deferred to infrastructure phase.
- [ ] Validate rate-limit persistence against Neon after migration.
- [ ] Validate production origin enforcement using deployed APP_URL.
- [ ] Validate idle-session expiry and session revocation in deployed environment.
## Architecture freeze remediation

### Pass A - data integrity and authorization
- [x] Append-only AttendanceCorrection model defined.
- [x] Base MeetingAttendance row preserved after meeting close.
- [x] Attendance API resolves latest correction as current value.
- [x] Attendance/absence reports resolve latest correction.
- [x] Exco dashboard resolves latest correction.
- [x] Committee mutation permission reduced to Admin only.
- [x] Exco/Management blocked from Member self-attendance/apology actions.
- [x] Invitation creates user + invitation token + committee memberships atomically.
- [x] Invitation supports committee role and membership term dates.
- [x] Meeting creation attendee eligibility uses meeting start time.
- [x] Meeting update recalculates eligible attendees for the new meeting start time.
- [x] CLOSED status supported by meeting list filtering.

### Pass B - remaining before architecture freeze
- [x] Deactivation ends active memberships, revokes sessions and reconciles future Zoho Calendar attendees.
- [x] Zoho Calendar refresh-token OAuth architecture implemented; live credentials deferred.
- [x] Zoho Mail refresh-token OAuth architecture implemented; live credentials deferred.
- [ ] Authenticated meeting QR/check-in presentation.
- [ ] General committee documents UI.
- [~] R2 MIME fallback and deletion helper implemented; version concurrency/orphan completion cleanup remains for Pass B2.
- [x] Immutable AuditEvent/AttendanceCorrection/COI-revision PostgreSQL trigger SQL prepared but not applied.
- [ ] Final whole-repo architecture audit and code gates.
## Architecture Freeze Pass B2

- [x] Authenticated meeting QR route implemented.
- [x] QR opens the normal authenticated meeting route and does not bypass attendance authorization.
- [x] General committee documents UI mounted against the secured document API.
- [x] Browser MIME fallback implemented for supported file extensions.
- [x] Document version allocation uses Serializable transactions with bounded conflict retry.
- [x] Failed document persistence triggers best-effort R2 orphan cleanup.
- [x] No public R2 URLs introduced.
- [x] Immutable governance SQL prepared separately and not applied.
- [x] Zoho Calendar refresh-token architecture implemented.
- [x] Zoho Mail refresh-token architecture implemented.
- [x] Deactivation revokes sessions, ends active memberships and reconciles future meeting attendees when Calendar is configured.
- [x] No database migration applied during architecture freeze.
- [x] No live Zoho/R2 runtime operation performed during architecture freeze.
- [ ] Final read-only cross-stage audit against the original build brief.
- [ ] Neon migration and runtime validation.
- [ ] Zoho Mail OAuth credential/runtime validation.
- [ ] Zoho Calendar OAuth credential/runtime validation.
- [ ] Cloudflare R2 bucket/CORS/runtime validation.
- [ ] Vercel environment and deployment validation.
## Architecture Freeze Pass C1

- [x] Invitation delivery failure preserves immutable AuditEvent history.
- [x] Failed invitation delivery records INVITATION_EMAIL_FAILED.
- [x] Meeting eligibility respects account activity at the meeting time.
- [x] Inactive users cannot receive new committee memberships.
- [x] COI reads effective attendance including append-only corrections.
- [x] Attendance corrected to PRESENT creates DECLARATION_NOT_SUBMITTED if required.
- [x] Repeated attendance corrections audit the prior effective value.
- [x] Admin force-close supported when Zoho RSVP sync fails, with mandatory reason and audit.
- [x] Self attendance/apology controls shown only to Members.
- [x] QR direct meeting route opens Meetings.
- [x] Vercel meeting SPA rewrite prepared.
- [x] Active App.tsx mojibake removed.
- [ ] Pass C2 Admin management surfaces + in-app notifications.
- [ ] Final architecture freeze audit.