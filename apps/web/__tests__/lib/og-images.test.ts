/**
 * Tests for lib/og-images.ts
 */

import {
  OG_IMAGE_CONFIG,
  getOgImageUrl,
  getOgImageConfig,
  getOgImageTypeFromContext,
  buildOgMetadata,
} from '@/lib/og-images';

// ─── OG_IMAGE_CONFIG ──────────────────────────────────────────────────────────

describe('OG_IMAGE_CONFIG', () => {
  it('has default, signin, and affiliate entries', () => {
    expect(OG_IMAGE_CONFIG.default).toBeDefined();
    expect(OG_IMAGE_CONFIG.signin).toBeDefined();
    expect(OG_IMAGE_CONFIG.affiliate).toBeDefined();
  });

  it('all entries have width 1200 and height 630', () => {
    (['default', 'signin', 'affiliate'] as const).forEach((key) => {
      expect(OG_IMAGE_CONFIG[key].width).toBe(1200);
      expect(OG_IMAGE_CONFIG[key].height).toBe(630);
    });
  });

  it('each entry has a path and alt', () => {
    (['default', 'signin', 'affiliate'] as const).forEach((key) => {
      expect(OG_IMAGE_CONFIG[key].path).toMatch(/^\//);
      expect(OG_IMAGE_CONFIG[key].alt.length).toBeGreaterThan(0);
    });
  });
});

// ─── getOgImageUrl ────────────────────────────────────────────────────────────

describe('getOgImageUrl', () => {
  it('returns default image URL when called with no arguments', () => {
    const url = getOgImageUrl();
    expect(url).toContain(OG_IMAGE_CONFIG.default.path);
  });

  it('returns signin image URL for signin type', () => {
    const url = getOgImageUrl('signin', 'https://test.meeshy.me');
    expect(url).toBe('https://test.meeshy.me' + OG_IMAGE_CONFIG.signin.path);
  });

  it('returns affiliate image URL for affiliate type', () => {
    const url = getOgImageUrl('affiliate', 'https://test.meeshy.me');
    expect(url).toBe('https://test.meeshy.me' + OG_IMAGE_CONFIG.affiliate.path);
  });

  it('uses provided frontendUrl over environment variable', () => {
    const url = getOgImageUrl('default', 'https://custom.example.com');
    expect(url).toContain('https://custom.example.com');
  });

  it('falls back to meeshy.me when no env var and no frontendUrl', () => {
    const saved = process.env.NEXT_PUBLIC_FRONTEND_URL;
    delete process.env.NEXT_PUBLIC_FRONTEND_URL;
    const url = getOgImageUrl('default');
    expect(url).toContain('meeshy.me');
    process.env.NEXT_PUBLIC_FRONTEND_URL = saved;
  });

  it('uses NEXT_PUBLIC_FRONTEND_URL when no frontendUrl provided', () => {
    const saved = process.env.NEXT_PUBLIC_FRONTEND_URL;
    process.env.NEXT_PUBLIC_FRONTEND_URL = 'https://env.meeshy.me';
    const url = getOgImageUrl('default');
    expect(url).toContain('https://env.meeshy.me');
    process.env.NEXT_PUBLIC_FRONTEND_URL = saved;
  });
});

// ─── getOgImageConfig ─────────────────────────────────────────────────────────

describe('getOgImageConfig', () => {
  it('returns config with url, width, height, alt', () => {
    const config = getOgImageConfig('default', 'https://test.meeshy.me');
    expect(config).toHaveProperty('url');
    expect(config).toHaveProperty('width', 1200);
    expect(config).toHaveProperty('height', 630);
    expect(config).toHaveProperty('alt');
  });

  it('url includes the correct path for signin', () => {
    const config = getOgImageConfig('signin', 'https://x.com');
    expect(config.url).toBe('https://x.com' + OG_IMAGE_CONFIG.signin.path);
  });

  it('defaults to "default" type when no type given', () => {
    const config = getOgImageConfig(undefined, 'https://x.com');
    expect(config.url).toContain(OG_IMAGE_CONFIG.default.path);
  });
});

// ─── getOgImageTypeFromContext ────────────────────────────────────────────────

describe('getOgImageTypeFromContext', () => {
  it('returns "default" for root path with no params', () => {
    expect(getOgImageTypeFromContext('/')).toBe('default');
  });

  it('returns "signin" for /signup path', () => {
    expect(getOgImageTypeFromContext('/signup')).toBe('signin');
  });

  it('returns "signin" for /join path', () => {
    expect(getOgImageTypeFromContext('/join')).toBe('signin');
  });

  it('returns "affiliate" for /affiliate path', () => {
    expect(getOgImageTypeFromContext('/signup/affiliate/abc123')).toBe('affiliate');
  });

  it('returns "affiliate" when affiliate query param is present (URLSearchParams)', () => {
    const params = new URLSearchParams('affiliate=sponsor123');
    expect(getOgImageTypeFromContext('/signup', params)).toBe('affiliate');
  });

  it('returns "affiliate" when affiliate key in plain object searchParams', () => {
    expect(getOgImageTypeFromContext('/signup', { affiliate: 'sponsor123' })).toBe('affiliate');
  });

  it('returns "signin" for /signup with non-affiliate params', () => {
    const params = new URLSearchParams('ref=google');
    expect(getOgImageTypeFromContext('/signup', params)).toBe('signin');
  });

  it('returns "default" for dashboard page', () => {
    expect(getOgImageTypeFromContext('/conversations/123')).toBe('default');
  });
});

// ─── buildOgMetadata ──────────────────────────────────────────────────────────

describe('buildOgMetadata', () => {
  it('returns object with images array', () => {
    const meta = buildOgMetadata('default', { frontendUrl: 'https://test.me' });
    expect(Array.isArray(meta.images)).toBe(true);
    expect(meta.images).toHaveLength(1);
  });

  it('image entry has url, width, height, alt', () => {
    const meta = buildOgMetadata('default', { frontendUrl: 'https://test.me' });
    const img = meta.images[0];
    expect(img).toHaveProperty('url');
    expect(img).toHaveProperty('width', 1200);
    expect(img).toHaveProperty('height', 630);
    expect(img).toHaveProperty('alt');
  });

  it('includes title when provided', () => {
    const meta = buildOgMetadata('default', { title: 'Hello Meeshy', frontendUrl: 'https://x.me' });
    expect(meta.title).toBe('Hello Meeshy');
  });

  it('excludes title when not provided', () => {
    const meta = buildOgMetadata('default', { frontendUrl: 'https://x.me' });
    expect(meta).not.toHaveProperty('title');
  });

  it('includes description when provided', () => {
    const meta = buildOgMetadata('signin', { description: 'Sign up now', frontendUrl: 'https://x.me' });
    expect(meta.description).toBe('Sign up now');
  });

  it('always sets siteName to Meeshy', () => {
    const meta = buildOgMetadata('default', { frontendUrl: 'https://x.me' });
    expect(meta.siteName).toBe('Meeshy');
  });

  it('always sets locale to fr_FR', () => {
    const meta = buildOgMetadata('default', { frontendUrl: 'https://x.me' });
    expect(meta.locale).toBe('fr_FR');
  });

  it('always sets type to website', () => {
    const meta = buildOgMetadata('default', { frontendUrl: 'https://x.me' });
    expect(meta.type).toBe('website');
  });
});
