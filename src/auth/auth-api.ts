import type {
  AuthUser,
  LoginResult,
} from "./auth-types";

interface MessageResponse {
  success: boolean;
  message?: string;
}

interface PasswordResetResponse
  extends MessageResponse {
  notificationSent?: boolean;
}

async function request<T>(
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
      data = {
        error:
          "Unexpected server response.",
      };
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

export async function login(
  email: string,
  password: string,
): Promise<LoginResult> {
  return request<LoginResult>(
    "/api/auth/login",
    {
      method:
        "POST",
      body:
        JSON.stringify({
          email,
          password,
        }),
    },
  );
}

export async function verifyOtp(
  challengeId: string,
  otp: string,
): Promise<void> {
  await request(
    "/api/auth/verify-otp",
    {
      method:
        "POST",
      body:
        JSON.stringify({
          challengeId,
          otp,
        }),
    },
  );
}

export async function resendOtp(
  challengeId: string,
): Promise<void> {
  await request(
    "/api/auth/resend-otp",
    {
      method:
        "POST",
      body:
        JSON.stringify({
          challengeId,
        }),
    },
  );
}

export async function requestPasswordReset(
  email: string,
): Promise<MessageResponse> {
  return request<MessageResponse>(
    "/api/auth/request-reset",
    {
      method:
        "POST",
      body:
        JSON.stringify({
          email,
        }),
    },
  );
}

export async function completePasswordReset(
  email: string,
  otp: string,
  password: string,
): Promise<PasswordResetResponse> {
  return request<PasswordResetResponse>(
    "/api/auth/reset-password",
    {
      method:
        "POST",
      body:
        JSON.stringify({
          email,
          otp,
          password,
        }),
    },
  );
}

export async function acceptInvitation(
  token: string,
  name: string,
  password: string,
): Promise<MessageResponse> {
  return request<MessageResponse>(
    "/api/auth/accept-invite",
    {
      method:
        "POST",
      body:
        JSON.stringify({
          token,
          name,
          password,
        }),
    },
  );
}

export async function logout(): Promise<void> {
  await request(
    "/api/auth/logout",
    {
      method:
        "POST",
    },
  );
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  try {
    const response =
      await request<{
        success: boolean;
        user: AuthUser;
      }>(
        "/api/auth/me",
      );

    return response.user;
  } catch {
    return null;
  }
}