import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import type { GallerySaver } from '@/lib/gallery/gallery-saver';
import type { FileDeliveryPortal } from '@/lib/media/deliver-file';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { captureFaces, captureMontage, saveCaptures, type CaptureEnv } from './call-capture';
import { drawMontage } from './call-montage-render';
import { montageLayout } from './call-montage';

/**
 * CAPTURER UN APPEL VIDÉO (#8552) — le montage à pleine résolution depuis ce
 * que l'écran montre, un portrait par visage affiché, et l'enregistrement :
 * la photothèque là où l'hôte en a une, sinon la porte de fichiers.
 */

type Draw = { readonly op: string; readonly args: readonly unknown[] };

const recorder = () => {
  const draws: Draw[] = [];
  const gradient = { addColorStop: () => undefined };
  const context = new Proxy(
    {},
    {
      get: (_target, key) => {
        if (key === 'createLinearGradient') return () => gradient;
        return (...args: unknown[]) => void draws.push({ op: String(key), args });
      },
      set: () => true,
    },
  ) as unknown as CanvasRenderingContext2D;
  return { draws, context };
};

const envWith = (options: { readonly faces?: boolean } = {}) => {
  const sizes: Array<{ width: number; height: number }> = [];
  const log = recorder();
  const env: CaptureEnv = {
    canvas: (size) => {
      sizes.push(size);
      return { context: log.context, toBlob: async () => new Blob(['png'], { type: 'image/png' }) };
    },
    detector: options.faces === true ? { detect: async () => [{ boundingBox: { x: 500, y: 200, width: 200, height: 260 } }] } : null,
    now: () => new Date(2026, 8, 28, 9, 5, 3),
  };
  return { env, sizes, draws: log.draws };
};

const place = (element: Element, box: { left: number; top: number; width: number; height: number }): void => {
  Object.defineProperty(element, 'getBoundingClientRect', { value: () => ({ ...box, x: box.left, y: box.top, right: box.left + box.width, bottom: box.top + box.height }) });
};

const stageOf = (count: number) => {
  const stage = document.createElement('div');
  place(stage, { left: 0, top: 0, width: 400, height: 800 });
  Array.from({ length: count }, (_, index) => {
    const video = document.createElement('video');
    video.setAttribute('data-call-stream', 'cover');
    if (index === 1) video.setAttribute('data-call-mirrored', '');
    Object.defineProperty(video, 'videoWidth', { value: 1280 });
    Object.defineProperty(video, 'videoHeight', { value: 720 });
    place(video, index === 0 ? { left: 0, top: 0, width: 400, height: 800 } : { left: 280, top: 40, width: 100, height: 160 });
    stage.appendChild(video);
  });
  return stage;
};

describe('capturer', () => {
  beforeAll(() => ensureHappyDomRegistered());
  afterAll(async () => releaseHappyDomIfRegistered());

  test('le montage se rend en 1080 × 1920 sur un écran étroit, une image par tuile affichée, nommé par son style', async () => {
    const { env, sizes, draws } = envWith();
    const file = await captureMontage({ stage: stageOf(2), style: 'comic', text: { bubble: 'Quel appel !', date: '28 septembre 2026' }, viewport: { width: 390, height: 844 }, env });
    expect(sizes).toEqual([{ width: 1080, height: 1920 }]);
    expect(draws.filter((draw) => draw.op === 'drawImage')).toHaveLength(2);
    expect(draws.some((draw) => draw.op === 'fillText' && draw.args[0] === 'Quel appel !')).toBe(true);
    expect(file?.fileName).toBe('meeshy-appel-comic-20260928-090503.png');
  });

  test('rien d’affiché : rien à capturer', async () => {
    const { env, sizes } = envWith();
    expect(await captureMontage({ stage: stageOf(0), style: 'grid', text: { bubble: '', date: '' }, viewport: { width: 1440, height: 900 }, env })).toBeNull();
    expect(sizes).toEqual([]);
  });

  test('« Chaque visage » : un carré de 1080 par tuile, cadré sur le visage vu', async () => {
    const { env, sizes, draws } = envWith({ faces: true });
    const files = await captureFaces({ stage: stageOf(2), env });
    expect(files.map((file) => file.fileName)).toEqual(['meeshy-appel-visage-20260928-090503-1.png', 'meeshy-appel-visage-20260928-090503-2.png']);
    expect(sizes).toEqual([
      { width: 1080, height: 1080 },
      { width: 1080, height: 1080 },
    ]);
    const crop = draws.find((draw) => draw.op === 'drawImage')?.args.slice(1, 5) as number[];
    expect(crop[2]).toBe(crop[3]);
    expect((crop[0] ?? 0) + (crop[2] ?? 0) / 2).toBeCloseTo(600, 0);
  });

  test('un miroir se capture comme il se voit : l’image est retournée', () => {
    const { context, draws } = recorder();
    const layout = montageLayout({ style: 'grid', count: 1, size: { width: 100, height: 100 } });
    drawMontage(context, layout, [{ source: {} as CanvasImageSource, size: { width: 100, height: 100 }, mirrored: true, fit: 'cover' }], { bubble: '', date: '' });
    expect(draws.some((draw) => draw.op === 'scale' && draw.args[0] === -1)).toBe(true);
  });

  test('le cœur découpe le montage dans sa forme', () => {
    const { context, draws } = recorder();
    const layout = montageLayout({ style: 'heart', count: 2, size: { width: 200, height: 200 } });
    drawMontage(context, layout, [], { bubble: '', date: '' });
    expect(draws.filter((draw) => draw.op === 'bezierCurveTo').length).toBeGreaterThanOrEqual(4);
    expect(draws.some((draw) => draw.op === 'clip')).toBe(true);
  });
});

describe('enregistrer', () => {
  const file = (name: string) => ({ blob: new Blob(['png'], { type: 'image/png' }), fileName: name });

  test('dans la photothèque quand l’hôte en a une — sans passer par la porte de fichiers', async () => {
    const saved: string[] = [];
    const saver: GallerySaver = { available: true, save: async (input) => (saved.push(input.fileName), 'saved') };
    const delivered: string[] = [];
    const portal: FileDeliveryPortal = { deliver: async (_blob, name) => (delivered.push(name), 'delivered') };
    expect(await saveCaptures([file('a.png'), file('b.png')], { saver, portal })).toEqual({ saved: 2, failed: 0, cancelled: 0 });
    expect(saved).toEqual(['a.png', 'b.png']);
    expect(delivered).toEqual([]);
  });

  test('sans photothèque, par la porte de fichiers ; une annulation se compte à part', async () => {
    const outcomes: Array<'delivered' | 'cancelled'> = ['delivered', 'cancelled'];
    const portal: FileDeliveryPortal = { deliver: async () => outcomes.shift() ?? 'unavailable' };
    expect(await saveCaptures([file('a.png'), file('b.png')], { saver: null, portal })).toEqual({ saved: 1, failed: 0, cancelled: 1 });
  });

  test('sans aucune porte, c’est un échec dit, jamais un silence', async () => {
    expect(await saveCaptures([file('a.png')], { saver: null, portal: null })).toEqual({ saved: 0, failed: 1, cancelled: 0 });
  });
});
