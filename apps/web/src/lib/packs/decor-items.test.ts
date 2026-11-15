import { describe, expect, test } from 'bun:test';

import {
  contractDecorItems,
  decorPackState,
  embeddedDecorItems,
  equipChoiceOf,
  isAnimatedDecor,
  isDecorDomain,
  otherProposals,
  stepIndex,
  type DecorItem,
} from './decor-items';

/**
 * **LES ÉLÉMENTS D'UN PACK DE DÉCOR** (#16267) — la fiche et le plein écran de
 * la boutique lisent les éléments d'un pack (contours, bannières, cadres de
 * bannière, fonds) depuis le catalogue EMBARQUÉ, sinon depuis le contrat servi.
 */

const ringContract = {
  domain: 'avatar-ring',
  rings: [
    { key: 'anneau-a', stroke: { style: 'solid', width: 0.05, colors: ['#112233'] } },
    { key: 'anneau-b', stroke: { style: 'solid', width: 0.05, colors: ['#445566'] } },
  ],
};

describe('les éléments d’un pack de décor', () => {
  test('seuls les contours, bannières, cadres de bannière et fonds ont des éléments à montrer', () => {
    expect(['avatar-ring', 'banner', 'banner-frame', 'wallpaper'].every(isDecorDomain)).toBe(true);
    expect(['sticker', 'glory-frame', 'capture-frame', 'lens', 'autre'].some(isDecorDomain)).toBe(false);
  });

  test('un pack embarqué se lit sans réseau, dans l’ordre du catalogue, pour chaque domaine', () => {
    const rings = embeddedDecorItems('avatar-ring', 'contours-essentiels');
    expect(rings?.map((item) => item.key).slice(0, 3)).toEqual(['filet', 'double-filet', 'perle']);
    expect(rings?.every((item) => item.domain === 'avatar-ring' && item.pack === 'contours-essentiels')).toBe(true);
    expect(embeddedDecorItems('banner', 'bannieres-essentielles')?.[0]?.key).toBe('aurore');
    expect(embeddedDecorItems('banner-frame', 'cadres-haussmannien')?.map((item) => item.key)).toEqual(['haussmannien', 'haussmannien-anime']);
    expect(embeddedDecorItems('wallpaper', 'essentiels')?.[0]?.key).toBe('monogramme');
  });

  test('un pack que le catalogue n’embarque pas rend null : il se lira dans son contrat', () => {
    expect(embeddedDecorItems('avatar-ring', 'pack-inconnu')).toBeNull();
  });

  test('un contrat servi donne ses éléments ; un contrat d’un autre domaine ou illisible n’en donne aucun', () => {
    expect(contractDecorItems('avatar-ring', 'officiel', ringContract).map((item) => item.key)).toEqual(['anneau-a', 'anneau-b']);
    expect(contractDecorItems('banner', 'officiel', ringContract)).toEqual([]);
    expect(contractDecorItems('avatar-ring', 'officiel', null)).toEqual([]);
  });

  test('un élément est animé s’il porte une couche Lottie ou des mouvements', () => {
    const items = embeddedDecorItems('avatar-ring', 'contours-animes') ?? [];
    expect(items.length).toBeGreaterThan(0);
    expect(items.every(isAnimatedDecor)).toBe(true);
    expect(isAnimatedDecor(embeddedDecorItems('avatar-ring', 'contours-essentiels')?.[0] as DecorItem)).toBe(false);
  });

  test('l’état d’un pack : embarqué l’emporte, puis installé, sinon à télécharger', () => {
    expect(decorPackState({ embedded: true, installed: false })).toBe('embedded');
    expect(decorPackState({ embedded: false, installed: true })).toBe('installed');
    expect(decorPackState({ embedded: false, installed: false })).toBe('download');
  });

  test('passer aux alternatives fait le tour du pack dans les deux sens', () => {
    expect(stepIndex({ count: 3, current: 2, delta: 1 })).toBe(0);
    expect(stepIndex({ count: 3, current: 0, delta: -1 })).toBe(2);
    expect(stepIndex({ count: 0, current: 0, delta: 1 })).toBe(0);
  });

  test('les autres propositions viennent des AUTRES packs du même domaine, bornées', () => {
    const essentials = embeddedDecorItems('avatar-ring', 'contours-essentiels') ?? [];
    const animated = embeddedDecorItems('avatar-ring', 'contours-animes') ?? [];
    const banners = embeddedDecorItems('banner', 'bannieres-essentielles') ?? [];
    const others = otherProposals({ domain: 'avatar-ring', pack: 'contours-essentiels', candidates: [...essentials, ...animated, ...banners], limit: 2 });
    expect(others.map((item) => item.key)).toEqual(animated.slice(0, 2).map((item) => item.key));
  });

  test('équiper un contour, une bannière ou un cadre désigne le côté et la référence ; un fond ne s’équipe pas depuis la boutique', () => {
    const ring = embeddedDecorItems('avatar-ring', 'contours-essentiels')?.[0] as DecorItem;
    expect(equipChoiceOf(ring, null)).toEqual({ side: 'avatarRing', choice: { pack: 'contours-essentiels', item: 'filet', origin: 'builtin', contract: null } });
    const frame = embeddedDecorItems('banner-frame', 'cadres-haussmannien')?.[0] as DecorItem;
    expect(equipChoiceOf(frame, null)?.side).toBe('bannerFrame');
    const official = contractDecorItems('avatar-ring', 'officiel', ringContract)[1] as DecorItem;
    expect(equipChoiceOf(official, 'abcdef0123456789.json')).toEqual({
      side: 'avatarRing',
      choice: { pack: 'officiel', item: 'anneau-b', origin: 'official', contract: 'abcdef0123456789.json' },
    });
    expect(equipChoiceOf(embeddedDecorItems('wallpaper', 'essentiels')?.[0] as DecorItem, null)).toBeNull();
  });
});
