import { describe, expect, test } from 'bun:test';

import { openLink } from './open-link';

/**
 * « OUVRIR LE LIEN » DU MENU D'UN MESSAGE (#12965) — la règle #7849 du
 * toucher (`rich-text.tsx`) vaut pour le menu : un lien Meeshy reste dans
 * l'app. Dans la coque Android, `window.open` d'un lien Meeshy le confiait
 * au système, qui quittait l'app.
 */
const recorder = () => {
  const navigated: string[] = [];
  const opened: string[] = [];
  return {
    navigated,
    opened,
    ports: {
      origins: ['https://localhost'],
      navigate: (path: string) => void navigated.push(path),
      openOutside: (href: string) => void opened.push(href),
    },
  };
};

describe('openLink — le menu suit la règle du toucher (#12965)', () => {
  test('un lien Meeshy servi par l’app navigue dans l’app, sans rien ouvrir dehors', () => {
    const { navigated, opened, ports } = recorder();
    openLink('https://meeshy.me/u/alice', ports);
    expect(navigated).toEqual(['/u/alice']);
    expect(opened).toEqual([]);
  });

  test('un lien externe s’ouvre hors de l’app', () => {
    const { navigated, opened, ports } = recorder();
    openLink('https://example.org/article', ports);
    expect(navigated).toEqual([]);
    expect(opened).toEqual(['https://example.org/article']);
  });

  test('une page statique de Meeshy, qu’aucun écran ne sert, s’ouvre hors de l’app', () => {
    const { navigated, opened, ports } = recorder();
    openLink('https://meeshy.me/privacy', ports);
    expect(navigated).toEqual([]);
    expect(opened).toEqual(['https://meeshy.me/privacy']);
  });
});
