import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // その他の設定オプション
  images: {
    unoptimized: true,
  },
  // Vercelのサーバーレス環境にファイルを含めるための設定
  experimental: {
    outputFileTracingIncludes: {
      '/api/generate-report': ['./symbols/**/*'],
    },
  },
};

export default nextConfig;