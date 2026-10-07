/**
 * Le Mythe (#9636) : cent places dans l'ordre d'arrivée à un million de Gloire, libérées par la
 * suppression d'un compte (décision porteur 2026-10-08), et une Signature unique par ÉMISSION.
 */

import { describe, it, expect } from 'vitest';
import { MYTHE_GLORY } from '../../utils/game/glory.js';
import { assignMythicSeats, freeMythicNumbers, mythicCrossedAt, nextMythicNumber, reachesMythe } from '../../utils/game/mythe.js';
import {
  MYTHIC_GEOMETRY_SPAN,
  MYTHIC_SIGNATURE_BOX,
  mythicGemAngle,
  mythicHue,
  mythicRayCount,
  mythicRing,
  mythicSignature,
  mythicSignatures,
} from '../../utils/game/mythic-signature.js';

const arrival = (userId: string, crossedAt: string, glory = MYTHE_GLORY) => ({ userId, glory, crossedAt });
const upTo = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe('le seuil', () => {
  it('999 999 n’ouvre pas de place, 1 000 000 l’ouvre', () => {
    expect(reachesMythe(999_999)).toBe(false);
    expect(reachesMythe(1_000_000)).toBe(true);
    expect(reachesMythe(Number.NaN)).toBe(false);
  });
});

describe('la place suivante', () => {
  it('est la plus petite place libre, et il n’y a jamais de 101e', () => {
    expect(nextMythicNumber([])).toBe(1);
    expect(nextMythicNumber(upTo(98))).toBe(99);
    expect(nextMythicNumber(upTo(99))).toBe(100);
    expect(nextMythicNumber(upTo(100))).toBeNull();
    expect(nextMythicNumber([...upTo(100), 101, 102])).toBeNull();
  });

  it('une place libérée au milieu se reprend avant la suite', () => {
    const taken = upTo(100).filter((n) => n !== 37);
    expect(freeMythicNumbers(taken)).toEqual([37]);
    expect(nextMythicNumber(taken)).toBe(37);
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

describe('l’attribution des places', () => {
  it('donne dans l’ordre d’arrivée, puis par identifiant, les plus petites places libres', () => {
    const grants = assignMythicSeats({
      taken: [1, 2, 4],
      seated: ['z'],
      arrivals: [arrival('b', '2027-01-02'), arrival('a', '2027-01-02'), arrival('c', '2027-01-01'), arrival('z', '2026-01-01'), arrival('low', '2027-01-01', 999_999)],
    });
    expect(grants).toEqual([
      { userId: 'c', number: 3 },
      { userId: 'a', number: 5 },
      { userId: 'b', number: 6 },
    ]);
  });

  it('la 100e place se prend, la 101e jamais', () => {
    const arrivals = Array.from({ length: 5 }, (_, i) => arrival(`u${i}`, `2027-01-0${i + 1}`));
    expect(assignMythicSeats({ taken: upTo(99), seated: [], arrivals })).toEqual([{ userId: 'u0', number: 100 }]);
    expect(assignMythicSeats({ taken: upTo(100), seated: [], arrivals })).toEqual([]);
    const crowd = Array.from({ length: 130 }, (_, i) => arrival(`u${String(i).padStart(3, '0')}`, '2027-01-01'));
    const all = assignMythicSeats({ taken: [], seated: [], arrivals: crowd });
    expect(all).toHaveLength(100);
    expect(all.at(-1)).toEqual({ userId: 'u099', number: 100 });
  });

  it('une place libérée revient au plus ancien en attente', () => {
    const taken = upTo(100).filter((n) => n !== 12);
    const waiting = [arrival('late', '2027-05-01'), arrival('early', '2027-02-01'), arrival('mid', '2027-03-01')];
    expect(assignMythicSeats({ taken, seated: [], arrivals: waiting })).toEqual([{ userId: 'early', number: 12 }]);
  });

  it('un compte arrivé deux fois ne prend qu’une place', () => {
    expect(assignMythicSeats({ taken: [], seated: [], arrivals: [arrival('a', '2027-01-01'), arrival('a', '2027-01-02')] })).toEqual([{ userId: 'a', number: 1 }]);
  });
});

describe('la Signature unique, par émission', () => {
  const key = (e: number) => {
    const s = mythicSignature(e)!;
    return `${s.rays.length}|${s.gem.angle}|${s.beads.map((b) => b.slot).join(',')}`;
  };

  it('les cent premières émissions donnent cent Signatures distinctes, sans perle', () => {
    const all = mythicSignatures();
    expect(all.map((s) => s.edition)).toEqual(upTo(100));
    expect(new Set(all.map((s) => key(s.edition))).size).toBe(100);
    expect(new Set(all.map((s) => s.hue)).size).toBe(100);
    expect(all.every((s) => s.beads.length === 0)).toBe(true);
  });

  it('une émission neuve ne reprend jamais la géométrie d’une émission déjà faite : 5 000 émissions, 5 000 dessins', () => {
    expect(new Set(mythicSignatures(5000).map((s) => key(s.edition))).size).toBe(5000);
  });

  it('l’injectivité tient jusqu’à la dernière émission de la portée, et le numéro gravé au-delà', () => {
    expect(MYTHIC_GEOMETRY_SPAN).toBe(409_600);
    expect(key(MYTHIC_GEOMETRY_SPAN)).not.toBe(key(MYTHIC_GEOMETRY_SPAN - 1));
    expect(key(MYTHIC_GEOMETRY_SPAN)).not.toBe(key(1));
    expect(mythicRing(MYTHIC_GEOMETRY_SPAN)).toBe(4095);
    expect(key(MYTHIC_GEOMETRY_SPAN + 1)).toBe(key(1));
    expect(mythicSignature(MYTHIC_GEOMETRY_SPAN + 1)!.numeral).not.toBe(mythicSignature(1)!.numeral);
  });

  it('est déterministe : la même émission rend le même dessin', () => {
    expect(mythicSignature(4242)).toEqual(mythicSignature(4242));
    expect(mythicSignatures()[41]).toEqual(mythicSignature(42));
  });

  it('dérive de l’émission : rayons par dizaine, gemme par unité, perles par anneau, teinte par l’angle d’or', () => {
    expect([1, 10, 11, 91, 100, 101].map(mythicRayCount)).toEqual([12, 12, 14, 30, 30, 12]);
    expect([1, 2, 10, 11].map(mythicGemAngle)).toEqual([18, 54, 342, 18]);
    expect([1, 100, 101, 201, 301].map(mythicRing)).toEqual([0, 0, 1, 2, 3]);
    expect(mythicSignature(301)!.beads.map((b) => b.slot)).toEqual([0, 1]);
    expect([1, 2, 3, 4].map(mythicHue)).toEqual([0, 138, 275, 53]);
  });

  it('pose le premier rayon à midi, et tout dans le carré de 1 024 sans toucher la Signature', () => {
    const signatureReach = Math.hypot(250, 128) + 92 / 2;
    for (const s of [...mythicSignatures(), mythicSignature(MYTHIC_GEOMETRY_SPAN)!]) {
      expect(s.rays[0]).toEqual({ x1: 512, y1: 132, x2: 512, y2: 82 });
      expect(Math.hypot(s.gem.cx - 512, s.gem.cy - 512) + s.gem.r).toBeLessThanOrEqual(MYTHIC_SIGNATURE_BOX / 2);
      expect(s.gem.orbit - s.gem.r).toBeGreaterThan(s.halo.outer + s.halo.strokeWidth / 2);
      expect(s.halo.inner - s.halo.strokeWidth / 2).toBeGreaterThan(signatureReach);
      for (const bead of s.beads) {
        const at = Math.hypot(bead.cx - 512, bead.cy - 512);
        expect(at - bead.r).toBeGreaterThan(signatureReach);
        expect(at + bead.r).toBeLessThan(s.halo.inner - s.halo.strokeWidth / 2);
      }
    }
  });

  it('grave le numéro d’émission, et refuse une émission illisible', () => {
    expect(mythicSignature(7)?.numeral).toBe('7');
    expect(mythicSignature(123_456)?.numeral).toBe('123456');
    expect(mythicSignature(0)).toBeNull();
    expect(mythicSignature(2.5)).toBeNull();
    expect(mythicSignature(-1)).toBeNull();
  });
});
