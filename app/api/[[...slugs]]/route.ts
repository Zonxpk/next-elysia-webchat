import { Elysia, t } from "elysia";
import { pushMessage } from "@/lib/line";
import { addMessage, getMessages, subscribe } from "@/lib/store";

export const app = new Elysia({ prefix: "/api" })
  /**
   * GET /api/messages
   * Return all stored messages (for initial load / page refresh).
   */
  .get("/messages", () => {
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
      const msg = addMessage({ text, from: "user" });

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
    }
  )

  /**
   * GET /api/events
   * Server-Sent Events stream — pushes new LINE messages to connected webchat clients.
   */
  .get("/events", () => {
    const encoder = new TextEncoder();
    let unsubscribe: (() => void) | null = null;

    const stream = new ReadableStream({
      start(controller) {
        // Send a comment to keep the connection alive
        controller.enqueue(encoder.encode(": connected\n\n"));

        unsubscribe = subscribe((msg) => {
          // Only push messages received FROM LINE to the webchat
          if (msg.from === "line") {
            const data = `data: ${JSON.stringify(msg)}\n\n`;
            controller.enqueue(encoder.encode(data));
          }
        });
      },
      cancel() {
        unsubscribe?.();
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
