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
INFRASTRUCTURE I3A COMPLETE - Neon main, Zoho Mail SMTP, Zoho Calendar OAuth, automatic committee calendar provisioning and Cloudflare R2 core storage validated. Remaining: Vercel environment/deployment, production R2 CORS origin, live authentication/OTP and focused UAT.

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
- [x] Runtime Zoho Calendar credential/integration validation completed using the superadmin service identity.

## Stage 3
- [x] One authoritative attendance row per meeting/member.
- [x] Self check-in.
- [x] Self apology.
- [x] Admin marking.
- [x] On-demand RSVP sync; no cron.
- [x] Zoho decline only creates draft apology if no app record exists.
- [x] Auto absent on close.
- [x] Post-close Admin correction is append-only with mandatory reason; original attendance row is preserved.
- [x] Prisma migrations deployed to Neon main during Infrastructure I1.
- [x] Neon main schema and governance triggers validated during Infrastructure I1.
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
- [x] R2 bucket, localhost CORS and signed PUT/GET runtime validation completed.

## Stage 6
- [x] Invite.
- [x] MFA OTP.
- [x] Password reset + confirmation.
- [x] Meeting scheduled/updated/cancelled.
- [x] Apology confirmation.
- [x] New document notification.
- [x] Attendance correction notification.
- [x] COI correction notification.
- [x] Zoho Mail runtime validated; application outbound mail uses authenticated Zoho SMTP.

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
- Live Administrator login, email OTP, authenticated session and logout remain to be validated against the deployed application runtime.
- Cloudflare R2 core storage is validated; production Vercel origin must still be added to the bucket CORS policy after deployment.
- Vercel environment configuration and first deployment remain.
- End-to-end Zoho RSVP synchronization remains to be validated with a real committee meeting.
- Dependency security review must be repeated before production go-live.

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
## Architecture Freeze Pass C2A

- [x] Notification persistence model defined.
- [x] Authenticated notification list/read APIs implemented.
- [x] Meeting scheduled/updated/cancelled lifecycle writes in-app notifications.
- [x] Zoho Mail remains the exclusive email provider.
- [x] Admin user directory read API implemented.
- [x] Admin membership/roster read API implemented.
- [x] Safe 48-hour invitation resend API implemented.
- [x] Invitation resend audit history is append-only.
- [ ] Prisma migration deferred to infrastructure phase.
- [ ] C2B Admin management UI.
- [ ] C2B Notification UI.
- [ ] Final architecture freeze audit.
## Architecture Freeze Pass C2B

- [x] Administration navigation is visible only to Administrators.
- [x] Admin user directory UI implemented.
- [x] New user invitation UI implemented.
- [x] Invitation resend UI implemented.
- [x] Account deactivation UI implemented.
- [x] Additional committee membership UI implemented.
- [x] Membership role update UI implemented.
- [x] Membership term-ending UI implemented.
- [x] Committee create/edit/archive UI implemented.
- [x] In-app notification list UI implemented.
- [x] Individual notification read workflow implemented.
- [x] Mark-all-read workflow implemented.
- [x] Meeting notifications open the authenticated meeting route.
- [ ] Final architecture freeze verification.
- [ ] Production dependency audit review.
- [ ] Neon / Zoho / R2 / Vercel infrastructure phase.
## Final Architecture Freeze

Status: APPROVED WITH DOCUMENTED TOOLING SECURITY EXCEPTION

Application architecture and build validation completed successfully.

Passed:
- Architecture structural verification.
- Prisma schema validation.
- Prisma client generation.
- Full repository ESLint.
- Client TypeScript validation.
- API TypeScript validation.
- Production Vite build.
- Dependency provenance and runtime-reachability review.

Security exception:
- npm audit reports HIGH findings in transitive dependencies under the Prisma CLI/tooling chain.
- The findings are documented in docs/2026-09-09-dependency-security-review.md.
- No vulnerable mysql2 or deepmerge-ts application-source usage was identified.
- No forced dependency override or Prisma downgrade was applied.
- The exception must be reviewed again before production deployment.

Architecture is frozen.

Remaining work is infrastructure provisioning, migrations, provider configuration, focused automated governance tests, and end-to-end runtime/UAT validation.
## Infrastructure I1 - Neon main initialization

- [x] Initial Prisma migration generated and reviewed locally.
- [x] Immutable governance trigger migration packaged separately.
- [x] Neon main direct/unpooled migration connection configured.
- [x] Neon main confirmed empty before initialization.
- [x] `0_initial_schema` deployed successfully.
- [x] `1_immutable_governance` deployed successfully.
- [x] Prisma migration history verified current.
- [x] Deployed relational schema matches the frozen Prisma schema.
- [x] AuditEvent immutable trigger verified active.
- [x] AttendanceCorrection immutable trigger verified active.
- [x] MeetingConflictOfInterestRevision immutable trigger verified active.
- [x] No unresolved or unexpected Prisma migration records.
- [x] Membership PATCH term-overlap integrity corrected.
- [x] Future-dated memberships cannot be ended before their start date.
- [x] Inactive-user and archived-committee memberships cannot be reopened.
- [x] Prisma validation, ESLint, TypeScript and production build passed after correction.
- [x] First Administrator bootstrap.
- [ ] Live authentication/OTP validation.
- [x] Zoho Mail runtime validation.
- [x] Zoho Calendar runtime validation.
- [x] Cloudflare R2 core runtime validation.
- [ ] Vercel runtime/deployment validation.
## Infrastructure I2A - Initial Administrator bootstrap

- [x] Neon main migration state verified current before bootstrap.
- [x] Bootstrap permitted only because the User table was empty.
- [x] Initial Administrator created directly in Neon main.
- [x] Password stored using the application bcrypt 12-round policy.
- [x] Administrator account created active with passwordSetAt populated.
- [x] INITIAL_ADMIN_BOOTSTRAPPED immutable SYSTEM audit event created atomically.
- [x] Exactly one user verified after bootstrap.
- [x] Zoho Mail SMTP runtime configuration and sender identity validated.
- [ ] Live Administrator login/password/OTP/session validation.

## Infrastructure I2B - Zoho Mail

- [x] Zoho Mail service identity confirmed as superadmin@nairobiclub.com.
- [x] governance@nairobiclub.com confirmed as the application From alias.
- [x] Zoho REST sender-name limitation verified from the raw message From header.
- [x] Application outbound mail moved to authenticated Zoho SMTP.
- [x] Zoho application-specific SMTP password validated without exposing or committing it.
- [x] Sender identity validated as Nairobi Club <governance@nairobiclub.com>.
- [x] Existing application email workflows retained through the centralized Mail helper.
- [x] Nairobi Club corporate email branding applied.
- [ ] Live application login/OTP flow remains to be validated after runtime deployment.

## Infrastructure I2C - Zoho Calendar and automatic provisioning

- [x] Separate Zoho Calendar refresh token generated under superadmin@nairobiclub.com.
- [x] Required Calendar scopes validated.
- [x] Refresh-token exchange validated live.
- [x] Calendar ownership model fixed: institutional calendars are owned by superadmin@nairobiclub.com.
- [x] Committee creation automatically provisions a dedicated Zoho Calendar.
- [x] Returned Zoho Calendar UID is stored internally on the Committee record.
- [x] Administrators no longer enter or edit raw Zoho Calendar IDs.
- [x] Committee rename synchronizes the associated Zoho Calendar name.
- [x] Committee archive preserves the Zoho Calendar and historical meetings.
- [x] Database failure after Calendar creation has compensating Calendar cleanup.
- [x] Calendar rename database failure has rollback handling.
- [x] Live temporary Calendar create, rename and delete lifecycle validated.
- [x] Temporary validation Calendar confirmed removed after testing.
- [x] No real committee records exist yet; production committee creation will use the automatic provisioning workflow.


## Infrastructure I3A - Cloudflare R2

- [x] Dedicated private bucket provisioned: nairobi-club-committee-register-documents.
- [x] Public bucket access remains disabled.
- [x] Bucket-scoped S3-compatible credentials configured locally.
- [x] R2 endpoint validated against the Cloudflare Account ID.
- [x] Localhost browser CORS preflight validated for PUT with Content-Type.
- [x] Presigned PUT upload validated live.
- [x] Uploaded object Content-Type and size validated.
- [x] Presigned GET document retrieval validated live.
- [x] Temporary validation object deleted.
- [x] Object absence confirmed after cleanup.
- [x] No application code change was required for R2 core provisioning.
- [ ] Add the exact Vercel production application origin to R2 CORS after deployment.
- [ ] Validate a real authenticated document upload/view/download through the deployed application.
## Production Authentication and Committee Onboarding

- [x] Production Vercel Web Handler routing validated.
- [x] Forgot-password workflow exposed from sign-in.
- [x] Password recovery uses a 6-digit OTP sent to the registered email address.
- [x] Password-reset OTP expires after 10 minutes.
- [x] Password-reset resend throttling implemented.
- [x] Password-reset verification rate limiting implemented.
- [x] Successful password reset invalidates existing sessions and outstanding login OTP challenges.
- [x] Password-reset confirmation email implemented.
- [x] Show/hide password controls implemented for sign-in, reset and first-time setup.
- [x] Administrators never create or know member passwords.
- [x] Invitees confirm their own full name and create their own password.
- [x] Invitation links expire after 48 hours.
- [x] Bulk Committee/Subcommittee onboarding implemented from pasted email lists.
- [x] Email lists are validated and deduplicated.
- [x] Optional Chair and Secretary designation implemented.
- [x] Remaining committee invitees default to Member.
- [x] New users receive individual secure onboarding emails.
- [x] Pending users receive refreshed invitations without duplicate accounts.
- [x] Existing active users receive additional committee access without password replacement.
- [x] Existing overlapping committee appointments are not duplicated.
- [x] Invitation email explains the Governance Portal, what members use it for and how to activate access.
- [x] Existing-user committee-access notification email implemented.
- [x] First-time account setup confirmation email implemented.
- [x] Bulk onboarding returns per-address results and writes audit history.
- [x] No Prisma migration required.
- [x] Existing consolidated Vercel Function architecture preserved.
- [ ] Live Administrator forgot-password OTP UAT.
- [ ] Live first-time invitation UAT.
- [ ] Live bulk Committee/Subcommittee onboarding UAT.
## Final Production UI Pass

- [x] Document View/Download routing repaired and deployed before UI pass.
- [x] ESLint excludes generated Vercel build output.
- [x] Final lint gate requires zero warnings, including after Vercel production build.
- [x] User-facing product identity standardized as Nairobi Club Governance Portal.
- [x] Global typography changed from Segoe UI to Manrope with system fallbacks.
- [x] Excessive uppercase labels and wide positive letter-spacing removed from the rendered portal.
- [x] BeaconFold-inspired editorial hierarchy adopted: concise contextual labels, strong headings, restrained chrome and content-led layout.
- [x] Nairobi Club navy/gold institutional identity retained.
- [x] Sticky compact desktop/mobile navigation implemented.
- [x] Signed-in Home rebuilt as an information-rich operational dashboard.
- [x] Home surfaces next meeting, meeting workload, unread updates, committees and role-aware quick actions.
- [x] Meetings directory redesigned.
- [x] Meeting detail hierarchy redesigned without changing meeting governance logic.
- [x] Committee directory redesigned.
- [x] Document library redesigned with clearer version history and explicit View/Download actions.
- [x] Notifications redesigned as an Updates activity stream.
- [x] Login, OTP, password reset and first-time activation presentation refreshed.
- [x] Shared application controls, forms, modals, cards and status badges standardized.
- [x] Attendance, COI, Reports and Administration inherit the final design system without changing authorization or governance behaviour.
- [x] Responsive layouts preserved for desktop, tablet and mobile.
- [x] No database migration required.
- [x] Consolidated Vercel Function architecture remains at 10 Functions.
- [ ] Final browser visual UAT on representative desktop and mobile devices.
