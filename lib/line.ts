import crypto from "crypto";

const LINE_API_BASE = "https://api.line.me/v2/bot/message";

/**
 * Push a text message to a LINE user.
 * Uses LINE_TARGET_USER_ID env by default, or pass an explicit userId.
 */
export async function pushMessage(
  text: string,
  userId?: string,
): Promise<void> {
  const to = userId ?? process.env.LINE_TARGET_USER_ID;
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;

  if (!to || !token) {
    throw new Error(
      "Missing LINE_TARGET_USER_ID or LINE_CHANNEL_ACCESS_TOKEN env variables",
    );
  }

  const res = await fetch(`${LINE_API_BASE}/push`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      to,
      messages: [{ type: "text", text }],
    }),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`LINE push failed (${res.status}): ${error}`);
  }
}

/**
 * Reply to a LINE message using a replyToken (single-use, expires quickly).
 */
export async function replyMessage(
  replyToken: string,
  text: string,
): Promise<void> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;

  if (!token) {
    throw new Error("Missing LINE_CHANNEL_ACCESS_TOKEN env variable");
  }

  const res = await fetch(`${LINE_API_BASE}/reply`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: "text", text }],
    }),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`LINE reply failed (${res.status}): ${error}`);
  }
}

/**
 * Verify the x-line-signature header from a LINE webhook request.
 * The signature is HMAC-SHA256 of the raw request body using the channel secret.
 */
export function verifySignature(rawBody: string, signature: string): boolean {
  const channelSecret = process.env.LINE_CHANNEL_SECRET;

  if (!channelSecret) {
    throw new Error("Missing LINE_CHANNEL_SECRET env variable");
  }

  const hash = crypto
    .createHmac("SHA256", channelSecret)
    .update(rawBody)
    .digest("base64");

  return hash === signature;
}
