/**
 * Redis-backed message store.
 * Uses a sorted set for persistence and pub/sub for real-time delivery.
 * This works correctly across multiple Vercel serverless instances.
 */

import { getRedisClient, REDIS_CHANNEL, REDIS_KEY } from "@/lib/redis";

export interface Message {
  id: string;
  text: string;
  /** 'user' = sent from webchat to LINE | 'line' = received from LINE OA */
  from: "user" | "line";
  senderName?: string;
  timestamp: number;
}

/** Add a message to Redis and publish it to all SSE subscribers. */
export async function addMessage(
  msg: Omit<Message, "id" | "timestamp">,
): Promise<Message> {
  const message: Message = {
    ...msg,
    id: crypto.randomUUID(),
    timestamp: Date.now(),
  };

  const client = await getRedisClient();
  const json = JSON.stringify(message);

  // Store in sorted set, score = timestamp for chronological ordering
  await client.zAdd(REDIS_KEY, { score: message.timestamp, value: json });

  // Trim to last 200 messages
  await client.zRemRangeByRank(REDIS_KEY, 0, -201);

  // Publish to all SSE subscribers (works across Lambda instances)
  await client.publish(REDIS_CHANNEL, json);

  return message;
}

/** Get all stored messages in chronological order. */
export async function getMessages(): Promise<Message[]> {
  const client = await getRedisClient();
  const items = await client.zRange(REDIS_KEY, 0, -1);
  return items.map((item) => JSON.parse(item) as Message);
}
