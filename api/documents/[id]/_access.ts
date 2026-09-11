import { getAuthenticatedUser } from "../../_lib/auth.js";
import { writeAuditEvent } from "../../_lib/audit.js";
import { canAccessDocumentScope } from "../../_lib/document-access.js";
import { getDb } from "../../_lib/db.js";
import { error, json, readJson } from "../../_lib/http.js";
import {
  createSignedDocumentUrl,
  isR2Configured,
} from "../../_lib/r2.js";

interface AccessBody {
  mode?: unknown;
  versionId?: unknown;
}

function getDocumentId(request: Request): string {
  const pathname = new URL(request.url).pathname;
  const match = pathname.match(
    /\/api\/documents\/([^/]+)\/access\/?$/,
  );

  return match?.[1]
    ? decodeURIComponent(match[1])
    : "";
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

  const documentId = getDocumentId(request);

  if (!documentId) {
    return error("Document ID is required.", 400);
  }

  let body: AccessBody;

  try {
    body = await readJson<AccessBody>(request);
  } catch (cause) {
    return error(
      cause instanceof Error ? cause.message : "Invalid request.",
      400,
    );
  }

  const mode =
    body.mode === "download"
      ? "download"
      : body.mode === "view"
        ? "view"
        : null;

  if (!mode) {
    return error(
      "mode must be either view or download.",
      400,
    );
  }

  const versionId =
    typeof body.versionId === "string" && body.versionId.trim()
      ? body.versionId.trim()
      : null;

  const document = await getDb().document.findUnique({
    where: { id: documentId },
    include: {
      meeting: {
        select: {
          id: true,
          startAt: true,
          status: true,
        },
      },
      versions: {
        orderBy: {
          version: "desc",
        },
      },
    },
  });

  if (!document) {
    await writeAuditEvent({
      request,
      context,
      action: "DOCUMENT_ACCESS_DENIED",
      entityType: "Document",
      entityId: documentId,
      metadata: {
        mode,
        reason: "document_not_found",
      },
    });

    return error("Document not found.", 404);
  }

  const allowed = await canAccessDocumentScope(context, {
    committeeId: document.committeeId,
    meeting: document.meeting,
  });

  if (!allowed) {
    await writeAuditEvent({
      request,
      context,
      action: "DOCUMENT_ACCESS_DENIED",
      entityType: "Document",
      entityId: document.id,
      metadata: {
        mode,
        versionId,
        committeeId: document.committeeId,
        meetingId: document.meetingId,
        reason: "permission_denied",
      },
    });

    return error(
      "You do not have access to this document.",
      403,
    );
  }

  const version = versionId
    ? document.versions.find(
        (candidate) => candidate.id === versionId,
      )
    : document.versions[0];

  if (!version) {
    await writeAuditEvent({
      request,
      context,
      action: "DOCUMENT_ACCESS_DENIED",
      entityType: "Document",
      entityId: document.id,
      metadata: {
        mode,
        versionId,
        reason: "version_not_found",
      },
    });

    return error("Document version not found.", 404);
  }

  if (!isR2Configured()) {
    return error(
      "Cloudflare R2 is not configured.",
      503,
      "R2_NOT_CONFIGURED",
    );
  }

  const signedUrl = await createSignedDocumentUrl({
    key: version.objectKey,
    fileName: version.fileName,
    contentType: version.contentType,
    mode,
    expiresIn: 60,
  });

  await writeAuditEvent({
    request,
    context,
    action:
      mode === "view"
        ? "DOCUMENT_VIEW"
        : "DOCUMENT_DOWNLOAD",
    entityType: "DocumentVersion",
    entityId: version.id,
    metadata: {
      documentId: document.id,
      committeeId: document.committeeId,
      meetingId: document.meetingId,
      title: document.title,
      version: version.version,
      fileName: version.fileName,
    },
  });

  return json({
    success: true,
    url: signedUrl,
    expiresIn: 60,
    mode,
    documentId: document.id,
    versionId: version.id,
  });
}
