param(
    [string]$RepoRoot = (Get-Location).Path
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Get-FullPath {
    param([Parameter(Mandatory = $true)][string]$RelativePath)
    return [System.IO.Path]::GetFullPath((Join-Path $RepoRoot $RelativePath))
}

function Require-File {
    param([Parameter(Mandatory = $true)][string]$RelativePath)
    $full = Get-FullPath $RelativePath
    if (-not (Test-Path -LiteralPath $full)) {
        throw "Required file not found: $RelativePath"
    }
    return $full
}

function Write-Utf8NoBom {
    param(
        [Parameter(Mandatory = $true)][string]$RelativePath,
        [Parameter(Mandatory = $true)][string]$Content
    )

    $full = Get-FullPath $RelativePath
    $dir = [System.IO.Path]::GetDirectoryName($full)

    if ($dir -and -not (Test-Path -LiteralPath $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }

    [System.IO.File]::WriteAllText(
        $full,
        $Content,
        (New-Object System.Text.UTF8Encoding($false))
    )

    Write-Host "Wrote $RelativePath" -ForegroundColor Green
}

function Replace-RegexOnce {
    param(
        [Parameter(Mandatory = $true)][string]$Content,
        [Parameter(Mandatory = $true)][string]$Pattern,
        [Parameter(Mandatory = $true)][string]$Replacement,
        [Parameter(Mandatory = $true)][string]$Description
    )

    $regex = [regex]::new(
        $Pattern,
        [System.Text.RegularExpressions.RegexOptions]::Singleline
    )

    $matches = $regex.Matches($Content)

    if ($matches.Count -ne 1) {
        throw "Patch '$Description' expected exactly 1 match, found $($matches.Count)."
    }

    return $regex.Replace($Content, $Replacement, 1)
}

function Assert-Contains {
    param(
        [Parameter(Mandatory = $true)][string]$Content,
        [Parameter(Mandatory = $true)][string]$Pattern,
        [Parameter(Mandatory = $true)][string]$Description
    )

    if (-not [regex]::IsMatch(
        $Content,
        $Pattern,
        [System.Text.RegularExpressions.RegexOptions]::Singleline
    )) {
        throw "Validation failed: $Description"
    }
}

Write-Host ""
Write-Host "Nairobi Club Committee Register - Stage 4 COI implementation v2" -ForegroundColor Cyan
Write-Host "Repo: $RepoRoot"
Write-Host ""

# ---------------------------------------------------------------------------
# 1. Prisma schema
# ---------------------------------------------------------------------------

$schemaPath = Require-File "prisma/schema.prisma"
$schema = Get-Content -LiteralPath $schemaPath -Raw

# Insert enums before model User, independent of whitespace/line endings.
if ($schema -notmatch '(?m)^enum COIStatus\s*\{') {
    $coiEnums = @'
enum COIStatus {
  NO_CONFLICT
  CONFLICT_DECLARED
  DECLARATION_NOT_SUBMITTED
}

enum COISource {
  SELF
  ADMIN
  SYSTEM
}

enum COIRevisionKind {
  INITIAL
  CORRECTION
  SYSTEM_CLOSE
}

'@

    $schema = Replace-RegexOnce `
        -Content $schema `
        -Pattern '(?m)(^model User\s*\{)' `
        -Replacement ($coiEnums + '$1') `
        -Description "insert COI enums"
}

# User relations
if ($schema -notmatch 'conflictDeclarations\s+MeetingConflictOfInterest\[\]') {
    $schema = Replace-RegexOnce `
        -Content $schema `
        -Pattern '(\s+markedAttendance\s+MeetingAttendance\[\]\s+@relation\("AttendanceMarkedBy"\)\s*\r?\n)' `
        -Replacement ('$1  conflictDeclarations MeetingConflictOfInterest[] @relation("COIUser")' + "`r`n" + '  coiRevisionsCreated MeetingConflictOfInterestRevision[] @relation("COIRevisionCreatedBy")' + "`r`n") `
        -Description "add User COI relations"
}

# Meeting relation
if ($schema -notmatch '(?m)^\s+conflictDeclarations\s+MeetingConflictOfInterest\[\]\s*$') {
    $schema = Replace-RegexOnce `
        -Content $schema `
        -Pattern '(\s+attendance\s+MeetingAttendance\[\]\s*\r?\n)' `
        -Replacement ('$1  conflictDeclarations MeetingConflictOfInterest[]' + "`r`n") `
        -Description "add Meeting COI relation"
}

# Models
if ($schema -notmatch '(?m)^model MeetingConflictOfInterest\s*\{') {
    $coiModels = @'
model MeetingConflictOfInterest {
  id               String    @id @default(cuid())
  meetingId        String
  userId           String
  createdAt        DateTime  @default(now())
  meeting          Meeting   @relation(fields: [meetingId], references: [id], onDelete: Cascade)
  user             User      @relation("COIUser", fields: [userId], references: [id], onDelete: Restrict)
  revisions        MeetingConflictOfInterestRevision[]

  @@unique([meetingId, userId])
  @@index([meetingId])
  @@index([userId])
}

model MeetingConflictOfInterestRevision {
  id               String          @id @default(cuid())
  declarationId    String
  status           COIStatus
  source           COISource
  revisionKind     COIRevisionKind
  interestTypes    String[]        @default([])
  details          String?
  agendaItemIds    String[]        @default([])
  recusalIntent    Boolean?
  correctionReason String?
  createdById      String?
  createdAt        DateTime        @default(now())
  declaration      MeetingConflictOfInterest @relation(fields: [declarationId], references: [id], onDelete: Cascade)
  createdBy        User?           @relation("COIRevisionCreatedBy", fields: [createdById], references: [id], onDelete: SetNull)

  @@index([declarationId, createdAt])
  @@index([status])
  @@index([source])
  @@index([createdById])
}

'@

    $schema = Replace-RegexOnce `
        -Content $schema `
        -Pattern '(?m)(^model AgendaItem\s*\{)' `
        -Replacement ($coiModels + '$1') `
        -Description "insert COI models"
}

Assert-Contains $schema '(?m)^enum COIStatus\s*\{' "COIStatus enum missing"
Assert-Contains $schema '(?m)^model MeetingConflictOfInterest\s*\{' "COI declaration model missing"
Assert-Contains $schema '(?m)^model MeetingConflictOfInterestRevision\s*\{' "COI revision model missing"
Assert-Contains $schema '@@unique\(\[meetingId,\s*userId\]\)' "COI unique meeting/member constraint missing"

Write-Utf8NoBom "prisma/schema.prisma" $schema

# ---------------------------------------------------------------------------
# 2. Zoho Mail COI correction notification
# ---------------------------------------------------------------------------

$emailPath = Require-File "api/_lib/email.ts"
$email = Get-Content -LiteralPath $emailPath -Raw

if ($email -notmatch 'export async function sendCoiCorrectionNotification') {
    $email += @'

export async function sendCoiCorrectionNotification(
  email: string,
  name: string,
  meeting: {
    title: string;
    committeeName: string;
    startAt: Date;
    timezone: string;
    meetingId: string;
  },
  correctionReason: string,
): Promise<void> {
  const url = `${appUrl()}/meetings/${encodeURIComponent(meeting.meetingId)}`;
  const when = meeting.startAt.toLocaleString("en-KE", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: meeting.timezone,
  });

  await sendZohoMail({
    toAddress: email,
    subject: `Nairobi Club: conflict-of-interest record corrected — ${meeting.title}`,
    content: `<p>Dear ${escapeHtml(name)},</p><p>Your conflict-of-interest declaration for the following committee meeting has been corrected by an administrator.</p><p><strong>Committee:</strong> ${escapeHtml(meeting.committeeName)}<br><strong>Meeting:</strong> ${escapeHtml(meeting.title)}<br><strong>When:</strong> ${escapeHtml(when)}</p><p><strong>Correction reason:</strong> ${escapeHtml(correctionReason)}</p><p>The original declaration remains preserved in the audit history.</p><p><a href="${url}">Open the meeting record</a></p><p>Regards,<br>Nairobi Club ICT</p>`,
  });
}
'@
}

Write-Utf8NoBom "api/_lib/email.ts" $email

# ---------------------------------------------------------------------------
# 3. COI API
# ---------------------------------------------------------------------------

$coiApi = @'
import { getAuthenticatedUser } from "../../_lib/auth";
import { writeAuditEvent } from "../../_lib/audit";
import { getDb } from "../../_lib/db";
import {
  isZohoMailConfigured,
  sendCoiCorrectionNotification,
} from "../../_lib/email";
import { error, json, readJson } from "../../_lib/http";
import { canViewCommittee } from "../../_lib/permissions";

type COIStatus =
  | "NO_CONFLICT"
  | "CONFLICT_DECLARED"
  | "DECLARATION_NOT_SUBMITTED";

interface COIInput {
  action?: unknown;
  userId?: unknown;
  status?: unknown;
  interestTypes?: unknown;
  details?: unknown;
  agendaItemIds?: unknown;
  recusalIntent?: unknown;
  correctionReason?: unknown;
}

function optionalString(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new Error("Value must be a string.");
  return value.trim() || undefined;
}

function parseStatus(value: unknown): COIStatus {
  if (
    value === "NO_CONFLICT" ||
    value === "CONFLICT_DECLARED" ||
    value === "DECLARATION_NOT_SUBMITTED"
  ) {
    return value;
  }

  throw new Error("A valid conflict-of-interest status is required.");
}

function parseInterestTypes(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new Error("At least one conflict-of-interest type is required.");
  }

  const values = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);

  if (values.length === 0) {
    throw new Error("At least one conflict-of-interest type is required.");
  }

  return Array.from(new Set(values));
}

function parseAgendaItemIds(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new Error("Agenda references must be an array.");
  }

  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function parseBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${fieldName} must be true or false.`);
  }

  return value;
}

async function getMeeting(meetingId: string) {
  return getDb().meeting.findUnique({
    where: { id: meetingId },
    include: {
      committee: {
        select: {
          id: true,
          name: true,
        },
      },
      agendaItems: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          position: true,
          title: true,
        },
      },
    },
  });
}

async function isEligibleMember(
  meeting: NonNullable<Awaited<ReturnType<typeof getMeeting>>>,
  userId: string,
) {
  return Boolean(
    await getDb().membership.findFirst({
      where: {
        userId,
        committeeId: meeting.committeeId,
        startDate: { lte: meeting.startAt },
        OR: [{ endDate: null }, { endDate: { gte: meeting.startAt } }],
      },
    }),
  );
}

async function isChairForMeeting(
  meeting: NonNullable<Awaited<ReturnType<typeof getMeeting>>>,
  userId: string,
) {
  return Boolean(
    await getDb().membership.findFirst({
      where: {
        userId,
        committeeId: meeting.committeeId,
        role: "CHAIR",
        startDate: { lte: meeting.startAt },
        OR: [{ endDate: null }, { endDate: { gte: meeting.startAt } }],
      },
    }),
  );
}

async function isPresent(meetingId: string, userId: string) {
  const attendance = await getDb().meetingAttendance.findUnique({
    where: {
      meetingId_userId: {
        meetingId,
        userId,
      },
    },
    select: {
      status: true,
    },
  });

  return attendance?.status === "PRESENT";
}

function validateAgendaReferences(
  meeting: NonNullable<Awaited<ReturnType<typeof getMeeting>>>,
  agendaItemIds: string[],
) {
  const validIds = new Set(meeting.agendaItems.map((item) => item.id));
  const invalid = agendaItemIds.filter((id) => !validIds.has(id));

  if (invalid.length > 0) {
    throw new Error(
      "One or more selected agenda references do not belong to this meeting.",
    );
  }
}

async function getViewerScope(request: Request, meetingId: string) {
  const context = await getAuthenticatedUser(request);

  if (!context) {
    return {
      context: null,
      meeting: null,
      response: error("Authentication required.", 401),
    };
  }

  const meeting = await getMeeting(meetingId);

  if (!meeting) {
    return {
      context,
      meeting: null,
      response: error("Meeting not found.", 404),
    };
  }

  if (!(await canViewCommittee(context, meeting.committeeId))) {
    return {
      context,
      meeting,
      response: error("You do not have access to this committee.", 403),
    };
  }

  return {
    context,
    meeting,
    response: null,
  };
}

async function getRegister(request: Request, meetingId: string) {
  const scope = await getViewerScope(request, meetingId);
  if (scope.response) return scope.response;

  const context = scope.context!;
  const meeting = scope.meeting!;

  const memberships = await getDb().membership.findMany({
    where: {
      committeeId: meeting.committeeId,
      startDate: { lte: meeting.startAt },
      OR: [{ endDate: null }, { endDate: { gte: meeting.startAt } }],
    },
    select: {
      userId: true,
      role: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
    orderBy: {
      user: {
        name: "asc",
      },
    },
  });

  const uniqueMemberships = new Map<
    string,
    (typeof memberships)[number]
  >();

  for (const membership of memberships) {
    uniqueMemberships.set(membership.userId, membership);
  }

  const eligible = Array.from(uniqueMemberships.values());

  const declarations =
    await getDb().meetingConflictOfInterest.findMany({
      where: {
        meetingId,
      },
      include: {
        revisions: {
          orderBy: {
            createdAt: "desc",
          },
          take: 1,
        },
      },
    });

  const declarationByUser = new Map(
    declarations.map((declaration) => [
      declaration.userId,
      declaration,
    ]),
  );

  const attendance = await getDb().meetingAttendance.findMany({
    where: {
      meetingId,
    },
    select: {
      userId: true,
      status: true,
    },
  });

  const attendanceByUser = new Map(
    attendance.map((record) => [
      record.userId,
      record.status,
    ]),
  );

  const isAdmin = context.user.role === "ADMIN";
  const isExco = context.user.role === "EXCO_MANAGEMENT";
  const isChair =
    context.user.role === "MEMBER" &&
    (await isChairForMeeting(meeting, context.user.id));
  const canViewFullRegister = isAdmin || isExco || isChair;

  const rows = eligible
    .filter((membership) => {
      if (canViewFullRegister) return true;
      return membership.userId === context.user.id;
    })
    .map((membership) => {
      const declaration =
        declarationByUser.get(membership.userId);
      const revision =
        declaration?.revisions[0] ?? null;

      return {
        user: {
          id: membership.user.id,
          name: membership.user.name,
          email: membership.user.email,
          membershipRole: membership.role,
        },
        attendanceStatus:
          attendanceByUser.get(membership.user.id) ?? null,
        declaration:
          declaration && revision
            ? {
                id: declaration.id,
                status: revision.status,
                source: revision.source,
                revisionKind: revision.revisionKind,
                interestTypes: revision.interestTypes,
                details: revision.details,
                agendaItemIds: revision.agendaItemIds,
                recusalIntent: revision.recusalIntent,
                correctionReason: revision.correctionReason,
                declaredAt: revision.createdAt,
                createdAt: declaration.createdAt,
              }
            : null,
      };
    });

  return json({
    success: true,
    meeting: {
      id: meeting.id,
      title: meeting.title,
      status: meeting.status,
      startAt: meeting.startAt,
      endAt: meeting.endAt,
      committeeId: meeting.committeeId,
      committeeName: meeting.committee.name,
      agendaItems: meeting.agendaItems,
    },
    viewer: {
      userId: context.user.id,
      role: context.user.role,
      canViewFullRegister,
      isChair,
    },
    declarations: rows,
  });
}

async function createDeclaration(
  request: Request,
  context: NonNullable<
    Awaited<ReturnType<typeof getAuthenticatedUser>>
  >,
  meeting: NonNullable<
    Awaited<ReturnType<typeof getMeeting>>
  >,
  targetUserId: string,
  source: "SELF" | "ADMIN",
  status: "NO_CONFLICT" | "CONFLICT_DECLARED",
  body: COIInput,
) {
  if (!(await isEligibleMember(meeting, targetUserId))) {
    return error(
      "The selected user was not an eligible committee member for this meeting.",
      400,
    );
  }

  if (!(await isPresent(meeting.id, targetUserId))) {
    return error(
      "The selected member must be recorded as present before the COI declaration can be submitted.",
      409,
    );
  }

  const existing =
    await getDb().meetingConflictOfInterest.findUnique({
      where: {
        meetingId_userId: {
          meetingId: meeting.id,
          userId: targetUserId,
        },
      },
    });

  if (existing) {
    return error(
      "A conflict-of-interest declaration already exists for this meeting.",
      409,
    );
  }

  let interestTypes: string[] = [];
  let details: string | undefined;
  let agendaItemIds: string[] = [];
  let recusalIntent: boolean | undefined;

  if (status === "CONFLICT_DECLARED") {
    interestTypes = parseInterestTypes(body.interestTypes);
    details = optionalString(body.details);

    if (!details) {
      return error(
        "Details are required when a conflict is declared.",
        400,
      );
    }

    agendaItemIds = parseAgendaItemIds(body.agendaItemIds);
    validateAgendaReferences(meeting, agendaItemIds);
    recusalIntent = parseBoolean(
      body.recusalIntent,
      "Recusal intent",
    );
  }

  const declaration =
    await getDb().meetingConflictOfInterest.create({
      data: {
        meetingId: meeting.id,
        userId: targetUserId,
        revisions: {
          create: {
            status,
            source,
            revisionKind: "INITIAL",
            interestTypes,
            details: details ?? null,
            agendaItemIds,
            recusalIntent:
              status === "CONFLICT_DECLARED"
                ? recusalIntent
                : null,
            createdById: context.user.id,
          },
        },
      },
    });

  await writeAuditEvent({
    request,
    context,
    action:
      source === "SELF"
        ? "COI_DECLARED"
        : "COI_RECORDED",
    entityType: "MeetingConflictOfInterest",
    entityId: declaration.id,
    metadata: {
      meetingId: meeting.id,
      userId: targetUserId,
      status,
      source,
      interestTypes,
      details: details ?? null,
      agendaItemIds,
      recusalIntent: recusalIntent ?? null,
    },
  });

  return getRegister(request, meeting.id);
}

async function handleWrite(
  request: Request,
  meetingId: string,
) {
  const scope = await getViewerScope(request, meetingId);
  if (scope.response) return scope.response;

  const context = scope.context!;
  const meeting = scope.meeting!;
  const body = await readJson<COIInput>(request);

  const action =
    typeof body.action === "string"
      ? body.action.trim()
      : "";

  const targetUserId =
    typeof body.userId === "string" && body.userId.trim()
      ? body.userId.trim()
      : context.user.id;

  if (meeting.status === "CANCELLED") {
    return error(
      "Cancelled meetings cannot receive conflict-of-interest changes.",
      409,
    );
  }

  if (action === "declare") {
    if (context.user.role !== "MEMBER") {
      return error(
        "Only committee members may submit a personal conflict-of-interest declaration.",
        403,
      );
    }

    if (targetUserId !== context.user.id) {
      return error(
        "You can only submit your own conflict-of-interest declaration.",
        403,
      );
    }

    if (meeting.status !== "SCHEDULED") {
      return error(
        "Conflict-of-interest declarations are locked because this meeting is not scheduled.",
        409,
      );
    }

    const status = parseStatus(body.status);

    if (
      status !== "NO_CONFLICT" &&
      status !== "CONFLICT_DECLARED"
    ) {
      return error(
        "Choose either No conflict or Conflict declared.",
        400,
      );
    }

    return createDeclaration(
      request,
      context,
      meeting,
      context.user.id,
      "SELF",
      status,
      body,
    );
  }

  if (action === "record") {
    if (context.user.role !== "ADMIN") {
      return error(
        "Administrator access required.",
        403,
      );
    }

    if (meeting.status !== "SCHEDULED") {
      return error(
        "Administrative COI recording is only available while the meeting is scheduled.",
        409,
      );
    }

    const status = parseStatus(body.status);

    if (
      status !== "NO_CONFLICT" &&
      status !== "CONFLICT_DECLARED"
    ) {
      return error(
        "Administrative recording requires No conflict or Conflict declared.",
        400,
      );
    }

    return createDeclaration(
      request,
      context,
      meeting,
      targetUserId,
      "ADMIN",
      status,
      body,
    );
  }

  if (action === "correct") {
    if (context.user.role !== "ADMIN") {
      return error(
        "Administrator access required.",
        403,
      );
    }

    if (meeting.status !== "CLOSED") {
      return error(
        "Post-close COI correction is only available after the meeting is closed.",
        409,
      );
    }

    const correctionReason =
      optionalString(body.correctionReason);

    if (!correctionReason) {
      return error(
        "A reason is required for a post-close COI correction.",
        400,
      );
    }

    if (!(await isEligibleMember(meeting, targetUserId))) {
      return error(
        "The selected user was not an eligible committee member for this meeting.",
        400,
      );
    }

    const declaration =
      await getDb().meetingConflictOfInterest.findUnique({
        where: {
          meetingId_userId: {
            meetingId: meeting.id,
            userId: targetUserId,
          },
        },
        include: {
          revisions: {
            orderBy: {
              createdAt: "desc",
            },
            take: 1,
          },
          user: {
            select: {
              email: true,
              name: true,
            },
          },
        },
      });

    if (
      !declaration ||
      declaration.revisions.length === 0
    ) {
      return error(
        "No conflict-of-interest declaration exists to correct.",
        404,
      );
    }

    const status = parseStatus(body.status);

    if (
      status !== "NO_CONFLICT" &&
      status !== "CONFLICT_DECLARED"
    ) {
      return error(
        "A correction must resolve to No conflict or Conflict declared.",
        400,
      );
    }

    let interestTypes: string[] = [];
    let details: string | undefined;
    let agendaItemIds: string[] = [];
    let recusalIntent: boolean | undefined;

    if (status === "CONFLICT_DECLARED") {
      interestTypes =
        parseInterestTypes(body.interestTypes);
      details = optionalString(body.details);

      if (!details) {
        return error(
          "Details are required when a conflict is declared.",
          400,
        );
      }

      agendaItemIds =
        parseAgendaItemIds(body.agendaItemIds);
      validateAgendaReferences(
        meeting,
        agendaItemIds,
      );
      recusalIntent = parseBoolean(
        body.recusalIntent,
        "Recusal intent",
      );
    }

    const previous = declaration.revisions[0];

    const revision =
      await getDb().meetingConflictOfInterestRevision.create({
        data: {
          declarationId: declaration.id,
          status,
          source: "ADMIN",
          revisionKind: "CORRECTION",
          interestTypes,
          details: details ?? null,
          agendaItemIds,
          recusalIntent:
            status === "CONFLICT_DECLARED"
              ? recusalIntent
              : null,
          correctionReason,
          createdById: context.user.id,
        },
      });

    await writeAuditEvent({
      request,
      context,
      action: "COI_CORRECTED",
      entityType: "MeetingConflictOfInterest",
      entityId: declaration.id,
      metadata: {
        meetingId: meeting.id,
        userId: targetUserId,
        revisionId: revision.id,
        correctionReason,
        previous: {
          revisionId: previous.id,
          status: previous.status,
          source: previous.source,
          interestTypes: previous.interestTypes,
          details: previous.details,
          agendaItemIds: previous.agendaItemIds,
          recusalIntent: previous.recusalIntent,
          createdAt: previous.createdAt,
        },
        current: {
          revisionId: revision.id,
          status: revision.status,
          source: revision.source,
          interestTypes: revision.interestTypes,
          details: revision.details,
          agendaItemIds: revision.agendaItemIds,
          recusalIntent: revision.recusalIntent,
          createdAt: revision.createdAt,
        },
      },
    });

    const warnings: string[] = [];

    if (isZohoMailConfigured()) {
      try {
        await sendCoiCorrectionNotification(
          declaration.user.email,
          declaration.user.name,
          {
            title: meeting.title,
            committeeName: meeting.committee.name,
            startAt: meeting.startAt,
            timezone: meeting.timezone,
            meetingId: meeting.id,
          },
          correctionReason,
        );
      } catch (mailError) {
        console.error(
          "COI correction email failed.",
          mailError,
        );
        warnings.push(
          "The correction was saved, but the member notification email could not be delivered.",
        );
      }
    } else {
      warnings.push(
        "Zoho Mail is not configured; COI correction notification was skipped.",
      );
    }

    const response =
      await getRegister(request, meeting.id);

    if (!response.ok || warnings.length === 0) {
      return response;
    }

    const payload = await response.json();

    return json({
      ...payload,
      warnings,
    });
  }

  return error(
    "A valid COI action is required.",
    400,
  );
}

export default async function handler(
  request: Request,
) {
  const url = new URL(request.url);
  const segments =
    url.pathname.split("/").filter(Boolean);
  const meetingsIndex =
    segments.indexOf("meetings");
  const meetingId =
    meetingsIndex >= 0
      ? segments[meetingsIndex + 1]
      : undefined;

  if (!meetingId) {
    return error(
      "Meeting ID is required.",
      400,
    );
  }

  try {
    if (request.method === "GET") {
      return getRegister(request, meetingId);
    }

    if (request.method === "POST") {
      return handleWrite(request, meetingId);
    }

    return error(
      "Method not allowed.",
      405,
    );
  } catch (caught) {
    if (caught instanceof Error) {
      return error(caught.message, 400);
    }

    return error(
      "Unable to process conflict-of-interest request.",
      500,
    );
  }
}
'@

Write-Utf8NoBom "api/meetings/[id]/coi.ts" $coiApi

# ---------------------------------------------------------------------------
# 4. Attendance close hook for DECLARATION_NOT_SUBMITTED
# ---------------------------------------------------------------------------

$attendancePath = Require-File "api/meetings/[id]/attendance.ts"
$attendance = Get-Content -LiteralPath $attendancePath -Raw

if ($attendance -notmatch 'coiDeclarationNotSubmitted') {
    $closePattern = 'if \(action === "close"\) \{.*?return getAttendanceResponse\(request, meetingId, false\); \}'

    $closeBlock = @'
if (action === "close") {
    if (context.user.role !== "ADMIN") return error("Administrator access required.", 403);
    if (meeting.status === "CLOSED") return error("Meeting is already closed.", 409);

    if (!meeting.lastSyncedAt || Date.now() - meeting.lastSyncedAt.getTime() >= SYNC_STALE_MS) {
      try {
        await syncZohoRsvps(request, context, meeting, false);
      } catch (caught) {
        if (caught instanceof Error) {
          return error(`Meeting cannot be closed until Zoho RSVP synchronization succeeds: ${caught.message}`, 503);
        }
        return error("Meeting cannot be closed until Zoho RSVP synchronization succeeds.", 503);
      }
    }

    const eligible = await getEligibleMembers(meeting.id, meeting.committeeId, meeting.startAt);
    const records = await getDb().meetingAttendance.findMany({ where: { meetingId } });
    const existing = new Map(records.map((record) => [record.userId, record]));
    const existingCoi = await getDb().meetingConflictOfInterest.findMany({
      where: { meetingId },
      select: { userId: true },
    });
    const coiUsers = new Set(existingCoi.map((record) => record.userId));
    let declarationNotSubmitted = 0;

    await getDb().$transaction(async (tx) => {
      for (const member of eligible) {
        const current = existing.get(member.id);

        if (!current) {
          await tx.meetingAttendance.create({
            data: {
              meetingId,
              userId: member.id,
              status: "ABSENT_NO_APOLOGY",
              source: "SYSTEM",
              reason: "Automatically recorded when the meeting was closed.",
            },
          });
          continue;
        }

        if (current.status === "APOLOGY_DRAFT") {
          await tx.meetingAttendance.update({
            where: { id: current.id },
            data: {
              status: "APOLOGY",
              source: "SYSTEM",
              markedAt: new Date(),
            },
          });
          continue;
        }

        if (current.status === "PRESENT" && !coiUsers.has(member.id)) {
          await tx.meetingConflictOfInterest.create({
            data: {
              meetingId,
              userId: member.id,
              revisions: {
                create: {
                  status: "DECLARATION_NOT_SUBMITTED",
                  source: "SYSTEM",
                  revisionKind: "SYSTEM_CLOSE",
                  interestTypes: [],
                  agendaItemIds: [],
                  createdById: context.user.id,
                },
              },
            },
          });
          declarationNotSubmitted += 1;
        }
      }

      await tx.meeting.update({
        where: {
          id: meetingId,
          status: "SCHEDULED",
        },
        data: {
          status: "CLOSED",
          closedAt: new Date(),
          closedById: context.user.id,
        },
      });
    });

    await writeAuditEvent({
      request,
      context,
      action: "MEETING_CLOSED",
      entityType: "Meeting",
      entityId: meetingId,
      metadata: {
        eligibleMembers: eligible.length,
        coiDeclarationNotSubmitted: declarationNotSubmitted,
      },
    });

    return getAttendanceResponse(request, meetingId, false);
  }
'@

    $attendance = Replace-RegexOnce `
        -Content $attendance `
        -Pattern $closePattern `
        -Replacement $closeBlock `
        -Description "extend meeting close for COI"
}

Write-Utf8NoBom "api/meetings/[id]/attendance.ts" $attendance

# ---------------------------------------------------------------------------
# 5. React COI panel
# ---------------------------------------------------------------------------

$coiPanel = @'
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

type UserRole =
  | "MEMBER"
  | "ADMIN"
  | "EXCO_MANAGEMENT";

type MeetingStatus =
  | "SCHEDULED"
  | "CLOSED"
  | "CANCELLED";

type COIStatus =
  | "NO_CONFLICT"
  | "CONFLICT_DECLARED"
  | "DECLARATION_NOT_SUBMITTED";

interface AgendaItem {
  id: string;
  position: number;
  title: string;
}

interface CoiDeclaration {
  id: string;
  status: COIStatus;
  source: "SELF" | "ADMIN" | "SYSTEM";
  revisionKind:
    | "INITIAL"
    | "CORRECTION"
    | "SYSTEM_CLOSE";
  interestTypes: string[];
  details: string | null;
  agendaItemIds: string[];
  recusalIntent: boolean | null;
  correctionReason: string | null;
  declaredAt: string;
  createdAt: string;
}

interface CoiRow {
  user: {
    id: string;
    name: string;
    email: string;
    membershipRole: string;
  };
  attendanceStatus: string | null;
  declaration: CoiDeclaration | null;
}

interface CoiResponse {
  success: boolean;
  warnings?: string[];
  meeting: {
    id: string;
    title: string;
    status: MeetingStatus;
    startAt: string;
    endAt: string;
    committeeId: string;
    committeeName: string;
    agendaItems: AgendaItem[];
  };
  viewer: {
    userId: string;
    role: UserRole;
    canViewFullRegister: boolean;
    isChair: boolean;
  };
  declarations: CoiRow[];
}

interface Props {
  meetingId: string;
  timezone: string;
  user: {
    id: string;
    role: UserRole;
  };
}

const conflictTypes = [
  "Financial",
  "Business",
  "Family / Personal",
  "Employment / Professional",
  "Supplier / Vendor",
  "Other",
];

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(path, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  const text = await response.text();
  let payload: unknown = {};

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = {};
    }
  }

  if (!response.ok) {
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : "Request failed.";

    throw new Error(message);
  }

  return payload as T;
}

function statusLabel(status: COIStatus): string {
  if (status === "NO_CONFLICT") {
    return "No conflict";
  }

  if (status === "CONFLICT_DECLARED") {
    return "Conflict declared";
  }

  return "Declaration not submitted";
}

function statusClasses(status: COIStatus): string {
  if (status === "NO_CONFLICT") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }

  if (status === "CONFLICT_DECLARED") {
    return "border-red-200 bg-red-50 text-red-800";
  }

  return "border-amber-200 bg-amber-50 text-amber-800";
}

export default function ConflictOfInterestPanel({
  meetingId,
  timezone,
  user,
}: Props) {
  const [data, setData] =
    useState<CoiResponse | null>(null);
  const [initialLoading, setInitialLoading] =
    useState(true);
  const [working, setWorking] =
    useState(false);
  const [errorMessage, setErrorMessage] =
    useState("");
  const [message, setMessage] =
    useState("");
  const [targetUserId, setTargetUserId] =
    useState<string | null>(null);
  const [mode, setMode] =
    useState<"record" | "correct" | null>(null);
  const [status, setStatus] =
    useState<
      "NO_CONFLICT" | "CONFLICT_DECLARED"
    >("NO_CONFLICT");
  const [interestTypes, setInterestTypes] =
    useState<string[]>([]);
  const [details, setDetails] =
    useState("");
  const [agendaItemIds, setAgendaItemIds] =
    useState<string[]>([]);
  const [recusalIntent, setRecusalIntent] =
    useState(false);
  const [correctionReason, setCorrectionReason] =
    useState("");

  const load = useCallback(async () => {
    try {
      const response =
        await request<CoiResponse>(
          `/api/meetings/${encodeURIComponent(meetingId)}/coi`,
        );
      setData(response);
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to load conflict-of-interest declarations.",
      );
    } finally {
      setInitialLoading(false);
    }
  }, [meetingId]);

  useEffect(() => {
    void load();
  }, [load]);

  const ownRow = useMemo(
    () =>
      data?.declarations.find(
        (row) => row.user.id === user.id,
      ) ?? null,
    [data, user.id],
  );

  function resetEditor() {
    setTargetUserId(null);
    setMode(null);
    setStatus("NO_CONFLICT");
    setInterestTypes([]);
    setDetails("");
    setAgendaItemIds([]);
    setRecusalIntent(false);
    setCorrectionReason("");
  }

  function openEditor(
    row: CoiRow,
    nextMode: "record" | "correct",
  ) {
    setTargetUserId(row.user.id);
    setMode(nextMode);

    if (
      nextMode === "correct" &&
      row.declaration
    ) {
      setStatus(
        row.declaration.status ===
          "CONFLICT_DECLARED"
          ? "CONFLICT_DECLARED"
          : "NO_CONFLICT",
      );
      setInterestTypes(
        row.declaration.interestTypes,
      );
      setDetails(
        row.declaration.details ?? "",
      );
      setAgendaItemIds(
        row.declaration.agendaItemIds,
      );
      setRecusalIntent(
        row.declaration.recusalIntent ?? false,
      );
    } else {
      setStatus("NO_CONFLICT");
      setInterestTypes([]);
      setDetails("");
      setAgendaItemIds([]);
      setRecusalIntent(false);
    }

    setCorrectionReason("");
    setMessage("");
    setErrorMessage("");
  }

  async function submit(
    action:
      | "declare"
      | "record"
      | "correct",
    requestedStatus:
      | "NO_CONFLICT"
      | "CONFLICT_DECLARED",
    requestedUserId?: string,
  ) {
    setWorking(true);
    setErrorMessage("");
    setMessage("");

    try {
      const payload =
        await request<CoiResponse>(
          `/api/meetings/${encodeURIComponent(meetingId)}/coi`,
          {
            method: "POST",
            body: JSON.stringify({
              action,
              userId: requestedUserId,
              status: requestedStatus,
              interestTypes:
                requestedStatus ===
                "CONFLICT_DECLARED"
                  ? interestTypes
                  : [],
              details:
                requestedStatus ===
                "CONFLICT_DECLARED"
                  ? details
                  : undefined,
              agendaItemIds:
                requestedStatus ===
                "CONFLICT_DECLARED"
                  ? agendaItemIds
                  : [],
              recusalIntent:
                requestedStatus ===
                "CONFLICT_DECLARED"
                  ? recusalIntent
                  : undefined,
              correctionReason:
                action === "correct"
                  ? correctionReason
                  : undefined,
            }),
          },
        );

      setData(payload);
      setMessage(
        payload.warnings?.length
          ? `Conflict-of-interest record saved. ${payload.warnings.join(" ")}`
          : "Conflict-of-interest record saved.",
      );
      resetEditor();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to save conflict-of-interest declaration.",
      );
    } finally {
      setWorking(false);
    }
  }

  function toggleType(value: string) {
    setInterestTypes((current) =>
      current.includes(value)
        ? current.filter(
            (item) => item !== value,
          )
        : [...current, value],
    );
  }

  function toggleAgenda(value: string) {
    setAgendaItemIds((current) =>
      current.includes(value)
        ? current.filter(
            (item) => item !== value,
          )
        : [...current, value],
    );
  }

  if (initialLoading) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-500">
          Loading conflict-of-interest register…
        </p>
      </section>
    );
  }

  if (!data) {
    return (
      <section className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">
        {errorMessage ||
          "Conflict-of-interest register is unavailable."}
      </section>
    );
  }

  const locked =
    data.meeting.status !== "SCHEDULED";

  const canSelfDeclare =
    user.role === "MEMBER" &&
    !locked &&
    ownRow?.attendanceStatus ===
      "PRESENT" &&
    !ownRow.declaration;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-6 py-5">
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
          <div>
            <h3 className="font-semibold">
              Conflict of Interest
            </h3>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
              One declaration applies to the
              whole meeting. Agenda references
              identify affected items.
              Declarations lock when the meeting
              closes.
            </p>
          </div>

          {data.viewer.isChair && (
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
              Chair view
            </span>
          )}
        </div>
      </div>

      {message && (
        <div className="mx-6 mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </div>
      )}

      {errorMessage && (
        <div className="mx-6 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {errorMessage}
        </div>
      )}

      {canSelfDeclare && (
        <div className="border-b border-slate-100 p-6">
          <p className="text-sm font-semibold text-slate-900">
            Your declaration is required
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Confirm that you have no conflict,
            or declare the conflict before the
            meeting is closed.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={working}
              onClick={() =>
                void submit(
                  "declare",
                  "NO_CONFLICT",
                )
              }
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              No conflict
            </button>

            <button
              type="button"
              disabled={working}
              onClick={() => {
                setTargetUserId(user.id);
                setMode("record");
                setStatus(
                  "CONFLICT_DECLARED",
                );
              }}
              className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Declare conflict
            </button>
          </div>
        </div>
      )}

      <div className="divide-y divide-slate-100">
        {data.declarations.map((row) => (
          <div
            key={row.user.id}
            className="px-6 py-5"
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="font-semibold text-slate-900">
                  {row.user.name}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {row.user.membershipRole} ·
                  Attendance:{" "}
                  {row.attendanceStatus ??
                    "Not recorded"}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {row.declaration ? (
                  <span
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusClasses(row.declaration.status)}`}
                  >
                    {statusLabel(
                      row.declaration.status,
                    )}
                  </span>
                ) : (
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500">
                    Not submitted
                  </span>
                )}

                {user.role === "ADMIN" &&
                  data.meeting.status ===
                    "SCHEDULED" &&
                  row.attendanceStatus ===
                    "PRESENT" &&
                  !row.declaration && (
                    <button
                      type="button"
                      onClick={() =>
                        openEditor(
                          row,
                          "record",
                        )
                      }
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700"
                    >
                      Record
                    </button>
                  )}

                {user.role === "ADMIN" &&
                  data.meeting.status ===
                    "CLOSED" &&
                  row.declaration && (
                    <button
                      type="button"
                      onClick={() =>
                        openEditor(
                          row,
                          "correct",
                        )
                      }
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700"
                    >
                      Correct
                    </button>
                  )}
              </div>
            </div>

            {row.declaration?.status ===
              "CONFLICT_DECLARED" && (
              <div className="mt-4 rounded-xl border border-red-100 bg-red-50/50 p-4 text-sm text-slate-700">
                <p>
                  <strong>Type:</strong>{" "}
                  {row.declaration.interestTypes.join(
                    ", ",
                  )}
                </p>

                <p className="mt-1">
                  <strong>Details:</strong>{" "}
                  {row.declaration.details}
                </p>

                <p className="mt-1">
                  <strong>Recusal:</strong>{" "}
                  {row.declaration.recusalIntent
                    ? "Yes"
                    : "No"}
                </p>

                {row.declaration.agendaItemIds
                  .length > 0 && (
                  <p className="mt-1">
                    <strong>Agenda:</strong>{" "}
                    {data.meeting.agendaItems
                      .filter((item) =>
                        row.declaration?.agendaItemIds.includes(
                          item.id,
                        ),
                      )
                      .map(
                        (item) =>
                          `${item.position}. ${item.title}`,
                      )
                      .join(", ")}
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {mode && targetUserId && (
        <div className="border-t border-slate-200 bg-slate-50 p-6">
          <h4 className="font-semibold text-slate-900">
            {mode === "correct"
              ? "Correct locked declaration"
              : "Record conflict-of-interest declaration"}
          </h4>

          <div className="mt-4 grid gap-4">
            <label className="text-sm font-medium text-slate-700">
              Declaration
              <select
                value={status}
                onChange={(event) =>
                  setStatus(
                    event.target.value as
                      | "NO_CONFLICT"
                      | "CONFLICT_DECLARED",
                  )
                }
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
              >
                <option value="NO_CONFLICT">
                  No conflict
                </option>
                <option value="CONFLICT_DECLARED">
                  Conflict declared
                </option>
              </select>
            </label>

            {status ===
              "CONFLICT_DECLARED" && (
              <>
                <fieldset>
                  <legend className="text-sm font-medium text-slate-700">
                    Conflict type
                  </legend>

                  <div className="mt-2 flex flex-wrap gap-2">
                    {conflictTypes.map(
                      (item) => (
                        <label
                          key={item}
                          className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={interestTypes.includes(
                              item,
                            )}
                            onChange={() =>
                              toggleType(item)
                            }
                          />
                          {item}
                        </label>
                      ),
                    )}
                  </div>
                </fieldset>

                <label className="text-sm font-medium text-slate-700">
                  Details
                  <textarea
                    rows={4}
                    value={details}
                    onChange={(event) =>
                      setDetails(
                        event.target.value,
                      )
                    }
                    className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                    placeholder="Describe the nature of the conflict."
                  />
                </label>

                <fieldset>
                  <legend className="text-sm font-medium text-slate-700">
                    Related agenda items
                    (optional)
                  </legend>

                  <div className="mt-2 grid gap-2">
                    {data.meeting.agendaItems.map(
                      (item) => (
                        <label
                          key={item.id}
                          className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={agendaItemIds.includes(
                              item.id,
                            )}
                            onChange={() =>
                              toggleAgenda(
                                item.id,
                              )
                            }
                          />
                          <span>
                            {item.position}.{" "}
                            {item.title}
                          </span>
                        </label>
                      ),
                    )}
                  </div>
                </fieldset>

                <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={recusalIntent}
                    onChange={(event) =>
                      setRecusalIntent(
                        event.target.checked,
                      )
                    }
                  />
                  Member intends to recuse from
                  affected agenda items
                </label>
              </>
            )}

            {mode === "correct" && (
              <label className="text-sm font-medium text-slate-700">
                Mandatory correction reason
                <textarea
                  rows={3}
                  value={correctionReason}
                  onChange={(event) =>
                    setCorrectionReason(
                      event.target.value,
                    )
                  }
                  className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                  placeholder="Why is the locked declaration being corrected?"
                />
              </label>
            )}
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              disabled={working}
              onClick={resetEditor}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="button"
              disabled={working}
              onClick={() =>
                void submit(
                  mode === "correct"
                    ? "correct"
                    : targetUserId ===
                          user.id &&
                        user.role ===
                          "MEMBER"
                      ? "declare"
                      : "record",
                  status,
                  targetUserId,
                )
              }
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {working
                ? "Saving…"
                : "Save declaration"}
            </button>
          </div>
        </div>
      )}

      <div className="border-t border-slate-100 px-6 py-4 text-xs text-slate-400">
        Meeting timezone: {timezone}.
        Corrections create new immutable
        revisions; original declarations are
        retained.
      </div>
    </section>
  );
}
'@

Write-Utf8NoBom "src/components/ConflictOfInterestPanel.tsx" $coiPanel

# ---------------------------------------------------------------------------
# 6. App integration
# ---------------------------------------------------------------------------

$appPath = Require-File "src/App.tsx"
$app = Get-Content -LiteralPath $appPath -Raw

if ($app -notmatch 'import ConflictOfInterestPanel from') {
    $app = Replace-RegexOnce `
        -Content $app `
        -Pattern '(import\s+\{\s*AuthProvider,\s*useAuth\s*\}\s+from\s+"\./auth/AuthContext";)' `
        -Replacement ('$1' + "`r`n" + 'import ConflictOfInterestPanel from "./components/ConflictOfInterestPanel";') `
        -Description "import COI panel"
}

if ($app -notmatch '<ConflictOfInterestPanel\b') {
    $app = Replace-RegexOnce `
        -Content $app `
        -Pattern '(<AttendancePanel\s+meeting=\{meeting\}\s+user=\{user\}\s*/>)' `
        -Replacement ('$1' + '<ConflictOfInterestPanel meetingId={meeting.id} timezone={meeting.timezone} user={user} />') `
        -Description "render COI panel"
}

Write-Utf8NoBom "src/App.tsx" $app

# ---------------------------------------------------------------------------
# 7. ESLint cleanup for existing warnings/errors without suppressing rules
# ---------------------------------------------------------------------------

# We do not globally disable React rules. Existing warnings are left visible.
# The new COI component is written with useCallback/useEffect dependencies correct.

# ---------------------------------------------------------------------------
# 8. State update
# ---------------------------------------------------------------------------

$statePath = Require-File "PROJECT_STATE.md"
$state = Get-Content -LiteralPath $statePath -Raw

$state = [regex]::Replace(
    $state,
    '(?m)^Stage 3 .*Attendance: implementation substantially complete, operational validation pending\.$',
    'Stage 4 — COI: implementation complete in code; migration and runtime validation pending.'
)

$state = $state.Replace(
    '- [ ] Schema.',
    '- [x] Schema implemented with immutable declaration identity + append-only revisions.'
)
$state = $state.Replace(
    '- [ ] One declaration per member/meeting.',
    '- [x] One declaration identity per member/meeting.'
)
$state = $state.Replace(
    '- [ ] Yes/No + types/detail/agenda references/recusal intent.',
    '- [x] Yes/No + types/detail/agenda references/recusal intent.'
)
$state = $state.Replace(
    '- [ ] Live Admin/chair flag.',
    '- [x] Live Admin/chair register visibility; Exco remains read-only.'
)
$state = $state.Replace(
    '- [ ] declaration_not_submitted at close.',
    '- [x] declaration_not_submitted created at close for present members without a declaration.'
)
$state = $state.Replace(
    '- [ ] Post-close correction flow.',
    '- [x] Post-close Admin correction appends a new immutable revision with mandatory reason; member email notification included.'
)

if ($state -notmatch 'Stage 4 runtime migration/Neon validation') {
    $state = $state.Replace(
        '## Open questions / blockers',
        "## Open questions / blockers`r`n- Stage 4 runtime migration/Neon validation is pending; this script does not write to the database."
    )
}

Write-Utf8NoBom "PROJECT_STATE.md" $state

# ---------------------------------------------------------------------------
# 9. Validation
# ---------------------------------------------------------------------------

Write-Host ""
Write-Host "Validating Stage 4 code..." -ForegroundColor Cyan

Push-Location $RepoRoot
try {
    & npm run prisma:validate
    if ($LASTEXITCODE -ne 0) {
        throw "prisma:validate failed."
    }

    & npm run prisma:generate
    if ($LASTEXITCODE -ne 0) {
        throw "prisma:generate failed."
    }

    & npm run typecheck
    if ($LASTEXITCODE -ne 0) {
        throw "typecheck failed."
    }

    Write-Host ""
    Write-Host "TypeScript is clean." -ForegroundColor Green

    & npm run lint
    $lintExit = $LASTEXITCODE

    & npm run build
    $buildExit = $LASTEXITCODE

    Write-Host ""

    if ($lintExit -eq 0) {
        Write-Host "Lint is clean." -ForegroundColor Green
    } else {
        Write-Host "Lint still reports existing frontend issues. Stage 4 files were not rolled back." -ForegroundColor Yellow
    }

    if ($buildExit -eq 0) {
        Write-Host "Build is clean." -ForegroundColor Green
    } else {
        Write-Host "Build failed. Use the shortened diagnostic printed below." -ForegroundColor Yellow
    }

    Write-Host ""
    Write-Host "No Prisma migration or database write was performed." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Short diagnostics if needed:" -ForegroundColor Cyan
    Write-Host 'npm run typecheck 2>&1 | Select-String -Pattern "error TS" -CaseSensitive:$false'
    Write-Host 'npm run lint 2>&1 | Select-String -Pattern "error|warning|problems" -CaseSensitive:$false | Select-Object -First 60'
    Write-Host 'npm run build 2>&1 | Select-String -Pattern "error|warning|failed|cannot" -CaseSensitive:$false | Select-Object -First 60'
}
finally {
    Pop-Location
}
