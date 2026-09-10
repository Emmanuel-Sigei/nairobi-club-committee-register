import acceptInvite from "./auth/_accept-invite";
import invite from "./auth/_invite";
import login from "./auth/_login";
import logout from "./auth/_logout";
import me from "./auth/_me";
import requestReset from "./auth/_request-reset";
import resendInvite from "./auth/_resend-invite";
import resendOtp from "./auth/_resend-otp";
import resetPassword from "./auth/_reset-password";
import verifyOtp from "./auth/_verify-otp";
import {
  forwardRequest,
  routingError,
  routingParameter,
} from "./_lib/function-forward";

export default async function handler(
  request: Request,
): Promise<Response> {
  const route =
    routingParameter(
      request,
      "ncRoute",
    );

  const handlers = {
    "accept-invite":
      acceptInvite,
    "invite":
      invite,
    "login":
      login,
    "logout":
      logout,
    "me":
      me,
    "request-reset":
      requestReset,
    "resend-invite":
      resendInvite,
    "resend-otp":
      resendOtp,
    "reset-password":
      resetPassword,
    "verify-otp":
      verifyOtp,
  } as const;

  const selected =
    handlers[
      route as keyof typeof handlers
    ];

  if (!selected) {
    return routingError();
  }

  const forwarded =
    await forwardRequest(
      request,
      `/api/auth/${encodeURIComponent(route)}`,
      ["ncRoute"],
    );

  return selected(
    forwarded,
  );
}
