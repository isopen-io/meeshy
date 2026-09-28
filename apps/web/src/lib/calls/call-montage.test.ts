import { describe, expect, test } from 'bun:test';

import { captureFileName, captureSize, containRect, coverCrop, faceCropRect, gridRects, heartBox, MONTAGE_STYLES, montageLayout, type Rect, type Size } from './call-montage';

/**
 * LES MONTAGES D'UNE CAPTURE D'APPEL (#8552) — sept styles, une géométrie
 * déterministe : chaque visage a sa case, dans l'image, dans l'ordre ; la
 * capture est l'aperçu à la pleine résolution.
 */

const PORTRAIT: Size = { width: 1080, height: 1920 };
const LANDSCAPE: Size = { width: 1920, height: 1080 };

const inside = (rect: Rect, size: Size): boolean => rect.x >= -0.5 && rect.y >= -0.5 && rect.x + rect.width <= size.width + 0.5 && rect.y + rect.height <= size.height + 0.5;

const overlaps = (a: Rect, b: Rect): boolean => a.x < b.x + b.width - 0.5 && b.x < a.x + a.width - 0.5 && a.y < b.y + b.height - 0.5 && b.y < a.y + a.height - 0.5;

describe('montageLayout', () => {
  test('sept styles, dans l’ordre du panneau', () => {
    expect(MONTAGE_STYLES).toEqual(['screen', 'grid', 'strip', 'polaroid', 'magazine', 'comic', 'heart']);
  });

  MONTAGE_STYLES.flatMap((style) => [1, 2, 3, 5].map((count) => [style, count] as const)).forEach(([style, count]) =>
    test(`${style} à ${count} visage(s) : une case par visage, chacune dans l’image`, () => {
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
    MONTAGE_STYLES.forEach((style) => expect(montageLayout({ style, count: 0, size: PORTRAIT }).cells).toEqual([]));
  });

  test('la mosaïque ne superpose aucune case', () => {
    const cells = montageLayout({
      style: 'grid',
      count: 5,
      size: LANDSCAPE,
    }).cells;
    cells.forEach((a, i) => cells.slice(i + 1).forEach((b) => expect(overlaps(a.card, b.card)).toBe(false)));
  });

  test('« Plein écran » garde la place de chaque tuile à l’écran', () => {
    const onScreen = [
      { x: 0, y: 0, width: 1, height: 1 },
      { x: 0.7, y: 0.05, width: 0.25, height: 0.2 },
    ];
    const cells = montageLayout({
      style: 'screen',
      count: 2,
      size: PORTRAIT,
      onScreen,
    }).cells;
    expect(cells[0]?.card).toEqual({ x: 0, y: 0, width: 1080, height: 1920 });
    expect(cells[1]?.card).toEqual({ x: 756, y: 96, width: 270, height: 384 });
  });

  test('le photomaton empile ses poses de haut en bas, entre deux rangs de perforations', () => {
    const layout = montageLayout({ style: 'strip', count: 3, size: PORTRAIT });
    const ys = layout.cells.map((cell) => cell.card.y);
    expect([...ys].sort((a, b) => a - b)).toEqual(ys);
    expect(layout.ornaments.some((ornament) => ornament.kind === 'holes')).toBe(true);
  });

  test('le polaroïd encadre de blanc, penche chaque carte, et laisse la marge du bas plus large', () => {
    const cells = montageLayout({
      style: 'polaroid',
      count: 3,
      size: PORTRAIT,
    }).cells;
    cells.forEach((cell) => {
      expect(cell.cardColor).toBe('#fbfaf5');
      expect(cell.rotation).not.toBe(0);
      const bottom = cell.card.y + cell.card.height - (cell.photo.y + cell.photo.height);
      expect(bottom).toBeGreaterThan(cell.photo.x - cell.card.x);
    });
  });

  test('le magazine met le premier visage en couverture, sous le titre, les autres en médaillons', () => {
    const layout = montageLayout({
      style: 'magazine',
      count: 3,
      size: PORTRAIT,
    });
    expect(layout.cells[0]?.card).toEqual({
      x: 0,
      y: 0,
      width: 1080,
      height: 1920,
    });
    expect(layout.cells.slice(1).every((cell) => cell.card.width < 400 && cell.stroke !== null)).toBe(true);
    expect(layout.ornaments.find((ornament) => ornament.kind === 'masthead')).toMatchObject({ text: 'MEESHY' });
  });

  test('la BD cerne chaque case d’encre et donne une bulle à la première', () => {
    const layout = montageLayout({ style: 'comic', count: 2, size: LANDSCAPE });
    expect(layout.cells.every((cell) => cell.stroke?.color === '#111111')).toBe(true);
    const bubble = layout.ornaments.find((ornament) => ornament.kind === 'bubble');
    expect(bubble).toBeDefined();
    if (bubble?.kind === 'bubble') expect(overlaps(bubble.rect, layout.cells[0]?.card ?? bubble.rect)).toBe(true);
  });

  test('le cœur découpe les visages dans sa forme, centrée', () => {
    const layout = montageLayout({ style: 'heart', count: 2, size: PORTRAIT });
    const box = heartBox(PORTRAIT);
    expect(layout.clip).toEqual({ shape: 'heart', box });
    expect(box.x + box.width / 2).toBe(540);
    layout.cells.forEach((cell) =>
      expect(
        inside(cell.card, {
          width: box.x + box.width,
          height: box.y + box.height,
        }),
      ).toBe(true),
    );
  });

  test('le même appel, le même instant : le même montage (déterministe)', () => {
    expect(montageLayout({ style: 'polaroid', count: 4, size: PORTRAIT })).toEqual(montageLayout({ style: 'polaroid', count: 4, size: PORTRAIT }));
  });
});

describe('gridRects', () => {
  test('cinq cases en paysage : trois puis deux, la dernière rangée centrée', () => {
    const rects = gridRects(5, { x: 0, y: 0, width: 300, height: 200 }, 0);
    expect(rects.map((rect) => Math.round(rect.y))).toEqual([0, 0, 0, 100, 100]);
    expect(Math.round(rects[3]?.x ?? 0)).toBe(50);
  });
});

describe('captureSize', () => {
  test('un écran étroit capture en portrait 1080 × 1920, un large en paysage 1920 × 1080', () => {
    expect(captureSize({ width: 390, height: 844 })).toEqual({
      width: 1080,
      height: 1920,
    });
    expect(captureSize({ width: 1440, height: 900 })).toEqual({
      width: 1920,
      height: 1080,
    });
  });
});

describe('faceCropRect', () => {
  test('un carré autour du visage, plus large que lui, centré sur lui', () => {
    const crop = faceCropRect({ x: 500, y: 200, width: 200, height: 260 }, { width: 1280, height: 720 });
    expect(crop.width).toBe(crop.height);
    expect(crop.width).toBeGreaterThan(260);
    expect(crop.x + crop.width / 2).toBeCloseTo(600, 0);
  });

  test('jamais hors de l’image : collé au bord, et pas plus grand qu’elle', () => {
    const crop = faceCropRect({ x: 0, y: 0, width: 600, height: 700 }, { width: 1280, height: 720 });
    expect(crop).toEqual({ x: 0, y: 0, width: 720, height: 720 });
  });
});

describe('coverCrop et containRect', () => {
  test('une vidéo 16:9 dans un carré : on en garde le milieu', () => {
    expect(coverCrop({ width: 1600, height: 900 }, { width: 500, height: 500 })).toEqual({ x: 350, y: 0, width: 900, height: 900 });
  });

  test('une source vide ne rend rien', () => {
    expect(coverCrop({ width: 0, height: 0 }, { width: 10, height: 10 }).width).toBe(0);
  });

  test('un partage d’écran tient entier dans sa case', () => {
    expect(containRect({ width: 1600, height: 900 }, { x: 0, y: 0, width: 800, height: 800 })).toEqual({ x: 0, y: 175, width: 800, height: 450 });
  });
});

describe('captureFileName', () => {
  test('le style et l’heure, puis le rang d’un portrait', () => {
    const at = new Date(2026, 8, 28, 9, 5, 3);
    expect(captureFileName({ at, style: 'comic' })).toBe('meeshy-appel-comic-20260928-090503.png');
    expect(captureFileName({ at, style: 'visage', index: 1 })).toBe('meeshy-appel-visage-20260928-090503-2.png');
  });
});
