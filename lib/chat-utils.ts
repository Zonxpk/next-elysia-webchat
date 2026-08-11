export function isSameCalendarDay(firstTimestamp: number, secondTimestamp: number): boolean {
  const first = new Date(firstTimestamp);
  const second = new Date(secondTimestamp);
  return first.getFullYear() === second.getFullYear()
    && first.getMonth() === second.getMonth()
    && first.getDate() === second.getDate();
}

export function formatDateDivider(timestamp: number, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(timestamp));
}

export function isIncomingMessage(message: { from: "user" | "line" }): boolean {
  return message.from === "line";
}

const EMPTY_HISTORY: unknown[] = [];

export function getMessageHistory<T>(messages?: T[]): T[] {
  return (messages ?? EMPTY_HISTORY) as T[];
}

export function countUnreadMessages(
  messages: ReadonlyArray<{ from: "user" | "line"; timestamp: number }>,
  lastReadAt = 0,
): number {
  return messages.filter((message) => message.from === "line" && message.timestamp > lastReadAt).length;
}

export function formatMessagePreview(text: string, maxLength = 80): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (maxLength <= 0) return "";
  return normalized.length > maxLength
    ? normalized.slice(0, maxLength - 1) + "…"
    : normalized;
}

export function getSidebarUnreadCount(
  serverUnreadCount: number | undefined,
  localUnreadCounts: Record<string, number>,
  userId: string,
): number {
  return Object.prototype.hasOwnProperty.call(localUnreadCounts, userId)
    ? localUnreadCounts[userId]
    : serverUnreadCount ?? 0;
}

export function getProfileImageCandidates(
  messagePictureUrl?: string,
  userPictureUrl?: string,
): string[] {
  return Array.from(new Set([messagePictureUrl, userPictureUrl].filter(
    (url): url is string => Boolean(url),
  )));
}

export function getChatScrollBehavior(isInitialConversation: boolean): "auto" | "smooth" {
  return isInitialConversation ? "auto" : "smooth";
}

export function clearUnreadCountOverride(
  localUnreadCounts: Record<string, number>,
  userId: string,
): Record<string, number> {
  if (!Object.prototype.hasOwnProperty.call(localUnreadCounts, userId)) {
    return localUnreadCounts;
  }
  const next = { ...localUnreadCounts };
  delete next[userId];
  return next;
}
