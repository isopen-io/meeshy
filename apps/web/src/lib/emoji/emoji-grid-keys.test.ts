import { describe, expect, test } from 'bun:test';

import { isGridKey, nextGridIndex } from './emoji-grid-keys';

/**
 * LA GRILLE AU CLAVIER (#10531) — une seule tabulation entre dans la grille,
 * les flèches s'y déplacent ; en arabe, gauche et droite s'inversent.
 */
const move = (index: number, key: string, options: { rtl?: boolean; count?: number; columns?: number } = {}) =>
  nextGridIndex({ index, key, count: options.count ?? 20, columns: options.columns ?? 8, rtl: options.rtl ?? false });

describe('se déplacer dans la grille d’emojis', () => {
  test('droite et gauche avancent et reculent d’un emoji, sans sortir de la grille', () => {
    expect(move(3, 'ArrowRight')).toBe(4);
    expect(move(3, 'ArrowLeft')).toBe(2);
    expect(move(0, 'ArrowLeft')).toBe(0);
    expect(move(19, 'ArrowRight')).toBe(19);
  });

  test('de droite à gauche, la flèche gauche avance', () => {
    expect(move(3, 'ArrowLeft', { rtl: true })).toBe(4);
    expect(move(3, 'ArrowRight', { rtl: true })).toBe(2);
  });

  test('haut et bas changent de rangée ; la dernière rangée, plus courte, reçoit son dernier emoji', () => {
    expect(move(3, 'ArrowDown')).toBe(11);
    expect(move(11, 'ArrowUp')).toBe(3);
    expect(move(3, 'ArrowUp')).toBe(3);
    expect(move(15, 'ArrowDown')).toBe(19);
    expect(move(18, 'ArrowDown')).toBe(18);
  });

  test('Début et Fin vont au premier et au dernier', () => {
    expect(move(7, 'Home')).toBe(0);
    expect(move(7, 'End')).toBe(19);
  });

  test('une autre touche ne déplace rien', () => {
    expect(isGridKey('Enter')).toBe(false);
    expect(isGridKey('ArrowDown')).toBe(true);
    expect(move(7, 'Enter')).toBe(7);
  });
});
