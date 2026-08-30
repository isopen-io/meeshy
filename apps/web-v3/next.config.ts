import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  assetPrefix: '/__v3',
  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;
