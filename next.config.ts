import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the project root (a stray lockfile in a parent folder otherwise
  // makes Next.js guess the wrong workspace root).
  outputFileTracingRoot: __dirname,
  turbopack: { root: __dirname },
  // Type and lint errors fail the build (they were previously ignored).
  experimental: {
    serverActions: {
      // Uploads go through /api/files, so server actions only carry small
      // JSON payloads (rename, share, delete, search).
      bodySizeLimit: "1mb",
    },
  },
  images: {
    remotePatterns: [
      {
        // Default avatar for new users (constants/index.ts)
        protocol: "https",
        hostname: "img.freepik.com",
      },
    ],
  },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
