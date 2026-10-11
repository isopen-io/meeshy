import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { UserShowcaseResponse } from '@meeshy/shared/types/game';

import { loadGameCatalog } from '@/lib/i18n-game-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES as INTERFACE_LANGUAGES } from '@/lib/inline-interface-language-bootstrap.js';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { GameConstellation, visitorConstellation } from './game-constellation';
import { GameProfileVisitor } from './game-profile-visitor';

/**
 * LA CONSTELLATION (#10053) — une étoile tous les dix fragments d'étoile, un cosmétique de profil par étoile.
 * Le membre voit la suivante se remplir ; un visiteur ne voit que les étoiles (figées au mois par le serveur).
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
    expect(t).toContain('Encore 7 fragments d’étoile pour la prochaine étoile');
    expect(t).toContain('Halo · étoile 1');
    expect(t).toContain('Cadre · étoile 2');
    expect((html.match(/data-constellation-star="lit"/g) ?? []).length).toBe(2);
    expect((html.match(/data-constellation-cosmetic="constellation\.star-/g) ?? []).length).toBe(2);
  });

  test('aucun fragment : la constellation est éteinte et dit comment s’allume la première étoile', () => {
    const t = text(renderToStaticMarkup(<GameConstellation collected={0} />));
    expect(t).toContain('0 étoile allumée');
    expect(t).toContain('Encore 10 fragments d’étoile pour la prochaine étoile');
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

describe('la constellation d’un autre membre', () => {
  const showcase = (over: Partial<UserShowcaseResponse> = {}): UserShowcaseResponse => ({ visible: true, items: [], order: [], ...over });

  test('se lit sur les seules étoiles servies, sans progression vers la suivante', () => {
    expect(visitorConstellation(showcase({ constellation: { stars: 3 } }))).toBe(3);
    const t = text(renderToStaticMarkup(<GameProfileVisitor showcase={showcase({ constellation: { stars: 3 } })} name="Nour" />));
    expect(t).toContain('3 étoiles allumées');
    expect(t).toContain('Scintillement · étoile 3');
    expect(t).not.toContain('Encore');
  });

  test('vitrine fermée, ancien serveur ou constellation éteinte : rien ne se dessine', () => {
    expect(visitorConstellation(showcase({ visible: false, constellation: { stars: 3 } }))).toBeNull();
    expect(visitorConstellation(showcase())).toBeNull();
    expect(visitorConstellation(showcase({ constellation: { stars: 0 } }))).toBeNull();
    expect(visitorConstellation(undefined)).toBeNull();
    expect(renderToStaticMarkup(<GameProfileVisitor showcase={showcase({ constellation: { stars: 0 } })} name="Nour" />)).toBe('');
  });
});
