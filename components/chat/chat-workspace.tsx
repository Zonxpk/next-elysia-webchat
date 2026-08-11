"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Message } from "@/lib/store";
import { fetchUsers, markUserRead, type UserInfo } from "@/lib/chat-api";
import { clearUnreadCountOverride, formatMessagePreview, isIncomingMessage } from "@/lib/chat-utils";
import { ChatPanel } from "@/components/chat/chat-panel";
import { ChatSidebar } from "@/components/chat/chat-sidebar";

export function ChatWorkspace() {
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: fetchUsers,
    refetchInterval: 10_000,
  });
  const queryClient = useQueryClient();
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const selectedUserIdRef = useRef<string | null>(selectedUserId);
  const usersRef = useRef(users);

  const syncReadState = useCallback((userId: string) => {
    void (async () => {
      try {
        await markUserRead(userId);
      } catch {
        // The server count remains authoritative if marking read fails.
      }

      try {
        await queryClient.invalidateQueries({ queryKey: ["users"] });
      } catch {
        // Keep the current count if the refresh fails.
      }

      setUnreadCounts((prev) =>
        prev[userId] !== 0 ? prev : clearUnreadCountOverride(prev, userId),
      );
    })();
  }, [queryClient]);

  useEffect(() => {
    usersRef.current = users;
  }, [users]);

  useEffect(() => {
    selectedUserIdRef.current = selectedUserId;
  }, [selectedUserId]);

  useEffect(() => {
    const eventSource = new EventSource("/api/events");

    eventSource.onmessage = (event) => {
      try {
        const message: Message = JSON.parse(event.data);
        if (!isIncomingMessage(message)) return;

        const isSelectedUser = message.userId === selectedUserIdRef.current;
        if (isSelectedUser) syncReadState(message.userId);

        queryClient.setQueryData<UserInfo[]>(["users"], (currentUsers) =>
          currentUsers?.map((user) =>
            user.userId === message.userId
              ? {
                  ...user,
                  lastMessage: formatMessagePreview(message.text),
                  lastMessageAt: message.timestamp,
                }
              : user,
          ),
        );
        queryClient.invalidateQueries({ queryKey: ["users"] });

        setUnreadCounts((prev) => {
          if (isSelectedUser) return prev[message.userId] === 0 ? prev : { ...prev, [message.userId]: 0 };

          const serverUser = usersRef.current.find((user) => user.userId === message.userId);
          const serverUnreadCount = serverUser?.unreadCount ?? 0;
          const serverIncludesMessage = serverUser?.lastMessageAt !== undefined
            && serverUser.lastMessageAt >= message.timestamp;
          const nextUnreadCount = serverIncludesMessage
            ? serverUnreadCount
            : (prev[message.userId] ?? serverUnreadCount) + 1;

          return { ...prev, [message.userId]: nextUnreadCount };
        });
      } catch {
        // Ignore SSE comments and malformed events.
      }
    };

    return () => eventSource.close();
  }, [queryClient, syncReadState]);

  const handleSelectUser = useCallback((userId: string) => {
    selectedUserIdRef.current = userId;
    setSelectedUserId(userId);
    setUnreadCounts((prev) =>
      prev[userId] === 0 ? prev : { ...prev, [userId]: 0 },
    );
    syncReadState(userId);
  }, [syncReadState]);

  const selectedUser = useMemo(
    () => users.find((user) => user.userId === selectedUserId) ?? null,
    [selectedUserId, users],
  );

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      <ChatSidebar
        users={users}
        selectedUserId={selectedUserId}
        onSelect={handleSelectUser}
        unreadCounts={unreadCounts}
      />
      <ChatPanel key={selectedUserId ?? "empty"} selectedUser={selectedUser} />
    </div>
  );
}
