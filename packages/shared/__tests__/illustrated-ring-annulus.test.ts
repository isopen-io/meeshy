import { describe, expect, it } from 'vitest';
import { ringsOf } from '../scripts/compose-illustrated-ring-lotties';
import { art, circle, radial } from '../scripts/illustrated-rings/kit';
import { ILLUSTRATED_PACKS } from '../scripts/illustrated-rings/packs';

/**
 * #19935 — le moteur Core Animation de Lottie (iOS) ignore la règle pair-impair d'un remplissage en
 * DÉGRADÉ : une bande « cercle de 118 percé d'un cercle de 98 » s'y peint en disque plein, et le
 * film avant d'un cadre recouvre les initiales ou la photo. La règle non nulle, avec l'ellipse intérieure
 * tracée en sens inverse, n'y change rien (vu au simulateur) : un anneau s'émet donc en TRAIT épais sur
 * son cercle médian, que tous les moteurs peignent sans trou à percer.
 */
type Item = { readonly ty?: string; readonly r?: number; readonly d?: number; readonly s?: { readonly k?: unknown }; readonly it?: readonly Item[] };

const groups = (items: readonly Item[]): readonly Item[] =>
  items.flatMap((item) => (item.ty === 'gr' ? [item, ...groups(item.it ?? [])] : []));

const filmGroups = (film: unknown): readonly Item[] =>
  ((film as { layers?: readonly { shapes?: readonly Item[] }[] }).layers ?? []).flatMap((layer) => groups(layer.shapes ?? []));

const side = (ellipse: Item): number => ((ellipse.s?.k as readonly number[] | undefined) ?? [0])[0] ?? 0;

describe('un anneau de cadre illustré garde son trou dans tous les moteurs (#19935)', () => {
  it('une bande en dégradé pair-impair devient un trait épais sur le cercle médian, sans trou à percer', () => {
    const band = art([circle(59), circle(49)], [radial([[0, '#08133A'], [1, '#1D4ED8']], [50, 50], 59, { evenOdd: true })]) as Item;
    const items = band.it ?? [];
    const ellipses = items.filter((item) => item.ty === 'el');
    expect(ellipses.map(side)).toEqual([108]);
    const paints = items.filter((item) => ['gf', 'fl', 'gs', 'st'].includes(item.ty ?? ''));
    expect(paints.map((paint) => paint.ty)).toEqual(['gs']);
    expect((paints[0] as { w?: { k?: number } }).w?.k).toBe(10);
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
