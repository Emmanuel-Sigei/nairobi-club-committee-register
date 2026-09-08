# Project State - Nairobi Club Committee Register

## Stack

- React
- Vite
- Tailwind CSS
- TypeScript
- Prisma 7.10.0
- Neon PostgreSQL
- Vercel Serverless Functions
- Cloudflare R2
- Zoho Calendar
- Zoho Mail

## Fixed Architectural Constraints

1. No Vercel Cron jobs.
2. Periodic synchronisation shall be on-demand and gated by `last_synced_at`.
3. Admin is the only document uploader.
4. Members and Exco/Management have read-only document access.
5. Attendance and COI records lock when a meeting closes.
6. Corrections append audit events and preserve original values.
7. Document access is authenticated and logged.
8. One COI declaration covers the complete meeting agenda.
9. In-app apologies take precedence over Zoho RSVP "No".
10. Zoho RSVP "No" creates a draft apology only for Admin confirmation.
11. All application email is sent through Zoho Mail.
12. Email OTP is the only MFA mechanism.
13. Vercel Hobby is the current deployment target.

## Stage 1 Hardening

- [x] Prisma 7 schema converted to `prisma-client`.
- [x] Prisma client uses explicit generated output.
- [x] Prisma datasource moved to `prisma.config.ts`.
- [x] Neon driver adapter configured.
- [x] BOM-free source file writing enforced.
- [x] Database client lazy initialization implemented.
- [x] Password hashing implemented with bcrypt.
- [x] Strong password validation implemented.
- [x] Email normalization and validation implemented.
- [x] Six-digit email OTP implemented.
- [x] OTP expiry implemented.
- [x] OTP attempt limit implemented.
- [x] Fifteen-minute OTP lockout implemented.
- [x] Seven-day session implemented.
- [x] HttpOnly Secure SameSite session cookie implemented.
- [x] Login audit events implemented.
- [x] OTP audit events implemented.
- [x] Logout implemented.
- [x] Current-user endpoint implemented.
- [x] Admin invitation flow implemented.
- [x] Invitation tokens hashed at rest.
- [x] Invitation tokens expire after 48 hours.
- [x] Password reset tokens hashed at rest.
- [x] Password reset tokens expire after 1 hour.
- [x] Password reset invalidates existing sessions.
- [x] Password reset confirmation email implemented.
- [x] Zoho Mail integration implemented.
- [x] API TypeScript configuration added.
- [x] Frontend authentication context implemented.
- [x] Frontend login and OTP flow implemented.

## Stage 2 - Meetings and Zoho Calendar

- [x] Meeting and agenda Prisma models added.
- [x] Meeting statuses added (`SCHEDULED`, `CANCELLED`).
- [x] Meeting creation records the creating Admin.
- [x] Meeting cancellation records the cancelling Admin and timestamp.
- [x] Zoho Calendar provider added.
- [x] Zoho Calendar create/update/delete event integration added.
- [x] Committee active members are sent as calendar attendees.
- [x] Meeting list endpoint added with committee access control.
- [x] Meeting detail endpoint added with committee access control.
- [x] Admin meeting update endpoint added.
- [x] Admin meeting cancellation endpoint added.
- [x] Meeting mutation audit events added.
- [x] Zoho Mail meeting notifications added.
- [x] Missing third-party credentials remain nonfatal at application startup.

## Not Yet Executed

- [ ] Prisma database migration.
- [ ] Neon database connection validation.
- [ ] Zoho Mail credential validation.
- [ ] Zoho Calendar credential validation.
- [ ] Committee CRUD.
- [ ] Membership administration.
- [ ] Attendance workflow.
- [ ] COI workflow.
- [ ] Cloudflare R2 document workflow.
- [ ] Audit/reporting UI.
- [ ] Exco/Management dashboard.
- [ ] Production deployment validation.

## Environment Variables

See `.env.example`.

Required runtime integrations:

- `DATABASE_URL`
- `APP_URL`
- `ZOHO_MAIL_API_BASE_URL`
- `ZOHO_MAIL_ACCESS_TOKEN`
- `ZOHO_MAIL_ACCOUNT_ID`
- `ZOHO_MAIL_FROM_ADDRESS`
- `ZOHO_MAIL_FROM_NAME`
- `ZOHO_CALENDAR_API_BASE_URL`
- `ZOHO_CALENDAR_ACCESS_TOKEN`

## Decisions Log

### 2026-09-08

- Prisma 7.10.0 retained.
- Prisma `prisma-client` generator adopted with explicit generated output.
- Prisma datasource configuration moved to `prisma.config.ts`.
- Neon adapter retained for serverless PostgreSQL.
- All source rewrites use BOM-free UTF-8.
- No database migration or `db push` performed during hardening or Stage 2.
- No Vercel Cron configuration added.
- Zoho Mail retained as the mandatory application email provider.
- Zoho Calendar integration uses the official Calendar REST API and committee-level calendar UIDs.
- Meeting updates fetch the current Zoho event etag before replacing the event resource.
- Meeting cancellation deletes the Zoho event while retaining the meeting record and audit history in the application database.
- Third-party credentials are intentionally deferred until the integration validation phase.

## Gotchas

- `DATABASE_URL` is required when API code actually accesses the database.
- `DATABASE_URL` is not required for Prisma client generation.
- Zoho Mail credentials must be populated before invitation, OTP, password-reset, or meeting notification email flows can operate.
- Zoho Calendar credentials and a `zohoCalendarId` on the committee are required before meeting creation/update/cancellation can synchronize with Zoho.
- `src/generated/prisma` is generated during the build and is excluded from Git.
- Never expose raw invitation, reset or OTP tokens through API responses.
