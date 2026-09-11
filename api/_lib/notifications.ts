import {
  getDb,
} from "./db.js";

export type MeetingInAppNotificationType =
  | "scheduled"
  | "updated"
  | "cancelled";

interface MeetingNotificationInput {
  recipientUserIds: string[];
  type: MeetingInAppNotificationType;
  meetingId: string;
  meetingTitle: string;
  committeeName: string;
}

function notificationKind(
  type: MeetingInAppNotificationType,
): string {
  if (type === "scheduled") {
    return "MEETING_SCHEDULED";
  }

  if (type === "updated") {
    return "MEETING_UPDATED";
  }

  return "MEETING_CANCELLED";
}

function notificationVerb(
  type: MeetingInAppNotificationType,
): string {
  if (type === "scheduled") {
    return "scheduled";
  }

  if (type === "updated") {
    return "updated";
  }

  return "cancelled";
}

export async function createMeetingInAppNotifications(
  input: MeetingNotificationInput,
): Promise<number> {
  const recipientUserIds =
    Array.from(
      new Set(
        input.recipientUserIds
          .map((value) =>
            value.trim(),
          )
          .filter(Boolean),
      ),
    );

  if (
    recipientUserIds.length ===
    0
  ) {
    return 0;
  }

  const verb =
    notificationVerb(
      input.type,
    );

  const result =
    await getDb().notification.createMany({
      data:
        recipientUserIds.map(
          (userId) => ({
            userId,
            kind:
              notificationKind(
                input.type,
              ),
            title:
              `Meeting ${verb}: ${input.meetingTitle}`,
            body:
              `${input.committeeName} - ${input.meetingTitle}`,
            href:
              `/meetings/${encodeURIComponent(input.meetingId)}`,
          }),
        ),
    });

  return result.count;
}