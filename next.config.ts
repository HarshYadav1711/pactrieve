import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Keep PDF.js / Mammoth on the Node runtime rather than bundling them into the
  // route graph — pdfjs-dist otherwise fails to open valid PDFs under next start.
  serverExternalPackages: ["pdfjs-dist", "mammoth"]
};

export default nextConfig;
