import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'bun:test';

import { GAME_BADGE_MATERIALS, GAME_PAINTS, inkToken, paintStops, tokenVar } from './materials';

const CSS = readFileSync(new URL('../../styles/game.css', import.meta.url), 'utf8');
const declared = (token: string): boolean => new RegExp(`${token}\\s*:`).test(CSS);

/**
 * LES MATIÈRES DU JEU (#9380). Un dégradé de métal est une ILLUSTRATION, pas
 * du chrome : sa couleur vit dans `styles/game.css` sous forme de jetons, et le
 * code n'écrit aucun littéral. Le témoin garde l'inventaire — un jeton cité
 * qu'aucune feuille ne déclare ne peint rien et ne rougit nulle part.
 */
describe('les sept matières des badges', () => {
  test('cuivre, bronze, argent, or, platine, obsidienne, prisme — dans l’ordre de la montée', () => {
    expect(GAME_BADGE_MATERIALS).toEqual(['copper', 'bronze', 'silver', 'gold', 'platinum', 'obsidian', 'prism']);
  });

  test('chaque matière de badge est une peinture connue', () => {
    for (const m of GAME_BADGE_MATERIALS) expect(GAME_PAINTS).toContain(m);
  });
});

describe('paintStops — des arrêts qui nomment des jetons', () => {
  test('chaque arrêt est un `var(--game-…)` croissant de 0 à 1', () => {
    for (const paint of GAME_PAINTS) {
      const stops = paintStops(paint);
      expect(stops.length).toBeGreaterThanOrEqual(2);
      expect(stops[0]?.offset).toBe(0);
      expect(stops.at(-1)?.offset).toBe(1);
      for (const stop of stops) expect(stop.color).toMatch(/^var\(--game-[a-z-]+-\d\)$/);
      expect(stops.map((s) => s.offset)).toEqual([...stops.map((s) => s.offset)].sort((a, b) => a - b));
    }
  });

  test('le prisme porte cinq teintes, le métal deux ou trois', () => {
    expect(paintStops('prism')).toHaveLength(5);
    expect(paintStops('copper')).toHaveLength(2);
    expect(paintStops('coin-silver')).toHaveLength(3);
  });
});

describe('inventaire des jetons', () => {
  test('tout jeton d’arrêt est déclaré par game.css', () => {
    for (const paint of GAME_PAINTS) {
      for (const stop of paintStops(paint)) {
        const token = stop.color.slice(4, -1);
        expect(declared(token)).toBe(true);
      }
    }
  });

  test('toute encre de matière est déclarée, et se lit en var()', () => {
    for (const paint of GAME_PAINTS) {
      expect(inkToken(paint)).toBe(`var(--game-${paint}-ink)`);
      expect(declared(`--game-${paint}-ink`)).toBe(true);
    }
  });

  test('les jetons transverses (ombre, éclat, tranche, piste) sont déclarés', () => {
    for (const token of ['--game-shade', '--game-glint', '--game-edge', '--game-track', '--game-rim', '--game-ash']) {
      expect(declared(token)).toBe(true);
    }
    expect(tokenVar('edge')).toBe('var(--game-edge)');
  });

  test('les dix teintes de palier sont déclarées', () => {
    for (const tier of ['etincelle', 'lueur', 'lumiere', 'eclat', 'rayon', 'aurore', 'comete', 'etoile', 'constellation']) {
      expect(declared(`--game-tier-${tier}`)).toBe(true);
    }
  });
});
