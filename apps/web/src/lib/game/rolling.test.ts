import { describe, expect, test } from 'bun:test';

import { ROLL_MS, rolledValue } from './rolling';

/**
 * LE CHIFFRE QUI ROULE (#9494) — un gain de points fait défiler le total de
 * l'ancienne valeur à la nouvelle, en freinant à l'arrivée. Pure : le temps
 * entre, rien d'autre.
 */
describe('rolledValue', () => {
  test('part de l’ancienne valeur et arrive exactement sur la nouvelle', () => {
    expect(rolledValue(100, 160, 0)).toBe(100);
    expect(rolledValue(100, 160, ROLL_MS)).toBe(160);
  });

  test('freine à l’arrivée : à mi-temps, plus de la moitié du chemin est faite', () => {
    expect(rolledValue(0, 100, ROLL_MS / 2)).toBeGreaterThan(50);
  });

  test('ne rend que des entiers, jamais en dehors du chemin', () => {
    for (let at = 0; at <= ROLL_MS; at += 37) {
      const value = rolledValue(10, 95, at);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(10);
      expect(value).toBeLessThanOrEqual(95);
    }
  });

  test('roule aussi vers le bas (un niveau perdu) et reste sur la cible au-delà du temps', () => {
    expect(rolledValue(200, 120, ROLL_MS / 2)).toBeLessThan(200);
    expect(rolledValue(200, 120, ROLL_MS * 5)).toBe(120);
  });

  test('un temps qui n’est pas un nombre ne casse rien : la cible', () => {
    expect(rolledValue(5, 9, Number.NaN)).toBe(9);
  });
});
