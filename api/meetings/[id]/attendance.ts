import { getAuthenticatedUser } from "../../_lib/auth";
import { writeAuditEvent } from "../../_lib/audit";
import { CalendarNotConfiguredError, getCalendarEventSnapshot } from "../../_lib/calendar";
import { getDb } from "../../_lib/db";
import { error, json, readJson } from "../../_lib/http";
import { canViewCommittee } from "../../_lib/permissions";
import { isZohoMailConfigured, sendApologyConfirmation } from "../../_lib/email";

const SYNC_STALE_MS = 5 * 60 * 1000;

type Action = "check-in" | "apology" | "mark" | "confirm-draft" | "reject-draft" | "sync" | "close";
type AttendanceWriteStatus = "PRESENT" | "ABSENT" | "EXCUSED";
interface AttendanceInput { action?: unknown; userId?: unknown; status?: unknown; reason?: unknown; correctionReason?: unknown; }

function optionalString(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new Error("Value must be a string.");
  return value.trim() || undefined;
}
function parseAction(value: unknown): Action {
  if (value === "check-in" || value === "apology" || value === "mark" || value === "confirm-draft" || value === "reject-draft" || value === "sync" || value === "close") return value;
  throw new Error("A valid attendance action is required.");
}
function parseStatus(value: unknown): AttendanceWriteStatus {
  if (value === "PRESENT" || value === "ABSENT" || value === "EXCUSED") return value;
  throw new Error("Attendance status must be PRESENT, ABSENT or EXCUSED.");
}
async function getMeeting(meetingId: string) {
  return getDb().meeting.findUnique({ where: { id: meetingId }, include: { committee: { select: { id: true, name: true, zohoCalendarId: true } } } });
}
async function getEligibleMembers(meetingId: string, committeeId: string, startAt: Date) {
  const memberships = await getDb().membership.findMany({
    where: { committeeId, startDate: { lte: startAt }, OR: [{ endDate: null }, { endDate: { gte: startAt } }] },
    select: { userId: true, role: true, user: { select: { id: true, name: true, email: true } } },
    orderBy: { user: { name: "asc" } },
  });
  const unique = new Map<string, (typeof memberships)[number]>();
  for (const membership of memberships) unique.set(membership.userId, membership);
  return Array.from(unique.values()).map((membership) => ({ ...membership.user, membershipRole: membership.role, meetingId }));
}
function attendeeEmail(attendee: unknown): string | null { if (typeof attendee !== "object" || attendee === null) return null; const value = (attendee as Record<string, unknown>).email; return typeof value === "string" ? value.trim().toLowerCase() : null; }
function attendeeStatus(attendee: unknown): string | null { if (typeof attendee !== "object" || attendee === null) return null; const value = (attendee as Record<string, unknown>).status; return typeof value === "string" ? value.toUpperCase() : null; }
async function readZohoRsvps(meeting: NonNullable<Awaited<ReturnType<typeof getMeeting>>>) {
  if (!meeting.committee.zohoCalendarId || !meeting.zohoEventUid) throw new CalendarNotConfiguredError();
  const snapshot = await getCalendarEventSnapshot(meeting.committee.zohoCalendarId, meeting.zohoEventUid);
  const attendees = Array.isArray(snapshot.resource.attendees) ? snapshot.resource.attendees : [];
  const byEmail = new Map<string, string>();
  for (const attendee of attendees) { const email = attendeeEmail(attendee); const status = attendeeStatus(attendee); if (email && status) byEmail.set(email, status); }
  return byEmail;
}
async function syncZohoRsvps(request: Request, context: Awaited<ReturnType<typeof getAuthenticatedUser>>, meeting: NonNullable<Awaited<ReturnType<typeof getMeeting>>>, force: boolean) {
  if (!context) throw new Error("Authentication required.");
  if (context.user.role !== "ADMIN") throw new Error("Administrator access required.");
  if (meeting.status !== "SCHEDULED") throw new Error("RSVP synchronization is only available while the meeting is scheduled.");
  const stale = !meeting.lastSyncedAt || Date.now() - meeting.lastSyncedAt.getTime() >= SYNC_STALE_MS;
  if (!force && !stale) return { synced: false, createdDrafts: 0, lastSyncedAt: meeting.lastSyncedAt };
  const rsvps = await readZohoRsvps(meeting);
  const eligible = await getEligibleMembers(meeting.id, meeting.committeeId, meeting.startAt);
  const existing = await getDb().meetingAttendance.findMany({ where: { meetingId: meeting.id } });
  const existingByUser = new Map(existing.map((record) => [record.userId, record]));
  let createdDrafts = 0;
  for (const member of eligible) {
    const response = rsvps.get(member.email.toLowerCase());
    const current = existingByUser.get(member.id);
    if (response === "DECLINED" && !current) {
      await getDb().meetingAttendance.create({ data: { meetingId: meeting.id, userId: member.id, status: "APOLOGY_DRAFT", source: "ZOHO_SYNC", reason: "Draft created from Zoho Calendar RSVP decline. Awaiting Admin confirmation." } });
      createdDrafts += 1;
    }
  }
  const syncedAt = new Date();
  await getDb().meeting.update({ where: { id: meeting.id, status: "SCHEDULED" }, data: { lastSyncedAt: syncedAt, lastSyncedById: context.user.id } });
  await writeAuditEvent({ request, context, action: "ZOHO_RSVP_SYNCED", entityType: "Meeting", entityId: meeting.id, metadata: { createdDrafts, attendeeCount: rsvps.size, forced: force, syncedAt } });
  return { synced: true, createdDrafts, lastSyncedAt: syncedAt };
}
async function getAttendanceResponse(request: Request, meetingId: string, allowAutoSync = true) {
  const context = await getAuthenticatedUser(request);
  if (!context) return error("Authentication required.", 401);
  const meeting = await getMeeting(meetingId);
  if (!meeting) return error("Meeting not found.", 404);
  if (!(await canViewCommittee(context, meeting.committeeId))) return error("You do not have access to this committee.", 403);
  let syncResult: { synced: boolean; createdDrafts: number; lastSyncedAt: Date | null } = { synced: false, createdDrafts: 0, lastSyncedAt: meeting.lastSyncedAt };
  if (allowAutoSync && context.user.role === "ADMIN" && meeting.status === "SCHEDULED") {
    try { syncResult = await syncZohoRsvps(request, context, meeting, false); } catch (caught) { if (!(caught instanceof CalendarNotConfiguredError)) console.error("On-demand Zoho RSVP sync failed.", caught); }
  }
  const refreshed = await getMeeting(meetingId);
  if (!refreshed) return error("Meeting not found.", 404);
  const eligible = await getEligibleMembers(refreshed.id, refreshed.committeeId, refreshed.startAt);
  const records = await getDb().meetingAttendance.findMany({ where: { meetingId }, include: { markedBy: { select: { id: true, name: true } } } });
  const byUser = new Map(records.map((record) => [record.userId, record]));
  let rsvpByEmail = new Map<string, string>();
  if (context.user.role === "ADMIN" && refreshed.status === "SCHEDULED") { try { rsvpByEmail = await readZohoRsvps(refreshed); } catch { rsvpByEmail = new Map(); } }
  return json({ success: true, meeting: { id: refreshed.id, status: refreshed.status, startAt: refreshed.startAt, endAt: refreshed.endAt, committeeId: refreshed.committeeId, lastSyncedAt: refreshed.lastSyncedAt, closedAt: refreshed.closedAt }, attendance: eligible.map((member) => ({ user: member, attendance: byUser.get(member.id) ?? null, zohoRsvp: rsvpByEmail.get(member.email.toLowerCase()) ?? null })), sync: syncResult });
}
async function ensureEligible(meeting: NonNullable<Awaited<ReturnType<typeof getMeeting>>>, userId: string) {
  return Boolean(await getDb().membership.findFirst({ where: { userId, committeeId: meeting.committeeId, startDate: { lte: meeting.startAt }, OR: [{ endDate: null }, { endDate: { gte: meeting.startAt } }] } }));
}
async function upsertAttendance(meetingId: string, userId: string, status: AttendanceWriteStatus | "APOLOGY", source: "SELF" | "ADMIN", markedById: string, reason?: string) {
  return getDb().meetingAttendance.upsert({ where: { meetingId_userId: { meetingId, userId } }, create: { meetingId, userId, status, source, reason, markedById }, update: { status, source, reason, markedAt: new Date(), markedById } });
}

async function handleWrite(request: Request, meetingId: string) {
  const context = await getAuthenticatedUser(request);
  if (!context) return error("Authentication required.", 401);
  const meeting = await getMeeting(meetingId);
  if (!meeting) return error("Meeting not found.", 404);
  const body = await readJson<AttendanceInput>(request);
  const action = parseAction(body.action);
  const requestedUserId = typeof body.userId === "string" ? body.userId.trim() : context.user.id;
  const reason = optionalString(body.reason);

  if (action === "sync") {
    if (context.user.role !== "ADMIN") return error("Administrator access required.", 403);
    try { const result = await syncZohoRsvps(request, context, meeting, true); return getAttendanceResponse(request, meetingId, false).then(async (response) => { if (!response.ok) return response; const payload = await response.json(); return json({ ...payload, sync: result }); }); }
    catch (caught) { if (caught instanceof CalendarNotConfiguredError) return error(caught.message, 503, "CALENDAR_NOT_CONFIGURED"); if (caught instanceof Error) return error(caught.message, 409); return error("Unable to synchronize Zoho RSVP responses.", 500); }
  }
  if (meeting.status === "CANCELLED") return error("Cancelled meetings cannot receive attendance changes.", 409);

  if (action === "close") {
    if (context.user.role !== "ADMIN") return error("Administrator access required.", 403);
    if (meeting.status === "CLOSED") return error("Meeting is already closed.", 409);
    if (!meeting.lastSyncedAt || Date.now() - meeting.lastSyncedAt.getTime() >= SYNC_STALE_MS) {
      try { await syncZohoRsvps(request, context, meeting, false); } catch (caught) { if (caught instanceof Error) return error(`Meeting cannot be closed until Zoho RSVP synchronization succeeds: ${caught.message}`, 503); return error("Meeting cannot be closed until Zoho RSVP synchronization succeeds.", 503); }
    }
    const eligible = await getEligibleMembers(meeting.id, meeting.committeeId, meeting.startAt);
    const records = await getDb().meetingAttendance.findMany({ where: { meetingId } });
    const existing = new Map(records.map((record) => [record.userId, record]));
    await getDb().$transaction(async (tx) => {
      for (const member of eligible) {
        const current = existing.get(member.id);
        if (!current) await tx.meetingAttendance.create({ data: { meetingId, userId: member.id, status: "ABSENT_NO_APOLOGY", source: "SYSTEM", reason: "Automatically recorded when the meeting was closed." } });
        else if (current.status === "APOLOGY_DRAFT") await tx.meetingAttendance.update({ where: { id: current.id }, data: { status: "APOLOGY", source: "SYSTEM", markedAt: new Date() } });
      }
      await tx.meeting.update({ where: { id: meetingId, status: "SCHEDULED" }, data: { status: "CLOSED", closedAt: new Date(), closedById: context.user.id } });
    });
    await writeAuditEvent({ request, context, action: "MEETING_CLOSED", entityType: "Meeting", entityId: meetingId, metadata: { eligibleMembers: eligible.length } });
    return getAttendanceResponse(request, meetingId, false);
  }

  if (meeting.status === "CLOSED") {
    if (action !== "mark" || context.user.role !== "ADMIN") return error("Attendance records are locked because this meeting is closed.", 409);
    const correctionReason = optionalString(body.correctionReason);
    if (!correctionReason) return error("A reason is required for a post-close correction.", 400);
    if (!(await ensureEligible(meeting, requestedUserId))) return error("The selected user was not a member of this committee for this meeting.", 400);
    const status = parseStatus(body.status);
    const current = await getDb().meetingAttendance.findUnique({ where: { meetingId_userId: { meetingId, userId: requestedUserId } } });
    if (!current) return error("No attendance record exists to correct.", 404);
    await getDb().meetingAttendance.update({ where: { id: current.id }, data: { status, source: "ADMIN", reason: correctionReason, markedAt: new Date(), markedById: context.user.id } });
    await writeAuditEvent({ request, context, action: "ATTENDANCE_CORRECTED", entityType: "MeetingAttendance", entityId: current.id, metadata: { meetingId, userId: requestedUserId, previousStatus: current.status, previousSource: current.source, previousReason: current.reason, correctedStatus: status, correctionReason } });
    return getAttendanceResponse(request, meetingId, false);
  }

  if (action === "check-in") {
    if (requestedUserId !== context.user.id) return error("You can only check yourself in.", 403);
    if (!(await ensureEligible(meeting, context.user.id))) return error("You are not an eligible committee member for this meeting.", 403);
    const existing = await getDb().meetingAttendance.findUnique({ where: { meetingId_userId: { meetingId, userId: context.user.id } } });
    if (existing?.status === "APOLOGY") return error("Your in-app apology is already recorded and cannot be replaced by check-in.", 409);
    await upsertAttendance(meetingId, context.user.id, "PRESENT", "SELF", context.user.id);
    await writeAuditEvent({ request, context, action: "ATTENDANCE_CHECKED_IN", entityType: "MeetingAttendance", entityId: existing?.id, metadata: { meetingId, userId: context.user.id, status: "PRESENT", source: "SELF" } });
    return getAttendanceResponse(request, meetingId, false);
  }

  if (action === "apology") {
    if (requestedUserId !== context.user.id) return error("You can only submit your own apology.", 403);
    if (!(await ensureEligible(meeting, context.user.id))) return error("You are not an eligible committee member for this meeting.", 403);
    if (new Date() >= meeting.startAt) return error("Apologies must be submitted before the meeting starts.", 409);
    const existing = await getDb().meetingAttendance.findUnique({ where: { meetingId_userId: { meetingId, userId: context.user.id } } });
    if (existing && existing.source === "SELF") return error("An attendance record already exists for this meeting.", 409);
    const record = await upsertAttendance(meetingId, context.user.id, "APOLOGY", "SELF", context.user.id, reason);
    await writeAuditEvent({ request, context, action: "APOLOGY_SUBMITTED", entityType: "MeetingAttendance", entityId: record.id, metadata: { meetingId, userId: context.user.id, status: "APOLOGY", source: "SELF", reason: reason ?? null } });
    const warnings: string[] = [];
    if (isZohoMailConfigured()) {
      try { await sendApologyConfirmation(context.user.email, context.user.name, { title: meeting.title, committeeName: meeting.committee.name, startAt: meeting.startAt, timezone: meeting.timezone, meetingId }, reason); }
      catch (mailError) { console.error("Apology confirmation email failed.", mailError); warnings.push("The apology was recorded, but the confirmation email could not be delivered."); }
    } else warnings.push("Zoho Mail is not configured; apology confirmation email was skipped.");
    const response = await getAttendanceResponse(request, meetingId, false);
    if (!response.ok || warnings.length === 0) return response;
    const payload = await response.json();
    return json({ ...payload, warnings });
  }

  if (action === "confirm-draft") {
    if (context.user.role !== "ADMIN") return error("Administrator access required.", 403);
    const draft = await getDb().meetingAttendance.findUnique({ where: { meetingId_userId: { meetingId, userId: requestedUserId } }, include: { user: { select: { id: true, name: true, email: true } } } });
    if (!draft || draft.status !== "APOLOGY_DRAFT") return error("No pending apology draft exists for this member.", 404);
    await getDb().meetingAttendance.update({ where: { id: draft.id }, data: { status: "APOLOGY", source: "ADMIN", markedAt: new Date(), markedById: context.user.id } });
    await writeAuditEvent({ request, context, action: "APOLOGY_DRAFT_CONFIRMED", entityType: "MeetingAttendance", entityId: draft.id, metadata: { meetingId, userId: requestedUserId, previousStatus: draft.status } });
    return getAttendanceResponse(request, meetingId, false);
  }

  if (action === "reject-draft") {
    if (context.user.role !== "ADMIN") return error("Administrator access required.", 403);
    const draft = await getDb().meetingAttendance.findUnique({ where: { meetingId_userId: { meetingId, userId: requestedUserId } } });
    if (!draft || draft.status !== "APOLOGY_DRAFT") return error("No pending apology draft exists for this member.", 404);
    await getDb().meetingAttendance.update({ where: { id: draft.id }, data: { status: "APOLOGY_DRAFT_REJECTED", source: "ADMIN", reason: reason ?? draft.reason, markedAt: new Date(), markedById: context.user.id } });
    await writeAuditEvent({ request, context, action: "APOLOGY_DRAFT_REJECTED", entityType: "MeetingAttendance", entityId: draft.id, metadata: { meetingId, userId: requestedUserId, reason: reason ?? null } });
    return getAttendanceResponse(request, meetingId, false);
  }

  if (action === "mark") {
    if (context.user.role !== "ADMIN") return error("Administrator access required.", 403);
    if (!(await ensureEligible(meeting, requestedUserId))) return error("The selected user was not a member of this committee for this meeting.", 400);
    const status = parseStatus(body.status);
    const existing = await getDb().meetingAttendance.findUnique({ where: { meetingId_userId: { meetingId, userId: requestedUserId } } });
    if (existing?.status === "APOLOGY" && status !== "APOLOGY") return error("An in-app apology is authoritative and cannot be overwritten by a manual attendance mark.", 409);
    const record = await upsertAttendance(meetingId, requestedUserId, status, "ADMIN", context.user.id, reason);
    await writeAuditEvent({ request, context, action: existing ? "ATTENDANCE_UPDATED" : "ATTENDANCE_MARKED", entityType: "MeetingAttendance", entityId: record.id, metadata: { meetingId, userId: requestedUserId, previousStatus: existing?.status ?? null, previousSource: existing?.source ?? null, status, source: "ADMIN", reason: reason ?? null } });
    return getAttendanceResponse(request, meetingId, false);
  }
  return error("Unsupported attendance action.", 400);
}

export default async function handler(request: Request, context: { params: { id?: string } | Promise<{ id?: string }> }): Promise<Response> {
  try {
    const params = await context.params;
    const meetingId = params.id;
    if (!meetingId) return error("Meeting ID is required.", 400);
    if (request.method === "GET") return getAttendanceResponse(request, meetingId);
    if (request.method === "POST") return await handleWrite(request, meetingId);
    return error("Method not allowed.", 405);
  } catch (caught) {
    console.error("Attendance request failed.", caught);
    if (caught instanceof CalendarNotConfiguredError) return error(caught.message, 503, "CALENDAR_NOT_CONFIGURED");
    if (caught instanceof Error) return error(caught.message, 400);
    return error("Unable to process attendance request.", 500);
  }
}
