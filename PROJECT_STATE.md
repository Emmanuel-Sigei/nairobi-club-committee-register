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
Stage 3 â€” Attendance: implementation substantially complete, operational validation pending.

## Stage 1 â€” Auth + committee/member foundations
- [x] Email/password + email OTP flow exists.
- [x] 10-minute OTP expiry.
- [x] 5 failed OTP attempts -> 15-minute lock.
- [x] 60-second OTP resend gate.
- [x] Session cookie and logout/current-user endpoints.
- [x] Invitation/password-reset token hashing and expiry.
- [x] Zoho Mail integration.
- [ ] Invitation must atomically create committee memberships + role + term dates.
- [ ] Committee CRUD must be fully validated.
- [ ] Membership administration must be fully validated.
- [ ] Member deactivation/session invalidation must be fully validated.
- [ ] Full login/password-reset rate limiting deferred to Stage 8.

## Stage 2 â€” Meetings + Zoho Calendar
- [x] Create/update/cancel meetings.
- [x] Ordered agenda items.
- [x] Active members sent to Zoho Calendar.
- [x] Zoho create/update/delete integration.
- [x] Meeting email notifications.
- [x] Mutation audit events.
- [ ] Runtime Zoho Calendar credential/integration validation.

## Stage 3 â€” Attendance
- [x] One authoritative attendance row per meeting/member.
- [x] Self check-in.
- [x] Self apology.
- [x] Admin marking.
- [x] On-demand RSVP sync; no cron.
- [x] Zoho decline only creates draft apology if no app record exists.
- [x] Auto absent on close.
- [x] Post-close Admin correction with mandatory reason/audit event.
- [ ] Prisma migration not executed.
- [ ] Neon runtime validation not executed.
- [ ] End-to-end Zoho RSVP validation not executed.
- [ ] QR presentation/generation not implemented.

## Stage 4 â€” COI
- [ ] Schema.
- [ ] One declaration per member/meeting.
- [ ] Yes/No + types/detail/agenda references/recusal intent.
- [ ] Live Admin/chair flag.
- [ ] declaration_not_submitted at close.
- [ ] Post-close correction flow.

## Stage 5 â€” Documents
- [ ] R2 signed PUT upload.
- [ ] Versioned document records.
- [ ] Admin-only upload enforced server-side.
- [ ] Authenticated signed GET route.
- [ ] View/download/denied access logging.
- [ ] Archived display state after close.

## Stage 6 â€” Notifications
- [x] Invite.
- [x] MFA OTP.
- [x] Password reset + confirmation.
- [x] Meeting scheduled/updated/cancelled.
- [x] Apology confirmation.
- [ ] New document notification.
- [ ] Attendance correction notification.
- [ ] COI correction notification.

## Stage 7 â€” Audit/reporting/Exco
- [x] Core append-only AuditEvent model.
- [ ] Audit viewer.
- [ ] Attendance report + CSV.
- [ ] COI report + CSV.
- [ ] Absence/apology pattern report + CSV.
- [ ] Document access report + CSV.
- [ ] Dedicated Exco/Management read-only dashboard with server-side enforcement.

## Stage 8 â€” Hardening
- [ ] Login endpoint rate limiting.
- [ ] Password-reset endpoint rate limiting.
- [ ] Session policy review/rotation.
- [ ] Security headers/CSRF review.
- [ ] Production deployment validation.

## Open questions / blockers
- Neon database credentials/runtime access are required for migration/runtime validation.
- Zoho Mail/Calendar credentials are required for integration validation.
- R2 credentials are required before Stage 5 runtime validation.
- Decide whether QR should encode the existing authenticated meeting URL (recommended) or a separate expiring check-in token.

## Decisions
- No cron under Vercel Hobby.
- Historical eligibility is based on membership term at meeting start.
- QR should not become an unauthenticated attendance bypass.
- Remediation scripts must write UTF-8 without BOM.