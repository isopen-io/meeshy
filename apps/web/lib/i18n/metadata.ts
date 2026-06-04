import type { Metadata } from 'next';
import enMetadata from '@/locales/en/metadata.json';
import frMetadata from '@/locales/fr/metadata.json';
import esMetadata from '@/locales/es/metadata.json';
import ptMetadata from '@/locales/pt/metadata.json';
import {
  DEFAULT_INTERFACE_LOCALE,
  interpolate,
  ogLocale,
  type InterfaceLocale,
} from './locale-config';

/**
 * Localized metadata bundles. Each `locales/{lang}/metadata.json` shares the
 * exact same key shape, so the structural type below holds for all of them.
 * Languages without a bundle (de, it) reuse the English copy while still
 * getting their own `og:locale` value via {@link ogLocale}.
 *
 * This module is intentionally pure (no `server-only` / `next/headers` at load
 * time) so the builders below can be unit-tested. The only request-scoped piece
 * — {@link buildPageMetadata} — lazily imports the server locale resolver.
 */
type MetadataStringTree = string | string[] | { [key: string]: string };
type MetadataPage = { [key: string]: MetadataStringTree };
type MetadataBundle = {
  siteName: string;
  skipToContent: string;
  pages: { [pageKey: string]: MetadataPage };
};

const BUNDLES: Record<string, MetadataBundle> = {
  en: enMetadata,
  fr: frMetadata,
  es: esMetadata,
  pt: ptMetadata,
};

const SITE_NAME = 'Meeshy';
const TWITTER_CREATOR = '@meeshy_app';

export function getMetadataBundle(locale: string): MetadataBundle {
  return BUNDLES[locale] ?? BUNDLES[DEFAULT_INTERFACE_LOCALE];
}

export function getMetadataPage(locale: string, pageKey: string): MetadataPage {
  const bundle = getMetadataBundle(locale);
  return bundle.pages[pageKey] ?? bundle.pages.home;
}

/** Reads a string field from a metadata page entry, with an optional fallback. */
export function pageString(page: MetadataPage, key: string, fallback = ''): string {
  const value = page[key];
  return typeof value === 'string' ? value : fallback;
}

/** Reads a nested `{ key: string }` map (e.g. join conversation types). */
export function pageMap(page: MetadataPage, key: string): Record<string, string> {
  const value = page[key];
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

/** Reads a string-array field (e.g. SEO keywords). */
export function pageArray(page: MetadataPage, key: string): string[] {
  const value = page[key];
  return Array.isArray(value) ? value : [];
}

export interface ComposeMetadataArgs {
  locale: InterfaceLocale | string;
  title: string;
  description: string;
  ogTitle?: string;
  ogDescription?: string;
  url?: string;
  image?: string;
  imageAlt?: string;
  type?: 'website' | 'article' | 'profile';
  canonical?: string;
  keywords?: string[];
}

/**
 * Pure builder for a coherent {@link Metadata} object: a single `og:locale`
 * matching the active interface locale, plus consistent Open Graph + Twitter
 * cards.
 */
export function composeMetadata(args: ComposeMetadataArgs): Metadata {
  const ogTitle = args.ogTitle ?? args.title;
  const ogDescription = args.ogDescription ?? args.description;
  const images = args.image
    ? [{ url: args.image, width: 1200, height: 630, alt: args.imageAlt ?? ogTitle }]
    : undefined;

  return {
    title: args.title,
    description: args.description,
    ...(args.keywords && args.keywords.length > 0 ? { keywords: args.keywords } : {}),
    openGraph: {
      type: args.type ?? 'website',
      locale: ogLocale(args.locale),
      siteName: SITE_NAME,
      title: ogTitle,
      description: ogDescription,
      ...(args.url ? { url: args.url } : {}),
      ...(images ? { images } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: ogTitle,
      description: ogDescription,
      creator: TWITTER_CREATOR,
      ...(args.image ? { images: [args.image] } : {}),
    },
    ...(args.canonical ? { alternates: { canonical: args.canonical } } : {}),
  };
}

export interface PageMetadataOptions {
  url?: string;
  image?: string;
  canonical?: string;
  type?: 'website' | 'article' | 'profile';
}

/**
 * Pure helper: builds metadata for a static page from its bundle entry.
 * Titles, descriptions and image alts come from the localized JSON; URLs and
 * image paths (non-translatable) are supplied by the caller.
 */
export function composePageMetadata(
  pageKey: string,
  locale: InterfaceLocale | string,
  options: PageMetadataOptions = {},
): Metadata {
  const page = getMetadataPage(locale, pageKey);

  return composeMetadata({
    locale,
    title: pageString(page, 'title'),
    description: pageString(page, 'description'),
    ogTitle: pageString(page, 'ogTitle') || undefined,
    ogDescription: pageString(page, 'ogDescription') || undefined,
    imageAlt: pageString(page, 'ogImageAlt') || undefined,
    keywords: pageArray(page, 'keywords'),
    ...options,
  });
}

/**
 * Async wrapper that resolves the request locale (cookie → Accept-Language →
 * default) before building metadata for a static page. The server locale
 * resolver is imported lazily so this module stays import-safe in unit tests.
 */
export async function buildPageMetadata(
  pageKey: string,
  options: PageMetadataOptions = {},
): Promise<Metadata> {
  const { getServerLocale } = await import('./server-locale');
  const locale = await getServerLocale();
  return composePageMetadata(pageKey, locale, options);
}

export { interpolate };
