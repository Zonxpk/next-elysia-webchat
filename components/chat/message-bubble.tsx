"use client";

import { useState } from "react";
import type { Message } from "@/lib/store";
import { getProfileImageCandidates } from "@/lib/chat-utils";

export function MessageBubble({
  message,
  fallbackPictureUrl,
}: {
  message: Message;
  fallbackPictureUrl?: string;
}) {
  const isUser = message.from === "user";
  const time = new Date(message.timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  const imageCandidates = getProfileImageCandidates(message.pictureUrl, fallbackPictureUrl);
  const imageSourceKey = [message.id, message.pictureUrl ?? "", fallbackPictureUrl ?? ""].join("|");
  const [imageState, setImageState] = useState({ key: imageSourceKey, index: 0 });
  const imageCandidateIndex = imageState.key === imageSourceKey ? imageState.index : 0;
  const imageUrl = imageCandidates[imageCandidateIndex];

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} items-end gap-2`}>
      {!isUser && (
        <div className="flex-shrink-0">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={message.senderName ?? ""}
              width={32}
              height={32}
              className="w-8 h-8 rounded-full object-cover"
              onError={() => setImageState({ key: imageSourceKey, index: imageCandidateIndex + 1 })}
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
