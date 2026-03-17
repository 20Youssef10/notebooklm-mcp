import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Needed to use playwright-core in Next.js functions
  serverExternalPackages: ["playwright-core"],
};

export default nextConfig;
