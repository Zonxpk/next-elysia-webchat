"use client";

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Message } from "@/lib/store";
import { api } from "@/lib/eden";
import { fetchMessages, markUserRead, type UserInfo } from "@/lib/chat-api";
import { formatDateDivider, formatMessagePreview, getChatScrollBehavior, getMessageHistory, isIncomingMessage, isSameCalendarDay } from "@/lib/chat-utils";
import { MessageBubble } from "@/components/chat/message-bubble";

function mergeMessages(
  serverMessages: Message[],
  currentMessages: Message[],
  userId: string,
): Message[] {
  const messagesById = new Map(serverMessages.map((message) => [message.id, message]));

  for (const message of currentMessages) {
    if (message.userId === userId && !messagesById.has(message.id)) {
      messagesById.set(message.id, message);
    }
  }

  return [...messagesById.values()].sort((first, second) => first.timestamp - second.timestamp);
}

const NEAR_BOTTOM_THRESHOLD = 80;

export function ChatPanel({ selectedUser }: { selectedUser: UserInfo | null }) {
  const queryClient = useQueryClient();
  const [localMessages, setLocalMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sendingRef = useRef(false);
  const selectedUserId = selectedUser?.userId;
  const lastScrolledUserIdRef = useRef<string | null>(null);
  const wasNearBottomRef = useRef(true);

  const { data: fetchedMessageHistory } = useQuery({
    queryKey: ["messages", selectedUserId],
    queryFn: () => fetchMessages(selectedUserId!),
    enabled: Boolean(selectedUserId),
    refetchInterval: 10_000,
  });

  const messageHistory = getMessageHistory(fetchedMessageHistory);
  const messages = useMemo(
    () => selectedUserId ? mergeMessages(messageHistory, localMessages, selectedUserId) : [],
    [messageHistory, localMessages, selectedUserId],
  );
  const latestIncomingMessageId = [...messageHistory].reverse().find(isIncomingMessage)?.id;

  useLayoutEffect(() => {
    if (!selectedUserId || messages.length === 0) return;
    const hasCurrentConversationMessages = messages.every((message) => message.userId === selectedUserId);
    if (!hasCurrentConversationMessages) return;

    const isInitialConversation = lastScrolledUserIdRef.current !== selectedUserId;
    if (!isInitialConversation && !wasNearBottomRef.current) return;

    bottomRef.current?.scrollIntoView({
      behavior: getChatScrollBehavior(isInitialConversation),
      block: "end",
    });
    wasNearBottomRef.current = true;
    lastScrolledUserIdRef.current = selectedUserId;
  }, [selectedUserId, messages]);

  useEffect(() => {
    if (!selectedUserId || !latestIncomingMessageId) return;

    void markUserRead(selectedUserId)
      .then(() => queryClient.invalidateQueries({ queryKey: ["users"] }))
      .catch(() => {});
  }, [selectedUserId, latestIncomingMessageId, queryClient]);

  useEffect(() => {
    if (!selectedUserId) return;
    const userId = selectedUserId;
    let es: EventSource;
    let retryTimeout: ReturnType<typeof setTimeout>;

    function connect() {
      es = new EventSource(`/api/events?userId=${encodeURIComponent(userId)}`);
      es.onopen = () => {
        setConnected(true);
        setError(null);
      };
      es.onmessage = (event) => {
        try {
          const msg: Message = JSON.parse(event.data);
          void queryClient.cancelQueries({ queryKey: ["messages", userId] }).then(() => {
            queryClient.setQueryData<Message[]>(["messages", userId], (currentMessages) => {
              const messages = getMessageHistory(currentMessages);
              if (messages.some((message) => message.id === msg.id)) {
                return messages;
              }

              return [...messages, msg].sort((first, second) => first.timestamp - second.timestamp);
            });
            queryClient.invalidateQueries({ queryKey: ["users"] });
          }).catch(() => {
            // Do not write an event while the matching history query is still in flight.
          });
        } catch {
          // ignore parse errors
        }
      };
      es.onerror = () => {
        setConnected(false);
        es.close();
        retryTimeout = setTimeout(connect, 3000);
      };
    }

    connect();
    return () => {
      setConnected(false);
      es?.close();
      clearTimeout(retryTimeout);
    };
  }, [selectedUserId, queryClient]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || sendingRef.current || !selectedUser) return;

    sendingRef.current = true;
    setSending(true);
    setError(null);
    const optimistic: Message = {
      id: `tmp-${Date.now()}`,
      text,
      from: "user",
      userId: selectedUser.userId,
      timestamp: Date.now(),
    };
    setLocalMessages((prev) => [...prev, optimistic]);
    setInput("");

    try {
      const { data, error: apiError } = await api.messages.post({ text, userId: selectedUser.userId });
      if (apiError || !data?.ok) {
        setError(data?.error ?? "Failed to send message");
        setLocalMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      } else if (data?.message) {
        const sentMessage = data.message;
        await queryClient.cancelQueries({ queryKey: ["users"] });
        queryClient.setQueryData<UserInfo[]>(["users"], (currentUsers) =>
          currentUsers?.map((user) => user.userId === sentMessage.userId
            ? { ...user, lastMessage: formatMessagePreview(sentMessage.text), lastMessageAt: sentMessage.timestamp }
            : user),
        );
        await queryClient.cancelQueries({ queryKey: ["messages", sentMessage.userId] });
        queryClient.setQueryData<Message[]>(["messages", sentMessage.userId], (currentMessages) => {
          const messages = getMessageHistory(currentMessages);
          if (messages.some((message) => message.id === sentMessage.id)) {
            return messages;
          }

          return [...messages, sentMessage].sort((first, second) => first.timestamp - second.timestamp);
        });
        setLocalMessages((prev) => prev.filter((message) => message.id !== optimistic.id));
      } else {
        setError("Message send failed: the server did not return a persisted message");
        setLocalMessages((prev) => prev.filter((message) => message.id !== optimistic.id));
      }
    } catch {
      setError("Network error — could not send message");
      setLocalMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
    } finally {
      sendingRef.current = false;
      setSending(false);
      textareaRef.current?.focus();
    }
  }, [input, selectedUser, queryClient]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (!selectedUser) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-gray-50 text-gray-400 select-none">
        <svg className="h-16 w-16 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          />
        </svg>
        <p className="text-sm font-medium">Select a conversation</p>
        <p className="max-w-xs text-center text-xs">
          Choose a user from the left sidebar to start chatting.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <header className="flex flex-shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-4 py-3 shadow-sm">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-gray-800">
            {selectedUser.displayName}
          </h2>
          <p className="truncate text-xs text-gray-400">{selectedUser.userId}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className={`h-2 w-2 rounded-full ${connected ? "bg-green-500" : "animate-pulse bg-gray-300"}`}
          />
          <span className="hidden text-xs text-gray-400 sm:inline">
            {connected ? "Live" : "Connecting…"}
          </span>
        </div>
      </header>

      <main
        ref={scrollContainerRef}
        onScroll={() => {
          const element = scrollContainerRef.current;
          if (!element) return;
          wasNearBottomRef.current = element.scrollHeight - element.scrollTop - element.clientHeight <= NEAR_BOTTOM_THRESHOLD;
        }}
        className="flex-1 space-y-2 overflow-y-auto bg-gray-50 px-4 py-4"
      >
        {messages.length === 0 && (
          <div className="flex h-full select-none flex-col items-center justify-center gap-2 text-sm text-gray-400">
            <svg className="h-12 w-12 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
            <p className="font-medium">No messages yet</p>
            <p className="max-w-xs text-center text-xs">
              Send a message below, or wait for a reply from LINE.
            </p>
          </div>
        )}

        {messages.map((msg, index) => {
          const previousMessage = messages[index - 1];
          const showDateDivider =
            !previousMessage || !isSameCalendarDay(previousMessage.timestamp, msg.timestamp);
          const dateLabel = formatDateDivider(msg.timestamp);

          return (
            <Fragment key={msg.id}>
              {showDateDivider && (
                <div className="flex items-center gap-3 py-3" role="separator" aria-label={dateLabel}>
                  <div className="h-px flex-1 bg-gray-200" />
                  <span className="text-[11px] font-medium text-gray-400">{dateLabel}</span>
                  <div className="h-px flex-1 bg-gray-200" />
                </div>
              )}
              <MessageBubble message={msg} fallbackPictureUrl={selectedUser.pictureUrl} />
            </Fragment>
          );
        })}

        {error && (
          <div className="flex justify-center" role="alert">
            <div className="rounded-full border border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700 shadow-sm">
              ⚠ {error}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </main>

      <footer className="flex flex-shrink-0 items-end gap-3 border-t border-gray-200 bg-white px-4 py-3">
        <textarea
          id="message-input"
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          aria-label="Message"
          placeholder="Type a message… (Enter to send, Shift+Enter for newline)"
          rows={1}
          className="max-h-32 flex-1 resize-none overflow-y-auto rounded-2xl border border-gray-300 px-4 py-2.5 text-sm leading-snug text-gray-800 placeholder-gray-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#00B900]"
          style={{ minHeight: "42px" }}
          disabled={sending}
        />
        <button
          onClick={sendMessage}
          disabled={!input.trim() || sending}
          className="flex h-10 w-10 flex-shrink-0 cursor-pointer items-center justify-center rounded-full bg-[#00B900] text-white shadow-sm transition-colors hover:bg-[#009900] disabled:cursor-not-allowed disabled:bg-gray-300"
          aria-label="Send message"
        >
          {sending ? (
            <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          ) : (
            <svg className="ml-0.5 h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
            </svg>
          )}
        </button>
      </footer>
    </div>
  );
}
