import { createHash } from "node:crypto";
import { getDb } from "./db";
import { getClientIp } from "./http";

function positiveInteger(
  value: string | undefined,
  fallback: number,
): number {
  const parsed = Number.parseInt(
    value ?? "",
    10,
  );

  if (
    !Number.isFinite(parsed) ||
    parsed <= 0
  ) {
    return fallback;
  }

  return parsed;
}

export const SESSION_IDLE_MINUTES =
  positiveInteger(
    process.env.SESSION_IDLE_MINUTES,
    30,
  );

export const SESSION_TOUCH_MINUTES =
  positiveInteger(
    process.env.SESSION_TOUCH_MINUTES,
    5,
  );

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function securityKey(
  scope: string,
  value: string,
): string {
  const normalized =
    value.trim().toLowerCase();

  const digest = createHash("sha256")
    .update(`${scope}:${normalized}`)
    .digest("hex");

  return `${scope}:${digest}`;
}

export function clientRateLimitKey(
  request: Request,
  scope: string,
): string {
  const ip =
    getClientIp(request) ??
    "unknown";

  return securityKey(
    scope,
    ip,
  );
}

export function isTrustedMutationOrigin(
  request: Request,
): boolean {
  const method =
    request.method.toUpperCase();

  if (
    method === "GET" ||
    method === "HEAD" ||
    method === "OPTIONS"
  ) {
    return true;
  }

  const origin =
    request.headers.get("origin");

  const secFetchSite =
    request.headers.get(
      "sec-fetch-site",
    );

  if (
    secFetchSite &&
    secFetchSite !== "same-origin" &&
    secFetchSite !== "same-site" &&
    secFetchSite !== "none"
  ) {
    return false;
  }

  if (!origin) {
    return true;
  }

  let expectedOrigin: string;

  const configured =
    process.env.APP_URL?.trim();

  try {
    expectedOrigin = configured
      ? new URL(configured).origin
      : new URL(request.url).origin;
  } catch {
    return false;
  }

  try {
    return (
      new URL(origin).origin ===
      expectedOrigin
    );
  } catch {
    return false;
  }
}

export async function consumeRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  blockMs = windowMs,
): Promise<RateLimitResult> {
  const now = new Date();

  return getDb().$transaction(
    async (tx) => {
      const existing =
        await tx.rateLimitBucket.findUnique({
          where: {
            key,
          },
        });

      if (
        existing?.blockedUntil &&
        existing.blockedUntil > now
      ) {
        return {
          allowed: false,
          remaining: 0,
          retryAfterSeconds:
            Math.max(
              1,
              Math.ceil(
                (
                  existing.blockedUntil.getTime() -
                  now.getTime()
                ) / 1000,
              ),
            ),
        };
      }

      const windowExpired =
        !existing ||
        now.getTime() -
          existing.windowStart.getTime() >=
          windowMs;

      if (windowExpired) {
        await tx.rateLimitBucket.upsert({
          where: {
            key,
          },
          create: {
            key,
            count: 1,
            windowStart: now,
            blockedUntil: null,
          },
          update: {
            count: 1,
            windowStart: now,
            blockedUntil: null,
          },
        });

        return {
          allowed: true,
          remaining:
            Math.max(
              0,
              limit - 1,
            ),
          retryAfterSeconds: 0,
        };
      }

      if (
        existing.count >= limit
      ) {
        const blockedUntil =
          new Date(
            now.getTime() + blockMs,
          );

        await tx.rateLimitBucket.update({
          where: {
            id: existing.id,
          },
          data: {
            blockedUntil,
          },
        });

        return {
          allowed: false,
          remaining: 0,
          retryAfterSeconds:
            Math.ceil(
              blockMs / 1000,
            ),
        };
      }

      const updated =
        await tx.rateLimitBucket.update({
          where: {
            id: existing.id,
          },
          data: {
            count: {
              increment: 1,
            },
          },
        });

      return {
        allowed: true,
        remaining:
          Math.max(
            0,
            limit - updated.count,
          ),
        retryAfterSeconds: 0,
      };
    },
  );
}

export async function enforceIpRateLimit(
  request: Request,
  scope: string,
  limit: number,
  windowMs: number,
  blockMs = windowMs,
): Promise<RateLimitResult> {
  return consumeRateLimit(
    clientRateLimitKey(
      request,
      scope,
    ),
    limit,
    windowMs,
    blockMs,
  );
}