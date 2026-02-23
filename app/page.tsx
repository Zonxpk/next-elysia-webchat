"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { Message } from "@/lib/store";

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Load existing messages on mount
  useEffect(() => {
    fetch("/api/messages")
      .then((r) => r.json())
      .then((data: Message[]) => setMessages(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  // SSE connection for receiving LINE messages in real-time
  useEffect(() => {
    let es: EventSource;
    let retryTimeout: ReturnType<typeof setTimeout>;

    function connect() {
      es = new EventSource("/api/events");

      es.onopen = () => {
        setConnected(true);
        setError(null);
      };

      es.onmessage = (event) => {
        try {
          const msg: Message = JSON.parse(event.data);
          setMessages((prev) => [...prev, msg]);
        } catch {
          // ignore parse errors
        }
      };

      es.onerror = () => {
        setConnected(false);
        es.close();
        // Auto-reconnect after 3 seconds
        retryTimeout = setTimeout(connect, 3000);
      };
    }

    connect();

    return () => {
      es?.close();
      clearTimeout(retryTimeout);
    };
  }, []);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;

    setSending(true);
    setError(null);

    // Optimistic update — show message immediately in the UI
    const optimistic: Message = {
      id: `tmp-${Date.now()}`,
      text,
      from: "user",
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setInput("");

    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        setError(data.error ?? "Failed to send message");
        // Remove optimistic message on failure
        setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      } else {
        // Replace optimistic with confirmed message from server
        setMessages((prev) =>
          prev.map((m) => (m.id === optimistic.id ? data.message : m))
        );
      }
    } catch {
      setError("Network error — could not send message");
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  }, [input, sending]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-[#00B900] text-white px-4 py-3 flex items-center gap-3 shadow-md flex-shrink-0">
        <div className="w-9 h-9 bg-white rounded-full flex items-center justify-center flex-shrink-0">
          <svg viewBox="0 0 48 48" className="w-6 h-6" fill="none">
            <path
              d="M24 4C12.95 4 4 11.82 4 21.4c0 5.56 3.06 10.52 7.86 13.77l-1.97 7.34a.5.5 0 0 0 .72.57L18.7 38.4A22.3 22.3 0 0 0 24 38.8c11.05 0 20-7.82 20-17.4S35.05 4 24 4Z"
              fill="#00B900"
            />
          </svg>
        </div>
        <div className="flex-1">
          <h1 className="font-semibold text-base leading-tight">LINE Webchat</h1>
          <p className="text-xs text-green-100 leading-tight">
            Messages are sent to your LINE Official Account
          </p>
        </div>
        {/* Live connection indicator */}
        <div className="flex items-center gap-1.5">
          <span
            className={`w-2 h-2 rounded-full ${
              connected ? "bg-white" : "bg-green-300 animate-pulse"
            }`}
          />
          <span className="text-xs text-green-100 hidden sm:inline">
            {connected ? "Live" : "Connecting…"}
          </span>
        </div>
      </header>

      {/* Messages area */}
      <main className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 text-sm gap-2 select-none">
            <svg
              className="w-12 h-12 opacity-30"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
            <p className="font-medium">No messages yet</p>
            <p className="text-xs text-center max-w-xs">
              Type a message below to send it to your LINE Official Account.
              Replies will appear here automatically.
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {/* Error toast */}
        {error && (
          <div className="flex justify-center">
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-4 py-2 rounded-full shadow-sm">
              ⚠ {error}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </main>

      {/* Input area */}
      <footer className="bg-white border-t border-gray-200 px-4 py-3 flex items-end gap-3 flex-shrink-0">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message… (Enter to send, Shift+Enter for newline)"
          rows={1}
          className="flex-1 resize-none rounded-2xl border border-gray-300 px-4 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#00B900] focus:border-transparent max-h-32 overflow-y-auto leading-snug"
          style={{ minHeight: "42px" }}
          disabled={sending}
        />
        <button
          onClick={sendMessage}
          disabled={!input.trim() || sending}
          className="flex-shrink-0 w-10 h-10 rounded-full bg-[#00B900] hover:bg-[#009900] disabled:bg-gray-300 disabled:cursor-not-allowed text-white flex items-center justify-center transition-colors shadow-sm"
          aria-label="Send message"
        >
          {sending ? (
            <svg
              className="w-4 h-4 animate-spin"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v8H4z"
              />
            </svg>
          ) : (
            <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
            </svg>
          )}
        </button>
      </footer>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.from === "user";
  const time = new Date(message.timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} items-end gap-2`}>
      {/* LINE avatar (left side) */}
      {!isUser && (
        <div className="w-8 h-8 bg-[#00B900] rounded-full flex items-center justify-center flex-shrink-0">
          <svg viewBox="0 0 48 48" className="w-5 h-5" fill="none">
            <path
              d="M24 4C12.95 4 4 11.82 4 21.4c0 5.56 3.06 10.52 7.86 13.77l-1.97 7.34a.5.5 0 0 0 .72.57L18.7 38.4A22.3 22.3 0 0 0 24 38.8c11.05 0 20-7.82 20-17.4S35.05 4 24 4Z"
              fill="white"
            />
          </svg>
        </div>
      )}

      <div
        className={`flex flex-col ${isUser ? "items-end" : "items-start"} max-w-[75%]`}
      >
        {!isUser && message.senderName && (
          <span className="text-xs text-gray-500 mb-1 px-1">
            {message.senderName}
          </span>
        )}
        <div
          className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed break-words shadow-sm ${
            isUser
              ? "bg-[#00B900] text-white rounded-br-md"
              : "bg-white text-gray-800 rounded-bl-md border border-gray-100"
          }`}
        >
          {message.text}
        </div>
        <span className="text-[10px] text-gray-400 mt-1 px-1">{time}</span>
      </div>
    </div>
  );
}

