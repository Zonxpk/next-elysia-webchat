import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Enable response body streaming for SSE (Server-Sent Events)
  experimental: {},
  // Vercel recommends these headers for SSE endpoints
  async headers() {
    return [
      {
        source: "/api/events",
        headers: [
          { key: "X-Accel-Buffering", value: "no" },
          { key: "Cache-Control", value: "no-cache, no-transform" },
        ],
      },
    ];
  },
};

export default nextConfig;
