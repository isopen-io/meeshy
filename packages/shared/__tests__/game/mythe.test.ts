/**
 * Le Mythe (#9636) : cent places définitives, dans l'ordre d'arrivée à un million de Gloire,
 * et une Signature unique par numéro.
 */

import { describe, it, expect } from 'vitest';
import { MYTHE_GLORY } from '../../utils/game/glory.js';
import { assignMythicSeats, mythicCrossedAt, nextMythicNumber, reachesMythe } from '../../utils/game/mythe.js';
import {
  MYTHIC_SIGNATURE_BOX,
  mythicGemAngle,
  mythicHue,
  mythicRayCount,
  mythicSignature,
  mythicSignatures,
} from '../../utils/game/mythic-signature.js';

const arrival = (userId: string, crossedAt: string, glory = MYTHE_GLORY) => ({ userId, glory, crossedAt });

describe('le seuil', () => {
  it('999 999 n’ouvre pas de place, 1 000 000 l’ouvre', () => {
    expect(reachesMythe(999_999)).toBe(false);
    expect(reachesMythe(1_000_000)).toBe(true);
    expect(reachesMythe(Number.NaN)).toBe(false);
  });
});

describe('la place suivante', () => {
  it('se prend dans l’ordre, sans trou, et jamais au-delà de la 100e', () => {
    expect(nextMythicNumber(0)).toBe(1);
    expect(nextMythicNumber(98)).toBe(99);
    expect(nextMythicNumber(99)).toBe(100);
    expect(nextMythicNumber(100)).toBeNull();
    expect(nextMythicNumber(250)).toBeNull();
  });
});

describe('l’instant d’arrivée', () => {
  it('est le premier gain qui atteint le seuil, quel que soit l’ordre de lecture', () => {
    const gains = [
      { delta: 500_000, createdAt: '2027-01-02T00:00:00.000Z' },
      { delta: 600_000, createdAt: '2027-03-01T00:00:00.000Z' },
      { delta: 500_000, createdAt: '2026-12-01T00:00:00.000Z' },
    ];
    expect(mythicCrossedAt(gains)).toBe('2027-01-02T00:00:00.000Z');
  });

  it('ne bouge pas quand une correction fait repasser sous le seuil', () => {
    const gains = [
      { delta: 1_000_000, createdAt: '2027-01-01T00:00:00.000Z' },
      { delta: -10, createdAt: '2027-01-02T00:00:00.000Z' },
      { delta: 10, createdAt: '2027-01-03T00:00:00.000Z' },
    ];
    expect(mythicCrossedAt(gains)).toBe('2027-01-01T00:00:00.000Z');
    expect(mythicCrossedAt([{ delta: 999_999, createdAt: '2027-01-01T00:00:00.000Z' }])).toBeNull();
  });
});

describe('le rattrapage des places', () => {
  it('attribue dans l’ordre d’arrivée, puis par identifiant, à partir de la place libre', () => {
    const grants = assignMythicSeats({
      taken: 3,
      seated: ['z'],
      arrivals: [arrival('b', '2027-01-02'), arrival('a', '2027-01-02'), arrival('c', '2027-01-01'), arrival('z', '2026-01-01'), arrival('low', '2027-01-01', 999_999)],
    });
    expect(grants).toEqual([
      { userId: 'c', number: 4 },
      { userId: 'a', number: 5 },
      { userId: 'b', number: 6 },
    ]);
  });

  it('la 100e place se prend, la 101e jamais', () => {
    const arrivals = Array.from({ length: 5 }, (_, i) => arrival(`u${i}`, `2027-01-0${i + 1}`));
    expect(assignMythicSeats({ taken: 99, seated: [], arrivals })).toEqual([{ userId: 'u0', number: 100 }]);
    expect(assignMythicSeats({ taken: 100, seated: [], arrivals })).toEqual([]);
    const crowd = Array.from({ length: 130 }, (_, i) => arrival(`u${String(i).padStart(3, '0')}`, '2027-01-01'));
    const all = assignMythicSeats({ taken: 0, seated: [], arrivals: crowd });
    expect(all).toHaveLength(100);
    expect(all.at(-1)).toEqual({ userId: 'u099', number: 100 });
  });

  it('un compte arrivé deux fois ne prend qu’une place', () => {
    expect(assignMythicSeats({ taken: 0, seated: [], arrivals: [arrival('a', '2027-01-01'), arrival('a', '2027-01-02')] })).toEqual([{ userId: 'a', number: 1 }]);
  });
});

describe('la Signature unique', () => {
  it('cent numéros donnent cent Signatures distinctes', () => {
    const all = mythicSignatures();
    expect(all.map((s) => s.number)).toEqual(Array.from({ length: 100 }, (_, i) => i + 1));
    expect(new Set(all.map((s) => `${s.rays.length}|${s.gem.angle}`)).size).toBe(100);
    expect(new Set(all.map((s) => s.hue)).size).toBe(100);
    expect(new Set(all.map((s) => JSON.stringify({ ...s, number: 0, numeral: '' }))).size).toBe(100);
  });

  it('est déterministe : la même place rend le même dessin', () => {
    expect(mythicSignature(42)).toEqual(mythicSignature(42));
    expect(mythicSignatures()[41]).toEqual(mythicSignature(42));
  });

  it('dérive du numéro : rayons par dizaine, gemme par unité, teinte par l’angle d’or', () => {
    expect([1, 10, 11, 91, 100].map(mythicRayCount)).toEqual([12, 12, 14, 30, 30]);
    expect([1, 2, 10, 11].map(mythicGemAngle)).toEqual([18, 54, 342, 18]);
    expect([1, 2, 3, 4].map(mythicHue)).toEqual([0, 138, 275, 53]);
  });

  it('pose le premier rayon à midi, et tout dans le carré de 1 024 sans toucher la Signature', () => {
    for (const s of mythicSignatures()) {
      expect(s.rays[0]).toEqual({ x1: 512, y1: 132, x2: 512, y2: 82 });
      const reach = Math.hypot(s.gem.cx - 512, s.gem.cy - 512) + s.gem.r;
      expect(reach).toBeLessThanOrEqual(MYTHIC_SIGNATURE_BOX / 2);
      expect(s.gem.orbit - s.gem.r).toBeGreaterThan(s.halo.outer + s.halo.strokeWidth / 2);
      expect(s.halo.inner - s.halo.strokeWidth / 2).toBeGreaterThan(Math.hypot(250, 128) + 92 / 2);
    }
  });

  it('grave le numéro, et refuse un numéro hors des cent places', () => {
    expect(mythicSignature(7)?.numeral).toBe('7');
    expect(mythicSignature(0)).toBeNull();
    expect(mythicSignature(101)).toBeNull();
    expect(mythicSignature(2.5)).toBeNull();
  });
});
