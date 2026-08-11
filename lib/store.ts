/**
 * Redis-backed message store.
 * Uses a sorted set for persistence and pub/sub for real-time delivery.
 * This works correctly across multiple Vercel serverless instances.
 */

import {
  getRedisClient,
  getChannelKey,
  getMessagesKey,
  GLOBAL_CHANNEL_KEY,
  USERS_SET_KEY,
} from "@/lib/redis";
import { countUnreadMessages } from "@/lib/chat-utils";

export interface Message {
  id: string;
  text: string;
  userId: string;
  /** 'user' = sent from webchat to LINE | 'line' = received from LINE OA */
  from: "user" | "line";
  senderName?: string;
  pictureUrl?: string;
  timestamp: number;
  /** Provider message/event ID, used to make webhook retries idempotent. */
  sourceId?: string;
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

  // LINE retries webhook deliveries. Claiming the provider ID atomically
  // prevents the same inbound event from being stored more than once.
  if (msg.sourceId) {
    const dedupeKey = `chat:message-source:${msg.userId}:${msg.sourceId}`;
    const claimed = await client.set(dedupeKey, json, { NX: true, EX: 60 * 60 * 24 * 7 });
    if (claimed === null) {
      const existing = await client.get(dedupeKey);
      if (existing) return JSON.parse(existing) as Message;
    }
  }

  // Store in sorted set, score = timestamp for chronological ordering
  await client.zAdd(messagesKey, { score: message.timestamp, value: json });

  // Trim to last 200 messages per user
  await client.zRemRangeByRank(messagesKey, 0, -201);

  // Publish to the per-user pub/sub channel
  await client.publish(channel, json);

  // Publish incoming LINE messages to the global channel so the sidebar can
  // detect replies even when another conversation is selected.
  if (msg.from === "line") {
    await client.publish(GLOBAL_CHANNEL_KEY, json);
  }

  return message;
}

/** Get all stored messages for a specific user in chronological order. */
export async function getMessages(userId: string): Promise<Message[]> {
  const client = await getRedisClient();
  const items = await client.zRange(getMessagesKey(userId), 0, -1);
  return items.map((item) => JSON.parse(item) as Message);
}

/** Get the newest stored message for a user. */
export async function getLatestMessage(userId: string): Promise<Message | null> {
  const client = await getRedisClient();
  const items = await client.zRange(getMessagesKey(userId), -1, -1);
  return items[0] ? (JSON.parse(items[0]) as Message) : null;
}

/** Return unread count and latest message with one Redis history read. */
export async function getConversationSummary(userId: string): Promise<{
  unreadCount: number;
  latestMessage: Message | null;
}> {
  const client = await getRedisClient();
  const lastReadAt = Number((await client.get("chat:read:" + userId)) ?? 0);
  const items = await client.zRange(getMessagesKey(userId), 0, -1);
  const messages = items.map((item) => JSON.parse(item) as Message);

  return {
    unreadCount: countUnreadMessages(messages, lastReadAt),
    latestMessage: messages[messages.length - 1] ?? null,
  };
}

/** Mark all messages currently visible in a conversation as read. */
export async function markUserRead(userId: string): Promise<void> {
  const client = await getRedisClient();
  await client.set("chat:read:" + userId, Date.now().toString());
}

/** Count incoming LINE messages added after the user's last read timestamp. */
export async function getUnreadCount(userId: string): Promise<number> {
  const client = await getRedisClient();
  const lastReadAt = Number((await client.get("chat:read:" + userId)) ?? 0);
  const items = await client.zRange(getMessagesKey(userId), 0, -1);
  const messages = items.map((item) => JSON.parse(item) as Message);
  return countUnreadMessages(messages, lastReadAt);
}
