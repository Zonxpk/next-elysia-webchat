import { Elysia, t } from "elysia";
import { pushMessage } from "@/lib/line";
import { addMessage, getMessages } from "@/lib/store";
import { createSubscriber, REDIS_CHANNEL } from "@/lib/redis";

export const app = new Elysia({ prefix: "/api" })
  /**
   * GET /api/messages
   * Return all stored messages (for initial load / page refresh).
   */
  .get("/messages", async () => {
    return getMessages();
  })

  /**
   * POST /api/messages
   * Send a text message from the webchat to LINE OA, and store it.
   */
  .post(
    "/messages",
    async ({ body, set }) => {
      const { text } = body;

      // Store message locally first
      const msg = await addMessage({ text, from: "user" });

      // Push to LINE OA (non-blocking on failure so the UI still gets response)
      try {
        await pushMessage(text);
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
      }),
    },
  )

  /**
   * GET /api/events
   * Server-Sent Events stream — pushes new LINE messages to connected webchat clients.
   * Uses a dedicated Redis subscriber so this works across serverless instances.
   */
  .get("/events", async () => {
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

        // Subscribe to the Redis pub/sub channel
        await subscriber.subscribe(REDIS_CHANNEL, (json) => {
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
          await subscriber.unsubscribe(REDIS_CHANNEL);
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
  });

export const GET = app.fetch;
export const POST = app.fetch;
