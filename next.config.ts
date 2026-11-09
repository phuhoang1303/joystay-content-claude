import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native module: load from node_modules at runtime instead of bundling.
  serverExternalPackages: ["better-sqlite3"],
  webpack: (config, { dev }) => {
    if (dev) {
      // SQLite writes to .data/ must not trigger Fast Refresh (it would reload the page and drop form state).
      config.watchOptions = {
        ...config.watchOptions,
        ignored: ["**/node_modules/**", "**/.git/**", "**/.data/**"],
      };
    }
    return config;
  },
};

export default nextConfig;
