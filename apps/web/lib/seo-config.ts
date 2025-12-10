import { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Configuration SEO et performance
  experimental: {
    optimizeCss: true,
    optimizeServerReact: true,
  },

  // Compression et optimisation des images
  images: {
    formats: ['image/webp', 'image/avif'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 60 * 60 * 24 * 365, // 1 an
    dangerouslyAllowSVG: true,
    contentDispositionType: 'attachment',
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },

  // Configuration des headers pour le SEO et la sécurité
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // Sécurité
          {
            key: 'X-Frame-Options',
            value: 'DENY'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin'
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()'
          },
          // Performance
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          }
        ]
      },
      // Headers spécifiques pour les pages publiques (SEO)
      {
        source: '/(about|contact|partners|privacy|terms)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400'
          }
        ]
      },
      // Headers pour les assets statiques
      {
        source: '/images/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable'
          }
        ]
      }
    ];
  },

  // Redirections SEO
  async redirects() {
    return [
      // Redirection des anciennes URLs si nécessaire
      {
        source: '/home',
        destination: '/',
        permanent: true,
      },
      // Redirection des URLs avec trailing slash
      {
        source: '/(.*)/+',
        destination: '/$1',
        permanent: true,
      }
    ];
  },

  // Configuration PWA et manifest
  webpack: (config) => {
    // Optimisations webpack pour le SEO
    config.optimization = {
      ...config.optimization,
      sideEffects: false,
    };
    return config;
  },

  // Configuration de la compilation
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },

  // Configuration des variables d'environnement publiques
  env: {
    CUSTOM_KEY: process.env.CUSTOM_KEY,
  },

  // Configuration du transpile
  transpilePackages: [],

  // Configuration de l'output pour le déploiement
  output: 'standalone',
  
  // Configuration ESLint
  eslint: {
    dirs: ['app', 'components', 'hooks', 'lib', 'utils'],
  },

  // Configuration TypeScript
  typescript: {
    ignoreBuildErrors: false,
  },

  // Configuration de l'internationalisation
  async rewrites() {
    return [
      // Réécriture pour les langues supportées
      {
        source: '/en/:path*',
        destination: '/:path*',
      },
      {
        source: '/pt/:path*',
        destination: '/:path*',
      }
    ];
  }
};

module.exports = nextConfig;
