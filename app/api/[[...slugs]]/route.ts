import { Elysia, t } from "elysia";
import { pushMessage, getUserProfile } from "@/lib/line";
import { addMessage, getConversationSummary, getMessages, getUsers, markUserRead } from "@/lib/store";
import { formatMessagePreview } from "@/lib/chat-utils";
import {
  createSubscriber,
  getChannelKey,
  GLOBAL_CHANNEL_KEY,
} from "@/lib/redis";

export const app = new Elysia({ prefix: "/api" })
  /**
   * GET /api/users
   * Return all known LINE users with their profiles.
   */
  .get("/users", async () => {
    const userIds = await getUsers();
    const profiles = await Promise.all(
      userIds.map(async (userId) => {
        const [{ unreadCount, latestMessage }, profile] = await Promise.all([
          getConversationSummary(userId),
          getUserProfile(userId).catch(() => null),
        ]);
        const lastMessage = latestMessage
          ? formatMessagePreview(latestMessage.text)
          : "";
        const lastMessageAt = latestMessage?.timestamp ?? 0;

        return {
          userId,
          displayName: profile?.displayName ?? userId.slice(0, 8) + "…",
          pictureUrl: profile?.pictureUrl ?? "",
          unreadCount,
          lastMessage,
          lastMessageAt,
        };
      }),
    );
    return profiles;
  })

  /**
   * GET /api/messages?userId=...
   * Return all stored messages for a specific LINE user.
   */
  .get(
    "/messages",
    async ({ query }) => {
      const { userId } = query;
      if (!userId) return [];
      return getMessages(userId);
    },
    {
      query: t.Object({
        userId: t.Optional(t.String()),
      }),
    },
  )

  /**
   * POST /api/read
   * Mark a conversation as read.
   */
  .post(
    "/read",
    async ({ body }) => {
      await markUserRead(body.userId);
      return { ok: true };
    },
    {
      body: t.Object({
        userId: t.String({ minLength: 1 }),
      }),
    },
  )

  /**
   * POST /api/messages
   * Send a text message from the webchat to LINE OA, and store it.
   */
  .post(
    "/messages",
    async ({ body, set }) => {
      const { text, userId } = body;

      // Push to the LINE user
      try {
        await pushMessage(text, userId);
      } catch (err) {
        console.error("[LINE push error]", err);
        set.status = 502;
        return { ok: false, error: "Failed to send to LINE" };
      }

      // Persist only after LINE confirms delivery, so failed sends cannot
      // reappear as successful messages on the next history fetch.
      const msg = await addMessage({ text, from: "user", userId });

      return { ok: true, message: msg };
    },
    {
      body: t.Object({
        text: t.String({ minLength: 1 }),
        userId: t.String({ minLength: 1 }),
      }),
    },
  )

  /**
   * GET /api/events
   * Server-Sent Events stream — pushes new LINE messages to connected webchat clients.
   * Uses a dedicated Redis subscriber so this works across serverless instances.
   */
  .get(
    "/events",
    async ({ query }) => {
      const userId = query.userId ?? "";
      const channel = userId ? getChannelKey(userId) : GLOBAL_CHANNEL_KEY;
      const encoder = new TextEncoder();
      const subscriber = await createSubscriber();
      let heartbeat: ReturnType<typeof setInterval> | null = null;

      const stream = new ReadableStream({
        async start(controller) {
          // Send initial comment to confirm connection
          controller.enqueue(encoder.encode(": connected\n\n"));

          // Heartbeat every 20 s to prevent proxy / load-balancer timeouts
          heartbeat = setInterval(() => {
            try {
              controller.enqueue(encoder.encode(": ping\n\n"));
            } catch {
              // stream already closed
            }
          }, 20_000);

          // Subscribe to the per-user Redis pub/sub channel
          await subscriber.subscribe(channel, (json) => {
            try {
              const msg = JSON.parse(json);
              // Only forward messages received FROM LINE to the webchat
              if (msg.from === "line") {
                const data = `data: ${JSON.stringify(msg)}\n\n`;
                controller.enqueue(encoder.encode(data));
              }
            } catch (err) {
              console.error("[SSE parse error]", err);
            }
          });
        },
        async cancel() {
          if (heartbeat) clearInterval(heartbeat);
          try {
            await subscriber.unsubscribe(channel);
            await subscriber.quit();
          } catch (err) {
            console.error("[SSE subscriber cleanup error]", err);
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        },
      });
    },
    {
      query: t.Object({
        userId: t.Optional(t.String()),
      }),
    },
  );

export const GET = app.fetch;
export const POST = app.fetch;
