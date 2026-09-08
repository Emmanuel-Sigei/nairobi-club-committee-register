# Project State - Committee Register

## Stack (fixed - do not deviate without asking)
- React + Vite + Tailwind CSS
- Prisma + Neon (serverless Postgres)
- Vercel serverless functions
- Cloudflare R2 for document storage (S3-compatible SDK, NOT AWS S3)
- Zoho Calendar API - one calendar per subcommittee
- Zoho Mail API - ALL app emails, including MFA OTP
- MFA: email OTP only (not TOTP/authenticator apps)
- Deployment: Vercel HOBBY tier for now
- Dev environment: Windows + PowerShell + VS Code. All setup/build
  scripts are PowerShell (.ps1), not bash.

## Constraints (do not violate)
- NO Vercel Cron Jobs anywhere, ever, on Hobby tier - any periodic
  task must be triggered on-demand (page load check, or manual button)
  against a last_synced_at timestamp instead.
- Admin is the ONLY role that can upload documents.
- Attendance and COI records are immutable once a meeting is closed -
  corrections are appended events, never silent edits.
- Every document view/download must be logged (audit trail).
- COI declaration is ONE per (member, meeting) covering the whole
  agenda - NOT per agenda item.
- All terminal/setup instructions given to the user must be PowerShell,
  not bash/sh.

## Build stages (work through in order - do not skip ahead)
- [ ] Stage 1: Auth (email/password + email-OTP MFA) + committees/memberships schema
- [ ] Stage 2: Meetings CRUD + Zoho Calendar integration
- [ ] Stage 3: Attendance (self check-in, admin marking, apology, on-demand Zoho sync, auto-absent-at-close)
- [ ] Stage 4: COI declaration flow (per-meeting)
- [ ] Stage 5: Documents (R2 signed URLs, admin-only upload, versioning, access logging)
- [ ] Stage 6: Zoho Mail integration for every notification type
- [ ] Stage 7: Audit trail + Exco/Management read-only dashboards + CSV export
- [ ] Stage 8: Hardening pass before any move off Hobby

## Current stage
Not started - bootstrap complete, ready for Stage 1.

## Decisions log
- 2026-09-08 : Project scaffolded via setup-project.ps1 (continuation run).

## Environment variables needed so far
- See .env.example - filled in as each integration is wired up.

## Open questions / blockers
(none yet)

## Known gotchas encountered
(none yet)
