import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vinext inspects multipart API requests before dispatching route handlers.
  // Allow the 32MB attachment total plus text and multipart metadata.
  experimental: { serverActions: { bodySizeLimit: "34mb" } },
};

export default nextConfig;
