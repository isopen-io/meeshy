import { describe, expect, test } from 'bun:test';

import { layoutMessageCard, type CardMediaOp, type Measure, type MessageCardInput } from './message-card-layout';
import type { CardMedia } from './message-card-media';
import { paintMessageCard } from './message-card-paint';
import { cardMediaOf } from './message-card-subject';
import { isStickerMedia, measuredInput, stickerFrame, withMeasuredSizes } from './message-card-sticker';
import { templateOf } from './message-card-templates';

/**
 * UN STICKER NE SE COUPE JAMAIS (#10915) : ajusté (« contain ») dans un cadre
 * à son rapport, centré, sans clip arrondi ; les photos ne changent pas.
 */

const measure: Measure = (text, font) => Array.from(text).length * Number(/(\d+)px/.exec(font)?.[1] ?? '10') * 0.5;

const png = (width: number, height: number, extra: object = {}): CardMedia => ({ kind: 'image', width, height, mimeType: 'image/png', ...extra });
const photo: CardMedia = { kind: 'image', width: 3000, height: 2000, mimeType: 'image/jpeg' };

const input = (media: readonly CardMedia[]): MessageCardInput => ({
  quoted: null,
  reply: { author: 'Jacques', text: 'Chez Lina !' },
  handle: 'jacques',
  template: 'aurore.rond.orbite',
  media,
});
const mediaOps = (media: readonly CardMedia[], overrides: Partial<MessageCardInput> = {}): CardMediaOp[] =>
  layoutMessageCard({ ...input(media), ...overrides }, measure).ops.filter((op): op is CardMediaOp => op.kind === 'media');

describe('qui est un sticker', () => {
  test('un PNG ou WebP dont les deux côtés tiennent dans 512 px', () => {
    expect(isStickerMedia(png(512, 400))).toBe(true);
    expect(isStickerMedia({ kind: 'image', width: 256, height: 256, mimeType: 'image/webp' })).toBe(true);
  });

  test('une photo, un JPEG, ou un PNG plus grand que 512 px n’en est pas un', () => {
    expect(isStickerMedia(photo)).toBe(false);
    expect(isStickerMedia({ kind: 'image', width: 300, height: 300, mimeType: 'image/jpeg' })).toBe(false);
    expect(isStickerMedia(png(513, 200))).toBe(false);
  });

  test('sans dimensions ni déclaration, on ne devine pas', () => {
    expect(isStickerMedia(png(0, 0))).toBe(false);
  });

  test('le drapeau du porteur dispense de la taille, jamais du format à transparence (miroir de `MessageCardSticker.isSticker`)', () => {
    expect(isStickerMedia({ kind: 'image', width: 0, height: 0, mimeType: 'image/png', sticker: true })).toBe(true);
    expect(isStickerMedia({ kind: 'image', width: 2048, height: 2048, mimeType: 'image/webp', sticker: true })).toBe(true);
    expect(isStickerMedia({ kind: 'image', width: 0, height: 0, sticker: true })).toBe(false);
    expect(isStickerMedia({ kind: 'image', width: 300, height: 300, mimeType: 'image/jpeg', sticker: true })).toBe(false);
    expect(isStickerMedia({ kind: 'video', width: 100, height: 100, mimeType: 'image/png', sticker: true })).toBe(false);
  });

  test('cardMediaOf transmet le type de fichier à la carte', () => {
    const [item] = cardMediaOf([{ id: 'a', fileUrl: 'a.png', mimeType: 'image/png', width: 200, height: 100 }]);
    expect(item?.card.kind === 'image' && item.card.mimeType).toBe('image/png');
    expect(item !== undefined && isStickerMedia(item.card)).toBe(true);
  });
});

describe('le cadre d’un sticker', () => {
  test('suit le rapport du sticker, centré, sans dépasser la boîte', () => {
    expect(stickerFrame({ width: 512, height: 256 }, 888, 2000)).toEqual({ x: 178, width: 532, height: 266 });
    const tall = stickerFrame({ width: 200, height: 400 }, 888, 300);
    expect(tall.height).toBe(300);
    expect(tall.width).toBe(150);
    expect(tall.x).toBe(369);
  });

  test('un rapport inconnu vaut le carré', () => {
    const frame = stickerFrame({ width: 0, height: 0 }, 400, 1000);
    expect(frame.width).toBe(frame.height);
  });
});

describe('la mise en page', () => {
  test('un sticker est un cadre contain au rapport du sticker, sans coin arrondi', () => {
    const [op] = mediaOps([png(512, 256)]);
    expect(op?.contain).toBe(true);
    expect(op?.radius).toBe(0);
    expect(op === undefined ? 0 : op.height / op.width).toBeCloseTo(0.5, 2);
  });

  test('il est centré dans la colonne de la réponse', () => {
    const [sticker] = mediaOps([png(200, 200)]);
    const [wide] = mediaOps([photo]);
    expect(sticker === undefined || wide === undefined ? 0 : sticker.x - wide.x).toBeGreaterThan(0);
    expect(sticker === undefined || wide === undefined ? 0 : sticker.x + sticker.width / 2).toBeCloseTo(wide === undefined ? 0 : wide.x + wide.width / 2, 0);
  });

  test('une photo reste un cadre arrondi qui remplit (cover)', () => {
    const [op] = mediaOps([photo]);
    expect(op?.contain).toBeUndefined();
    expect(op?.radius).toBeGreaterThan(0);
  });

  test('un sticker de plus d’un visuel reste contain dans sa tuile', () => {
    const ops = mediaOps([png(300, 300), photo], { mediaArrangement: 'mosaic' });
    expect(ops.map((op) => op.contain === true)).toEqual([true, false]);
  });
});

describe('les dimensions manquantes', () => {
  test('viennent des pixels décodés, sans jamais remplacer celles qu’on connaît', () => {
    const media: readonly CardMedia[] = [png(0, 0), png(100, 50)];
    const measured = withMeasuredSizes(media, [{ width: 320, height: 160 }, { width: 999, height: 999 }]);
    expect(measured.map((item) => (item.kind === 'audio' ? 0 : item.width))).toEqual([320, 100]);
  });

  test('un sticker sans dimensions est reconnu et cadré à son aspect réel une fois décodé', () => {
    const raw = input([png(0, 0)]);
    const [blind] = layoutMessageCard(raw, measure).ops.filter((op): op is CardMediaOp => op.kind === 'media');
    expect(blind?.contain).toBeUndefined();
    const [op] = layoutMessageCard(measuredInput(raw, [{ naturalWidth: 400, naturalHeight: 200 }]), measure).ops.filter((o): o is CardMediaOp => o.kind === 'media');
    expect(op?.contain).toBe(true);
    expect(op === undefined ? 0 : op.height / op.width).toBeCloseTo(0.5, 2);
  });
});

describe('la peinture', () => {
  const context = () => {
    const calls: string[] = [];
    const drawn: number[][] = [];
    const gradient = { addColorStop: () => {} };
    const ctx = new Proxy(
      {
        measureText: (text: string) => ({ width: text.length * 18 }),
        createLinearGradient: () => gradient,
        createRadialGradient: () => gradient,
        drawImage: (...args: unknown[]) => {
          drawn.push(args.slice(1).map(Number));
          calls.push('drawImage');
        },
        save: () => calls.push('save'),
        clip: () => calls.push('clip'),
        roundRect: () => calls.push('roundRect'),
      } as Record<string, unknown>,
      { get: (target, key: string) => (key in target ? target[key] : () => undefined), set: () => true },
    ) as unknown as CanvasRenderingContext2D;
    return { ctx, calls, drawn };
  };

  test('un sticker est dessiné tout entier dans son cadre : ni clip ni coin arrondi', () => {
    const { ctx, calls, drawn } = context();
    const layout = layoutMessageCard(input([png(512, 256)]), measure);
    const frame = layout.ops.find((op): op is CardMediaOp => op.kind === 'media');
    paintMessageCard(ctx, layout, templateOf('aurore.rond.orbite'), { sources: [{ width: 512, height: 256 } as unknown as CanvasImageSource] });
    expect(calls).not.toContain('clip');
    expect(calls).not.toContain('roundRect');
    const [x = 0, y = 0, w = 0, h = 0] = drawn[0] ?? [];
    expect(frame).toBeDefined();
    if (frame === undefined) return;
    expect(w).toBeCloseTo(frame.width, 3);
    expect(h).toBeCloseTo(frame.height, 3);
    expect(x).toBeCloseTo(frame.x, 3);
    expect(y).toBeCloseTo(frame.y, 3);
  });

  test('un sticker de rapport différent de son cadre est contenu, jamais rogné', () => {
    const { ctx, drawn } = context();
    const layout = layoutMessageCard(input([png(512, 256)]), measure);
    const frame = layout.ops.find((op): op is CardMediaOp => op.kind === 'media');
    paintMessageCard(ctx, layout, templateOf('aurore.rond.orbite'), { sources: [{ width: 100, height: 100 } as unknown as CanvasImageSource] });
    const [, , w = 0, h = 0] = drawn[0] ?? [];
    expect(frame).toBeDefined();
    expect(w).toBeLessThanOrEqual((frame?.width ?? 0) + 0.001);
    expect(h).toBeLessThanOrEqual((frame?.height ?? 0) + 0.001);
  });
});
