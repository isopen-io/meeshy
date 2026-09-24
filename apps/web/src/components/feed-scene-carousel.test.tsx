import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import type { CanvasDocument } from '@/lib/canvas/document';
import type { SceneCarrier } from '@/lib/canvas/carrier';

import { FeedSceneCarousel } from './feed-scene-carousel';

/** `currentInterfaceLanguage()` lit `document.documentElement.lang`, qui vaut
 * `fr` par défaut (préchargé, `bunfig.toml`) — les libellés attendus ici sont
 * donc les français ; le gate DOM (§ 5.7) les prouve en `en-US`. */
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

/** Le document « post-scenes-mixed » du § 3.4 : panorama légendé, page
 * texte seul, portrait sans texte. */
const DOCUMENT: CanvasDocument = {
  v: 3,
  scenes: [
    {
      id: 's1',
      objects: [
        { id: 'bg1', kind: 'media', anchor: { t: 'free', x: 0.5, y: 0.5 }, plane: 'bg', z: 0, transform: { scale: 1, rotation: 0, opacity: 1 }, payload: { postMediaId: 'media-scene-pano', aspectRatio: 4 } },
      ],
    },
    {
      id: 's2',
      objects: [
        { id: 'bg2', kind: 'media', anchor: { t: 'free', x: 0.5, y: 0.5 }, plane: 'bg', z: 0, transform: { scale: 1, rotation: 0, opacity: 1 }, payload: { background: '#4338CA' } },
        { id: 't2', kind: 'text', anchor: { t: 'free', x: 0.5, y: 0.5 }, plane: 'fg', z: 1, transform: { scale: 1, rotation: 0, opacity: 1 }, locale: 'fr', payload: { text: 'Deuxième page, texte seul' } },
      ],
    },
    {
      id: 's3',
      objects: [
        { id: 'bg3', kind: 'media', anchor: { t: 'free', x: 0.5, y: 0.5 }, plane: 'bg', z: 0, transform: { scale: 1, rotation: 0, opacity: 1 }, payload: { postMediaId: 'media-scene-portrait', aspectRatio: 0.5625 } },
      ],
    },
  ],
};

const CARRIER: SceneCarrier = {
  postId: 'post-scenes-mixed',
  media: [
    { id: 'media-scene-pano', src: 'pano.svg' },
    { id: 'media-scene-portrait', src: 'portrait.svg' },
  ],
};

async function mount(): Promise<HTMLDivElement> {
  const c = document.createElement('div');
  document.body.appendChild(c);
  const r = createRoot(c);
  container = c;
  root = r;
  await act(async () => {
    r.render(<FeedSceneCarousel document={DOCUMENT} carrier={CARRIER} preferredLanguages={['fr']} accent="#4F46E5" active={false} authorName="Demo" />);
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  return c;
}

describe('FeedSceneCarousel — pages, flèches, compteur', () => {
  test('3 scènes ⇒ 3 [data-feed-scene-index] montés (0,1,2)', async () => {
    const el = await mount();
    const pages = el.querySelectorAll('[data-feed-scene-index]');
    expect(Array.from(pages).map((p) => p.getAttribute('data-feed-scene-index'))).toEqual(['0', '1', '2']);
  });

  test('page 0 : aucune « précédente », une « suivante »', async () => {
    const el = await mount();
    expect(el.querySelector('[aria-label="Scène précédente"]')).toBeNull();
    expect(el.querySelector('[aria-label="Scène suivante"]')).not.toBeNull();
  });

  test('clic suivante ⇒ compteur 2 / 3, page 1 aria-current, scrollTo appelé', async () => {
    const el = await mount();
    const track = el.querySelector('[data-feed-scene-track]') as HTMLDivElement;
    // happy-dom ne calcule aucune mise en page réelle : `clientWidth` vaut 0
    // par défaut, ce qui désarme `scrollTo` (garde légitime en production —
    // aucune piste de largeur nulle ne défile). On le fixe ici pour observer
    // l'APPEL, comme le gate DOM (§ 5.7) le mesure au navigateur réel.
    Object.defineProperty(track, 'clientWidth', { value: 400, configurable: true });
    let scrolledTo: unknown;
    track.scrollTo = ((opts: unknown) => {
      scrolledTo = opts;
    }) as typeof track.scrollTo;
    const next = el.querySelector('[aria-label="Scène suivante"]') as HTMLButtonElement;
    await act(async () => {
      next.click();
    });
    expect(el.querySelector('[data-feed-media-counter]')?.textContent?.replace(/\s+/g, '')).toBe('2/3');
    const page1 = el.querySelector('[data-feed-scene-index="1"]')?.closest('[aria-current]');
    expect(page1?.getAttribute('aria-current')).toBe('true');
    expect(scrolledTo).toBeDefined();
  });

  test('dernière page : aucune « suivante »', async () => {
    const el = await mount();
    const next = () => el.querySelector('[aria-label="Scène suivante"]') as HTMLButtonElement | null;
    await act(async () => {
      next()?.click();
    });
    await act(async () => {
      next()?.click();
    });
    expect(el.querySelector('[data-feed-media-counter]')?.textContent?.replace(/\s+/g, '')).toBe('3/3');
    expect(next()).toBeNull();
  });

  test('pastilles aria-hidden', async () => {
    const el = await mount();
    expect(el.querySelector('[data-feed-carousel-dots]')?.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('FeedSceneCarousel — la page 2 texte seul montre son texte, pas une image', () => {
  test('index 1 contient [data-scene-text] avec le texte fr, aucun <img>', async () => {
    const el = await mount();
    const page1 = el.querySelector('[data-feed-scene-index="1"]') as HTMLElement;
    const text = page1.querySelector('[data-scene-text]');
    expect(text?.textContent).toBe('Deuxième page, texte seul');
    expect(text?.getAttribute('lang')).toBe('fr');
    expect(page1.querySelector('img')).toBeNull();
  });

  test('index 0 contient un <img>', async () => {
    const el = await mount();
    const page0 = el.querySelector('[data-feed-scene-index="0"]') as HTMLElement;
    expect(page0.querySelector('img')).not.toBeNull();
  });
});
