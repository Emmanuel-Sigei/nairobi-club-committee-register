import type {
  AuthUser,
  LoginResult,
} from "./auth-types";

async function request<T>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(url, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
    ...options,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.error || "Request failed.",
    );
  }

  return data as T;
}

export function login(
  email: string,
  password: string,
): Promise<LoginResult> {
  return request<LoginResult>(
    "/api/auth/login",
    {
      method: "POST",
      body: JSON.stringify({
        email,
        password,
      }),
    },
  );
}

export function verifyOtp(
  challengeId: string,
  otp: string,
): Promise<{ success: boolean }> {
  return request(
    "/api/auth/verify-otp",
    {
      method: "POST",
      body: JSON.stringify({
        challengeId,
        otp,
      }),
    },
  );
}

export function resendOtp(
  challengeId: string,
): Promise<{ success: boolean }> {
  return request(
    "/api/auth/resend-otp",
    {
      method: "POST",
      body: JSON.stringify({
        challengeId,
      }),
    },
  );
}

export function logout(): Promise<{ success: boolean }> {
  return request(
    "/api/auth/logout",
    {
      method: "POST",
    },
  );
}

export function getCurrentUser(): Promise<{
  success: boolean;
  user: AuthUser;
}> {
  return request(
    "/api/auth/me",
  );
}
