import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  endpoint: string;
}

function getConfig(): R2Config {
  const accountId = process.env.R2_ACCOUNT_ID?.trim() ?? "";
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim() ?? "";
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim() ?? "";
  const bucket = process.env.R2_BUCKET?.trim() ?? "";

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error("Cloudflare R2 is not configured.");
  }

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    endpoint:
      process.env.R2_ENDPOINT?.trim() ||
      `https://${accountId}.r2.cloudflarestorage.com`,
  };
}

export function isR2Configured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID?.trim() &&
      process.env.R2_ACCESS_KEY_ID?.trim() &&
      process.env.R2_SECRET_ACCESS_KEY?.trim() &&
      process.env.R2_BUCKET?.trim(),
  );
}

function client(config: R2Config): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

export async function createSignedUploadUrl(input: {
  key: string;
  contentType: string;
  expiresIn?: number;
}): Promise<string> {
  const config = getConfig();

  return getSignedUrl(
    client(config),
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: input.key,
      ContentType: input.contentType,
    }),
    { expiresIn: input.expiresIn ?? 300 },
  );
}

export async function headR2Object(key: string) {
  const config = getConfig();

  return client(config).send(
    new HeadObjectCommand({
      Bucket: config.bucket,
      Key: key,
    }),
  );
}

function safeDispositionFileName(fileName: string): string {
  return fileName
    .replace(/[\r\n"]/g, "")
    .replace(/[^\x20-\x7E]/g, "_")
    .slice(0, 180);
}

export async function createSignedDocumentUrl(input: {
  key: string;
  fileName: string;
  contentType: string;
  mode: "view" | "download";
  expiresIn?: number;
}): Promise<string> {
  const config = getConfig();
  const fileName = safeDispositionFileName(input.fileName);
  const disposition =
    input.mode === "download"
      ? `attachment; filename="${fileName}"`
      : `inline; filename="${fileName}"`;

  return getSignedUrl(
    client(config),
    new GetObjectCommand({
      Bucket: config.bucket,
      Key: input.key,
      ResponseContentDisposition: disposition,
      ResponseContentType: input.contentType,
    }),
    { expiresIn: input.expiresIn ?? 60 },
  );
}
