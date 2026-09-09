-- Nairobi Club Committee Register
-- Immutable governance hardening.
--
-- DO NOT apply automatically.
-- Review after the production Prisma migration is generated,
-- then apply manually to PostgreSQL during infrastructure setup.

CREATE OR REPLACE FUNCTION prevent_governance_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'Governance history is append-only; % on table % is prohibited.',
    TG_OP,
    TG_TABLE_NAME;
END;
$$;

DROP TRIGGER IF EXISTS audit_event_immutable
ON "AuditEvent";

CREATE TRIGGER audit_event_immutable
BEFORE UPDATE OR DELETE
ON "AuditEvent"
FOR EACH ROW
EXECUTE FUNCTION prevent_governance_history_mutation();

DROP TRIGGER IF EXISTS attendance_correction_immutable
ON "AttendanceCorrection";

CREATE TRIGGER attendance_correction_immutable
BEFORE UPDATE OR DELETE
ON "AttendanceCorrection"
FOR EACH ROW
EXECUTE FUNCTION prevent_governance_history_mutation();

DROP TRIGGER IF EXISTS coi_revision_immutable
ON "MeetingConflictOfInterestRevision";

CREATE TRIGGER coi_revision_immutable
BEFORE UPDATE OR DELETE
ON "MeetingConflictOfInterestRevision"
FOR EACH ROW
EXECUTE FUNCTION prevent_governance_history_mutation();

-- MeetingAttendance itself remains mutable while a meeting is still
-- open because check-in, apologies, Admin marking and draft-apology
-- confirmation occur before the meeting locks.
--
-- The application prevents post-close mutation and uses
-- AttendanceCorrection for all later corrections.
--
-- A database trigger enforcing Meeting.status-aware attendance
-- immutability may be added after runtime migration validation.