import assert from "node:assert/strict";
import { countUnreadMessages, formatDateDivider, formatMessagePreview, clearUnreadCountOverride, getChatScrollBehavior, getMessageHistory, getProfileImageCandidates, getSidebarUnreadCount, isIncomingMessage, isSameCalendarDay } from "./chat-utils.ts";

const morning = new Date(2025, 0, 5, 9, 15).getTime();
const evening = new Date(2025, 0, 5, 21, 45).getTime();
const nextDay = new Date(2025, 0, 6, 0, 5).getTime();

assert.equal(isSameCalendarDay(morning, evening), true);
assert.equal(isSameCalendarDay(morning, nextDay), false);
assert.equal(formatDateDivider(morning, "en-US"), "January 5, 2025");
assert.equal(isIncomingMessage({ from: "line" }), true);
assert.equal(isIncomingMessage({ from: "user" }), false);
console.log("chat-utils assertions passed");

const firstEmptyHistory = getMessageHistory(undefined);
const secondEmptyHistory = getMessageHistory(undefined);
assert.equal(firstEmptyHistory, secondEmptyHistory);
const existingHistory = [{ id: "message-1" }];
assert.equal(getMessageHistory(existingHistory), existingHistory);

const messagesWithReadState = [
  { from: "line" as const, timestamp: 200 },
  { from: "user" as const, timestamp: 250 },
  { from: "line" as const, timestamp: 300 },
];
assert.equal(countUnreadMessages(messagesWithReadState, 200), 1);

assert.equal(formatMessagePreview("hello\nworld"), "hello world");
assert.equal(formatMessagePreview("123456", 5), "1234…");

assert.equal(getSidebarUnreadCount(4, {}, "user-1"), 4);
assert.equal(getSidebarUnreadCount(4, { "user-1": 0 }, "user-1"), 0);

assert.deepEqual(getProfileImageCandidates(undefined, "fresh-profile"), ["fresh-profile"]);
assert.deepEqual(getProfileImageCandidates("stored-profile", "fresh-profile"), ["stored-profile", "fresh-profile"]);

assert.equal(getChatScrollBehavior(true), "auto");
assert.equal(getChatScrollBehavior(false), "smooth");

const unreadOverride = { "user-1": 0, "user-2": 3 };
assert.deepEqual(clearUnreadCountOverride(unreadOverride, "user-1"), { "user-2": 3 });
assert.equal(clearUnreadCountOverride(unreadOverride, "missing"), unreadOverride);
