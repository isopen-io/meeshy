/**
 * Le blason d'un rang, sa géométrie (#9636) : une décoration propre à chaque rang, de plus en plus
 * riche, tenue dans le cadre ; la division en encoches ; la Signature unique d'un Mythe en halo.
 */

import { describe, it, expect } from 'vitest';
import { GLORY_DIVISIONS, GLORY_RANKS } from '../../utils/game/glory.js';
import { mythicSignature } from '../../utils/game/mythic-signature.js';
import {
  BLASON_COMPACT_FRAME,
  BLASON_COMPACT_MYTHIC_FRAME,
  BLASON_FRAME,
  BLASON_LEVEL_ENGRAVING,
  MYTHIC_HALO_DEFAULT_RAYS,
  RANK_CRESTS,
  divisionNotches,
  mythicHalo,
  type BlasonViewport,
  type CrestPiece,
} from '../../utils/game/rank-crest.js';

const RANKS = [...GLORY_RANKS.map((rank) => rank.key), 'mythe'] as const;
const DRAWN = GLORY_RANKS.map((rank) => rank.key);

/** Les points qui bornent une pièce, marge du trait comprise. */
const extent = (piece: CrestPiece): { readonly minX: number; readonly maxX: number; readonly minY: number; readonly maxY: number } => {
  const box = (xs: readonly number[], ys: readonly number[], pad: number) => ({
    minX: Math.min(...xs) - pad,
    maxX: Math.max(...xs) + pad,
    minY: Math.min(...ys) - pad,
    maxY: Math.max(...ys) + pad,
  });
  switch (piece.kind) {
    case 'line':
      return box([piece.x1, piece.x2], [piece.y1, piece.y2], piece.width / 2);
    case 'arc':
      return box([piece.cx - piece.r, piece.cx + piece.r], [piece.cy - piece.r], piece.width / 2);
    case 'curve':
      return box(
        [piece.x, ...piece.segments.flatMap((s) => [s.c1x, s.c2x, s.x])],
        [piece.y, ...piece.segments.flatMap((s) => [s.c1y, s.c2y, s.y])],
        piece.width / 2,
      );
    case 'leaf': {
      const length = Math.hypot(piece.x2 - piece.x1, piece.y2 - piece.y1);
      const nx = (-(piece.y2 - piece.y1) / length) * piece.bulge;
      const ny = ((piece.x2 - piece.x1) / length) * piece.bulge;
      const mx = (piece.x1 + piece.x2) / 2;
      const my = (piece.y1 + piece.y2) / 2;
      return box([piece.x1, piece.x2, mx + nx, mx - nx], [piece.y1, piece.y2, my + ny, my - ny], 0);
    }
    case 'dot':
      return box([piece.cx], [piece.cy], piece.r);
  }
};

const inside = (frame: BlasonViewport) => (piece: CrestPiece): boolean => {
  const e = extent(piece);
  return e.minX >= frame.x && e.maxX <= frame.x + frame.width && e.minY >= frame.y && e.maxY <= frame.y + frame.height;
};

describe('la décoration de chaque rang', () => {
  it('chaque rang de Murmure à Légende a la sienne, et deux rangs n’ont jamais la même', () => {
    for (const rank of DRAWN) expect(RANK_CRESTS[rank].length).toBeGreaterThan(0);
    expect(new Set(DRAWN.map((rank) => JSON.stringify(RANK_CRESTS[rank]))).size).toBe(DRAWN.length);
  });

  it('de plus en plus riche : un rang ne porte jamais moins de pièces que celui d’en dessous', () => {
    const counts = DRAWN.map((rank) => RANK_CRESTS[rank].length);
    expect(counts).toEqual([...counts].sort((a, b) => a - b));
    expect(counts[0]).toBe(1);
  });

  it('les formes annoncées : un trait, deux arcs, trois traits, la feuille, l’arche', () => {
    expect(RANK_CRESTS.murmure.map((p) => p.kind)).toEqual(['line']);
    expect(RANK_CRESTS.echo.map((p) => p.kind)).toEqual(['arc', 'arc']);
    expect(RANK_CRESTS.voix.map((p) => p.kind)).toEqual(['line', 'line', 'line']);
    expect(RANK_CRESTS.conteur.filter((p) => p.kind === 'leaf')).toHaveLength(3);
    expect(RANK_CRESTS.passeur.filter((p) => p.kind === 'arc')).toHaveLength(2);
  });

  it('le laurier d’Ambassadeur reste sous les décorations des rangs suivants', () => {
    for (const rank of ['orateur', 'oracle', 'legende'] as const) {
      expect(RANK_CRESTS[rank].slice(0, RANK_CRESTS.ambassadeur.length)).toEqual(RANK_CRESTS.ambassadeur);
    }
  });

  it('le Mythe ne porte pas de pièce fixe : son halo vient de son émission', () => {
    expect(RANK_CRESTS.mythe).toEqual([]);
  });

  it('tout tient dans le cadre, et dans le cadre du petit format', () => {
    for (const rank of RANKS) {
      expect(RANK_CRESTS[rank].every(inside({ x: 0, y: 0, ...BLASON_FRAME }))).toBe(true);
      expect(RANK_CRESTS[rank].every(inside(BLASON_COMPACT_FRAME))).toBe(true);
    }
  });

  it('le petit format garde la proportion du cadre entier', () => {
    const ratio = BLASON_FRAME.width / BLASON_FRAME.height;
    expect(BLASON_COMPACT_FRAME.width / BLASON_COMPACT_FRAME.height).toBeCloseTo(ratio, 6);
    expect(BLASON_COMPACT_MYTHIC_FRAME.width / BLASON_COMPACT_MYTHIC_FRAME.height).toBeCloseTo(ratio, 6);
  });

  it('le niveau se grave dans la pointe de l’écu, sous la Signature', () => {
    expect(BLASON_LEVEL_ENGRAVING.x).toBe(100);
    expect(BLASON_LEVEL_ENGRAVING.y).toBeGreaterThan(92);
    expect(BLASON_LEVEL_ENGRAVING.y).toBeLessThan(119);
  });
});

describe('la division en encoches', () => {
  it('V = 1 encoche pleine … I = 5, toujours cinq emplacements', () => {
    expect(GLORY_DIVISIONS.map((division) => divisionNotches(division).filter((n) => n.on).length)).toEqual([1, 2, 3, 4, 5]);
    for (const division of GLORY_DIVISIONS) expect(divisionNotches(division)).toHaveLength(5);
  });

  it('les encoches pleines partent de la gauche, centrées sous la pointe', () => {
    const notches = divisionNotches(4);
    expect(notches.map((n) => n.on)).toEqual([true, true, false, false, false]);
    expect(notches.map((n) => n.x)).toEqual([82, 91, 100, 109, 118]);
  });

  it('le Mythe n’a pas de division, donc pas d’encoche', () => {
    expect(divisionNotches(null)).toEqual([]);
  });
});

describe('la Signature unique d’un Mythe, en halo', () => {
  it('reprend les rayons, la teinte et le numéro de son émission', () => {
    for (const edition of [1, 42, 100, 301]) {
      const design = mythicSignature(edition)!;
      const halo = mythicHalo(edition);
      expect(halo.edition).toBe(edition);
      expect(halo.hue).toBe(design.hue);
      expect(halo.rays).toHaveLength(design.rays.length);
      expect(halo.beads).toHaveLength(design.beads.length);
      expect(halo.numeral?.text).toBe(String(edition));
      expect(halo.gem).toHaveLength(4);
    }
  });

  it('le premier rayon est à midi, au-dessus du centre de l’écu', () => {
    const [first] = mythicHalo(7).rays;
    expect(first?.x1).toBe(100);
    expect(first?.x2).toBe(100);
    expect(first!.y2).toBeLessThan(first!.y1);
  });

  it('deux émissions voisines ne se dessinent pas pareil', () => {
    const drawings = Array.from({ length: 200 }, (_, i) => JSON.stringify({ ...mythicHalo(i + 1), edition: null, numeral: null }));
    expect(new Set(drawings).size).toBe(200);
  });

  it('le numéro gravé passe sous la pointe de l’écu, au-dessus du ruban', () => {
    const numeral = mythicHalo(42).numeral!;
    expect(numeral.x).toBe(100);
    expect(numeral.y).toBeGreaterThan(119);
    expect(numeral.y).toBeLessThan(140);
  });

  it('le halo tient dans le cadre entier et dans le petit format du Mythe', () => {
    for (const edition of [1, 5, 10, 55, 100, 101, 4321]) {
      const halo = mythicHalo(edition);
      const points = [...halo.rays.flatMap((r) => [{ x: r.x1, y: r.y1 }, { x: r.x2, y: r.y2 }]), ...(halo.gem ?? [])];
      for (const frame of [{ x: 0, y: 0, ...BLASON_FRAME }, BLASON_COMPACT_MYTHIC_FRAME]) {
        for (const p of points) {
          expect(p.x).toBeGreaterThanOrEqual(frame.x);
          expect(p.x).toBeLessThanOrEqual(frame.x + frame.width);
          expect(p.y).toBeGreaterThanOrEqual(frame.y);
          expect(p.y).toBeLessThanOrEqual(frame.y + frame.height);
        }
      }
    }
  });

  it('sans émission servie (ancien serveur) : douze rayons, ni gemme, ni perle, ni numéro', () => {
    const halo = mythicHalo(null);
    expect(halo.rays).toHaveLength(MYTHIC_HALO_DEFAULT_RAYS);
    expect(halo.hue).toBeNull();
    expect(halo.gem).toBeNull();
    expect(halo.beads).toEqual([]);
    expect(halo.numeral).toBeNull();
  });

  it('une émission illisible retombe sur le halo par défaut', () => {
    expect(mythicHalo(0)).toEqual(mythicHalo(null));
  });
});
