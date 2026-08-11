import { createClient } from "redis";

type RedisClient = ReturnType<typeof createClient>;

declare global {
  var __redisClient: RedisClient | undefined;
  var __redisClientPromise: Promise<RedisClient> | undefined;
}

function getRedisUrl(): string {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL environment variable is not set");
  return url;
}

/**
 * Lazy singleton Redis client used for read/write/publish operations.
 * Reuses the same connection across Next.js hot-reloads in dev.
 */
export async function getRedisClient(): Promise<RedisClient> {
  if (global.__redisClient) return global.__redisClient;
  if (!global.__redisClientPromise) {
    const client = createClient({ url: getRedisUrl() });
    client.on("error", (err) => console.error("[Redis client error]", err));
    global.__redisClientPromise = client.connect().then(() => {
      global.__redisClient = client;
      return client;
    }).catch((error) => {
      // Allow a later request to retry after a transient connection failure.
      global.__redisClientPromise = undefined;
      client.disconnect().catch(() => undefined);
      throw error;
    });
  }
  return global.__redisClientPromise;
}

/**
 * Create a fresh Redis client dedicated to pub/sub subscribing.
 * Must be a separate connection — once subscribed, the client cannot
 * issue regular commands. Caller is responsible for calling quit().
 */
export async function createSubscriber(): Promise<RedisClient> {
  const client = createClient({ url: getRedisUrl() });
  client.on("error", (err) => console.error("[Redis subscriber error]", err));
  await client.connect();
  return client;
}

/** Per-user sorted set key for message storage. */
export function getMessagesKey(userId: string): string {
  return `chat:messages:${userId}`;
}

/** Per-user pub/sub channel key for SSE delivery. */
export function getChannelKey(userId: string): string {
  return `chat:events:${userId}`;
}

/** Global Redis pub/sub channel for incoming LINE messages. */
export const GLOBAL_CHANNEL_KEY = "chat:events:all";

/** Global Redis set key that tracks all known LINE user IDs. */
export const USERS_SET_KEY = "chat:users";
