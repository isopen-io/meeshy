import { describe, expect, test } from 'bun:test';

import type { ScenePaintable } from './scene-export-paint';
import { grainTiles, mediaLookOf, paintWithLook, placementOf } from './scene-export-media';

type Op = { readonly op: string; readonly detail: string };

function recorder() {
  const ops: Op[] = [];
  const saved: { filter: string; composite: string }[] = [];
  const ctx = {
    filter: 'none',
    globalCompositeOperation: 'source-over',
    fillStyle: '' as unknown,
    globalAlpha: 1,
    save() {
      saved.push({ filter: this.filter, composite: this.globalCompositeOperation });
    },
    restore() {
      const top = saved.pop();
      if (top !== undefined) {
        this.filter = top.filter;
        this.globalCompositeOperation = top.composite;
      }
    },
    fillRect(x: number, y: number, w: number, h: number) {
      ops.push({ op: 'fillRect', detail: `${this.globalCompositeOperation}|${String((this.fillStyle as { name?: string })?.name ?? this.fillStyle)}|${Math.round(x)},${Math.round(y)},${Math.round(w)},${Math.round(h)}` });
    },
    beginPath: () => undefined,
    rect: () => undefined,
    clip() {
      ops.push({ op: 'clip', detail: '' });
    },
    translate: () => undefined,
    scale: () => undefined,
    createRadialGradient(...args: number[]) {
      const stops: string[] = [];
      ops.push({ op: 'radial', detail: args.map((value) => Math.round(value)).join(',') });
      return { name: 'radial', addColorStop: (at: number, color: string) => stops.push(`${at}:${color}`) && ops.push({ op: 'stop', detail: `${at}:${color}` }) };
    },
    createPattern(image: { readonly name?: string }) {
      return { name: `pattern:${image.name ?? '?'}` };
    },
  };
  const draw = () => ops.push({ op: 'draw', detail: `${ctx.globalCompositeOperation}|${ctx.filter}` });
  return { ctx: ctx as unknown as ScenePaintable, ops, draw };
}

const BOX = { x: 0, y: 0, width: 400, height: 300 };

describe('les réglages d’un média, peints sur le canvas de l’export (#13880)', () => {
  test('le filtre de l’auteur PUIS ses réglages, dans l’ordre du lecteur, le flou en pixels du canvas', () => {
    const look = mediaLookOf({ filter: 'bw', adjustments: { blur: 0.5, contrast: 1.2 } }, { target: 'image', designPixelsPerSourcePixel: 1, pixelsPerDesignPixel: 720 / 1080 });
    expect(look.filter).toBe('grayscale(1) contrast(1.1) contrast(1.2) blur(5.33px)');
  });

  test('sans filtre ni réglage, rien ne se pose', () => {
    expect(mediaLookOf({}, { target: 'image', pixelsPerDesignPixel: 1 })).toEqual({ filter: undefined, glow: undefined, layers: [] });
  });

  test('le bloom repeint le média flouté et atténué, fondu en « screen » par-dessus', () => {
    const { ctx, ops, draw } = recorder();
    const look = mediaLookOf({ adjustments: { bloom: 0.5 } }, { target: 'image', pixelsPerDesignPixel: 1 });
    paintWithLook(ctx, look, { glowWidth: 1080, overlayBox: BOX, grainTile: () => null }, draw);
    expect(ops.filter((op) => op.op === 'draw').map((op) => op.detail)).toEqual(['source-over|none', 'screen|blur(10px) brightness(0.5)']);
  });

  test('la teinte en lumière douce, la vignette en dégradé elliptique, le grain en motif — dans la boîte du média', () => {
    const { ctx, ops, draw } = recorder();
    const look = mediaLookOf({ adjustments: { temperature: 1, vignette: 1, grain: 1 } }, { target: 'image', pixelsPerDesignPixel: 1 });
    paintWithLook(ctx, look, { glowWidth: 400, overlayBox: BOX, grainTile: (alpha) => ({ name: `bruit-${alpha}` }) as unknown as CanvasImageSource }, draw);
    const fills = ops.filter((op) => op.op === 'fillRect').map((op) => op.detail);
    expect(fills[0]).toBe('soft-light|rgba(255, 138, 0, 0.5)|0,0,400,300');
    expect(fills[1]?.startsWith('source-over|radial|')).toBe(true);
    expect(fills[2]).toBe('source-over|pattern:bruit-0.1|0,0,400,300');
    expect(ops.filter((op) => op.op === 'stop').map((op) => op.detail)).toEqual(['0.45:rgba(0, 0, 0, 0)', '1:rgba(0, 0, 0, 0.5)']);
    expect(ops.find((op) => op.op === 'radial')?.detail).toBe(`0,0,0,0,0,${Math.round(200 * Math.SQRT2)}`);
  });

  test('sans tuile de bruit (pas de canvas), le grain se tait plutôt que d’échouer', () => {
    const { ctx, ops, draw } = recorder();
    paintWithLook(ctx, mediaLookOf({ adjustments: { grain: 1 } }, { target: 'image', pixelsPerDesignPixel: 1 }), { glowWidth: 400, overlayBox: BOX, grainTile: () => null }, draw);
    expect(ops.filter((op) => op.op === 'fillRect')).toEqual([]);
  });
});

describe('la place d’une source dans sa boîte — rempli ou ajusté, recadré', () => {
  const source = { naturalWidth: 200, naturalHeight: 100 } as unknown as CanvasImageSource;
  test('ajusté : la source entière, centrée', () => {
    expect(placementOf(source, { x: 0, y: 0, width: 100, height: 100 }, 'contain', null)?.to).toEqual({ x: 0, y: 25, width: 100, height: 50 });
  });
  test('rempli : le centre de la source couvre la boîte', () => {
    expect(placementOf(source, { x: 0, y: 0, width: 100, height: 100 }, 'cover', null)?.from).toEqual({ x: 50, y: 0, width: 100, height: 100 });
  });
  test('une source sans dimensions ne se place pas', () => {
    expect(placementOf({} as CanvasImageSource, BOX, 'cover', null)).toBeNull();
  });
});

describe('la tuile du grain — tissée une fois par intensité, du noir dont l’alpha suit un bruit', () => {
  function fakeDocument() {
    const made: { width: number; height: number; data: Uint8ClampedArray | null }[] = [];
    const doc = {
      createElement: () => {
        const canvas = {
          width: 0,
          height: 0,
          data: null as Uint8ClampedArray | null,
          getContext: () => ({
            createImageData: (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
            putImageData(image: { data: Uint8ClampedArray }) {
              canvas.data = image.data;
            },
          }),
        };
        made.push(canvas);
        return canvas;
      },
    };
    return { doc: doc as unknown as Document, made };
  }

  test('une tuile de 256 px, noire, d’alpha borné par l’intensité, et la même tuile pour la même intensité', () => {
    const { doc, made } = fakeDocument();
    const tiles = grainTiles(doc);
    const tile = tiles(0.1);
    expect(tile).not.toBeNull();
    expect(tiles(0.1)).toBe(tile);
    expect(made).toHaveLength(1);
    const data = made[0]?.data ?? new Uint8ClampedArray();
    expect(made[0]?.width).toBe(256);
    const alphas = Array.from({ length: data.length / 4 }, (_, i) => data[i * 4 + 3] ?? 0);
    expect(Math.max(...alphas)).toBeLessThanOrEqual(Math.ceil(0.1 * 255));
    expect(Math.max(...alphas)).toBeGreaterThan(0);
    expect(data[0]).toBe(0);
  });

  test('sans contexte 2D, aucune tuile', () => {
    const doc = { createElement: () => ({ getContext: () => null }) } as unknown as Document;
    expect(grainTiles(doc)(0.1)).toBeNull();
  });
});
