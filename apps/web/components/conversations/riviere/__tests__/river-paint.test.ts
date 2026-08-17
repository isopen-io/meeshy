import { resolveRiverLanes } from '@meeshy/shared/utils/river-lanes';
import { buildRiverPaint, type RiverRowExtent } from '../river-paint';

const participants = [
  { id: 'me', displayName: 'Moi' },
  { id: 'alice', displayName: 'Alice' },
  { id: 'bob', displayName: 'Bob' },
];

// rang 0 = alice (m1), rang 1 = bob (m2), rang 2 = moi (m3, répond à m1 → connecteur
// + nœud `addressed` sur la branche d'alice au rang 2).
const messages = [
  { id: 'm1', senderId: 'alice', createdAt: 0 },
  { id: 'm2', senderId: 'bob', createdAt: 1000 },
  { id: 'm3', senderId: 'me', createdAt: 2000, replyToMessageId: 'm1' },
];

const geometry = resolveRiverLanes({ messages, participants, viewerId: 'me' });

// 100px par rang, mesurés — jamais une hauteur supposée (§7ter A1).
const rowExtents = new Map<number, RiverRowExtent>([
  [0, { top: 0, bottom: 100 }],
  [1, { top: 100, bottom: 200 }],
  [2, { top: 200, bottom: 300 }],
]);

const railX = (laneIndex: number) => laneIndex * 100 + 50;
const resolveBow = (laneDistancePx: number) => Math.max(34, Math.abs(laneDistancePx) * 0.5);

describe('buildRiverPaint — sur une géométrie RÉELLE (resolveRiverLanes, jamais fabriquée)', () => {
  it('geometry.layout === "lanes" (décor du test — 3 voix, ≤ 7 couloirs)', () => {
    expect(geometry.layout).toBe('lanes');
  });

  it('trace un connecteur pour la réponse m3 (rang 2, colonne 0 = moi) → m1 (rang 0, colonne 1 = alice)', () => {
    const paint = buildRiverPaint({ geometry, rowExtents, railX, resolveBow, idPrefix: 'test' });
    expect(paint.connectors).toHaveLength(1);
    // fx=railX(0)=50, fy=rowMid(2)=250 ; tx=railX(1)=150, ty=rowMid(0)=50 ;
    // side=+1 (tx>=fx) ; bow=resolveBow(100)=max(34,50)=50.
    expect(paint.connectors[0]!.d).toBe('M 50 250 C 100 250 100 50 150 50');
  });

  it('les traits partent du HAUT du segment (rowTop + 2)', () => {
    const paint = buildRiverPaint({ geometry, rowExtents, railX, resolveBow, idPrefix: 'test' });
    // La branche d'alice naît au rang 0 : y1 = rowTop[0] + 2 = 2.
    const aliceLine = paint.lines.find((line) => line.x === railX(1)); // alice = colonne 1 (viewer = colonne 0)
    expect(aliceLine).toBeDefined();
    expect(aliceLine!.y1).toBe(2);
  });

  it('pose une amorce de naissance (birth) par segment', () => {
    const paint = buildRiverPaint({ geometry, rowExtents, railX, resolveBow, idPrefix: 'test' });
    expect(paint.births.length).toBeGreaterThan(0);
  });

  it('sérialisée : AUCUN trait, quelle que soit la géométrie (§7ter C)', () => {
    const serialized = { ...geometry, layout: 'serialized' as const };
    const paint = buildRiverPaint({ geometry: serialized, rowExtents, railX, resolveBow, idPrefix: 'test' });
    expect(paint).toEqual({ connectors: [], lines: [], tails: [], births: [], rings: [] });
  });

  it('un rang sans extent mesuré n\'explose rien — le connecteur est simplement absent', () => {
    const partialExtents = new Map<number, RiverRowExtent>([[0, { top: 0, bottom: 100 }]]);
    const paint = buildRiverPaint({
      geometry,
      rowExtents: partialExtents,
      railX,
      resolveBow,
      idPrefix: 'test',
    });
    expect(paint.connectors).toHaveLength(0);
  });

  it('la courbe utilise `resolveBow` injecté, jamais un second calcul de bow', () => {
    const constantBow = () => 999;
    const paint = buildRiverPaint({ geometry, rowExtents, railX, resolveBow: constantBow, idPrefix: 'test' });
    // side=+1 ⇒ premier point de contrôle = fx + 1*999 = 50 + 999 = 1049.
    expect(paint.connectors[0]!.d).toBe('M 50 250 C 1049 250 -849 50 150 50');
  });
});
