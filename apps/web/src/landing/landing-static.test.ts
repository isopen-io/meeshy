import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import { landingOgImagePath, OG_IMAGE_SIZE } from './landing-document';
import { LANDING_LANGUAGES, LANDING_SUBPATH_PATTERN, ROOT_LANDING_LANGUAGE, landingFiles, landingPath } from './landing-languages';

/**
 * CE QUE LE SERVEUR ET LES ROBOTS LISENT DE LA LANDING (#10002) — sitemap,
 * robots, nginx, manifeste : quatre fichiers de CONFIGURATION qui ne peuvent pas
 * importer la liste des langues, confrontés ici à elle.
 */
const read = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');
const SITEMAP = read('../../public/sitemap.xml');
const ROBOTS = read('../../public/robots.txt');
const NGINX = read('../../nginx.conf');
const VITE = read('../../vite.config.ts') + read('../../vite/pwa.ts');
const ORIGIN = 'https://meeshy.me';

describe('sitemap.xml', () => {
  test('chaque landing y figure, avec ses sept alternates et x-default', () => {
    const urls = [...SITEMAP.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => m[1] ?? '');
    for (const language of LANDING_LANGUAGES) {
      const entry = urls.find((url) => url.includes(`<loc>${ORIGIN}${landingPath(language)}</loc>`));
      expect(entry).toBeDefined();
      for (const code of LANDING_LANGUAGES) {
        expect(entry).toContain(`<xhtml:link rel="alternate" hreflang="${code}" href="${ORIGIN}${landingPath(code)}"/>`);
      }
      expect(entry).toContain(`<xhtml:link rel="alternate" hreflang="x-default" href="${ORIGIN}/"/>`);
    }
    expect(SITEMAP).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"');
  });
});

describe('robots.txt', () => {
  const groups = ROBOTS.split(/\n\s*\n/).filter((group) => /User-Agent:/i.test(group));
  const disallowed = (group: string): readonly string[] =>
    [...group.matchAll(/^Disallow: (\S+)$/gm)].map((m) => m[1] ?? '');

  test('la liste des conversations (/chats) est fermée à tous les robots qui indexent', () => {
    const indexing = groups.filter((group) => /User-Agent: \*/i.test(group));
    expect(indexing).toHaveLength(1);
    for (const group of indexing) expect(disallowed(group)).toContain('/chats');
  });

  test('aucune landing n’est fermée par un préfixe', () => {
    for (const group of groups) {
      for (const language of LANDING_LANGUAGES) {
        const path = landingPath(language);
        expect(disallowed(group).filter((rule) => path.startsWith(rule))).toEqual([]);
      }
    }
  });
});

describe('nginx.conf', () => {
  test('la racine sert la landing prérendue, la coquille seulement en repli', () => {
    expect(NGINX).toMatch(/location = \/ \{[\s\S]*?try_files \/landing\.html \/index\.html =404;/);
    expect(landingFiles(ROOT_LANDING_LANGUAGE)).toEqual(['landing.html']);
  });

  test('les landings de langue y sont TOUTES, et rien d’autre', () => {
    const mirror = /location ~ \^\/\(([a-z|]+)\)\(\\\.html\|\/\)\?\$ \{\n\s+add_header Cache-Control "no-cache"/.exec(NGINX)?.[1];
    const expected = LANDING_LANGUAGES.filter((language) => language !== ROOT_LANDING_LANGUAGE);
    expect(mirror?.split('|')).toEqual([...expected]);
  });
});

describe('service worker et manifeste (vite.config.ts)', () => {
  test('les landings de langue échappent au repli de la coquille', () => {
    expect(VITE).toContain('LANDING_SUBPATH_PATTERN,');
    for (const language of LANDING_LANGUAGES.filter((code) => code !== ROOT_LANDING_LANGUAGE)) {
      expect(LANDING_SUBPATH_PATTERN.test(`/${language}`)).toBe(true);
      expect(LANDING_SUBPATH_PATTERN.test(`/${language}/`)).toBe(true);
    }
    for (const path of ['/', '/chats', '/english', '/c/abc', '/fr']) expect(LANDING_SUBPATH_PATTERN.test(path)).toBe(false);
  });

  test('l’application installée démarre sur /chats, plus sur la landing', () => {
    expect(VITE).toMatch(/start_url: '\/chats'/);
    expect(VITE).not.toMatch(/start_url: '\/'/);
  });

  test('la landing n’est prérendue que pour le web, jamais dans la coque', () => {
    expect(VITE).toContain('...(forCapacitor ? [] : [prerenderLanding()]),');
  });
});

describe('les images d’aperçu (og:image)', () => {
  test('une PNG 1200 × 630 par langue, dans public/og', () => {
    for (const language of LANDING_LANGUAGES) {
      const png = readFileSync(new URL(`../../public${landingOgImagePath(language)}`, import.meta.url));
      expect(png.subarray(1, 4).toString('latin1')).toBe('PNG');
      expect({ width: png.readUInt32BE(16), height: png.readUInt32BE(20) }).toEqual({ ...OG_IMAGE_SIZE });
    }
  });
});

describe('le QR code vers /world (#10784)', () => {
  const svg = read('../../public/world-qr.svg');

  test('un SVG versionné, fond blanc posé dans le SVG, sans script ni ressource externe', () => {
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
    expect(svg).toMatch(/<path fill="#ffffff" d="M0 0h(\d+)v\1H0z"\/>/);
    expect(svg).not.toMatch(/<script|href=|xlink/);
  });

  test('il encode https://meeshy.me/world : le générateur le reproduit à l’octet', async () => {
    const { worldQrSvg, worldQrModules, WORLD_QR_URL } = await import('../../scripts/generate-world-qr.mjs');
    expect(WORLD_QR_URL).toBe('https://meeshy.me/world');
    expect(await worldQrSvg()).toBe(svg);
    expect(await worldQrSvg('https://meeshy.me/')).not.toBe(svg);
    const side = worldQrModules().size + 8;
    expect(svg).toContain(`viewBox="0 0 ${side} ${side}"`);
  });
});

describe('copie de la landing', () => {
  test('aucun nom de fixture ne part dans la page publique — le dist gateway les refuse (scripts/check-gateway-build.mjs)', async () => {
    const { LANDING_COPY } = await import('./landing-copy');
    const { FIXTURE_MARKERS } = (await import('../../scripts/lib/fixture-markers.mjs')) as { FIXTURE_MARKERS: readonly string[] };
    const text = JSON.stringify(LANDING_COPY);
    expect(FIXTURE_MARKERS.filter((marker) => text.includes(marker))).toEqual([]);
  });
});
