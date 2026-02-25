/**
 * Redis-backed message store.
 * Uses a sorted set for persistence and pub/sub for real-time delivery.
 * This works correctly across multiple Vercel serverless instances.
 */

import {
  getRedisClient,
  getChannelKey,
  getMessagesKey,
  USERS_SET_KEY,
} from "@/lib/redis";

export interface Message {
  id: string;
  text: string;
  userId: string;
  /** 'user' = sent from webchat to LINE | 'line' = received from LINE OA */
  from: "user" | "line";
  senderName?: string;
  pictureUrl?: string;
  timestamp: number;
}

/** Register a LINE userId into the global users set. */
export async function addUser(userId: string): Promise<void> {
  const client = await getRedisClient();
  await client.sAdd(USERS_SET_KEY, userId);
}

/** Get all known LINE user IDs. */
export async function getUsers(): Promise<string[]> {
  const client = await getRedisClient();
  return client.sMembers(USERS_SET_KEY);
}

/** Add a message to Redis and publish it to the per-user SSE channel. */
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
  const messagesKey = getMessagesKey(msg.userId);
  const channel = getChannelKey(msg.userId);

  // Store in sorted set, score = timestamp for chronological ordering
  await client.zAdd(messagesKey, { score: message.timestamp, value: json });

  // Trim to last 200 messages per user
  await client.zRemRangeByRank(messagesKey, 0, -201);

  // Publish to the per-user pub/sub channel
  await client.publish(channel, json);

  return message;
}

/** Get all stored messages for a specific user in chronological order. */
export async function getMessages(userId: string): Promise<Message[]> {
  const client = await getRedisClient();
  const items = await client.zRange(getMessagesKey(userId), 0, -1);
  return items.map((item) => JSON.parse(item) as Message);
}
