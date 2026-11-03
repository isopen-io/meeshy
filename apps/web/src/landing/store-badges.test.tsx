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

describe('les badges de boutique gardent le blanc imposé, malgré la couleur des liens de la page (#15120)', () => {
  test('la règle du badge l’emporte sur `.ld a` : même spécificité au moins, déclarée plus bas', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync(new URL('../styles/landing.css', import.meta.url), 'utf8');
    const linkRule = css.indexOf('.ld a {');
    const badgeRule = css.indexOf('.ld .ld-store,\n.ld .ld-store:hover {');
    expect(linkRule).toBeGreaterThanOrEqual(0);
    expect(badgeRule).toBeGreaterThan(linkRule);
    expect(css.slice(badgeRule, css.indexOf('}', badgeRule))).toMatch(/color: #fff;/);
  });
});
