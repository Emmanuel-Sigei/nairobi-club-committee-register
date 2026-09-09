type ZohoService =
  | "MAIL"
  | "CALENDAR";

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

const cache =
  new Map<
    ZohoService,
    CachedToken
  >();

function env(
  name: string,
): string {
  return (
    process.env[name]?.trim() ??
    ""
  );
}

function staticAccessToken(
  service: ZohoService,
): string {
  return env(
    `ZOHO_${service}_ACCESS_TOKEN`,
  );
}

function refreshToken(
  service: ZohoService,
): string {
  return env(
    `ZOHO_${service}_REFRESH_TOKEN`,
  );
}

function clientId(): string {
  return env(
    "ZOHO_CLIENT_ID",
  );
}

function clientSecret(): string {
  return env(
    "ZOHO_CLIENT_SECRET",
  );
}

function accountsBaseUrl(): string {
  return (
    env(
      "ZOHO_ACCOUNTS_BASE_URL",
    ) ||
    "https://accounts.zoho.com"
  ).replace(/\/+$/, "");
}

export function isZohoOAuthConfigured(
  service: ZohoService,
): boolean {
  return Boolean(
    clientId() &&
      clientSecret() &&
      refreshToken(service),
  );
}

export function isZohoServiceConfigured(
  service: ZohoService,
): boolean {
  return Boolean(
    isZohoOAuthConfigured(
      service,
    ) ||
      staticAccessToken(
        service,
      ),
  );
}

async function refreshAccessToken(
  service: ZohoService,
): Promise<CachedToken> {
  const id =
    clientId();

  const secret =
    clientSecret();

  const refresh =
    refreshToken(
      service,
    );

  if (
    !id ||
    !secret ||
    !refresh
  ) {
    throw new Error(
      `Zoho ${service.toLowerCase()} OAuth configuration is incomplete.`,
    );
  }

  const body =
    new URLSearchParams({
      grant_type:
        "refresh_token",
      client_id:
        id,
      client_secret:
        secret,
      refresh_token:
        refresh,
    });

  const response =
    await fetch(
      `${accountsBaseUrl()}/oauth/v2/token`,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded",
          Accept:
            "application/json",
        },
        body,
      },
    );

  const payload =
    (await response
      .json()
      .catch(
        () => ({}),
      )) as Record<
      string,
      unknown
    >;

  if (!response.ok) {
    throw new Error(
      `Zoho OAuth refresh failed with HTTP ${response.status}.`,
    );
  }

  const accessToken =
    typeof payload.access_token ===
      "string"
      ? payload.access_token.trim()
      : "";

  if (!accessToken) {
    throw new Error(
      "Zoho OAuth refresh response did not include an access token.",
    );
  }

  const expiresIn =
    typeof payload.expires_in ===
      "number"
      ? payload.expires_in
      : typeof payload.expires_in ===
          "string"
        ? Number(
            payload.expires_in,
          )
        : 3600;

  const safeSeconds =
    Number.isFinite(
      expiresIn,
    )
      ? Math.max(
          60,
          expiresIn,
        )
      : 3600;

  const cached: CachedToken =
    {
      accessToken,
      expiresAt:
        Date.now() +
        Math.max(
          30,
          safeSeconds - 120,
        ) *
          1000,
    };

  cache.set(
    service,
    cached,
  );

  return cached;
}

export async function getZohoAccessToken(
  service: ZohoService,
): Promise<string> {
  const cached =
    cache.get(
      service,
    );

  if (
    cached &&
    cached.expiresAt >
      Date.now()
  ) {
    return cached.accessToken;
  }

  if (
    isZohoOAuthConfigured(
      service,
    )
  ) {
    const fresh =
      await refreshAccessToken(
        service,
      );

    return fresh.accessToken;
  }

  /*
   * Transitional fallback for local development and existing
   * environments. Production should use refresh-token OAuth.
   */
  const staticToken =
    staticAccessToken(
      service,
    );

  if (staticToken) {
    return staticToken;
  }

  throw new Error(
    `Zoho ${service.toLowerCase()} is not configured.`,
  );
}

export function clearZohoTokenCache(
  service?: ZohoService,
): void {
  if (service) {
    cache.delete(service);
    return;
  }

  cache.clear();
}