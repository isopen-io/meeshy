import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { EntityImageFormat } from '@/lib/profile/entity-image-format';
import type { StudioRetouchDeps } from '@/lib/stories/studio-retouch';
import { flush, registerStudioBench } from '@/test-support/story-studio-bench';

import EntityImageRetouch from './entity-image-retouch';

/**
 * AVATAR ET BANNIÈRE SE RETOUCHENT AVEC L'OUTIL DE LA CAPTURE (#17256, jumelle
 * de #17251) — le MÊME studio que la retouche d'une pièce du fil, ouvert sur
 * l'image choisie, la scène aux proportions du format : un carré voilé hors du
 * cercle pour l'avatar, un bandeau 3:1 pour la bannière. « Terminé » rend une
 * image à ces proportions exactes ; ✕ ne rend rien.
 */
registerStudioBench();

beforeAll(async () => {
  await Promise.all([import('@/routes/story-compose'), import('./entity-image-retouch'), import('@/lib/stories/studio-retouch')]);
});

const mounted: Array<{ root: Root; host: HTMLElement }> = [];
afterEach(() => {
  act(() => mounted.splice(0).forEach(({ root, host }) => (root.unmount(), host.remove())));
});

function mount(element: React.ReactElement): HTMLElement {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push({ root, host });
  act(() => root.render(element));
  return host;
}

const photo = (): File => new File([new Uint8Array([1, 2, 3])], 'moi.png', { type: 'image/png' });

/** Un canvas factice qui retient la taille demandée. */
function recordingRender() {
  const sizes: (readonly [number, number])[] = [];
  const draws: { count: number } = { count: 0 };
  const paint = (key: string | symbol) => {
    if (key === 'measureText') return () => ({ width: 10 });
    if (key === 'drawImage') return () => (draws.count += 1);
    return () => undefined;
  };
  const render: StudioRetouchDeps = {
    createCanvas: (width, height) => {
      sizes.push([width, height]);
      return {
        context: new Proxy({}, { get: (_t, key) => paint(key), set: () => true }) as never,
        toBlob: async (type) => new Blob(['jpeg'], { type }),
      };
    },
    loadImage: async () => ({ naturalWidth: 4, naturalHeight: 3 }) as unknown as CanvasImageSource,
  };
  return { sizes, draws, render };
}

function open(format: EntityImageFormat, render: StudioRetouchDeps = recordingRender().render) {
  const got: { done: File | null; cancelled: boolean } = { done: null, cancelled: false };
  mount(
    <EntityImageRetouch
      file={photo()}
      format={format}
      onDone={(file) => (got.done = file)}
      onCancel={() => (got.cancelled = true)}
      render={render}
    />,
  );
  return got;
}

const stage = () => document.querySelector<HTMLElement>('[data-entity-image-retouch] [data-scene-stage]');

describe('la retouche d’une image d’identité ouvre le studio de la capture', () => {
  test('l’avatar : une scène CARRÉE, voilée hors du cercle', async () => {
    open('avatar');
    await flush(() => document.querySelector('[data-entity-image-retouch] [data-scene-player]') !== null);
    expect(document.querySelector('[data-entity-image-retouch] [data-story-retouch-done]')).not.toBeNull();
    expect(stage()?.dataset.sceneFormat).toBe('avatar');
    expect(stage()?.style.aspectRatio).toBe('1 / 1');
    expect(document.querySelector('[data-entity-image-veil="round"]')).not.toBeNull();
  });

  test('la bannière : une scène 3:1, sans voile rond', async () => {
    open('banner');
    await flush(() => document.querySelector('[data-entity-image-retouch] [data-scene-player]') !== null);
    expect(stage()?.dataset.sceneFormat).toBe('banner');
    expect(stage()?.style.aspectRatio).toBe('3 / 1');
    expect(document.querySelector('[data-entity-image-veil]')).toBeNull();
  });

  test('« Terminé » rend un JPEG aux proportions de l’avatar — même intact, et sans rien téléverser', async () => {
    const calls: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return new Response('{}');
    }) as typeof fetch;
    try {
      const { sizes, draws, render } = recordingRender();
      const got = open('avatar', render);
      await flush(() => document.querySelector('[data-entity-image-retouch] [data-scene-player]') !== null);
      act(() => document.querySelector<HTMLButtonElement>('[data-story-retouch-done]')!.click());
      await flush(() => got.done !== null);
      expect(got.done?.type).toBe('image/jpeg');
      expect(sizes).toEqual([[1080, 1080]]);
      // L'image REMPLIT le rond : une seule peinture, aucune bande floutée autour.
      expect(draws.count).toBe(1);
      expect(got.cancelled).toBe(false);
      expect(calls).toEqual([]);
    } finally {
      globalThis.fetch = original;
    }
  });

  test('« Terminé » rend la bannière en 3:1', async () => {
    const { sizes, render } = recordingRender();
    const got = open('banner', render);
    await flush(() => document.querySelector('[data-entity-image-retouch] [data-scene-player]') !== null);
    act(() => document.querySelector<HTMLButtonElement>('[data-story-retouch-done]')!.click());
    await flush(() => got.done !== null);
    expect(sizes).toEqual([[1500, 500]]);
  });

  test('✕ referme sans rien rendre', async () => {
    const got = open('avatar');
    await flush(() => document.querySelector('[data-story-retouch-cancel]') !== null);
    act(() => document.querySelector<HTMLButtonElement>('[data-story-retouch-cancel]')!.click());
    expect(got.cancelled).toBe(true);
    expect(got.done).toBeNull();
  });

  test('le retour matériel referme sans rien rendre', async () => {
    const got = open('banner');
    await flush(() => document.querySelector('[data-story-retouch-cancel]') !== null);
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(got.cancelled).toBe(true);
    expect(got.done).toBeNull();
  });
});
