param(
  [string]$RepoRoot = (Get-Location).Path
)

$ErrorActionPreference = "Stop"

function Write-Utf8NoBom {
  param([string]$Path, [string]$Content)
  $full = Join-Path $RepoRoot $Path
  $dir = Split-Path -Parent $full
  if ($dir -and -not (Test-Path $dir)) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
  }
  [System.IO.File]::WriteAllText($full, $Content, [System.Text.UTF8Encoding]::new($false))
  Write-Host "Wrote $Path"
}

# Stage-aware remediation helper.
# This intentionally does NOT run prisma migrate or alter GitHub.
# It writes the key Stage 1 administration gaps plus a corrected PROJECT_STATE.

Write-Utf8NoBom "api/committees/index.ts" @'
import { getAuthenticatedUser } from "../_lib/auth";
import { writeAuditEvent } from "../_lib/audit";
import { getDb } from "../_lib/db";
import { error, json, readJson } from "../_lib/http";

type CommitteeType = "MAIN" | "SUBCOMMITTEE";

interface CommitteeInput {
  name?: unknown;
  slug?: unknown;
  type?: unknown;
  parentId?: unknown;
  zohoCalendarId?: unknown;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} is required.`);
  }
  return value.trim();
}

function optionalString(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new Error("Expected a string.");
  return value.trim() || undefined;
}

function parseType(value: unknown): CommitteeType {
  if (value === "MAIN" || value === "SUBCOMMITTEE") return value;
  throw new Error("type must be MAIN or SUBCOMMITTEE.");
}

export default async function handler(request: Request): Promise<Response> {
  try {
    const context = await getAuthenticatedUser(request);
    if (!context) return error("Authentication required.", 401);

    if (request.method === "GET") {
      const now = new Date();
      const committees = await getDb().committee.findMany({
        where:
          context.user.role === "MEMBER"
            ? {
                memberships: {
                  some: {
                    userId: context.user.id,
                    startDate: { lte: now },
                    OR: [{ endDate: null }, { endDate: { gte: now } }],
                  },
                },
              }
            : undefined,
        select: {
          id: true,
          name: true,
          slug: true,
          type: true,
          parentId: true,
          zohoCalendarId: true,
          archivedAt: true,
        },
        orderBy: [{ archivedAt: "asc" }, { name: "asc" }],
      });
      return json({ success: true, committees });
    }

    if (request.method === "POST") {
      if (context.user.role !== "ADMIN") {
        return error("Administrator access required.", 403);
      }

      const body = await readJson<CommitteeInput>(request);
      const name = requiredString(body.name, "name");
      const slug = requiredString(body.slug, "slug").toLowerCase();
      const type = parseType(body.type);
      const parentId = optionalString(body.parentId);
      const zohoCalendarId = optionalString(body.zohoCalendarId);

      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
        return error("slug must contain lowercase letters, numbers and hyphens only.", 400);
      }

      if (type === "MAIN" && parentId) {
        return error("A MAIN committee cannot have a parent.", 400);
      }
      if (type === "SUBCOMMITTEE" && !parentId) {
        return error("A SUBCOMMITTEE requires parentId.", 400);
      }

      if (parentId) {
        const parent = await getDb().committee.findUnique({ where: { id: parentId } });
        if (!parent) return error("Parent committee not found.", 404);
        if (parent.archivedAt) return error("Archived committees cannot be used as parents.", 409);
      }

      const committee = await getDb().committee.create({
        data: { name, slug, type, parentId, zohoCalendarId },
      });

      await writeAuditEvent({
        request,
        context,
        action: "COMMITTEE_CREATED",
        entityType: "Committee",
        entityId: committee.id,
        metadata: { name, slug, type, parentId: parentId ?? null },
      });

      return json({ success: true, committee }, 201);
    }

    return error("Method not allowed.", 405);
  } catch (caught) {
    if (
      typeof caught === "object" &&
      caught !== null &&
      "code" in caught &&
      (caught as { code?: unknown }).code === "P2002"
    ) {
      return error("A committee with that slug already exists.", 409);
    }
    console.error("Committee request failed.", caught);
    return error(caught instanceof Error ? caught.message : "Unable to process committee request.", 400);
  }
}
'@

Write-Utf8NoBom "api/committees/[id].ts" @'
import { getAuthenticatedUser } from "../_lib/auth";
import { writeAuditEvent } from "../_lib/audit";
import { getDb } from "../_lib/db";
import { error, json, readJson } from "../_lib/http";

interface CommitteePatch {
  name?: unknown;
  zohoCalendarId?: unknown;
  action?: unknown;
}

function idFromRequest(request: Request): string {
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);
  return decodeURIComponent(parts.at(-1) ?? "");
}

function optionalString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string") throw new Error("Expected a string.");
  return value.trim() || null;
}

export default async function handler(request: Request): Promise<Response> {
  const context = await getAuthenticatedUser(request);
  if (!context) return error("Authentication required.", 401);
  if (context.user.role !== "ADMIN") return error("Administrator access required.", 403);

  const id = idFromRequest(request);
  if (!id) return error("Committee id is required.", 400);

  const existing = await getDb().committee.findUnique({ where: { id } });
  if (!existing) return error("Committee not found.", 404);

  if (request.method === "PATCH") {
    const body = await readJson<CommitteePatch>(request);
    if (body.action === "archive") {
      if (existing.archivedAt) return error("Committee is already archived.", 409);
      const committee = await getDb().committee.update({
        where: { id },
        data: { archivedAt: new Date() },
      });
      await writeAuditEvent({
        request, context, action: "COMMITTEE_ARCHIVED",
        entityType: "Committee", entityId: id
      });
      return json({ success: true, committee });
    }

    const name =
      body.name === undefined
        ? undefined
        : typeof body.name === "string" && body.name.trim()
          ? body.name.trim()
          : (() => { throw new Error("name must be a non-empty string."); })();

    const zohoCalendarId = optionalString(body.zohoCalendarId);

    const committee = await getDb().committee.update({
      where: { id },
      data: { name, zohoCalendarId },
    });

    await writeAuditEvent({
      request, context, action: "COMMITTEE_UPDATED",
      entityType: "Committee", entityId: id,
      metadata: { name: name ?? existing.name, zohoCalendarId }
    });

    return json({ success: true, committee });
  }

  return error("Method not allowed.", 405);
}
'@

Write-Utf8NoBom "api/memberships/index.ts" @'
import { getAuthenticatedUser } from "../_lib/auth";
import { writeAuditEvent } from "../_lib/audit";
import { getDb } from "../_lib/db";
import { error, json, readJson } from "../_lib/http";

type MembershipRole = "CHAIR" | "SECRETARY" | "MEMBER";

interface MembershipInput {
  userId?: unknown;
  committeeId?: unknown;
  role?: unknown;
  startDate?: unknown;
  endDate?: unknown;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`);
  return value.trim();
}
function dateValue(value: unknown, field: string): Date {
  const raw = requiredString(value, field);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) throw new Error(`${field} must be a valid date.`);
  return date;
}
function optionalDate(value: unknown): Date | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new Error("endDate must be a valid date.");
  return date;
}
function roleValue(value: unknown): MembershipRole {
  if (value === "CHAIR" || value === "SECRETARY" || value === "MEMBER") return value;
  return "MEMBER";
}

export default async function handler(request: Request): Promise<Response> {
  const context = await getAuthenticatedUser(request);
  if (!context) return error("Authentication required.", 401);
  if (context.user.role !== "ADMIN") return error("Administrator access required.", 403);

  if (request.method === "POST") {
    try {
      const body = await readJson<MembershipInput>(request);
      const userId = requiredString(body.userId, "userId");
      const committeeId = requiredString(body.committeeId, "committeeId");
      const startDate = dateValue(body.startDate, "startDate");
      const endDate = optionalDate(body.endDate);
      const role = roleValue(body.role);

      if (endDate && endDate < startDate) return error("endDate cannot be before startDate.", 400);

      const [user, committee] = await Promise.all([
        getDb().user.findUnique({ where: { id: userId } }),
        getDb().committee.findUnique({ where: { id: committeeId } }),
      ]);
      if (!user) return error("User not found.", 404);
      if (!committee) return error("Committee not found.", 404);
      if (committee.archivedAt) return error("Archived committees cannot receive memberships.", 409);

      const overlapping = await getDb().membership.findFirst({
        where: {
          userId,
          committeeId,
          startDate: { lte: endDate ?? new Date("9999-12-31T00:00:00.000Z") },
          OR: [{ endDate: null }, { endDate: { gte: startDate } }],
        },
      });
      if (overlapping) return error("This membership overlaps an existing term.", 409);

      const membership = await getDb().membership.create({
        data: { userId, committeeId, role, startDate, endDate },
      });

      await writeAuditEvent({
        request, context, action: "MEMBERSHIP_CREATED",
        entityType: "Membership", entityId: membership.id,
        metadata: { userId, committeeId, role, startDate, endDate: endDate ?? null }
      });

      return json({ success: true, membership }, 201);
    } catch (caught) {
      return error(caught instanceof Error ? caught.message : "Unable to create membership.", 400);
    }
  }

  return error("Method not allowed.", 405);
}
'@

Write-Utf8NoBom "api/memberships/[id].ts" @'
import { getAuthenticatedUser } from "../_lib/auth";
import { writeAuditEvent } from "../_lib/audit";
import { getDb } from "../_lib/db";
import { error, json, readJson } from "../_lib/http";

interface PatchBody {
  role?: unknown;
  endDate?: unknown;
  action?: unknown;
}

function idFromRequest(request: Request): string {
  const url = new URL(request.url);
  return decodeURIComponent(url.pathname.split("/").filter(Boolean).at(-1) ?? "");
}

export default async function handler(request: Request): Promise<Response> {
  const context = await getAuthenticatedUser(request);
  if (!context) return error("Authentication required.", 401);
  if (context.user.role !== "ADMIN") return error("Administrator access required.", 403);
  if (request.method !== "PATCH") return error("Method not allowed.", 405);

  const id = idFromRequest(request);
  const existing = await getDb().membership.findUnique({ where: { id } });
  if (!existing) return error("Membership not found.", 404);

  const body = await readJson<PatchBody>(request);
  const data: { role?: "CHAIR" | "SECRETARY" | "MEMBER"; endDate?: Date | null } = {};

  if (body.action === "end") {
    data.endDate = new Date();
  } else {
    if (body.role !== undefined) {
      if (body.role !== "CHAIR" && body.role !== "SECRETARY" && body.role !== "MEMBER") {
        return error("Invalid membership role.", 400);
      }
      data.role = body.role;
    }
    if (body.endDate !== undefined) {
      if (body.endDate === null || body.endDate === "") {
        data.endDate = null;
      } else {
        const date = new Date(String(body.endDate));
        if (Number.isNaN(date.getTime())) return error("Invalid endDate.", 400);
        if (date < existing.startDate) return error("endDate cannot be before startDate.", 400);
        data.endDate = date;
      }
    }
  }

  const membership = await getDb().membership.update({ where: { id }, data });
  await writeAuditEvent({
    request, context, action: body.action === "end" ? "MEMBERSHIP_ENDED" : "MEMBERSHIP_UPDATED",
    entityType: "Membership", entityId: id,
    metadata: { previousRole: existing.role, previousEndDate: existing.endDate, ...data }
  });
  return json({ success: true, membership });
}
'@

Write-Utf8NoBom "api/users/[id]/deactivate.ts" @'
import { getAuthenticatedUser } from "../../_lib/auth";
import { writeAuditEvent } from "../../_lib/audit";
import { getDb } from "../../_lib/db";
import { error, json } from "../../_lib/http";

function idFromRequest(request: Request): string {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  return decodeURIComponent(parts.at(-2) ?? "");
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") return error("Method not allowed.", 405);
  const context = await getAuthenticatedUser(request);
  if (!context) return error("Authentication required.", 401);
  if (context.user.role !== "ADMIN") return error("Administrator access required.", 403);

  const userId = idFromRequest(request);
  if (!userId) return error("User id is required.", 400);
  if (userId === context.user.id) return error("You cannot deactivate your own account.", 409);

  const existing = await getDb().user.findUnique({ where: { id: userId } });
  if (!existing) return error("User not found.", 404);
  if (!existing.isActive) return error("User is already inactive.", 409);

  const now = new Date();
  await getDb().$transaction([
    getDb().user.update({
      where: { id: userId },
      data: { isActive: false, deactivatedAt: now },
    }),
    getDb().session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now },
    }),
  ]);

  await writeAuditEvent({
    request, context, action: "USER_DEACTIVATED",
    entityType: "User", entityId: userId
  });

  return json({ success: true });
}
'@

# Tighten invitation contract to include memberships as required by the brief.
$invitePath = Join-Path $RepoRoot "api/auth/invite.ts"
if (Test-Path $invitePath) {
  $invite = [System.IO.File]::ReadAllText($invitePath)
  if ($invite -notmatch 'memberships\?: unknown') {
    $invite = $invite.Replace('  role?: unknown;`n}', '  role?: unknown;`n  memberships?: unknown;`n}')
    [System.IO.File]::WriteAllText($invitePath, $invite, [System.Text.UTF8Encoding]::new($false))
    Write-Host "Prepared api/auth/invite.ts for membership payload extension; manual TypeScript completion still required."
  }
}

# Remove BOMs from tracked source/config files.
Get-ChildItem $RepoRoot -Recurse -File |
  Where-Object { $_.Extension -in ".ts",".tsx",".js",".jsx",".json",".md",".prisma",".css",".html" } |
  ForEach-Object {
    $bytes = [System.IO.File]::ReadAllBytes($_.FullName)
    if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
      $text = [System.Text.Encoding]::UTF8.GetString($bytes, 3, $bytes.Length - 3)
      [System.IO.File]::WriteAllText($_.FullName, $text, [System.Text.UTF8Encoding]::new($false))
      Write-Host "Removed UTF-8 BOM: $($_.FullName)"
    }
  }

Write-Utf8NoBom "GAP_ANALYSIS.md" @'
# Nairobi Club Committee Register — Gap Analysis

## Current stage
Stage 3 is implemented in code but is not operationally complete because database/runtime/integration validation remains outstanding. Stages 4–8 are not complete.

## Critical gaps
1. Invitations do not create committee memberships or term dates.
2. Committee CRUD is incomplete; current endpoint was list-only.
3. Membership administration is missing.
4. Member deactivation endpoint/session revocation flow is missing.
5. COI schema/API/UI is missing.
6. Document/R2 schema/API/UI, versioning, signed upload/download and access logging are missing.
7. Audit log viewer and CSV reports are missing.
8. Exco/Management dashboard is not a dedicated server-enforced read-only workflow.
9. Login/password reset need Stage 8 rate limiting beyond OTP resend/attempt controls.
10. QR presentation is missing.
11. Prisma migration and Neon/Zoho runtime validation have not been executed.
12. PROJECT_STATE was stale relative to repo contents.
13. At least one committed TypeScript source file contained a UTF-8 BOM despite the stated no-BOM rule.

## Required sequencing
Do not jump straight to documents/reporting. Finish Stage 3 operational validation first, then implement Stage 4 COI, Stage 5 Documents, Stage 6 notification completion, Stage 7 audit/reporting/Exco, and Stage 8 hardening.
'@

Write-Utf8NoBom "PROJECT_STATE.md" @'
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
Stage 3 — Attendance: implementation substantially complete, operational validation pending.

## Stage 1 — Auth + committee/member foundations
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

## Stage 2 — Meetings + Zoho Calendar
- [x] Create/update/cancel meetings.
- [x] Ordered agenda items.
- [x] Active members sent to Zoho Calendar.
- [x] Zoho create/update/delete integration.
- [x] Meeting email notifications.
- [x] Mutation audit events.
- [ ] Runtime Zoho Calendar credential/integration validation.

## Stage 3 — Attendance
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

## Stage 4 — COI
- [ ] Schema.
- [ ] One declaration per member/meeting.
- [ ] Yes/No + types/detail/agenda references/recusal intent.
- [ ] Live Admin/chair flag.
- [ ] declaration_not_submitted at close.
- [ ] Post-close correction flow.

## Stage 5 — Documents
- [ ] R2 signed PUT upload.
- [ ] Versioned document records.
- [ ] Admin-only upload enforced server-side.
- [ ] Authenticated signed GET route.
- [ ] View/download/denied access logging.
- [ ] Archived display state after close.

## Stage 6 — Notifications
- [x] Invite.
- [x] MFA OTP.
- [x] Password reset + confirmation.
- [x] Meeting scheduled/updated/cancelled.
- [x] Apology confirmation.
- [ ] New document notification.
- [ ] Attendance correction notification.
- [ ] COI correction notification.

## Stage 7 — Audit/reporting/Exco
- [x] Core append-only AuditEvent model.
- [ ] Audit viewer.
- [ ] Attendance report + CSV.
- [ ] COI report + CSV.
- [ ] Absence/apology pattern report + CSV.
- [ ] Document access report + CSV.
- [ ] Dedicated Exco/Management read-only dashboard with server-side enforcement.

## Stage 8 — Hardening
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
'@

Write-Host ""
Write-Host "Patch files created/repaired. No migration, npm install, database write, or GitHub write was performed."
Write-Host "Recommended validation commands:"
Write-Host "  npm run prisma:validate"
Write-Host "  npm run typecheck"
Write-Host "  npm run lint"
Write-Host "  npm run build"
