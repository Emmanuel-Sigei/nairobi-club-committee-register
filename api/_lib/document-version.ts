import {
  getDb,
} from "./db.js";

interface CreateDocumentVersionInput {
  committeeId: string;
  meetingId?: string;
  scopeKey: string;
  title: string;
  titleKey: string;
  fileName: string;
  objectKey: string;
  contentType: string;
  sizeBytes: number;
  userId: string;
}

function prismaErrorCode(
  cause: unknown,
): string | undefined {
  if (
    typeof cause !== "object" ||
    cause === null ||
    !("code" in cause)
  ) {
    return undefined;
  }

  const code =
    (cause as {
      code?: unknown;
    }).code;

  return typeof code === "string"
    ? code
    : undefined;
}

function retryableConflict(
  cause: unknown,
): boolean {
  const code =
    prismaErrorCode(cause);

  return (
    code === "P2002" ||
    code === "P2034"
  );
}

export async function createDocumentVersion(
  input: CreateDocumentVersionInput,
) {
  const db =
    getDb();

  const maximumAttempts =
    4;

  let lastError:
    unknown;

  for (
    let attempt = 1;
    attempt <= maximumAttempts;
    attempt += 1
  ) {
    try {
      return await db.$transaction(
        async (tx) => {
          let document =
            await tx.document.findUnique({
              where: {
                committeeId_scopeKey_titleKey: {
                  committeeId:
                    input.committeeId,
                  scopeKey:
                    input.scopeKey,
                  titleKey:
                    input.titleKey,
                },
              },
            });

          if (!document) {
            document =
              await tx.document.create({
                data: {
                  committeeId:
                    input.committeeId,
                  meetingId:
                    input.meetingId ??
                    null,
                  scopeKey:
                    input.scopeKey,
                  title:
                    input.title,
                  titleKey:
                    input.titleKey,
                  createdById:
                    input.userId,
                },
              });
          }

          const latest =
            await tx.documentVersion.findFirst({
              where: {
                documentId:
                  document.id,
              },
              orderBy: {
                version:
                  "desc",
              },
              select: {
                version:
                  true,
              },
            });

          const nextVersion =
            (latest?.version ??
              0) + 1;

          const version =
            await tx.documentVersion.create({
              data: {
                documentId:
                  document.id,
                version:
                  nextVersion,
                fileName:
                  input.fileName,
                objectKey:
                  input.objectKey,
                contentType:
                  input.contentType,
                sizeBytes:
                  input.sizeBytes,
                uploadedById:
                  input.userId,
              },
            });

          return {
            document,
            version,
          };
        },
        {
          isolationLevel:
            "Serializable",
        },
      );
    } catch (cause) {
      lastError =
        cause;

      if (
        !retryableConflict(cause) ||
        attempt === maximumAttempts
      ) {
        throw cause;
      }
    }
  }

  throw (
    lastError ??
    new Error(
      "Unable to allocate document version.",
    )
  );
}