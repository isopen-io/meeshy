import { describe, expect, test } from 'bun:test';

import { institutionalHref } from './institutional-href';

describe('institutionalHref — la page institutionnelle que chaque cible sait servir (#8213)', () => {
  test('le web garde le chemin relatif, que nginx sert et que le staging sert pour lui-même', () => {
    expect(institutionalHref('terms', { shell: false })).toBe('/terms');
    expect(institutionalHref('privacy', { shell: false })).toBe('/privacy');
  });

  test('la coque lie l’adresse publique : son serveur local rendrait index.html, donc « page introuvable »', () => {
    expect(institutionalHref('terms', { shell: true })).toBe('https://meeshy.me/terms');
    expect(institutionalHref('privacy', { shell: true })).toBe('https://meeshy.me/privacy');
  });
});
