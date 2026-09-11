import { getAuthenticatedUser } from "../_lib/auth.js";
import { canAccessDocumentScope } from "../_lib/document-access.js";
import { getDb } from "../_lib/db.js";
import { error, json } from "../_lib/http.js";

export default async function handler(
  request: Request,
): Promise<Response> {
  if (request.method !== "GET") {
    return error("Method not allowed.", 405);
  }

  const context = await getAuthenticatedUser(request);

  if (!context) {
    return error("Authentication required.", 401);
  }

  const url = new URL(request.url);
  const committeeId = url.searchParams.get("committeeId")?.trim();
  const meetingId = url.searchParams.get("meetingId")?.trim() || null;

  if (!committeeId) {
    return error("committeeId is required.", 400);
  }

  const committee = await getDb().committee.findUnique({
    where: { id: committeeId },
    select: {
      id: true,
      name: true,
      slug: true,
    },
  });

  if (!committee) {
    return error("Committee not found.", 404);
  }

  let meeting:
    | {
        id: string;
        committeeId: string;
        startAt: Date;
        status: "SCHEDULED" | "CLOSED" | "CANCELLED";
      }
    | null = null;

  if (meetingId) {
    meeting = await getDb().meeting.findUnique({
      where: { id: meetingId },
      select: {
        id: true,
        committeeId: true,
        startAt: true,
        status: true,
      },
    });

    if (!meeting) {
      return error("Meeting not found.", 404);
    }

    if (meeting.committeeId !== committeeId) {
      return error(
        "Meeting does not belong to this committee.",
        409,
      );
    }
  }

  const allowed = await canAccessDocumentScope(context, {
    committeeId,
    meeting,
  });

  if (!allowed) {
    return error(
      "You do not have access to these documents.",
      403,
    );
  }

  const documents = await getDb().document.findMany({
    where: {
      committeeId,
      meetingId,
    },
    include: {
      createdBy: {
        select: {
          id: true,
          name: true,
        },
      },
      versions: {
        orderBy: {
          version: "desc",
        },
        include: {
          uploadedBy: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
    orderBy: {
      updatedAt: "desc",
    },
  });

  return json({
    success: true,
    committee,
    meeting: meeting
      ? {
          id: meeting.id,
          status: meeting.status,
        }
      : null,
    displayState:
      meeting && meeting.status !== "SCHEDULED"
        ? "ARCHIVED"
        : "ACTIVE",
    documents,
  });
}
