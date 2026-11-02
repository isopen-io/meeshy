import { describe, expect, test } from 'bun:test';

import { institutionalHref, siteHref } from './institutional-href';

describe('institutionalHref — la page institutionnelle que chaque cible sait servir (#8213)', () => {
  test('le web garde le chemin relatif, que nginx sert et que le staging sert pour lui-même', () => {
    expect(institutionalHref('terms', { shell: false })).toBe('/terms');
    expect(institutionalHref('privacy', { shell: false })).toBe('/privacy');
  });

  test('la coque lie l’adresse publique : son serveur local rendrait index.html, donc « page introuvable »', () => {
    expect(institutionalHref('terms', { shell: true })).toBe('https://meeshy.me/terms');
    expect(institutionalHref('privacy', { shell: true })).toBe('https://meeshy.me/privacy');
  });

  test('les sept pages suivent la même règle — `/download` lie aussi l’aide, la FAQ et le contact (#8801)', () => {
    for (const page of ['about', 'contact', 'faq', 'help', 'partners', 'privacy', 'terms'] as const) {
      expect(institutionalHref(page, { shell: false })).toBe(`/${page}`);
      expect(institutionalHref(page, { shell: true })).toBe(`https://meeshy.me/${page}`);
    }
  });

  test('une adresse du site suit la même règle — la landing par langue et ses ancres, que la coque ne sert pas (#12930)', () => {
    expect(siteHref('/en#world', { shell: false })).toBe('/en#world');
    expect(siteHref('/', { shell: false })).toBe('/');
    expect(siteHref('/en#world', { shell: true })).toBe('https://meeshy.me/en#world');
    expect(siteHref('/', { shell: true })).toBe('https://meeshy.me/');
  });
});
