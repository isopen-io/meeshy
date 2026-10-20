import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { loadGameCatalog } from '@/lib/i18n-game-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES as INTERFACE_LANGUAGES } from '@/lib/inline-interface-language-bootstrap.js';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { GameConstellationOwn as GameConstellation } from './game-constellation-own';

/**
 * LA CONSTELLATION (#10053) — une étoile tous les dix fragments d'étoile, un cosmétique de profil par étoile.
 * Le membre voit la suivante se remplir.
 * Aucun mot de points, de Meesh ni d'argent.
 */
const setInterfaceLanguage = (language: InterfaceLanguage): void => {
  document.documentElement.lang = language;
};
const text = (html: string): string => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/me/progression/vitrine' });
  await Promise.all(INTERFACE_LANGUAGES.map((language) => loadGameCatalog(language)));
  setInterfaceLanguage('fr');
});
afterAll(async () => {
  setInterfaceLanguage('fr');
  await releaseHappyDomIfRegistered();
});

describe('la constellation du membre', () => {
  test('23 fragments : deux étoiles allumées, sept fragments vers la troisième, deux cosmétiques', () => {
    const html = renderToStaticMarkup(<GameConstellation collected={23} />);
    const t = text(html);
    expect(t).toContain('Constellation');
    expect(t).toContain('2 étoiles allumées');
    expect(t).toContain('7 fragments d’étoile jusqu’à la prochaine étoile');
    expect(t).toContain('Halo · étoile 1');
    expect(t).toContain('Cadre · étoile 2');
    expect((html.match(/data-constellation-star="lit"/g) ?? []).length).toBe(2);
    expect((html.match(/data-constellation-cosmetic="constellation\.star-/g) ?? []).length).toBe(2);
  });

  test('aucun fragment : la constellation est éteinte et dit comment s’allume la première étoile', () => {
    const t = text(renderToStaticMarkup(<GameConstellation collected={0} />));
    expect(t).toContain('0 étoile allumée');
    expect(t).toContain('10 fragments d’étoile jusqu’à la prochaine étoile');
    expect(t).not.toContain('Cosmétiques débloqués');
  });

  test('aucune valeur : ni points, ni Meesh, ni argent', () => {
    const t = text(renderToStaticMarkup(<GameConstellation collected={57} />)).toLowerCase();
    for (const word of ['point', 'meesh', '€', '$', 'prix']) expect(t.includes(word)).toBe(false);
  });

  test('chaque langue dit la constellation, l’arabe en miroir', () => {
    for (const language of INTERFACE_LANGUAGES) {
      setInterfaceLanguage(language);
      const html = renderToStaticMarkup(<GameConstellation collected={31} />);
      expect(text(html).trim().length > 0).toBe(true);
      expect(html.includes('game.constellation')).toBe(false);
      expect(html).toContain('rtl:-scale-x-100');
    }
    setInterfaceLanguage('fr');
  });
});
