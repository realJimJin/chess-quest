import type { NextConfig } from "next";

// BUILD_TARGET=ios produces a static site for the native iOS shell.
const ios = process.env.BUILD_TARGET === "ios";

const nextConfig: NextConfig = {
  ...(ios ? { output: "export" as const, trailingSlash: true, images: { unoptimized: true } } : {}),
  /* config options here */
  reactCompiler: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
