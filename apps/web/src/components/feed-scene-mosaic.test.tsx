import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import type { CanvasDocument, CanvasObject } from '@/lib/canvas/document';
import type { SceneCarrier } from '@/lib/canvas/carrier';

import { FeedSceneMosaic } from './feed-scene-mosaic';

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  // Le moteur est chargé À LA DEMANDE (`lazy`) : le PREMIER `import()` du
  // module coûte une compilation que 20 ms d'attente ne couvrent pas toujours
  // — le premier témoin du fichier rougissait seul, au hasard de la machine.
  // Chauffé ici, chaque montage ne paie plus qu'une microtâche.
  await import('./scene-player');
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

const textScene = (index: number): CanvasDocument['scenes'][number] => {
  const object: CanvasObject = {
    id: `t${index}`,
    kind: 'text',
    anchor: { t: 'free', x: 0.5, y: 0.5 },
    plane: 'fg',
    z: 0,
    transform: { scale: 1, rotation: 0, opacity: 1 },
    payload: { text: `Scène ${index}` },
  };
  return { id: `s${index}`, objects: [object] };
};

const CARRIER: SceneCarrier = { postId: 'post-scenes-wave', media: [] };

async function mount(document: CanvasDocument, layout: 'wave' | 'hero', onOpenScene?: (postId: string, i: number) => void): Promise<HTMLDivElement> {
  const c = window.document.createElement('div');
  window.document.body.appendChild(c);
  const r = createRoot(c);
  container = c;
  root = r;
  await act(async () => {
    r.render(
      <FeedSceneMosaic
        document={document}
        carrier={CARRIER}
        preferredLanguages={['fr']}
        layout={layout}
        authorName="Demo"
        {...(onOpenScene !== undefined ? { onOpenScene } : {})}
      />,
    );
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  return c;
}

describe('FeedSceneMosaic — une tuile monte SA scène', () => {
  test('wave × 5 ⇒ 4 tuiles, chacune montre le texte de sa scène, +1 sur la dernière', async () => {
    const doc: CanvasDocument = { v: 3, scenes: [0, 1, 2, 3, 4].map(textScene) };
    const el = await mount(doc, 'wave');
    const tiles = el.querySelectorAll('[data-feed-mosaic-tile]');
    expect(tiles.length).toBe(4);
    tiles.forEach((tile, i) => {
      const sceneNode = tile.querySelector(`[data-feed-scene-index="${i}"]`);
      expect(sceneNode).not.toBeNull();
      expect(sceneNode?.querySelector('[data-scene-text]')?.textContent).toBe(`Scène ${i}`);
    });
    const overflow = tiles[tiles.length - 1]?.querySelector('[data-feed-mosaic-overflow]');
    expect(overflow?.textContent).toBe('+1');
    // wave ne porte de légende sur AUCUNE tuile.
    expect(el.querySelector('[data-feed-scene-caption]')).toBeNull();
  });

  test('hero ⇒ légende sur la tuile 0 SEULE', async () => {
    // Une légende n'existe que sur une scène qui ADRESSE un média LÉGENDÉ —
    // les trois scènes ci-dessous en portent chacune un, pour isoler la
    // règle testée (la PLACE, `tileCarriesCaption`) de la présence même
    // d'une légende (déjà couverte par `scene-caption.test.ts`).
    const mediaScene = (index: number): CanvasDocument['scenes'][number] => ({
      id: `s${index}`,
      objects: [
        {
          id: `m${index}`,
          kind: 'media',
          anchor: { t: 'free', x: 0.5, y: 0.5 },
          plane: 'bg',
          z: 0,
          transform: { scale: 1, rotation: 0, opacity: 1 },
          payload: { postMediaId: `media-${index}` },
        },
      ],
    });
    const doc: CanvasDocument = { v: 3, scenes: [0, 1, 2].map(mediaScene) };
    const carrier: SceneCarrier = {
      postId: 'post-hero',
      media: [0, 1, 2].map((i) => ({ id: `media-${i}`, src: `${i}.jpg`, caption: `Légende ${i}` })),
    };
    const c = window.document.createElement('div');
    window.document.body.appendChild(c);
    const r = createRoot(c);
    container = c;
    root = r;
    await act(async () => {
      r.render(<FeedSceneMosaic document={doc} carrier={carrier} preferredLanguages={['fr']} layout="hero" authorName="Demo" />);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    const tile0 = c.querySelector('[data-feed-mosaic-tile="0"]');
    const tile1 = c.querySelector('[data-feed-mosaic-tile="1"]');
    expect(tile0?.querySelector('[data-feed-scene-caption]')?.textContent).toBe('Légende 0');
    expect(tile1?.querySelector('[data-feed-scene-caption]')).toBeNull();
  });

  test('tap tuile 2 ⇒ onOpenScene(postId, 2) — l’index VOYAGE', async () => {
    const doc: CanvasDocument = { v: 3, scenes: [0, 1, 2, 3, 4].map(textScene) };
    let called: readonly [string, number] | undefined;
    const el = await mount(doc, 'wave', (postId, index) => {
      called = [postId, index];
    });
    const tile2 = el.querySelector('[data-feed-mosaic-tile="2"] button') as HTMLButtonElement;
    expect(tile2).not.toBeNull();
    await act(async () => {
      tile2.click();
    });
    expect(called).toEqual(['post-scenes-wave', 2]);
  });
});
