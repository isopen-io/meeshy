import { describe, expect, test } from 'bun:test';

import { EMPTY_RANGE, entryRanges, keptRowIds, rowSlices, rowsInView, settleRange } from './row-window';

/**
 * LA FENÊTRE DE RANGÉES (#11228) — la loi pure qui dit, pour une liste de
 * rangées de hauteur FIXE, lesquelles monter. Le composant ne fait que la
 * mesurer et la peindre ; tout ce qui se décide se décide ici.
 */

const H = 84;

describe('rowsInView — les rangées que le défileur montre, marge comprise', () => {
  test('en tête de liste : de la première jusqu’au bas de la fenêtre et de sa marge', () => {
    expect(rowsInView({ top: 0, viewport: 840, rowHeight: H, count: 500, marginPx: 168 })).toEqual({ start: 0, end: 12 });
  });

  test('défilée de cent rangées : la fenêtre suit, marge des deux côtés', () => {
    expect(rowsInView({ top: -100 * H, viewport: 840, rowHeight: H, count: 500, marginPx: 168 })).toEqual({ start: 98, end: 112 });
  });

  test('bornée au nombre de rangées en bas de liste', () => {
    expect(rowsInView({ top: -495 * H, viewport: 840, rowHeight: H, count: 500, marginPx: 0 })).toEqual({ start: 495, end: 500 });
  });

  test('une section entièrement hors champ ne monte rien', () => {
    expect(rowsInView({ top: 5000, viewport: 840, rowHeight: H, count: 50, marginPx: 168 })).toBe(EMPTY_RANGE);
    expect(rowsInView({ top: -50 * H - 400, viewport: 840, rowHeight: H, count: 50, marginPx: 168 })).toBe(EMPTY_RANGE);
  });
});

describe('settleRange — la fenêtre ne bouge que quand il le faut', () => {
  test('tant que le besoin tient dans la fenêtre montée, rien ne change (même référence)', () => {
    const current = { start: 10, end: 40 };
    expect(settleRange(current, { start: 12, end: 30 }, { count: 500, extraRows: 6 })).toBe(current);
  });

  test('quand le besoin déborde, la fenêtre se recentre avec sa réserve', () => {
    expect(settleRange({ start: 10, end: 40 }, { start: 35, end: 50 }, { count: 500, extraRows: 6 })).toEqual({ start: 29, end: 56 });
  });

  test('la réserve est bornée aux deux bouts de la liste', () => {
    expect(settleRange(EMPTY_RANGE, { start: 2, end: 10 }, { count: 12, extraRows: 6 })).toEqual({ start: 0, end: 12 });
  });

  test('une liste qui a rétréci sous la fenêtre la recalcule', () => {
    expect(settleRange({ start: 0, end: 40 }, { start: 0, end: 10 }, { count: 20, extraRows: 6 })).toEqual({ start: 0, end: 16 });
  });

  test('rien à montrer : la fenêtre se vide', () => {
    expect(settleRange({ start: 10, end: 40 }, EMPTY_RANGE, { count: 500, extraRows: 6 })).toBe(EMPTY_RANGE);
  });
});

describe('rowSlices — les rangées montées et les cales qui tiennent la place des autres', () => {
  test('une cale de tête toujours présente (l’ancre de mesure), puis la fenêtre, puis la cale de queue', () => {
    expect(rowSlices({ count: 500, range: { start: 100, end: 120 }, keep: [] })).toEqual([
      { kind: 'gap', at: 0, rows: 100 },
      { kind: 'rows', from: 100, to: 120 },
      { kind: 'gap', at: 120, rows: 380 },
    ]);
  });

  test('en tête de liste, la cale de tête est vide', () => {
    expect(rowSlices({ count: 30, range: { start: 0, end: 30 }, keep: [] })).toEqual([
      { kind: 'gap', at: 0, rows: 0 },
      { kind: 'rows', from: 0, to: 30 },
    ]);
  });

  test('une rangée retenue hors fenêtre est montée À SA PLACE, entre deux cales', () => {
    expect(rowSlices({ count: 500, range: { start: 100, end: 110 }, keep: [0, 499, 300, 301] })).toEqual([
      { kind: 'gap', at: 0, rows: 0 },
      { kind: 'rows', from: 0, to: 1 },
      { kind: 'gap', at: 1, rows: 99 },
      { kind: 'rows', from: 100, to: 110 },
      { kind: 'gap', at: 110, rows: 190 },
      { kind: 'rows', from: 300, to: 302 },
      { kind: 'gap', at: 302, rows: 197 },
      { kind: 'rows', from: 499, to: 500 },
    ]);
  });

  test('une rangée retenue contiguë à la fenêtre s’y soude, et les indices hors liste sont ignorés', () => {
    expect(rowSlices({ count: 50, range: { start: 10, end: 20 }, keep: [20, 9, 75, -1] })).toEqual([
      { kind: 'gap', at: 0, rows: 9 },
      { kind: 'rows', from: 9, to: 21 },
      { kind: 'gap', at: 21, rows: 29 },
    ]);
  });

  test('rien de monté : une seule cale porte toute la hauteur', () => {
    expect(rowSlices({ count: 40, range: EMPTY_RANGE, keep: [] })).toEqual([{ kind: 'gap', at: 0, rows: 40 }]);
  });
});

describe('keptRowIds — ce que la fenêtre ne démonte jamais', () => {
  const order = ['a', 'b', 'c', 'd', 'e'];

  test('les deux bouts de la liste, pour que Début et Fin y mènent', () => {
    expect([...keptRowIds({ order, active: null })].sort()).toEqual(['a', 'e']);
  });

  test('la rangée qui tient l’arrêt clavier et ses deux voisines, pour que haut et bas y mènent', () => {
    expect([...keptRowIds({ order, active: 'c' })].sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  test('un arrêt qui n’est plus dans la liste ne retient rien de plus', () => {
    expect([...keptRowIds({ order, active: 'zz' })].sort()).toEqual(['a', 'e']);
  });

  test('une liste vide ne retient rien', () => {
    expect(keptRowIds({ order: [], active: null }).size).toBe(0);
  });
});

describe('entryRanges — avant toute mesure, seul le premier écran se monte', () => {
  test('une section qui commence sous le premier écran n’entre avec RIEN', () => {
    const blocks = [
      { id: 'pinned', count: 2 },
      { id: 'today', count: 5 },
      { id: 'week', count: 40 },
      { id: 'older', count: 300 },
      { id: 'cat-a', count: 20 },
    ];
    const ranges = entryRanges(blocks, { rows: 19 });
    expect(ranges.get('pinned')).toEqual({ start: 0, end: 2 });
    expect(ranges.get('today')).toEqual({ start: 0, end: 5 });
    expect(ranges.get('week')).toEqual({ start: 0, end: 12 });
    expect(ranges.get('older')).toBe(EMPTY_RANGE);
    expect(ranges.get('cat-a')).toBe(EMPTY_RANGE);
  });

  test('le total monté avant mesure ne dépasse jamais un écran et sa réserve, quel que soit le nombre de sections', () => {
    const blocks = Array.from({ length: 10 }, (_, i) => ({ id: `s-${i}`, count: 50 }));
    const total = [...entryRanges(blocks, { rows: 19 }).values()].reduce((sum, range) => sum + (range.end - range.start), 0);
    expect(total).toBe(19);
  });
});
