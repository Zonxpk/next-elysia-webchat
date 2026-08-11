import type { Message } from "@/lib/store";
import { api } from "@/lib/eden";

export interface UserInfo {
  userId: string;
  displayName: string;
  pictureUrl: string;
  unreadCount?: number;
  lastMessage?: string;
  lastMessageAt?: number;
}

export async function fetchUsers(): Promise<UserInfo[]> {
  const { data, error } = await api.users.get();
  if (error) {
    throw new Error("Failed to fetch users");
  }
  return Array.isArray(data) ? (data as UserInfo[]) : [];
}

export async function markUserRead(userId: string): Promise<void> {
  const { data, error } = await api.read.post({ userId });
  if (error || !data?.ok) {
    throw new Error("Failed to mark conversation as read");
  }
}

export async function fetchMessages(userId: string): Promise<Message[]> {
  const { data, error } = await api.messages.get({
    query: { userId },
  });
  if (error) {
    throw new Error("Failed to fetch messages");
  }
  return Array.isArray(data) ? (data as Message[]) : [];
}
