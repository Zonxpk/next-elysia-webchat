/**
 * In-memory message store with SSE subscriber support.
 * Uses a global singleton to persist across Next.js hot reloads in dev.
 */

export interface Message {
  id: string;
  text: string;
  /** 'user' = sent from webchat to LINE | 'line' = received from LINE OA */
  from: "user" | "line";
  senderName?: string;
  timestamp: number;
}

interface MessageStore {
  messages: Message[];
  subscribers: Set<(msg: Message) => void>;
}

declare global {
  // eslint-disable-next-line no-var
  var __messageStore: MessageStore | undefined;
}

function getStore(): MessageStore {
  if (!global.__messageStore) {
    global.__messageStore = {
      messages: [],
      subscribers: new Set(),
    };
  }
  return global.__messageStore;
}

/** Add a message to the store and notify all SSE subscribers. */
export function addMessage(
  msg: Omit<Message, "id" | "timestamp">
): Message {
  const store = getStore();
  const message: Message = {
    ...msg,
    id: crypto.randomUUID(),
    timestamp: Date.now(),
  };
  store.messages.push(message);
  // Keep last 200 messages to avoid unbounded memory usage
  if (store.messages.length > 200) {
    store.messages = store.messages.slice(-200);
  }
  store.subscribers.forEach((fn) => fn(message));
  return message;
}

/** Get all stored messages. */
export function getMessages(): Message[] {
  return getStore().messages;
}

/**
 * Subscribe to new messages. Returns an unsubscribe function.
 * Only messages from LINE (from: 'line') are pushed via SSE.
 */
export function subscribe(fn: (msg: Message) => void): () => void {
  const store = getStore();
  store.subscribers.add(fn);
  return () => {
    store.subscribers.delete(fn);
  };
}
