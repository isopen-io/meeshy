import type { MetadataRoute } from 'next';

/**
 * Same base-URL resolution as `lib/og-images.ts` and the hardcoded canonical
 * links in `about|contact|partners|privacy|terms/layout.tsx`: this file runs
 * server-only (build/request time), never in the browser, so it reads the env
 * var directly instead of `getFrontendUrl()` (which branches on `window`).
 */
const BASE_URL = process.env.NEXT_PUBLIC_FRONTEND_URL || 'https://meeshy.me';

type StaticPageEntry = {
  path: string;
  changeFrequency: NonNullable<MetadataRoute.Sitemap[number]['changeFrequency']>;
  priority: number;
};

/**
 * Only pages that are genuinely public and indexable today. Auth-gated
 * surfaces (conversations, feed, profile, settings, …) are excluded here and
 * blocked in `robots.ts` — listing them would contradict the crawl directive.
 */
const STATIC_PAGES: StaticPageEntry[] = [
  { path: '/', changeFrequency: 'daily', priority: 1 },
  { path: '/about', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/partners', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/contact', changeFrequency: 'yearly', priority: 0.5 },
  { path: '/privacy', changeFrequency: 'yearly', priority: 0.3 },
  { path: '/terms', changeFrequency: 'yearly', priority: 0.3 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return STATIC_PAGES.map(({ path, changeFrequency, priority }) => ({
    url: `${BASE_URL}${path}`,
    lastModified,
    changeFrequency,
    priority,
  }));
}
