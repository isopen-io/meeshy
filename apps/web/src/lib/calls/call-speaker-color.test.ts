import { describe, expect, test } from 'bun:test';

import { authorAccentColor } from '@meeshy/shared/utils/conversation-colors';

import { glassWorstCaseBackground, glassWorstCaseContrast, loadColorAliasMap, loadGlassDensities, loadIosSchemes, resolveColor } from '../../../scripts/lib/glass-contrast.mjs';

import { CALL_GLASS_WORST_BACKGROUND, speakerColor } from './call-speaker-color';

/**
 * LA COULEUR DE L'AUTEUR, DANS L'APPEL AUSSI (#16614, décision #16612) — un
 * sous-titre porte la couleur vive que son auteur a partout ailleurs
 * (`authorAccentColor`), éclaircie juste ce qu'il faut pour le verre d'appel.
 */

const rgb = (hex: string): readonly number[] => [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16));
const IDS: readonly string[] = Array.from({ length: 60 }, (_, index) => `65f0c0ffee0000000000${String(index).padStart(4, '0')}`);
const FIRST = '65f0c0ffee00000000000000';
const SECOND = '65f0c0ffee00000000000001';

describe('speakerColor', () => {
  test('stable : le même identifiant rend toujours la même couleur', () => {
    expect(speakerColor(FIRST)).toBe(speakerColor(FIRST));
  });

  test("c'est la couleur PARTAGÉE de l'auteur, seulement éclaircie : aucune composante ne baisse", () => {
    for (const id of IDS) {
      const shared = rgb(authorAccentColor(id, ''));
      const served = rgb(speakerColor(id));
      expect(served.every((channel, at) => channel >= (shared[at] ?? 0))).toBe(true);
    }
  });

  test("une couleur partagée déjà lisible sur le verre d'appel est servie telle quelle", () => {
    const legible = IDS.find((id) => speakerColor(id) === authorAccentColor(id, '').toLowerCase());
    expect(legible).toBeDefined();
  });

  test("l'identifiant prime sur le nom, comme partout ailleurs", () => {
    expect(speakerColor(SECOND, 'Awa')).toBe(speakerColor(SECOND, 'Kofi'));
  });

  test('des personnes différentes se distinguent : six locuteurs couvrent au moins quatre couleurs', () => {
    expect(new Set(IDS.slice(0, 6).map((id) => speakerColor(id))).size).toBeGreaterThanOrEqual(4);
  });
});

describe('lisible sur le verre des sous-titres, au pire cas', () => {
  const schemes = loadIosSchemes();
  const density = loadGlassDensities()['glass-call-prominent'];
  const white = resolveColor('white', {});
  const aliases = Object.fromEntries(Object.entries(loadColorAliasMap()).map(([name, target]) => [name, `var(${target})`]));

  test('le fond de référence est bien le pire fond mesuré de glass-call-prominent', () => {
    for (const scheme of ['light', 'dark'] as const) {
      const tone = resolveColor('var(--ios-indigo-950)', schemes[scheme]);
      const worst = glassWorstCaseBackground({ tone, densityPercent: density, scheme, canvas: white });
      expect(Math.max(...rgb(CALL_GLASS_WORST_BACKGROUND).map((channel, at) => Math.abs(channel - ([worst.r, worst.g, worst.b][at] ?? Number.NaN))))).toBeLessThanOrEqual(1);
    }
  });

  test('chaque auteur tient AA texte (4,5:1) sur glass-call-prominent posé sur du blanc', () => {
    for (const id of IDS) {
      for (const scheme of ['light', 'dark'] as const) {
        const tone = resolveColor('var(--ios-indigo-950)', schemes[scheme]);
        const ink = resolveColor(speakerColor(id), { ...aliases, ...schemes[scheme] });
        expect(glassWorstCaseContrast({ tone, ink, densityPercent: density, scheme, canvas: white })).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
