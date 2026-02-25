import { Elysia, t } from "elysia";
import { pushMessage, getUserProfile } from "@/lib/line";
import { addMessage, getMessages, getUsers } from "@/lib/store";
import { createSubscriber, getChannelKey } from "@/lib/redis";

export const app = new Elysia({ prefix: "/api" })
  /**
   * GET /api/users
   * Return all known LINE users with their profiles.
   */
  .get("/users", async () => {
    const userIds = await getUsers();
    const profiles = await Promise.all(
      userIds.map(async (userId) => {
        try {
          const profile = await getUserProfile(userId);
          return {
            userId,
            displayName: profile.displayName,
            pictureUrl: profile.pictureUrl,
          };
        } catch {
          return {
            userId,
            displayName: userId.slice(0, 8) + "…",
            pictureUrl: "",
          };
        }
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
   * POST /api/messages
   * Send a text message from the webchat to LINE OA, and store it.
   */
  .post(
    "/messages",
    async ({ body, set }) => {
      const { text, userId } = body;

      // Store message locally first
      const msg = await addMessage({ text, from: "user", userId });

      // Push to the LINE user
      try {
        await pushMessage(text, userId);
      } catch (err) {
        console.error("[LINE push error]", err);
        set.status = 502;
        return { ok: false, error: "Failed to send to LINE" };
      }

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
      const channel = getChannelKey(userId);
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
