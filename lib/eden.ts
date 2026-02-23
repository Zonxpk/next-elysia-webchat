import { treaty } from "@elysiajs/eden";
import type { app } from "@/app/api/[[...slugs]]/route";

/**
 * Type-safe API client using Eden Treaty.
 * On the server, calls are made to the configured base URL.
 * On the client, calls are made to the same origin.
 */
function getBaseUrl(): string {
  if (typeof window !== "undefined") {
    // Browser: use current origin
    return window.location.origin;
  }
  // Server: use NEXT_PUBLIC_BASE_URL or default
  return process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
}

export const api = treaty<typeof app>(getBaseUrl());
