"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { Message } from "@/lib/store";

interface UserInfo {
  userId: string;
  displayName: string;
  pictureUrl: string;
}

// ─── Sidebar ────────────────────────────────────────────────────────────────

function UserAvatar({
  user,
  size = 40,
}: {
  user: UserInfo;
  size?: number;
}) {
  const [imgError, setImgError] = useState(false);
  if (user.pictureUrl && !imgError) {
    return (
      <img
        src={user.pictureUrl}
        alt={user.displayName}
        width={size}
        height={size}
        className="rounded-full object-cover flex-shrink-0"
        style={{ width: size, height: size }}
        onError={() => setImgError(true)}
      />
    );
  }
  return (
    <div
      className="rounded-full bg-[#00B900] flex items-center justify-center flex-shrink-0 text-white font-semibold"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {user.displayName.charAt(0).toUpperCase()}
    </div>
  );
}

function Sidebar({
  users,
  selectedUserId,
  onSelect,
}: {
  users: UserInfo[];
  selectedUserId: string | null;
  onSelect: (userId: string) => void;
}) {
  return (
    <aside className="w-[280px] flex-shrink-0 bg-white border-r border-gray-200 flex flex-col">
      {/* Sidebar header */}
      <div className="px-4 py-3 bg-[#00B900] text-white flex items-center gap-2 flex-shrink-0">
        <svg viewBox="0 0 48 48" className="w-6 h-6 flex-shrink-0" fill="none">
          <path
            d="M24 4C12.95 4 4 11.82 4 21.4c0 5.56 3.06 10.52 7.86 13.77l-1.97 7.34a.5.5 0 0 0 .72.57L18.7 38.4A22.3 22.3 0 0 0 24 38.8c11.05 0 20-7.82 20-17.4S35.05 4 24 4Z"
            fill="white"
          />
        </svg>
        <span className="font-semibold text-sm">LINE Webchat</span>
      </div>

      {/* User list */}
      <div className="flex-1 overflow-y-auto">
        {users.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 text-xs gap-2 px-4 py-8 text-center select-none">
            <svg className="w-10 h-10 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <p>No users yet.<br />Waiting for LINE messages…</p>
          </div>
        ) : (
          users.map((user) => (
            <button
              key={user.userId}
              onClick={() => onSelect(user.userId)}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 border-b border-gray-100 ${
                selectedUserId === user.userId ? "bg-green-50 border-l-4 border-l-[#00B900]" : ""
              }`}
            >
              <UserAvatar user={user} size={40} />
              <span className="text-sm font-medium text-gray-800 truncate">
                {user.displayName}
              </span>
            </button>
          ))
        )}
      </div>
    </aside>
  );
}

// ─── Message bubble ──────────────────────────────────────────────────────────

function MessageBubble({
  message,
  senderUser,
}: {
  message: Message;
  senderUser?: UserInfo;
}) {
  const isUser = message.from === "user";
  const time = new Date(message.timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  const [imgError, setImgError] = useState(false);

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} items-end gap-2`}>
      {/* Avatar (left side for LINE messages) */}
      {!isUser && (
        <div className="flex-shrink-0">
          {message.pictureUrl && !imgError ? (
            <img
              src={message.pictureUrl}
              alt={message.senderName ?? ""}
              width={32}
              height={32}
              className="w-8 h-8 rounded-full object-cover"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-[#00B900] flex items-center justify-center text-white text-xs font-semibold">
              {(message.senderName ?? "L").charAt(0).toUpperCase()}
            </div>
          )}
        </div>
      )}

      <div className={`flex flex-col ${isUser ? "items-end" : "items-start"} max-w-[75%]`}>
        {!isUser && message.senderName && (
          <span className="text-xs text-gray-500 mb-1 px-1">{message.senderName}</span>
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

// ─── Chat panel ──────────────────────────────────────────────────────────────

function ChatPanel({
  selectedUser,
  onUsersChanged,
}: {
  selectedUser: UserInfo | null;
  onUsersChanged: () => void;
}) {
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

  // Load messages + set up SSE when selected user changes
  useEffect(() => {
    if (!selectedUser) {
      setMessages([]);
      return;
    }
    const { userId } = selectedUser;

    // Fetch message history
    fetch(`/api/messages?userId=${encodeURIComponent(userId)}`)
      .then((r) => r.json())
      .then((data: Message[]) => setMessages(Array.isArray(data) ? data : []))
      .catch(() => {});

    // Connect SSE for this user's room
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
          setMessages((prev) => [...prev, msg]);
          // Refresh user list so new users appear in sidebar
          onUsersChanged();
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUser?.userId]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || sending || !selectedUser) return;

    setSending(true);
    setError(null);

    const optimistic: Message = {
      id: `tmp-${Date.now()}`,
      text,
      from: "user",
      userId: selectedUser.userId,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setInput("");

    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, userId: selectedUser.userId }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        setError(data.error ?? "Failed to send message");
        setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      } else {
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
  }, [input, sending, selectedUser]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (!selectedUser) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-gray-50 text-gray-400 select-none gap-3">
        <svg className="w-16 h-16 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        <p className="text-sm font-medium">Select a conversation</p>
        <p className="text-xs text-center max-w-xs">Choose a user from the left sidebar to start chatting.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Chat header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 flex-shrink-0 shadow-sm">
        <UserAvatar user={selectedUser} size={36} />
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-sm text-gray-800 truncate">{selectedUser.displayName}</h2>
          <p className="text-xs text-gray-400 truncate">{selectedUser.userId}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${connected ? "bg-green-500" : "bg-gray-300 animate-pulse"}`} />
          <span className="text-xs text-gray-400 hidden sm:inline">
            {connected ? "Live" : "Connecting…"}
          </span>
        </div>
      </header>

      {/* Messages */}
      <main className="flex-1 overflow-y-auto px-4 py-4 space-y-2 bg-gray-50">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 text-sm gap-2 select-none">
            <svg className="w-12 h-12 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <p className="font-medium">No messages yet</p>
            <p className="text-xs text-center max-w-xs">
              Send a message below, or wait for a reply from LINE.
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} senderUser={selectedUser} />
        ))}

        {error && (
          <div className="flex justify-center">
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-4 py-2 rounded-full shadow-sm">
              ⚠ {error}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </main>

      {/* Input */}
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
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
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

// ─── Page root ───────────────────────────────────────────────────────────────

export default function ChatPage() {
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/users");
      const data = await res.json();
      if (Array.isArray(data)) {
        setUsers(data as UserInfo[]);
      }
    } catch {
      // ignore
    }
  }, []);

  // Load users on mount, then refresh every 10 s for new arrivals
  useEffect(() => {
    fetchUsers();
    const interval = setInterval(fetchUsers, 10_000);
    return () => clearInterval(interval);
  }, [fetchUsers]);

  const selectedUser = users.find((u) => u.userId === selectedUserId) ?? null;

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      <Sidebar
        users={users}
        selectedUserId={selectedUserId}
        onSelect={setSelectedUserId}
      />
      <ChatPanel
        selectedUser={selectedUser}
        onUsersChanged={fetchUsers}
      />
    </div>
  );
}

