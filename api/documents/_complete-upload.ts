import { getAuthenticatedUser } from "../_lib/auth.js";
import { writeAuditEvent } from "../_lib/audit.js";
import { getDb } from "../_lib/db.js";
import {
  createDocumentVersion,
} from "../_lib/document-version.js";
import {
  isZohoMailConfigured,
  sendDocumentAddedNotification,
} from "../_lib/email.js";
import {
  documentScopeKey,
  inferDocumentContentType,
  documentTitleKey,
  normalizeDocumentTitle,
  optionalDocumentString,
  parseDocumentSize,
  requiredDocumentString,

} from "../_lib/document-utils.js";
import {
  deleteR2Object,
  headR2Object,
  isR2Configured,
} from "../_lib/r2.js";
import {
  error,
  json,
  readJson,
} from "../_lib/http.js";

interface CompleteUploadBody {
  committeeId?: unknown;
  meetingId?: unknown;
  title?: unknown;
  fileName?: unknown;
  contentType?: unknown;
  sizeBytes?: unknown;
  objectKey?: unknown;
}

export default async function handler(
  request: Request,
): Promise<Response> {
  if (request.method !== "POST") {
    return error("Method not allowed.", 405);
  }

  const context =
    await getAuthenticatedUser(request);

  if (!context) {
    return error(
      "Authentication required.",
      401,
    );
  }

  if (context.user.role !== "ADMIN") {
    return error(
      "Administrator access required.",
      403,
    );
  }

  if (!isR2Configured()) {
    return error(
      "Cloudflare R2 is not configured.",
      503,
      "R2_NOT_CONFIGURED",
    );
  }

  try {
    const body =
      await readJson<CompleteUploadBody>(
        request,
      );

    const committeeId =
      requiredDocumentString(
        body.committeeId,
        "committeeId",
      );

    const meetingId =
      optionalDocumentString(
        body.meetingId,
      );

    const title =
      normalizeDocumentTitle(
        requiredDocumentString(
          body.title,
          "title",
        ),
      );

    const titleKey =
      documentTitleKey(title);

    const fileName =
      requiredDocumentString(
        body.fileName,
        "fileName",
      );

    const contentType =
      inferDocumentContentType(
        fileName,
        body.contentType,
      );

    const sizeBytes =
      parseDocumentSize(
        body.sizeBytes,
      );

    const objectKey =
      requiredDocumentString(
        body.objectKey,
        "objectKey",
      );

    const committee =
      await getDb().committee.findUnique({
        where: {
          id: committeeId,
        },
        select: {
          id: true,
          name: true,
          slug: true,
          archivedAt: true,
        },
      });

    if (!committee) {
      return error(
        "Committee not found.",
        404,
      );
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
          title: string;
          committeeId: string;
          startAt: Date;
          status:
            | "SCHEDULED"
            | "CLOSED"
            | "CANCELLED";
        }
      | null = null;

    if (meetingId) {
      meeting =
        await getDb().meeting.findUnique({
          where: {
            id: meetingId,
          },
          select: {
            id: true,
            title: true,
            committeeId: true,
            startAt: true,
            status: true,
          },
        });

      if (!meeting) {
        return error(
          "Meeting not found.",
          404,
        );
      }

      if (
        meeting.committeeId !==
        committeeId
      ) {
        return error(
          "Meeting does not belong to this committee.",
          409,
        );
      }

      if (
        meeting.status !==
        "SCHEDULED"
      ) {
        return error(
          "Closed or cancelled meetings are read-only.",
          409,
        );
      }
    }

    const expectedPrefix =
      `${committee.slug}/` +
      `${meetingId ?? "general"}/`;

    if (
      !objectKey.startsWith(
        expectedPrefix,
      )
    ) {
      return error(
        "Invalid document object key.",
        400,
      );
    }

    let head;

    try {
      head =
        await headR2Object(
          objectKey,
        );
    } catch {
      return error(
        "The uploaded object could not be verified in R2.",
        409,
      );
    }

    if (
      typeof head.ContentLength ===
        "number" &&
      head.ContentLength !==
        sizeBytes
    ) {
      return error(
        "Uploaded document size does not match the signed upload.",
        409,
      );
    }

    if (
      head.ContentType &&
      head.ContentType.toLowerCase() !==
        contentType
    ) {
      return error(
        "Uploaded document content type does not match the signed upload.",
        409,
      );
    }

    const scopeKey =
      documentScopeKey(
        meetingId,
      );

    let result;

    try {
      result =
        await createDocumentVersion({
          committeeId,
          meetingId,
          scopeKey,
          title,
          titleKey,
          fileName,
          objectKey,
          contentType,
          sizeBytes,
          userId:
            context.user.id,
        });
    } catch (persistenceError) {
      /*
       * The browser upload has already completed at this stage.
       * If persistence fails, the object is not a valid governed
       * DocumentVersion and should be removed from R2.
       */
      try {
        await deleteR2Object(
          objectKey,
        );
      } catch (cleanupError) {
        console.error(
          "DOCUMENT_ORPHAN_CLEANUP_FAILED",
          cleanupError,
        );
      }

      throw persistenceError;
    }
    await writeAuditEvent({
      request,
      context,
      action: "DOCUMENT_UPLOAD",
      entityType:
        "DocumentVersion",
      entityId:
        result.version.id,
      metadata: {
        documentId:
          result.document.id,
        committeeId,
        meetingId:
          meetingId ?? null,
        title,
        version:
          result.version.version,
        fileName,
        contentType,
        sizeBytes,
        objectKey,
      },
    });

    const warnings: string[] = [];

    if (isZohoMailConfigured()) {
      const effectiveAt =
        meeting?.startAt ??
        new Date();

      const memberships =
        await getDb().membership.findMany({
          where: {
            committeeId,
            startDate: {
              lte: effectiveAt,
            },
            OR: [
              {
                endDate: null,
              },
              {
                endDate: {
                  gte: effectiveAt,
                },
              },
            ],
            user: {
              isActive: true,
            },
          },
          select: {
            user: {
              select: {
                email: true,
                name: true,
              },
            },
          },
        });

      const recipients =
        Array.from(
          new Map(
            memberships.map(
              ({ user }) => [
                user.email
                  .trim()
                  .toLowerCase(),
                user,
              ],
            ),
          ).values(),
        );

      try {
        await sendDocumentAddedNotification(
          recipients,
          {
            title,
            committeeName:
              committee.name,
            meetingTitle:
              meeting?.title,
            meetingId:
              meeting?.id,
            version:
              result.version.version,
            fileName,
          },
        );
      } catch (mailError) {
        console.error(
          "DOCUMENT_NOTIFICATION_FAILED",
          mailError,
        );

        warnings.push(
          "The document was saved, but one or more notification emails could not be sent.",
        );
      }
    }

    return json({
      success: true,
      document:
        result.document,
      version:
        result.version,
      warnings,
    });
  } catch (cause) {
    return error(
      cause instanceof Error
        ? cause.message
        : "Unable to complete document upload.",
      400,
    );
  }
}