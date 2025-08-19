eimport type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // その他の設定オプション
  images: {
    unoptimized: true,
  },
    eslint: {
    ignoreDuringBuilds: true,
  },

};

export default nextConfig;
