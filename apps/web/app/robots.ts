import type { MetadataRoute } from 'next';

/**
 * Same base-URL resolution as `sitemap.ts` — server-only, reads the env var
 * directly rather than `getFrontendUrl()`.
 */
const BASE_URL = process.env.NEXT_PUBLIC_FRONTEND_URL || 'https://meeshy.me';

/**
 * Auth-gated or app-shell surfaces: none of these render meaningful content
 * for a signed-out crawler, several redirect to `/login` or `/signup`, and
 * indexing them would waste crawl budget on pages Google can't actually read.
 * Kept as a disallow-list (not an allow-list) so a new public marketing page
 * stays crawlable by default — mirrors the per-route `robots: { index: false
 * }` already set on `feed`, `story`, `reel`, `hashtag`, `l` layouts.
 */
const DISALLOWED_PATHS = [
  '/api/',
  '/admin',
  '/dashboard',
  '/account',
  '/auth/',
  '/auth-status',
  '/settings',
  '/notifications',
  '/conversation',
  '/conversations',
  '/chat',
  '/call',
  '/feed',
  '/feeds',
  '/groups',
  '/contacts',
  '/search',
  '/mood',
  '/story',
  '/reel',
  '/post',
  '/hashtag',
  '/l/',
  '/links',
  '/u',
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: DISALLOWED_PATHS,
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
