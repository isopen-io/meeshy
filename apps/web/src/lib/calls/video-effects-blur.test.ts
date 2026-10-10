import { describe, expect, test } from 'bun:test';

import { blendMaskInto, createSegmentedBlur, gaussianTaps, maskBytes, SEGMENT_INTERVAL_MS, type Compositor, type SegmenterPort } from './video-effects-blur';

/**
 * LE FLOU D'ARRIÈRE-PLAN PAR SEGMENTATION (#8471) — quand la caméra ne le
 * fait pas : le modèle se charge au premier flou, la personne est découpée
 * quinze fois par seconde (jamais sur le chemin d'une image), le masque est
 * lissé d'une découpe à l'autre, et tant qu'aucun masque n'est arrivé, TOUT
 * est flouté — l'arrière-plan ne fuit jamais pendant le chargement.
 */

function harness(options: { readonly failLoad?: boolean } = {}) {
  let clock = 0;
  const masks: Array<{ bytes: number[]; width: number; height: number }> = [];
  const rendered: unknown[] = [];
  const compositor: Compositor = {
    render: (source) => void rendered.push(source),
    mask: (bytes, width, height) => void masks.push({ bytes: [...bytes], width, height }),
    release: () => undefined,
  };
  const segmented: number[] = [];
  const closedBitmaps: number[] = [];
  let resolveLoad: (() => void) | null = null;
  const segmenter: SegmenterPort = {
    segment: (_image, timestamp) => {
      segmented.push(timestamp);
      return { width: 2, height: 1, data: new Float32Array([1, 0]) };
    },
    close: () => undefined,
  };
  const loads: number[] = [];
  const tasks: Array<() => void> = [];
  const canvas = { name: 'composited' };
  const stage = createSegmentedBlur({
    compositor,
    canvas: canvas as unknown as CanvasImageSource,
    loadSegmenter: () => {
      loads.push(clock);
      return options.failLoad === true ? Promise.reject(new Error('model')) : new Promise<SegmenterPort>((resolve) => void (resolveLoad = () => resolve(segmenter)));
    },
    snapshot: async () => {
      const id = segmented.length;
      return { close: () => void closedBitmaps.push(id) } as unknown as ImageBitmap;
    },
    schedule: (task) => void tasks.push(task),
    now: () => clock,
  });
  const settle = async () => {
    for (let round = 0; round < 4; round += 1) await Promise.resolve();
    tasks.splice(0).forEach((task) => task());
  };
  return { stage, canvas, rendered, masks, segmented, loads, closedBitmaps, settle, tick: (ms: number) => void (clock += ms), load: () => resolveLoad?.() };
}

const frame = { name: 'frame' } as unknown as CanvasImageSource;

describe('le flou par segmentation', () => {
  test('chaque image passe par le compositeur, qui rend son canevas', () => {
    const h = harness();
    expect(h.stage.render(frame, 640, 480, 0)).toBe(h.canvas as unknown as CanvasImageSource);
    expect(h.rendered).toEqual([frame]);
  });

  test('le modèle se charge UNE fois, au premier flou', () => {
    const h = harness();
    h.stage.render(frame, 640, 480, 0);
    h.stage.render(frame, 640, 480, 0);
    expect(h.loads).toEqual([0]);
  });

  test('tant que le modèle n’est pas là, aucun masque : tout reste flouté', async () => {
    const h = harness();
    h.stage.render(frame, 640, 480, 0);
    await h.settle();
    expect(h.masks).toEqual([]);
    expect(h.segmented).toEqual([]);
  });

  test('la personne est découpée HORS du chemin de l’image, quinze fois par seconde au plus', async () => {
    const h = harness();
    h.stage.render(frame, 640, 480, 0);
    h.load();
    await h.settle();
    h.stage.render(frame, 640, 480, 0);
    expect(h.segmented).toEqual([]);
    await h.settle();
    expect(h.segmented).toHaveLength(1);
    h.tick(SEGMENT_INTERVAL_MS / 2);
    h.stage.render(frame, 640, 480, 0);
    await h.settle();
    expect(h.segmented).toHaveLength(1);
    h.tick(SEGMENT_INTERVAL_MS);
    h.stage.render(frame, 640, 480, 0);
    await h.settle();
    expect(h.segmented).toHaveLength(2);
    expect(h.closedBitmaps).toHaveLength(2);
  });

  test('le masque découpé part au compositeur, en octets', async () => {
    const h = harness();
    h.stage.render(frame, 640, 480, 0);
    h.load();
    await h.settle();
    h.stage.render(frame, 640, 480, 0);
    await h.settle();
    expect(h.masks).toEqual([{ bytes: [255, 0], width: 2, height: 1 }]);
  });

  test('un modèle qui ne se charge pas laisse tout flouté, sans réessayer à chaque image', async () => {
    const h = harness({ failLoad: true });
    h.stage.render(frame, 640, 480, 0);
    await h.settle();
    h.stage.render(frame, 640, 480, 0);
    await h.settle();
    expect(h.loads).toHaveLength(1);
    expect(h.masks).toEqual([]);
  });
});

describe('le masque lissé', () => {
  test('la première découpe est prise telle quelle', () => {
    const target = blendMaskInto(null, new Float32Array([0.2, 0.8]), 0.5);
    expect([...target]).toEqual([0.2, 0.8].map((value) => Math.fround(value)));
  });

  test('les suivantes se mêlent à la précédente (moyenne mobile)', () => {
    const previous = new Float32Array([0, 1]);
    const target = blendMaskInto(previous, new Float32Array([1, 0]), 0.25);
    expect([...target]).toEqual([0.25, 0.75]);
  });

  test('une découpe d’une autre taille repart de zéro', () => {
    const target = blendMaskInto(new Float32Array([0, 0, 0]), new Float32Array([1, 1]), 0.5);
    expect([...target]).toEqual([1, 1]);
  });

  test('en octets, borné à 0…255', () => {
    expect([...maskBytes(new Float32Array([-1, 0, 0.5, 1, 2]), null)]).toEqual([0, 0, 128, 255, 255]);
  });
});

describe('le flou gaussien séparable', () => {
  test('les prises bilinéaires couvrent le noyau, et leurs poids somment à 1', () => {
    const taps = gaussianTaps(3);
    const total = taps.center + 2 * taps.weights.reduce((sum, weight) => sum + weight, 0);
    expect(Math.abs(total - 1)).toBeLessThan(1e-6);
    expect(taps.offsets).toHaveLength(4);
    expect(taps.weights).toHaveLength(4);
    expect([...taps.offsets].sort((a, b) => a - b)).toEqual([...taps.offsets]);
    expect(taps.offsets[0]).toBeGreaterThan(1);
    expect(taps.offsets[3]).toBeLessThan(8);
  });
});
