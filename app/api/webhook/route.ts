import { NextRequest, NextResponse } from "next/server";
import { verifySignature, getUserProfile } from "@/lib/line";
import { addMessage, addUser } from "@/lib/store";

interface LineTextMessage {
  type: "text";
  id: string;
  text: string;
}

interface LineWebhookEvent {
  type: string;
  replyToken?: string;
  source: {
    type: "user" | "group" | "room";
    userId?: string;
    displayName?: string;
  };
  timestamp: number;
  message?: LineTextMessage;
}

interface LineWebhookBody {
  destination: string;
  events: LineWebhookEvent[];
}

function isWebhookBody(value: unknown): value is LineWebhookBody {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  if (typeof body.destination !== "string" || !Array.isArray(body.events)) {
    return false;
  }

  return body.events.every((event) => {
    if (!event || typeof event !== "object") return false;
    const candidate = event as Record<string, unknown>;
    if (typeof candidate.type !== "string" || typeof candidate.timestamp !== "number") {
      return false;
    }
    const source = candidate.source;
    if (!source || typeof source !== "object") return false;
    const sourceType = (source as Record<string, unknown>).type;
    if (!["user", "group", "room"].includes(String(sourceType))) return false;

    const message = candidate.message;
    if (message === undefined) return true;
    if (!message || typeof message !== "object") return false;
    const messageRecord = message as Record<string, unknown>;
    return messageRecord.type !== "text" ||
      (typeof messageRecord.id === "string" && typeof messageRecord.text === "string");
  });
}

/**
 * POST /api/webhook
 * Receives events from the LINE Platform.
 * Must return 200 immediately; processing happens synchronously before responding.
 *
 * Set this URL in LINE Developers Console → Messaging API → Webhook URL:
 * https://<your-domain>/api/webhook
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-line-signature") ?? "";

  const secret = process.env.LINE_CHANNEL_SECRET;
  if (!secret) {
    console.error("[webhook] LINE_CHANNEL_SECRET is not configured");
    return NextResponse.json({ error: "Webhook is not configured" }, { status: 503 });
  }

  if (!signature) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const valid = verifySignature(rawBody, signature);
    if (!valid) {
      console.warn("[webhook] Invalid LINE signature");
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch (err) {
    console.error("[webhook] Signature verification error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!isWebhookBody(parsedBody)) {
    return NextResponse.json({ error: "Invalid webhook payload" }, { status: 400 });
  }
  const body = parsedBody;

  for (const event of body.events ?? []) {
    // Handle text messages sent by users to the LINE OA
    if (event.type === "message" && event.message?.type === "text") {
      const text = event.message.text;
      const userId = event.source.userId;

      if (!userId) {
        console.warn("[webhook] Message event without userId — skipping");
        continue;
      }

      // Fetch real LINE display name and profile picture
      let senderName = `LINE User (${userId.slice(0, 8)}…)`;
      let pictureUrl: string | undefined;
      try {
        const profile = await getUserProfile(userId);
        senderName = profile.displayName;
        pictureUrl = profile.pictureUrl;
      } catch (err) {
        console.warn("[webhook] Could not fetch LINE profile:", err);
      }

      // Register the user in the global users set
      await addUser(userId);

      await addMessage({
        text,
        from: "line",
        userId,
        senderName,
        pictureUrl,
        sourceId: event.message.id,
      });

      console.log(`[webhook] Message from LINE user ${userId}: "${text}"`);
    }

    // Log other event types for debugging
    if (event.type !== "message") {
      console.log(`[webhook] Event type: ${event.type}`);
    }
  }

  // LINE requires a 200 response
  return NextResponse.json({ status: "ok" });
}

/** GET /api/webhook — LINE verification challenge */
export async function GET() {
  return NextResponse.json({ status: "LINE webhook endpoint is active" });
}
