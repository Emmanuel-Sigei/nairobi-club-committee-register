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
Stage 6 — Notifications: architecture/code implementation complete; live Zoho Mail validation deferred.

## Stage 1 ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â Auth + committee/member foundations
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

## Stage 2 ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â Meetings + Zoho Calendar
- [x] Create/update/cancel meetings.
- [x] Ordered agenda items.
- [x] Active members sent to Zoho Calendar.
- [x] Zoho create/update/delete integration.
- [x] Meeting email notifications.
- [x] Mutation audit events.
- [ ] Runtime Zoho Calendar credential/integration validation.

## Stage 3 ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â Attendance
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

## Stage 4 ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â COI
- [x] Schema implemented with immutable declaration identity + append-only revisions.
- [x] One declaration identity per member/meeting.
- [x] Yes/No + types/detail/agenda references/recusal intent.
- [x] Live Admin/chair register visibility; Exco remains read-only.
- [x] declaration_not_submitted created at close for present members without a declaration.
- [x] Post-close Admin correction appends a new immutable revision with mandatory reason; member email notification included.

## Stage 5 ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â Documents
- [x] R2 signed PUT upload architecture.
- [x] Versioned document records.
- [x] Admin-only upload enforced server-side.
- [x] Authenticated signed GET route.
- [x] View/download/denied access logging.
- [x] Archived display state after close.
- [ ] R2 bucket/CORS/runtime validation deferred to infrastructure phase.

## Stage 6 ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â Notifications
- [x] Invite.
- [x] MFA OTP.
- [x] Password reset + confirmation.
- [x] Meeting scheduled/updated/cancelled.
- [x] Apology confirmation.
- [x] New document notification.
- [x] Attendance correction notification.
- [x] COI correction notification.
- [ ] Zoho Mail runtime validation deferred to infrastructure phase.

## Stage 7 ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â Audit/reporting/Exco
- [x] Core append-only AuditEvent model.
- [ ] Audit viewer.
- [ ] Attendance report + CSV.
- [ ] COI report + CSV.
- [ ] Absence/apology pattern report + CSV.
- [ ] Document access report + CSV.
- [ ] Dedicated Exco/Management read-only dashboard with server-side enforcement.

## Stage 8 ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â Hardening
- [ ] Login endpoint rate limiting.
- [ ] Password-reset endpoint rate limiting.
- [ ] Session policy review/rotation.
- [ ] Security headers/CSRF review.
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