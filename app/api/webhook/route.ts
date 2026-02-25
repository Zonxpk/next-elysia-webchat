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

  // Verify webhook signature (skip in dev if secret not set)
  if (process.env.LINE_CHANNEL_SECRET) {
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
  }

  let body: LineWebhookBody;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

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

      await addMessage({ text, from: "line", userId, senderName, pictureUrl });

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
