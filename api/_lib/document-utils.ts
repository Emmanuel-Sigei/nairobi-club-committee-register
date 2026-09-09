export const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024;

export const ALLOWED_DOCUMENT_CONTENT_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/csv",
  "text/plain",
  "image/jpeg",
  "image/png",
]);

export function requiredDocumentString(
  value: unknown,
  field: string,
): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} is required.`);
  }

  return value.trim();
}

export function optionalDocumentString(
  value: unknown,
): string | undefined {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new Error("Expected a string value.");
  }

  return value.trim() || undefined;
}

export function normalizeDocumentTitle(title: string): string {
  return title.trim().replace(/\s+/g, " ");
}

export function documentTitleKey(title: string): string {
  return normalizeDocumentTitle(title).toLocaleLowerCase("en");
}

export function documentScopeKey(
  meetingId?: string | null,
): string {
  return meetingId ? `meeting:${meetingId}` : "general";
}

export function safeObjectFileName(fileName: string): string {
  const result = fileName
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 160);

  return result || "document";
}

export function parseDocumentSize(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value <= 0
  ) {
    throw new Error("sizeBytes must be a positive integer.");
  }

  if (value > MAX_DOCUMENT_BYTES) {
    throw new Error(
      `Documents may not exceed ${MAX_DOCUMENT_BYTES / 1024 / 1024} MB.`,
    );
  }

  return value;
}

export function validateDocumentContentType(value: unknown): string {
  const contentType = requiredDocumentString(value, "contentType")
    .toLowerCase();

  if (!ALLOWED_DOCUMENT_CONTENT_TYPES.has(contentType)) {
    throw new Error("This document type is not allowed.");
  }

  return contentType;
}
