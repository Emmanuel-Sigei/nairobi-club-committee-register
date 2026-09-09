import { randomUUID } from "node:crypto";
import { getAuthenticatedUser } from "../_lib/auth";
import { getDb } from "../_lib/db";
import { error, json, readJson } from "../_lib/http";
import {
  normalizeDocumentTitle,
  optionalDocumentString,
  parseDocumentSize,
  requiredDocumentString,
  safeObjectFileName,
  validateDocumentContentType,
} from "../_lib/document-utils";
import {
  createSignedUploadUrl,
  isR2Configured,
} from "../_lib/r2";

interface UploadUrlBody {
  committeeId?: unknown;
  meetingId?: unknown;
  title?: unknown;
  fileName?: unknown;
  contentType?: unknown;
  sizeBytes?: unknown;
}

export default async function handler(
  request: Request,
): Promise<Response> {
  if (request.method !== "POST") {
    return error("Method not allowed.", 405);
  }

  const context = await getAuthenticatedUser(request);

  if (!context) {
    return error("Authentication required.", 401);
  }

  if (context.user.role !== "ADMIN") {
    return error("Administrator access required.", 403);
  }

  if (!isR2Configured()) {
    return error(
      "Cloudflare R2 is not configured.",
      503,
      "R2_NOT_CONFIGURED",
    );
  }

  try {
    const body = await readJson<UploadUrlBody>(request);

    const committeeId = requiredDocumentString(
      body.committeeId,
      "committeeId",
    );
    const meetingId = optionalDocumentString(body.meetingId);
    const title = normalizeDocumentTitle(
      requiredDocumentString(body.title, "title"),
    );
    const fileName = requiredDocumentString(
      body.fileName,
      "fileName",
    );
    const contentType = validateDocumentContentType(
      body.contentType,
    );
    const sizeBytes = parseDocumentSize(body.sizeBytes);

    const committee = await getDb().committee.findUnique({
      where: { id: committeeId },
      select: {
        id: true,
        slug: true,
        archivedAt: true,
      },
    });

    if (!committee) {
      return error("Committee not found.", 404);
    }

    if (committee.archivedAt) {
      return error(
        "Archived committees cannot receive new documents.",
        409,
      );
    }

    let meeting:
      | {
          id: string;
          committeeId: string;
          status: "SCHEDULED" | "CLOSED" | "CANCELLED";
        }
      | null = null;

    if (meetingId) {
      meeting = await getDb().meeting.findUnique({
        where: { id: meetingId },
        select: {
          id: true,
          committeeId: true,
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

      if (meeting.status !== "SCHEDULED") {
        return error(
          "Closed or cancelled meetings are read-only.",
          409,
        );
      }
    }

    const scope = meetingId ?? "general";
    const objectKey =
      `${committee.slug}/${scope}/` +
      `${randomUUID()}-${safeObjectFileName(fileName)}`;

    const uploadUrl = await createSignedUploadUrl({
      key: objectKey,
      contentType,
      expiresIn: 300,
    });

    return json({
      success: true,
      upload: {
        uploadUrl,
        objectKey,
        expiresIn: 300,
        committeeId,
        meetingId: meetingId ?? null,
        title,
        fileName,
        contentType,
        sizeBytes,
      },
    });
  } catch (cause) {
    return error(
      cause instanceof Error
        ? cause.message
        : "Unable to prepare document upload.",
      400,
    );
  }
}
