"use client";

import { useState } from "react";
import type { UserInfo } from "@/lib/chat-api";

export function UserAvatar({
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
