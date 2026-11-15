import { describe, expect, test } from 'bun:test';

import { frameAreas, frameSlots, tiltDegrees, type FrameLayoutInput, type FrameSlotBox } from './frame-layout';
import { FRAME_ARRANGEMENTS, SLOT_TILTS, type FrameArrangement, type FrameLook } from './frame-spec';

/**
 * LA GÉOMÉTRIE DES CADRES (#8741, spec § 4.1) — une case par personne, toutes
 * dans la toile, déterministes, pour chaque disposition, chaque nombre de 2 à
 * 12 et les deux orientations.
 */

const PORTRAIT = { width: 1080, height: 1920 } as const;
const LANDSCAPE = { width: 1920, height: 1080 } as const;
const PEOPLE = Array.from({ length: 11 }, (_, index) => index + 2);

const input = (arrangement: FrameArrangement, overrides: { readonly layout?: Partial<FrameLook['layout']>; readonly slot?: Partial<FrameLook['slot']> } = {}): FrameLayoutInput => ({
  layout: { arrangement, margin: 0.06, gap: 0.03, top: 0.18, bottom: 0.12, ...overrides.layout },
  slot: { shape: 'round', radius: 0.08, tilt: 'none', tone: 'color', ...overrides.slot },
});

const EPSILON = 1e-6;

/** L'encombrement d'une case tournée. */
const footprint = (box: FrameSlotBox) => {
  const radians = (Math.abs(box.rotation) * Math.PI) / 180;
  const halfX = (box.rect.width * Math.cos(radians) + box.rect.height * Math.sin(radians)) / 2;
  const halfY = (box.rect.width * Math.sin(radians) + box.rect.height * Math.cos(radians)) / 2;
  const cx = box.rect.x + box.rect.width / 2;
  const cy = box.rect.y + box.rect.height / 2;
  return { left: cx - halfX, right: cx + halfX, top: cy - halfY, bottom: cy + halfY };
};

const overlapArea = (a: FrameSlotBox['rect'], b: FrameSlotBox['rect']): number =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

describe('frameSlots — chaque disposition, chaque nombre, chaque orientation', () => {
  FRAME_ARRANGEMENTS.forEach((arrangement) =>
    [PORTRAIT, LANDSCAPE].forEach((size) =>
      SLOT_TILTS.forEach((tilt) =>
        test(`${arrangement} ${size.width}×${size.height} ${tilt} : n cases, dans la zone de contenu, sans NaN, déterministes`, () => {
          PEOPLE.forEach((people) => {
            const frame = input(arrangement, { slot: { tilt } });
            const boxes = frameSlots(frame, people, size);
            const content = frameAreas(frame.layout, size).content;
            expect(boxes).toHaveLength(people);
            expect(boxes.map((box) => box.index)).toEqual(Array.from({ length: people }, (_, index) => index));
            boxes.forEach((box) => {
              [box.rect.x, box.rect.y, box.rect.width, box.rect.height, box.rotation].forEach((value) => expect(Number.isFinite(value)).toBe(true));
              expect(box.rect.width).toBeGreaterThan(0);
              expect(box.rect.height).toBeGreaterThan(0);
              const around = footprint(box);
              expect(around.left).toBeGreaterThanOrEqual(content.x - EPSILON);
              expect(around.top).toBeGreaterThanOrEqual(content.y - EPSILON);
              expect(around.right).toBeLessThanOrEqual(content.x + content.width + EPSILON);
              expect(around.bottom).toBeLessThanOrEqual(content.y + content.height + EPSILON);
            });
            expect(frameSlots(frame, people, size)).toEqual(boxes);
          });
        }),
      ),
    ),
  );

  (['grid', 'row', 'column', 'arch', 'orbit', 'tiers', 'mosaic', 'honeycomb', 'hero', 'scatter'] as const).forEach((arrangement) =>
    test(`${arrangement} : les cases ne se chevauchent pas`, () => {
      [PORTRAIT, LANDSCAPE].forEach((size) =>
        PEOPLE.forEach((people) => {
          const boxes = frameSlots(input(arrangement), people, size);
          const collisions = boxes.flatMap((a, i) => boxes.slice(i + 1).filter((b) => overlapArea(a.rect, b.rect) > (arrangement === 'honeycomb' ? a.rect.width * a.rect.height * 0.13 : 1)).map((b) => `${people}:${a.index}/${b.index}`));
          expect(collisions).toEqual([]);
        }),
      );
    }),
  );

  test('la ruche force l’hexagone, quelle que soit la forme déclarée', () => {
    frameSlots(input('honeycomb', { slot: { shape: 'heart' } }), 6, PORTRAIT).forEach((box) => expect(box.shape).toBe('hex'));
    frameSlots(input('grid', { slot: { shape: 'heart' } }), 6, PORTRAIT).forEach((box) => expect(box.shape).toBe('heart'));
  });

  test('split et diagonal retombent sur la grille hors du duo', () => {
    [3, 5, 7].forEach((people) => {
      const grid = frameSlots(input('grid'), people, PORTRAIT);
      expect(frameSlots(input('split'), people, PORTRAIT)).toEqual(grid);
      expect(frameSlots(input('diagonal'), people, PORTRAIT)).toEqual(grid);
    });
  });

  test('split : deux moitiés empilées en portrait, côte à côte en paysage', () => {
    const [top, bottom] = frameSlots(input('split'), 2, PORTRAIT);
    expect(top?.rect.width).toBe(bottom?.rect.width ?? -1);
    expect((bottom?.rect.y ?? 0) > (top?.rect.y ?? 0)).toBe(true);
    const [left, right] = frameSlots(input('split'), 2, LANDSCAPE);
    expect((right?.rect.x ?? 0) > (left?.rect.x ?? 0)).toBe(true);
    expect(left?.rect.y).toBe(right?.rect.y ?? -1);
  });

  test('diagonal : la première en haut à gauche, la seconde en bas à droite, 64 % chacune', () => {
    const frame = input('diagonal');
    const content = frameAreas(frame.layout, PORTRAIT).content;
    const [first, second] = frameSlots(frame, 2, PORTRAIT);
    expect(first?.rect).toEqual({ x: content.x, y: content.y, width: content.width * 0.64, height: content.height * 0.64 });
    expect((second?.rect.x ?? 0) + (second?.rect.width ?? 0)).toBeCloseTo(content.x + content.width, 6);
    expect((second?.rect.y ?? 0) + (second?.rect.height ?? 0)).toBeCloseTo(content.y + content.height, 6);
  });

  test('hero : la case 1 prend 62 % de la hauteur en portrait, les médaillons sont carrés', () => {
    const frame = input('hero');
    const content = frameAreas(frame.layout, PORTRAIT).content;
    const [first, ...rest] = frameSlots(frame, 4, PORTRAIT);
    expect(first?.rect.height).toBeCloseTo(content.height * 0.62, 6);
    rest.forEach((box) => expect(box.rect.width).toBeCloseTo(box.rect.height, 6));
  });

  test('orbit : la case 1 au centre de la zone, à 38 % de son petit côté', () => {
    const frame = input('orbit');
    const content = frameAreas(frame.layout, LANDSCAPE).content;
    const [core] = frameSlots(frame, 5, LANDSCAPE);
    expect((core?.rect.x ?? 0) + (core?.rect.width ?? 0) / 2).toBeCloseTo(content.x + content.width / 2, 6);
    expect(core?.rect.width).toBeCloseTo(Math.min(content.width, content.height) * 0.38, 6);
  });

  test('arch : les cases du milieu sont plus hautes que celles des bouts (arc ouvert vers le bas)', () => {
    const boxes = frameSlots(input('arch'), 5, PORTRAIT);
    expect((boxes[2]?.rect.y ?? 0) < (boxes[0]?.rect.y ?? 0)).toBe(true);
    expect(boxes[0]?.rect.y).toBeCloseTo(boxes[4]?.rect.y ?? -1, 6);
  });

  test('tiers : la rangée du fond est plus petite (86 %) et plus haute', () => {
    const boxes = frameSlots(input('tiers'), 6, PORTRAIT);
    const sizes = [...new Set(boxes.map((box) => Math.round(box.rect.width * 1000)))].sort((a, b) => b - a);
    expect(sizes.length).toBeGreaterThanOrEqual(2);
    expect((sizes[1] ?? 0) / (sizes[0] ?? 1)).toBeCloseTo(0.86, 3);
  });

  test('cascade : chaque carte descend vers le bas à droite de la précédente', () => {
    const boxes = frameSlots(input('cascade'), 4, PORTRAIT);
    boxes.slice(1).forEach((box, index) => {
      expect(box.rect.x > (boxes[index]?.rect.x ?? 0)).toBe(true);
      expect(box.rect.y > (boxes[index]?.rect.y ?? 0)).toBe(true);
    });
  });

  test('scatter : chaque case fait 88 % de sa case de grille', () => {
    const grid = frameSlots(input('grid'), 4, PORTRAIT);
    frameSlots(input('scatter'), 4, PORTRAIT).forEach((box, index) => expect(box.rect.width).toBeCloseTo((grid[index]?.rect.width ?? 0) * 0.88, 6));
  });

  test('une inclinaison alterne de sens et reste dans son amplitude', () => {
    expect(tiltDegrees('none', 3)).toBe(0);
    Array.from({ length: 12 }, (_, index) => index).forEach((index) => {
      const gentle = tiltDegrees('gentle', index);
      const wild = tiltDegrees('wild', index);
      expect(Math.abs(gentle)).toBeGreaterThanOrEqual(2);
      expect(Math.abs(gentle)).toBeLessThanOrEqual(4);
      expect(Math.abs(wild)).toBeLessThanOrEqual(9);
      expect(Math.sign(gentle)).toBe(index % 2 === 0 ? -1 : 1);
    });
  });

  test('les zones : la marge rogne l’intérieur, les réserves se prennent sur la hauteur', () => {
    const areas = frameAreas({ arrangement: 'grid', margin: 0.1, gap: 0, top: 0.2, bottom: 0.1 }, PORTRAIT);
    expect(areas.unit).toBe(1080);
    expect(areas.inner).toEqual({ x: 108, y: 108, width: 864, height: 1704 });
    expect(areas.top).toEqual({ x: 108, y: 108, width: 864, height: 384 });
    expect(areas.bottom).toEqual({ x: 108, y: 1812 - 192, width: 864, height: 192 });
    expect(areas.content).toEqual({ x: 108, y: 492, width: 864, height: 1704 - 384 - 192 });
  });

  test('aucune personne, aucune case', () => {
    expect(frameSlots(input('grid'), 0, PORTRAIT)).toEqual([]);
  });
});
