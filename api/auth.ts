import acceptInvite from "./auth/_accept-invite.js";
import invite from "./auth/_invite.js";
import login from "./auth/_login.js";
import logout from "./auth/_logout.js";
import me from "./auth/_me.js";
import requestReset from "./auth/_request-reset.js";
import resendInvite from "./auth/_resend-invite.js";
import resendOtp from "./auth/_resend-otp.js";
import resetPassword from "./auth/_reset-password.js";
import verifyOtp from "./auth/_verify-otp.js";
import {
  forwardRequest,
  routingError,
  routingParameter,
} from "./_lib/function-forward.js";

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
