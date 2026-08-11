"use client";

import type { UserInfo } from "@/lib/chat-api";
import { getSidebarUnreadCount } from "@/lib/chat-utils";
import { UserAvatar } from "@/components/chat/user-avatar";

export function ChatSidebar({
  users,
  selectedUserId,
  onSelect,
  unreadCounts,
}: {
  users: UserInfo[];
  selectedUserId: string | null;
  onSelect: (userId: string) => void;
  unreadCounts: Record<string, number>;
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
          users.map((user) => {
            const unreadCount = getSidebarUnreadCount(
              user.unreadCount,
              unreadCounts,
              user.userId,
            );

            return (
              <button
                key={user.userId}
                onClick={() => onSelect(user.userId)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left cursor-pointer transition-colors hover:bg-gray-50 border-b border-gray-100 ${
                  selectedUserId === user.userId ? "bg-green-50 border-l-4 border-l-[#00B900]" : ""
                }`}
              >
                <UserAvatar user={user} size={40} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-800 truncate">
                      {user.displayName}
                    </span>
                  </div>
                  {user.lastMessage && (
                    <p
                      className={"text-xs truncate mt-0.5 " + (unreadCount > 0 ? "text-gray-700 font-medium" : "text-gray-400")}
                    >
                      {user.lastMessage}
                    </p>
                  )}
                </div>
                {unreadCount > 0 && (
                  <span
                    className="w-5 min-w-5 h-5 px-1 rounded-full bg-[#00B900] text-white text-[10px] font-bold leading-none flex items-center justify-center flex-shrink-0 self-center"
                    aria-label={unreadCount + " unread message" + (unreadCount === 1 ? "" : "s")}
                  >
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
