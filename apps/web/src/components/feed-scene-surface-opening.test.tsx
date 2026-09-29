import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import type { SceneCarrier } from '@/lib/canvas/carrier';
import type { CanvasDocument } from '@/lib/canvas/document';
import { sceneItemId } from '@/lib/feed/gallery-lot';
import { takeSceneOpening } from '@/lib/view/scene-opening';

import { FeedSceneSurface } from './feed-scene-surface';

/**
 * #8598 — TOUCHER UNE SCÈNE DU FIL CONFIE À LA VISIONNEUSE SON CADRE ET SON
 * TEMPS. Sans ce relais, la scène plein écran apparaissait d'un bloc et
 * repartait de zéro, alors que la carte venait d'en jouer une partie.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
let originalRect: HTMLElement['getBoundingClientRect'];

beforeAll(async () => {
  ensureHappyDomRegistered();
  originalRect = HTMLElement.prototype.getBoundingClientRect;
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await import('./scene-player');
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  HTMLElement.prototype.getBoundingClientRect = originalRect;
});

const timedDocument: CanvasDocument = {
  v: 3,
  scenes: [
    {
      id: 's1',
      objects: [
        {
          id: 't1',
          kind: 'text',
          anchor: { t: 'free', x: 0.5, y: 0.5 },
          plane: 'fg',
          z: 1,
          transform: { scale: 1, rotation: 0, opacity: 1 },
          payload: { text: 'Ça bouge' },
          timing: { start: 0, end: 4 },
        },
      ],
    },
  ],
} as CanvasDocument;

const carrier: SceneCarrier = { postId: 'post-open', media: [] };

async function mountCard(onOpen: (sceneIndex: number) => void): Promise<HTMLElement> {
  const c = document.createElement('div');
  c.style.borderRadius = '18px';
  document.body.appendChild(c);
  const r = createRoot(c);
  container = c;
  root = r;
  await act(async () => {
    r.render(
      <FeedSceneSurface document={timedDocument} sceneIndex={0} carrier={carrier} preferredLanguages={['fr']} active frame="page" authorName="Léa" onOpen={onOpen} />,
    );
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  return c;
}

describe('FeedSceneSurface — le tap confie l’ouverture (#8598)', () => {
  test('le cadre visible de la carte, son rayon et son temps voyagent jusqu’à la visionneuse, avant `onOpen`', async () => {
    HTMLElement.prototype.getBoundingClientRect = function rect(this: HTMLElement) {
      return this.hasAttribute('data-feed-scene-frame')
        ? ({ left: 16, top: 240, width: 358, height: 447.5, right: 374, bottom: 687.5, x: 16, y: 240, toJSON() {} } as DOMRect)
        : originalRect.call(this);
    };
    let openedWith: ReturnType<typeof takeSceneOpening> = null;
    const card = await mountCard(() => {
      openedWith = takeSceneOpening(sceneItemId('post-open', 0));
    });
    await act(async () => {
      card.querySelector<HTMLButtonElement>('button')!.click();
    });
    expect(openedWith).not.toBeNull();
    const opening = openedWith as unknown as NonNullable<ReturnType<typeof takeSceneOpening>>;
    expect(opening.origin).toMatchObject({ left: 16, top: 240, width: 358, height: 447.5, radius: 18 });
    expect(Number.isFinite(opening.seconds)).toBe(true);
    expect(opening.seconds).toBeGreaterThanOrEqual(0);
  });
});
