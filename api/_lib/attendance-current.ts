export interface AttendanceCorrectionLike {
  status: string;
  source: string;
  reason: string;
  createdAt: Date;
  correctedBy?: {
    id: string;
    name: string;
  } | null;
}

export interface AttendanceRecordLike {
  status: string;
  source: string;
  reason: string | null;
  markedAt: Date;
  markedBy?: {
    id: string;
    name: string;
  } | null;
  corrections?: AttendanceCorrectionLike[];
}

export function latestAttendanceCorrection<
  T extends AttendanceRecordLike,
>(
  record: T,
): AttendanceCorrectionLike | null {
  return record.corrections?.[0] ?? null;
}

export function currentAttendanceStatus(
  record: AttendanceRecordLike,
): string {
  return (
    latestAttendanceCorrection(record)?.status ??
    record.status
  );
}

export function currentAttendanceSource(
  record: AttendanceRecordLike,
): string {
  return (
    latestAttendanceCorrection(record)?.source ??
    record.source
  );
}

export function currentAttendanceReason(
  record: AttendanceRecordLike,
): string {
  return (
    latestAttendanceCorrection(record)?.reason ??
    record.reason ??
    ""
  );
}

export function currentAttendanceMarkedAt(
  record: AttendanceRecordLike,
): Date {
  return (
    latestAttendanceCorrection(record)?.createdAt ??
    record.markedAt
  );
}

export function currentAttendanceMarkedBy(
  record: AttendanceRecordLike,
) {
  return (
    latestAttendanceCorrection(record)?.correctedBy ??
    record.markedBy ??
    null
  );
}