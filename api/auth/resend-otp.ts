import { getDb } from "../_lib/db";
import { error, json, readJson } from "../_lib/http";
import {
  generateOtp,
  hashOtp,
} from "../_lib/security";
import { sendLoginOtp } from "../_lib/email";

interface ResendRequest {
  challengeId: string;
}

const RESEND_SECONDS = 60;
const OTP_MINUTES = 10;

export default async function handler(
  request: Request,
): Promise<Response> {
  if (request.method !== "POST") {
    return error("Method not allowed.", 405);
  }

  try {
    const body =
      await readJson<ResendRequest>(request);

    const db = getDb();

    const challenge =
      await db.otpChallenge.findUnique({
        where: {
          id: body.challengeId,
        },
        include: {
          user: true,
        },
      });

    if (!challenge || !challenge.user.isActive) {
      return error("Verification request not found.", 404);
    }

    if (
      Date.now() - challenge.lastSentAt.getTime() <
      RESEND_SECONDS * 1000
    ) {
      return error(
        "Please wait before requesting another code.",
        429,
      );
    }

    const otp = generateOtp();

    await db.otpChallenge.update({
      where: {
        id: challenge.id,
      },
      data: {
        codeHash: await hashOtp(otp),
        expiresAt: new Date(
          Date.now() +
            OTP_MINUTES * 60 * 1000,
        ),
        attempts: 0,
        lockedUntil: null,
        lastSentAt: new Date(),
      },
    });

    await sendLoginOtp(
      challenge.user.email,
      otp,
    );

    return json({
      success: true,
    });
  } catch (err) {
    console.error("OTP resend error:", err);

    return error(
      "Unable to resend the verification code.",
      500,
    );
  }
}
