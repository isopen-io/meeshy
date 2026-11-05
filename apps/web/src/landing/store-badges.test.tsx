import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { APP_STORE_URL, GOOGLE_PLAY_URL } from '@/lib/store-links';

import { LANDING_COPY } from './landing-copy';
import { LANDING_LANGUAGES } from './landing-languages';
import { LandingPage } from './landing-page';

/**
 * LES DEUX BOUTIQUES SUR LA LANDING (#15120) — meeshy.me mène aux fiches
 * RÉELLES de l'app iOS et de l'app Android native, dans chaque langue, avec un
 * nom que lit un lecteur d'écran.
 */
const storeAnchor = (html: string, store: 'app-store' | 'google-play'): string =>
  new RegExp(`<a [^>]*data-store="${store}"[^>]*>`).exec(html)?.[0] ?? '';

describe('la landing propose l’App Store et Google Play (#15120)', () => {
  test('chaque langue sert les deux badges, vers les fiches réelles, ouverts à côté de la page', () => {
    for (const language of LANDING_LANGUAGES) {
      const copy = LANDING_COPY[language];
      const html = renderToStaticMarkup(<LandingPage language={language} copy={copy} />);
      const appStore = storeAnchor(html, 'app-store');
      const googlePlay = storeAnchor(html, 'google-play');
      expect(appStore).toContain(`href="${APP_STORE_URL}"`);
      expect(googlePlay).toContain(`href="${GOOGLE_PLAY_URL}"`);
      for (const anchor of [appStore, googlePlay]) {
        expect(anchor).toContain('target="_blank"');
        expect(anchor).toContain('rel="noopener noreferrer"');
        expect(anchor).toContain('class="ld-store"');
      }
      expect(appStore).toContain(`aria-label="${copy.appStoreLabel}"`);
      expect(googlePlay).toContain(`aria-label="${copy.googlePlayLabel}"`);
      expect(html).toMatch(new RegExp(`<div class="ld-stores" role="group" aria-label="${copy.storesLabel}"`));
    }
  });

  test('les libellés sont écrits dans la langue de la page, jamais recopiés du français', () => {
    for (const language of LANDING_LANGUAGES.filter((language) => language !== 'fr')) {
      expect(LANDING_COPY[language].googlePlayLabel).not.toBe(LANDING_COPY.fr.googlePlayLabel);
      expect(LANDING_COPY[language].appStoreLabel).not.toBe(LANDING_COPY.fr.appStoreLabel);
      expect(LANDING_COPY[language].storesLabel).not.toBe(LANDING_COPY.fr.storesLabel);
    }
  });
});

describe('les badges de boutique gardent le blanc imposé, malgré la couleur des liens de la page (#15120, #16407)', () => {
  test('la règle du badge l’emporte sur `.ld a` par sa spécificité, et sa feuille sert la landing comme /download', async () => {
    const { readFileSync } = await import('node:fs');
    const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
    const css = read('../styles/store-badge.css');
    const badgeRule = css.indexOf('.ld-store.ld-store,\n.ld-store.ld-store:hover {');
    expect(badgeRule).toBeGreaterThanOrEqual(0);
    expect(css.slice(badgeRule, css.indexOf('}', badgeRule))).toMatch(/color: #fff;/);
    expect(read('../styles/landing.css')).toContain("@import './store-badge.css';");
    expect(read('../routes/download.tsx')).toContain("import '@/styles/store-badge.css';");
  });
});

const between = (html: string, start: string, end: string): string => {
  const from = html.indexOf(start);
  const to = html.indexOf(end, from + start.length);
  return from < 0 || to < 0 ? '' : html.slice(from, to);
};

describe('les badges sont en face du titre, juste au-dessus de l’aperçu World (#16407)', () => {
  test('dans chaque langue, les badges ouvrent la colonne de l’aperçu, avant le bloc World, hors de la colonne du titre', () => {
    for (const language of LANDING_LANGUAGES) {
      const html = renderToStaticMarkup(<LandingPage language={language} copy={LANDING_COPY[language]} />);
      const titleColumn = between(html, '<div class="ld-hero-copy">', '<div class="ld-hero-side">');
      const side = between(html, '<div class="ld-hero-side">', '</section>');
      expect(titleColumn).toContain('<h1>');
      expect(titleColumn).not.toContain('data-store=');
      expect(side.indexOf('<div class="ld-stores"')).toBe('<div class="ld-hero-side">'.length);
      expect(side.indexOf('data-store="app-store"')).toBeLessThan(side.indexOf('<aside class="ld-preview"'));
      expect(side.indexOf('data-store="google-play"')).toBeLessThan(side.indexOf('<aside class="ld-preview"'));
    }
  });

  test('le badge a UN rendu : la landing et /download servent le même composant', async () => {
    const { StoreBadge } = await import('./store-logos');
    const html = renderToStaticMarkup(<StoreBadge store="google-play" label="L" caption="C" />);
    expect(html).toBe(
      `<a href="${GOOGLE_PLAY_URL}" target="_blank" rel="noopener noreferrer" data-store="google-play" aria-label="L" class="ld-store">` +
        html.slice(html.indexOf('<svg'), html.indexOf('</svg>') + '</svg>'.length) +
        '<span class="ld-store-name"><span class="ld-store-caption">C</span>Google Play</span></a>',
    );
    const { readFileSync } = await import('node:fs');
    const download = readFileSync(new URL('../routes/download.tsx', import.meta.url), 'utf8');
    expect(download).toContain('<StoreBadge');
    expect(download).not.toContain('BADGE_CLASS');
  });
});
