import {
  useCallback,
  useEffect,
  useState,
} from "react";

type UserRole =
  | "MEMBER"
  | "ADMIN"
  | "EXCO_MANAGEMENT";

interface DocumentVersion {
  id: string;
  version: number;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
  uploadedBy: {
    id: string;
    name: string;
  };
}

interface DocumentRecord {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  createdBy: {
    id: string;
    name: string;
  };
  versions: DocumentVersion[];
}

interface DocumentListResponse {
  success: boolean;
  displayState:
    | "ACTIVE"
    | "ARCHIVED";
  documents: DocumentRecord[];
}

interface UploadUrlResponse {
  success: boolean;
  upload: {
    uploadUrl: string;
    objectKey: string;
    committeeId: string;
    meetingId: string | null;
    title: string;
    fileName: string;
    contentType: string;
    sizeBytes: number;
  };
}

interface AccessResponse {
  success: boolean;
  url: string;
}

async function requestJson<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response =
    await fetch(
      path,
      {
        ...options,
        credentials:
          "include",
        headers: {
          "Content-Type":
            "application/json",
          ...(options.headers ??
            {}),
        },
      },
    );

  const text =
    await response.text();

  let data:
    unknown = {};

  if (text) {
    try {
      data =
        JSON.parse(
          text,
        );
    } catch {
      data = {};
    }
  }

  if (!response.ok) {
    const message =
      typeof data ===
        "object" &&
      data !== null &&
      "error" in data &&
      typeof data.error ===
        "string"
        ? data.error
        : "Request failed.";

    throw new Error(
      message,
    );
  }

  return data as T;
}

function formatBytes(
  value: number,
): string {
  if (value < 1024) {
    return `${value} B`;
  }

  if (
    value <
    1024 * 1024
  ) {
    return `${(
      value / 1024
    ).toFixed(1)} KB`;
  }

  return `${(
    value /
    1024 /
    1024
  ).toFixed(1)} MB`;
}

function formatDate(
  value: string,
): string {
  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return value;
  }

  return new Intl.DateTimeFormat(
    "en-GB",
    {
      dateStyle:
        "medium",
      timeStyle:
        "short",
    },
  ).format(date);
}

function DocumentIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <path
        d="M7 3.75h6.5L18 8.25V20.25H7V3.75Z"
        strokeLinejoin="round"
      />
      <path
        d="M13 3.75v5h5"
        strokeLinejoin="round"
      />
      <path
        d="M9.5 12.25h6M9.5 15.25h6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path
        d="M12 16V5"
        strokeLinecap="round"
      />
      <path
        d="m8 9 4-4 4 4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5 19h14"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path
        d="M14 5h5v5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="m19 5-8 8"
        strokeLinecap="round"
      />
      <path
        d="M17 13v5H6V7h5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path
        d="M12 4v11"
        strokeLinecap="round"
      />
      <path
        d="m8 11 4 4 4-4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5 19h14"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function DocumentsPanel({
  committeeId,
  meetingId,
  meetingStatus,
  user,
}: {
  committeeId: string;
  meetingId?: string;
  meetingStatus?:
    | "SCHEDULED"
    | "CLOSED"
    | "CANCELLED";
  user: {
    id: string;
    role: UserRole;
  };
}) {
  const [
    data,
    setData,
  ] =
    useState<
      DocumentListResponse | null
    >(null);

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    working,
    setWorking,
  ] =
    useState(false);

  const [
    openingKey,
    setOpeningKey,
  ] =
    useState("");

  const [
    errorMessage,
    setErrorMessage,
  ] =
    useState("");

  const [
    message,
    setMessage,
  ] =
    useState("");

  const [
    title,
    setTitle,
  ] =
    useState("");

  const [
    file,
    setFile,
  ] =
    useState<File | null>(
      null,
    );

  const query =
    `/api/documents?committeeId=${encodeURIComponent(
      committeeId,
    )}` +
    (
      meetingId
        ? `&meetingId=${encodeURIComponent(
            meetingId,
          )}`
        : ""
    );

  const load =
    useCallback(
      async () => {
        setLoading(
          true,
        );

        try {
          const response =
            await requestJson<DocumentListResponse>(
              query,
            );

          setData(
            response,
          );

          setErrorMessage(
            "",
          );
        } catch (cause) {
          setErrorMessage(
            cause instanceof Error
              ? cause.message
              : "We couldn't load the documents.",
          );
        } finally {
          setLoading(
            false,
          );
        }
      },
      [query],
    );

  useEffect(
    () => {
      let cancelled =
        false;

      void requestJson<DocumentListResponse>(
        query,
      )
        .then(
          (
            response,
          ) => {
            if (
              cancelled
            ) {
              return;
            }

            setData(
              response,
            );

            setErrorMessage(
              "",
            );
          },
        )
        .catch(
          (
            cause:
              unknown,
          ) => {
            if (
              cancelled
            ) {
              return;
            }

            setErrorMessage(
              cause instanceof Error
                ? cause.message
                : "We couldn't load the documents.",
            );
          },
        )
        .finally(
          () => {
            if (
              !cancelled
            ) {
              setLoading(
                false,
              );
            }
          },
        );

      return () => {
        cancelled =
          true;
      };
    },
    [query],
  );

  const canUpload =
    user.role ===
      "ADMIN" &&
    (
      !meetingStatus ||
      meetingStatus ===
        "SCHEDULED"
    );

  const documentCount =
    data?.documents.length ??
    0;

  const versionCount =
    data?.documents.reduce(
      (
        total,
        item,
      ) =>
        total +
        item.versions.length,
      0,
    ) ?? 0;

  async function upload() {
    if (
      !file ||
      !title.trim()
    ) {
      setErrorMessage(
        "Enter a document title and choose a file.",
      );
      return;
    }

    setWorking(
      true,
    );

    setErrorMessage(
      "",
    );

    setMessage(
      "",
    );

    try {
      const upload =
        await requestJson<UploadUrlResponse>(
          "/api/documents/upload-url",
          {
            method:
              "POST",
            body:
              JSON.stringify({
                committeeId,
                meetingId,
                title:
                  title.trim(),
                fileName:
                  file.name,
                contentType:
                  file.type ||
                  "application/octet-stream",
                sizeBytes:
                  file.size,
              }),
          },
        );

      const putResponse =
        await fetch(
          upload.upload
            .uploadUrl,
          {
            method:
              "PUT",
            headers: {
              "Content-Type":
                upload.upload
                  .contentType,
            },
            body:
              file,
          },
        );

      if (
        !putResponse.ok
      ) {
        throw new Error(
          "We couldn't upload this file. Please try again.",
        );
      }

      await requestJson(
        "/api/documents/complete-upload",
        {
          method:
            "POST",
          body:
            JSON.stringify({
              committeeId,
              meetingId,
              title:
                upload.upload
                  .title,
              fileName:
                upload.upload
                  .fileName,
              contentType:
                upload.upload
                  .contentType,
              sizeBytes:
                upload.upload
                  .sizeBytes,
              objectKey:
                upload.upload
                  .objectKey,
            }),
        },
      );

      setTitle(
        "",
      );

      setFile(
        null,
      );

      setMessage(
        "Document uploaded and verified successfully.",
      );

      await load();
    } catch (cause) {
      setErrorMessage(
        cause instanceof Error
          ? cause.message
          : "Unable to upload document.",
      );
    } finally {
      setWorking(
        false,
      );
    }
  }

  async function access(
    documentId: string,
    versionId: string,
    mode:
      | "view"
      | "download",
  ) {
    const key =
      `${versionId}:${mode}`;

    setOpeningKey(
      key,
    );

    setErrorMessage(
      "",
    );

    try {
      const response =
        await requestJson<AccessResponse>(
          `/api/documents/${encodeURIComponent(
            documentId,
          )}/access`,
          {
            method:
              "POST",
            body:
              JSON.stringify({
                mode,
                versionId,
              }),
          },
        );

      const anchor =
        document.createElement(
          "a",
        );

      anchor.href =
        response.url;

      anchor.rel =
        "noopener noreferrer";

      if (
        mode ===
        "view"
      ) {
        anchor.target =
          "_blank";
      }

      document.body.appendChild(
        anchor,
      );

      anchor.click();
      anchor.remove();
    } catch (cause) {
      setErrorMessage(
        cause instanceof Error
          ? cause.message
          : "We couldn't open this document.",
      );
    } finally {
      setOpeningKey(
        "",
      );
    }
  }

  return (
    <section className="portal-panel">
      <div className="border-b border-[#E4E4DF] px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-[17px] font-semibold text-[#07172A]">
                Documents
              </h3>

              {data?.displayState ===
                "ARCHIVED" && (
                <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-semibold text-amber-800">
                  Archived record
                </span>
              )}
            </div>

            <p className="mt-1.5 max-w-2xl text-[12px] leading-5 text-slate-500">
              Minutes, agenda papers and supporting records. Every view and download is securely recorded.
            </p>
          </div>

          <div className="flex gap-5 text-sm">
            <div>
              <p className="font-semibold text-[#07172A]">
                {documentCount}
              </p>

              <p className="text-[10px] text-slate-500">
                documents
              </p>
            </div>

            <div className="border-l border-slate-200 pl-5">
              <p className="font-semibold text-[#07172A]">
                {versionCount}
              </p>

              <p className="text-[10px] text-slate-500">
                versions
              </p>
            </div>
          </div>
        </div>
      </div>

      {message && (
        <div className="mx-5 mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-[12px] text-emerald-800 sm:mx-6">
          {message}
        </div>
      )}

      {errorMessage && (
        <div className="mx-5 mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[12px] leading-5 text-red-800 sm:mx-6">
          <span className="font-semibold">
            Document action failed.
          </span>
          {" "}
          {errorMessage}
        </div>
      )}

      {canUpload && (
        <div className="border-b border-[#E4E4DF] bg-[#FAF9F6] px-5 py-5 sm:px-6">
          <div className="mb-4">
            <p className="text-[13px] font-semibold text-[#07172A]">
              Add a document
            </p>

            <p className="mt-1 text-[11px] leading-5 text-slate-500">
              Reusing a document title creates the next governed version automatically.
            </p>
          </div>

          <div className="grid gap-3 lg:grid-cols-[1fr_1.25fr_auto] lg:items-end">
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-semibold text-slate-700">
                Document title
              </span>

              <input
                value={title}
                onChange={(
                  event,
                ) =>
                  setTitle(
                    event.target.value,
                  )
                }
                placeholder="e.g. Agenda"
                className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3.5 text-sm outline-none"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[12px] font-semibold text-slate-700">
                File
              </span>

              <div className="flex h-11 items-center gap-3 rounded-lg border border-slate-300 bg-white px-3.5">
                <UploadIcon />

                <span className="min-w-0 flex-1 truncate text-[12px] text-slate-600">
                  {file
                    ? file.name
                    : "Choose a file"}
                </span>

                <span className="text-[11px] font-semibold text-[#17365F]">
                  Browse
                </span>
              </div>

              <input
                type="file"
                onChange={(
                  event,
                ) =>
                  setFile(
                    event.target
                      .files?.[0] ??
                      null,
                  )
                }
                className="sr-only"
              />
            </label>

            <button
              type="button"
              disabled={
                working ||
                !file ||
                !title.trim()
              }
              onClick={() =>
                void upload()
              }
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#0B1F3A] px-5 text-[12px] font-semibold text-white transition hover:bg-[#17365F] disabled:opacity-50"
            >
              <UploadIcon />

              {working
                ? "Uploading..."
                : "Upload document"}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="px-6 py-12 text-center text-sm text-slate-500">
          Loading documents...
        </div>
      ) : data?.documents
          .length ? (
        <div className="divide-y divide-[#EDECE7]">
          {data.documents.map(
            (item) => {
              const latest =
                item.versions[0];

              return (
                <article
                  key={item.id}
                  className="px-5 py-5 sm:px-6"
                >
                  <div className="flex min-w-0 gap-3.5">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#F2EAD7] text-[#806027]">
                      <DocumentIcon />
                    </div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-[14px] font-semibold text-[#07172A]">
                          {item.title}
                        </h4>

                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                          {item.versions
                            .length}{" "}
                          version
                          {item.versions
                            .length ===
                          1
                            ? ""
                            : "s"}
                        </span>
                      </div>

                      {latest && (
                        <p className="mt-1.5 text-[11px] text-slate-500">
                          Latest:{" "}
                          <span className="font-medium text-slate-700">
                            {latest.fileName}
                          </span>
                          {" · "}
                          {formatBytes(
                            latest.sizeBytes,
                          )}
                          {" · "}
                          {formatDate(
                            latest.createdAt,
                          )}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 overflow-hidden rounded-xl border border-[#E4E4DF]">
                    {item.versions.map(
                      (
                        version,
                        index,
                      ) => {
                        const viewKey =
                          `${version.id}:view`;

                        const downloadKey =
                          `${version.id}:download`;

                        return (
                          <div
                            key={
                              version.id
                            }
                            className={`flex flex-col gap-4 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between ${
                              index > 0
                                ? "border-t border-[#EDECE7]"
                                : ""
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-md bg-[#0B1F3A] px-2 py-1 text-[10px] font-semibold text-white">
                                  v
                                  {
                                    version.version
                                  }
                                </span>

                                <p className="truncate text-[12px] font-semibold text-[#07172A]">
                                  {
                                    version.fileName
                                  }
                                </p>
                              </div>

                              <p className="mt-1.5 text-[10px] text-slate-500">
                                {formatBytes(
                                  version.sizeBytes,
                                )}
                                {" · uploaded by "}
                                {
                                  version
                                    .uploadedBy
                                    .name
                                }
                                {" · "}
                                {formatDate(
                                  version.createdAt,
                                )}
                              </p>
                            </div>

                            <div className="flex shrink-0 gap-2">
                              <button
                                type="button"
                                disabled={
                                  Boolean(
                                    openingKey,
                                  )
                                }
                                onClick={() =>
                                  void access(
                                    item.id,
                                    version.id,
                                    "view",
                                  )
                                }
                                className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-[11px] font-semibold text-[#17365F] transition hover:bg-[#FAF9F6] disabled:opacity-50"
                              >
                                <ExternalIcon />

                                {openingKey ===
                                viewKey
                                  ? "Opening..."
                                  : "View"}
                              </button>

                              <button
                                type="button"
                                disabled={
                                  Boolean(
                                    openingKey,
                                  )
                                }
                                onClick={() =>
                                  void access(
                                    item.id,
                                    version.id,
                                    "download",
                                  )
                                }
                                className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#0B1F3A] px-3 text-[11px] font-semibold text-white transition hover:bg-[#17365F] disabled:opacity-50"
                              >
                                <DownloadIcon />

                                {openingKey ===
                                downloadKey
                                  ? "Preparing..."
                                  : "Download"}
                              </button>
                            </div>
                          </div>
                        );
                      },
                    )}
                  </div>
                </article>
              );
            },
          )}
        </div>
      ) : (
        <div className="px-6 py-12 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-500">
            <DocumentIcon />
          </div>

          <h4 className="mt-4 text-[15px] font-semibold text-[#07172A]">
            No documents yet
          </h4>

          <p className="mx-auto mt-1.5 max-w-md text-[12px] leading-5 text-slate-500">
            Minutes, agenda papers and supporting files will appear here when they are added.
          </p>
        </div>
      )}
    </section>
  );
}