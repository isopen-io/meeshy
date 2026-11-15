import { describe, expect, test } from 'bun:test';

import { montageLayout, type MontageLayout, type Ornament, type Rect, type Size } from './call-montage';

/**
 * LES MONTAGES GLAMOUR (#8580) — couverture de magazine, tapis rouge, doré,
 * pellicule, néon, noir et blanc : chacun compose TOUS les visages visibles,
 * avec une géométrie déterministe, dans l'image.
 */

const PORTRAIT: Size = { width: 1080, height: 1920 };
const LANDSCAPE: Size = { width: 1920, height: 1080 };

const GLAMOUR = ['cover', 'gold', 'redcarpet', 'film', 'neon', 'noir'] as const;

const inside = (rect: Rect, size: Size): boolean => rect.x >= -0.5 && rect.y >= -0.5 && rect.x + rect.width <= size.width + 0.5 && rect.y + rect.height <= size.height + 0.5;

const overlaps = (a: Rect, b: Rect): boolean => a.x < b.x + b.width - 0.5 && b.x < a.x + a.width - 0.5 && a.y < b.y + b.height - 0.5 && b.y < a.y + a.height - 0.5;

const ornaments = <K extends Ornament['kind']>(layout: MontageLayout, kind: K): readonly Extract<Ornament, { kind: K }>[] => layout.ornaments.filter((ornament): ornament is Extract<Ornament, { kind: K }> => ornament.kind === kind);

describe('les montages glamour', () => {
  GLAMOUR.flatMap((style) => [1, 2, 4, 7].map((count) => [style, count] as const)).forEach(([style, count]) =>
    test(`${style} à ${count} visage(s) : tous composés, chacun dans l’image`, () => {
      [PORTRAIT, LANDSCAPE].forEach((size) => {
        const layout = montageLayout({ style, count, size });
        expect(layout.cells).toHaveLength(count);
        layout.cells.forEach((cell) => {
          expect(inside(cell.card, size)).toBe(true);
          expect(cell.photo.width).toBeGreaterThan(0);
          expect(cell.photo.height).toBeGreaterThan(0);
        });
      });
    }),
  );

  test('sans visage, aucune case', () => {
    GLAMOUR.forEach((style) => expect(montageLayout({ style, count: 0, size: PORTRAIT }).cells).toEqual([]));
  });

  test('déterministe : le même instant donne le même montage', () => {
    GLAMOUR.forEach((style) => expect(montageLayout({ style, count: 3, size: PORTRAIT })).toEqual(montageLayout({ style, count: 3, size: PORTRAIT })));
  });

  test('la couverture : le premier visage en héros plein cadre, sous « MEESHY », les autres en médaillons ronds', () => {
    const layout = montageLayout({ style: 'cover', count: 4, size: PORTRAIT });
    expect(layout.cells[0]?.card).toEqual({ x: 0, y: 0, width: 1080, height: 1920 });
    const medallions = layout.cells.slice(1);
    medallions.forEach((cell) => {
      expect(cell.photo.width).toBe(cell.photo.height);
      expect(cell.radius).toBe(cell.photo.width / 2);
      expect(cell.stroke).not.toBeNull();
    });
    medallions.forEach((a, index) => medallions.slice(index + 1).forEach((b) => expect(overlaps(a.card, b.card)).toBe(false)));
    expect(ornaments(layout, 'masthead')[0]?.text).toBe('MEESHY');
    expect(ornaments(layout, 'coverline')).toHaveLength(3);
    expect(ornaments(layout, 'dateline')).toHaveLength(1);
    const barcode = ornaments(layout, 'barcode')[0];
    expect(barcode).toBeDefined();
    if (barcode !== undefined) {
      expect(inside(barcode.rect, PORTRAIT)).toBe(true);
      expect(barcode.rect.y).toBeGreaterThan(PORTRAIT.height * 0.8);
      expect(barcode.bars.length).toBeGreaterThan(20);
    }
  });

  test('les médaillons de la couverture ne couvrent ni le titre ni les accroches', () => {
    const layout = montageLayout({ style: 'cover', count: 6, size: PORTRAIT });
    const masthead = ornaments(layout, 'masthead')[0]?.rect;
    const lines = ornaments(layout, 'coverline').map((line) => line.rect);
    layout.cells.slice(1).forEach((cell) => {
      if (masthead !== undefined) expect(overlaps(cell.card, masthead)).toBe(false);
      lines.forEach((line) => expect(overlaps(cell.card, line)).toBe(false));
    });
  });

  test('le tapis rouge aligne les participants sur une même ligne, sous les flashs des photographes', () => {
    const layout = montageLayout({ style: 'redcarpet', count: 4, size: PORTRAIT });
    const bottoms = new Set(layout.cells.map((cell) => Math.round(cell.card.y + cell.card.height)));
    expect(bottoms.size).toBe(1);
    const xs = layout.cells.map((cell) => cell.card.x);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    layout.cells.forEach((a, index) => layout.cells.slice(index + 1).forEach((b) => expect(overlaps(a.card, b.card)).toBe(false)));
    const flashes = ornaments(layout, 'flashes')[0];
    expect(flashes?.points.length).toBeGreaterThanOrEqual(6);
    expect(layout.background).toMatchObject({ kind: 'radial' });
    expect(ornaments(layout, 'drapes')).toHaveLength(1);
  });

  test('le doré : un cadre d’or qui entoure tous les visages, un bokeh chaud, une lueur douce', () => {
    const layout = montageLayout({ style: 'gold', count: 3, size: PORTRAIT });
    const frame = ornaments(layout, 'frame')[0];
    expect(frame).toBeDefined();
    layout.cells.forEach((cell) => {
      expect(cell.glow).not.toBeNull();
      if (frame !== undefined) expect(inside(cell.card, { width: frame.rect.x + frame.rect.width, height: frame.rect.y + frame.rect.height })).toBe(true);
    });
    expect(ornaments(layout, 'bokeh')[0]?.circles.length).toBeGreaterThanOrEqual(12);
  });

  test('la pellicule : des images de même taille, des perforations des deux côtés, un numéro par image', () => {
    const layout = montageLayout({ style: 'film', count: 3, size: PORTRAIT });
    expect(new Set(layout.cells.map((cell) => Math.round(cell.photo.width))).size).toBe(1);
    const holes = ornaments(layout, 'holes')[0]?.rects ?? [];
    const first = layout.cells[0]?.photo;
    expect(first).toBeDefined();
    if (first !== undefined) {
      expect(holes.some((hole) => hole.x + hole.width < first.x)).toBe(true);
      expect(holes.some((hole) => hole.x > first.x + first.width)).toBe(true);
    }
    expect(ornaments(layout, 'frameNumbers')[0]?.items).toHaveLength(3);
  });

  test('la pellicule d’un écran large défile à l’horizontale', () => {
    const layout = montageLayout({ style: 'film', count: 3, size: LANDSCAPE });
    const ys = new Set(layout.cells.map((cell) => Math.round(cell.card.y)));
    expect(ys.size).toBe(1);
  });

  test('le néon : des cadres lumineux rose et cyan en alternance, sur un fond sombre', () => {
    const layout = montageLayout({ style: 'neon', count: 4, size: PORTRAIT });
    expect(layout.cells.map((cell) => cell.glow)).toEqual(['#ff2d95', '#00e5ff', '#ff2d95', '#00e5ff']);
    expect(layout.cells.every((cell) => cell.stroke !== null)).toBe(true);
  });

  test('le noir et blanc : chaque visage en monochrome, un grain et un vignettage de studio', () => {
    const layout = montageLayout({ style: 'noir', count: 2, size: PORTRAIT });
    expect(layout.cells.every((cell) => cell.tone === 'mono')).toBe(true);
    expect(ornaments(layout, 'grain')).toHaveLength(1);
    expect(ornaments(layout, 'vignette')).toHaveLength(1);
  });

  test('les styles d’avant restent en couleur, sans lueur', () => {
    (['grid', 'strip', 'polaroid', 'magazine', 'comic', 'heart'] as const).forEach((style) =>
      montageLayout({ style, count: 2, size: PORTRAIT }).cells.forEach((cell) => {
        expect(cell.tone).toBe('color');
        expect(cell.glow).toBeNull();
      }),
    );
  });
});
