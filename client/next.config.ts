import type { NextConfig } from "next";

const API_TARGET =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/api$/, "") ||
  "http://localhost:8005";

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${API_TARGET}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
