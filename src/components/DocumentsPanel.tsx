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
  displayState: "ACTIVE" | "ARCHIVED";
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
  const response = await fetch(path, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  const text = await response.text();
  let data: unknown = {};

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = {};
    }
  }

  if (!response.ok) {
    const message =
      typeof data === "object" &&
      data !== null &&
      "error" in data &&
      typeof data.error === "string"
        ? data.error
        : "Request failed.";

    throw new Error(message);
  }

  return data as T;
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export default function DocumentsPanel({
  committeeId,
  meetingId,
  meetingStatus,
  user,
}: {
  committeeId: string;
  meetingId?: string;
  meetingStatus?: "SCHEDULED" | "CLOSED" | "CANCELLED";
  user: {
    id: string;
    role: UserRole;
  };
}) {
  const [data, setData] =
    useState<DocumentListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [message, setMessage] = useState("");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const query =
    `/api/documents?committeeId=${encodeURIComponent(committeeId)}` +
    (meetingId
      ? `&meetingId=${encodeURIComponent(meetingId)}`
      : "");

  const load = useCallback(async () => {
    setLoading(true);

    try {
      const response =
        await requestJson<DocumentListResponse>(query);

      setData(response);
      setErrorMessage("");
    } catch (cause) {
      setErrorMessage(
        cause instanceof Error
          ? cause.message
          : "Unable to load documents.",
      );
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    let cancelled = false;

    void requestJson<DocumentListResponse>(query)
      .then((response) => {
        if (cancelled) return;
        setData(response);
        setErrorMessage("");
      })
      .catch((cause: unknown) => {
        if (cancelled) return;

        setErrorMessage(
          cause instanceof Error
            ? cause.message
            : "Unable to load documents.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [query]);

  const canUpload =
    user.role === "ADMIN" &&
    (!meetingStatus || meetingStatus === "SCHEDULED");

  async function upload() {
    if (!file || !title.trim()) {
      setErrorMessage(
        "Document title and file are required.",
      );
      return;
    }

    setWorking(true);
    setErrorMessage("");
    setMessage("");

    try {
      const upload =
        await requestJson<UploadUrlResponse>(
          "/api/documents/upload-url",
          {
            method: "POST",
            body: JSON.stringify({
              committeeId,
              meetingId,
              title: title.trim(),
              fileName: file.name,
              contentType:
                file.type || "application/octet-stream",
              sizeBytes: file.size,
            }),
          },
        );

      const putResponse = await fetch(
        upload.upload.uploadUrl,
        {
          method: "PUT",
          headers: {
            "Content-Type": upload.upload.contentType,
          },
          body: file,
        },
      );

      if (!putResponse.ok) {
        throw new Error(
          "The file could not be uploaded to document storage.",
        );
      }

      await requestJson(
        "/api/documents/complete-upload",
        {
          method: "POST",
          body: JSON.stringify({
            committeeId,
            meetingId,
            title: upload.upload.title,
            fileName: upload.upload.fileName,
            contentType: upload.upload.contentType,
            sizeBytes: upload.upload.sizeBytes,
            objectKey: upload.upload.objectKey,
          }),
        },
      );

      setTitle("");
      setFile(null);
      setMessage("Document uploaded successfully.");
      await load();
    } catch (cause) {
      setErrorMessage(
        cause instanceof Error
          ? cause.message
          : "Unable to upload document.",
      );
    } finally {
      setWorking(false);
    }
  }

  async function access(
    documentId: string,
    versionId: string,
    mode: "view" | "download",
  ) {
    setErrorMessage("");

    try {
      const response =
        await requestJson<AccessResponse>(
          `/api/documents/${encodeURIComponent(documentId)}/access`,
          {
            method: "POST",
            body: JSON.stringify({
              mode,
              versionId,
            }),
          },
        );

      const anchor = document.createElement("a");
      anchor.href = response.url;
      anchor.rel = "noopener";

      if (mode === "view") {
        anchor.target = "_blank";
      }

      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } catch (cause) {
      setErrorMessage(
        cause instanceof Error
          ? cause.message
          : "Unable to access document.",
      );
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-200 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">Documents</h3>
            {data?.displayState === "ARCHIVED" && (
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
                Archived
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Controlled committee records. Document access is authenticated and logged.
          </p>
        </div>
      </div>

      {message && (
        <div className="mx-6 mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </div>
      )}

      {errorMessage && (
        <div className="mx-6 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {errorMessage}
        </div>
      )}

      {canUpload && (
        <div className="border-b border-slate-100 p-6">
          <div className="grid gap-4 lg:grid-cols-[1fr_1.5fr_auto] lg:items-end">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Document title
              </span>
              <input
                value={title}
                onChange={(event) =>
                  setTitle(event.target.value)
                }
                placeholder="e.g. Minutes"
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                File
              </span>
              <input
                type="file"
                onChange={(event) =>
                  setFile(event.target.files?.[0] ?? null)
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>

            <button
              type="button"
              disabled={working}
              onClick={() => void upload()}
              className="min-h-10 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {working ? "Uploading..." : "Upload"}
            </button>
          </div>

          <p className="mt-3 text-xs text-slate-500">
            Uploading the same title creates a new immutable version.
          </p>
        </div>
      )}

      {loading ? (
        <div className="p-8 text-center text-sm text-slate-500">
          Loading documents...
        </div>
      ) : data?.documents.length ? (
        <div className="divide-y divide-slate-100">
          {data.documents.map((item) => (
            <div key={item.id} className="p-6">
              <div className="mb-4">
                <h4 className="font-semibold text-slate-900">
                  {item.title}
                </h4>
                <p className="mt-1 text-xs text-slate-500">
                  {item.versions.length} version
                  {item.versions.length === 1 ? "" : "s"}
                </p>
              </div>

              <div className="space-y-2">
                {item.versions.map((version) => (
                  <div
                    key={version.id}
                    className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="text-sm font-semibold">
                        v{version.version} · {version.fileName}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {formatBytes(version.sizeBytes)} · uploaded by{" "}
                        {version.uploadedBy.name}
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          void access(
                            item.id,
                            version.id,
                            "view",
                          )
                        }
                        className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold"
                      >
                        View
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          void access(
                            item.id,
                            version.id,
                            "download",
                          )
                        }
                        className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold"
                      >
                        Download
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-8 text-center text-sm text-slate-500">
          No documents have been added yet.
        </div>
      )}
    </section>
  );
}
