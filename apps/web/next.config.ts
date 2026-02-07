import type { NextConfig } from "next";
// Plugin next-intl désactivé pour éviter les redirections d'URL
// L'internationalisation est gérée côté client via le LanguageContext
// import createNextIntlPlugin from 'next-intl/plugin';

// const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

// Bundle Analyzer - activé uniquement avec ANALYZE=true
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  // Configuration Docker - standalone pour optimiser la taille de l'image
  output: 'standalone',

  // Note: URLs are derived dynamically at runtime from window.location in lib/config.ts
  // No publicRuntimeConfig needed - lib/config.ts handles all URL derivation

  poweredByHeader: false,
  
  // Optimisations de performance
  experimental: {
    optimizePackageImports: ['lucide-react', '@radix-ui/react-icons'],
  },
  
  // Configuration Turbopack (stable depuis Next.js 15)
  turbopack: {
    rules: {
      '*.svg': {
        loaders: ['@svgr/webpack'],
        as: '*.js',
      },
    },
  },
  
  // Optimisation des bundles
  modularizeImports: {
    'lucide-react': {
      transform: 'lucide-react/dist/esm/icons/{{kebabCase member}}',
      skipDefaultConversion: true,
    },
  },
  
  
  // Configuration des images
  images: {
    domains: ['localhost', 'meeshy.me', 'gate.meeshy.me', 'ml.meeshy.me'],
    unoptimized: true,
    formats: ['image/webp', 'image/avif'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
  
  // Note: No rewrites for /api - Next.js uses /api for BFF routes
  // Backend access via domain: gate.{domain} (e.g., gate.meeshy.local)
  // Backend access via IP: http://{ip}:3000 directly

  // Headers pour PWA et Service Workers
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, must-revalidate',
          },
          {
            key: 'Service-Worker-Allowed',
            value: '/',
          },
        ],
      },
      {
        source: '/firebase-messaging-sw.js',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, must-revalidate',
          },
          {
            key: 'Service-Worker-Allowed',
            value: '/',
          },
        ],
      },
      {
        source: '/chunk-recovery.js',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, must-revalidate',
          },
        ],
      },
      {
        source: '/manifest.json',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=604800, immutable',
          },
          {
            key: 'Content-Type',
            value: 'application/manifest+json',
          },
        ],
      },
    ];
  },
  
  
  // Note: No env section needed - lib/config.ts derives URLs dynamically from window.location

  // Configuration WebPack pour Docker
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }

    // Exclure dompurify du bundle serveur (client-only)
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push('dompurify');
    }

    return config;
  },
};

export default withBundleAnalyzer(nextConfig);
