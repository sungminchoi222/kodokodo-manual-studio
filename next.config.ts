import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 미디어는 private bucket + 서버 발급 signed URL로만 제공하므로 원격 이미지 최적화는 사용하지 않는다.
  images: { unoptimized: true },
};

export default nextConfig;
