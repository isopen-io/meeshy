import { describe, expect, it } from 'vitest';
import { ringsOf } from '../scripts/compose-illustrated-ring-lotties';
import { art, circle, radial } from '../scripts/illustrated-rings/kit';
import { ILLUSTRATED_PACKS } from '../scripts/illustrated-rings/packs';

/**
 * #19935 — le moteur Core Animation de Lottie (iOS) ignore la règle pair-impair d'un remplissage en
 * DÉGRADÉ : une bande « cercle de 118 percé d'un cercle de 98 » s'y peint en disque plein, et le
 * film avant d'un cadre recouvre les initiales ou la photo. Un anneau s'émet donc en règle NON NULLE,
 * l'ellipse intérieure tracée en sens inverse — le trou que tous les moteurs respectent.
 */
type Item = { readonly ty?: string; readonly r?: number; readonly d?: number; readonly s?: { readonly k?: unknown }; readonly it?: readonly Item[] };

const groups = (items: readonly Item[]): readonly Item[] =>
  items.flatMap((item) => (item.ty === 'gr' ? [item, ...groups(item.it ?? [])] : []));

const filmGroups = (film: unknown): readonly Item[] =>
  ((film as { layers?: readonly { shapes?: readonly Item[] }[] }).layers ?? []).flatMap((layer) => groups(layer.shapes ?? []));

const side = (ellipse: Item): number => ((ellipse.s?.k as readonly number[] | undefined) ?? [0])[0] ?? 0;

describe('un anneau de cadre illustré garde son trou dans tous les moteurs (#19935)', () => {
  it('une bande en dégradé pair-impair s’émet en règle non nulle, l’ellipse intérieure en sens inverse', () => {
    const band = art([circle(59), circle(49)], [radial([[0, '#08133A'], [1, '#1D4ED8']], [50, 50], 59, { evenOdd: true })]) as Item;
    const paints = (band.it ?? []).filter((item) => item.ty === 'gf' || item.ty === 'fl');
    const ellipses = (band.it ?? []).filter((item) => item.ty === 'el');
    expect(paints.map((paint) => paint.r)).toEqual([1]);
    const [outer, inner] = [...ellipses].sort((a, b) => side(b) - side(a));
    expect(outer?.d).toBe(1);
    expect(inner?.d).toBe(3);
  });

  it('aucun film de cadre illustré n’émet de remplissage pair-impair', () => {
    const evenOdd = ILLUSTRATED_PACKS.flatMap((pack) =>
      pack.frames.flatMap((frame) =>
        (['back', 'front'] as const).flatMap((filmSide) => {
          const build = frame[filmSide];
          if (build === undefined) return [];
          return filmGroups(build())
            .flatMap((group) => (group.it ?? []).filter((item) => (item.ty === 'gf' || item.ty === 'fl') && item.r === 2))
            .map(() => `${frame.key}/${filmSide}`);
        }),
      ),
    );
    expect(evenOdd).toEqual([]);
    expect(ringsOf(ILLUSTRATED_PACKS[0]!).length).toBeGreaterThan(0);
  });
});
