import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { POST_SCENE_DECORATED, POST_SCENES_MIXED } from '@/lib/api/fixtures-feed';
import type { FeedPost } from '@/lib/api/feed-pages';
import { resolveFeedCardModel } from '@/lib/feed/card-model';
import { composeSceneGalleryLot } from '@/lib/feed/gallery-lot';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { handOffSceneOpening } from '@/lib/view/scene-opening';

import MediaViewer from './media-viewer';

/**
 * #8598 — UNE SCÈNE QUI A UNE TIMELINE S'OUVRE AVEC SON CURSEUR, ET S'OUVRE
 * DEPUIS LA CARTE. La visionneuse rendait la scène sans aucun moyen de la
 * parcourir (le couloir de transport n'était rempli que par une VIDÉO), la
 * faisait repartir de zéro, et l'affichait d'un bloc au lieu de la faire
 * grandir depuis la carte touchée.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

type AnimateCall = { readonly element: Element; readonly keyframes: readonly Keyframe[] };
const animateCalls: AnimateCall[] = [];
let reducedMotion = false;
let originalMatchMedia: typeof window.matchMedia | undefined;

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
  await import('./scene-player');
  originalMatchMedia = window.matchMedia;
  Element.prototype.animate = function animate(this: Element, keyframes: Keyframe[] | PropertyIndexedKeyframes | null) {
    animateCalls.push({ element: this, keyframes: Array.isArray(keyframes) ? keyframes : [] });
    return { cancel() {}, finished: Promise.resolve() } as unknown as Animation;
  };
  window.matchMedia = ((query: string) =>
    ({ matches: reducedMotion && query.includes('reduce'), media: query, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList) as typeof window.matchMedia;
});

afterAll(async () => {
  if (originalMatchMedia !== undefined) window.matchMedia = originalMatchMedia;
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
  animateCalls.length = 0;
  reducedMotion = false;
});

async function open(post: FeedPost, startIndex = 0): Promise<HTMLElement> {
  const model = resolveFeedCardModel(post, { preferredLanguages: ['fr'], now: new Date('2026-09-17T12:00:00.000Z') });
  const lot = composeSceneGalleryLot(model);
  if (lot === undefined) throw new Error('lot attendu');
  container = document.createElement('div');
  container.id = 'root';
  document.body.appendChild(container);
  const r = createRoot(container);
  root = r;
  await act(async () => {
    r.render(
      <MediaViewer
        items={lot.items}
        scenes={lot.scenes}
        startIndex={startIndex}
        onClose={() => {}}
        languages={['fr']}
        fallbackLanguage="fr"
        carrier={{ sender: { displayName: 'Mei', avatarUrl: null }, sentAt: model.createdAt, caption: null }}
      />,
    );
  });
  return document.body;
}

const slot = (body: HTMLElement): HTMLElement => body.querySelector<HTMLElement>('[data-viewer-transport-slot]')!;
const scrub = (body: HTMLElement): HTMLElement | null => slot(body).querySelector<HTMLElement>('[data-scene-scrub]');

describe('le curseur de la scène (#8598)', () => {
  test('une scène qui a une timeline ouvre son curseur DANS le couloir de transport, avec sa durée', async () => {
    const body = await open(POST_SCENE_DECORATED);
    const slider = scrub(body);
    expect(slider).not.toBeNull();
    expect(slider!.getAttribute('role')).toBe('slider');
    expect(slider!.getAttribute('aria-valuetext')).toContain('0:02');
  });

  test('une scène FIXE n’a pas de curseur — un contrôle qui ne bougerait rien n’existe pas (loi 4)', async () => {
    const body = await open(POST_SCENES_MIXED, 0);
    expect(scrub(body)).toBeNull();
  });

  test('en plein cadre, le curseur s’efface avec le chrome — invisible ET intouchable', async () => {
    const body = await open(POST_SCENE_DECORATED);
    act(() => {
      body.querySelector('.media-viewer-track-frame')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const corridor = scrub(body)!.closest<HTMLElement>('[data-viewer-bottom-bar]')!;
    expect(corridor.getAttribute('data-chrome-yields')).toBe('hidden');
    expect(corridor.hasAttribute('inert')).toBe(true);
  });

  test('glisser le curseur ne bascule PAS le plateau — le geste appartient au curseur', async () => {
    const body = await open(POST_SCENE_DECORATED);
    const slider = scrub(body)!;
    await act(async () => {
      slider.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 10, pointerId: 1 }));
      slider.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 10, pointerId: 1 }));
      slider.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const corridor = slider.closest<HTMLElement>('[data-viewer-bottom-bar]')!;
    expect(corridor.getAttribute('data-chrome-yields')).toBe('shown');
  });
});

describe('les contrôles de la scène portent le disque commun des plein écrans (#8879)', () => {
  test('lecture/pause : le MÊME disque de verre que le rail du chrome (40 dans une cible de 44), jamais un noir local', async () => {
    const body = await open(POST_SCENE_DECORATED);
    const control = body.querySelector<HTMLElement>('[data-scene-viewer-playpause]')!;
    expect(control.className).toContain('size-11');
    const disc = control.querySelector<HTMLElement>('span')!;
    expect(disc.className).toContain('glass-call');
    expect(disc.className).toContain('viewer-disc');
    expect(control.className).not.toContain('media-viewer-scene-control');
  });

  test('la scène en plein viewport porte la barre basse en VOILE sur elle (overlay), une image en couloir', async () => {
    const body = await open(POST_SCENE_DECORATED);
    expect(body.querySelector('[data-viewer-bottom-bar]')!.className).toContain('viewer-scrim-bottom');
  });
});

describe('l’ouverture depuis la carte (#8598)', () => {
  test('la lecture REPREND au temps que la carte a confié — jamais de zéro', async () => {
    const itemId = 'scene:post-scene-decorated#0';
    handOffSceneOpening({ itemId, seconds: 1, origin: null });
    const body = await open(POST_SCENE_DECORATED);
    expect(scrub(body)!.getAttribute('aria-valuenow')).toBe('50');
  });

  test('la boîte de la scène GRANDIT depuis le cadre de la carte, et le fond noir se lève avec elle', async () => {
    handOffSceneOpening({ itemId: 'scene:post-scene-decorated#0', seconds: 0, origin: { left: 16, top: 300, width: 195, height: 346.5, radius: 12 } });
    await open(POST_SCENE_DECORATED);
    const box = animateCalls.find((call) => call.element.hasAttribute('data-scene-viewer-box'));
    expect(box).toBeDefined();
    expect(String(box!.keyframes[0]!.transform)).toContain('scale(');
    expect(String(box!.keyframes[0]!.clipPath)).toContain('inset(');
    const layer = animateCalls.find((call) => call.element.hasAttribute('data-media-viewer'));
    expect(layer).toBeDefined();
    expect(layer!.keyframes[0]!.backgroundColor).toBe('color-mix(in srgb, var(--color-media-backdrop) 0%, transparent)');
    expect(layer!.keyframes[1]!.backgroundColor).toBe('var(--color-media-backdrop)');
  });

  test('sous `prefers-reduced-motion`, rien ne s’anime : la scène est là, à sa place', async () => {
    reducedMotion = true;
    handOffSceneOpening({ itemId: 'scene:post-scene-decorated#0', seconds: 0, origin: { left: 16, top: 300, width: 195, height: 346.5, radius: 12 } });
    await open(POST_SCENE_DECORATED);
    expect(animateCalls).toEqual([]);
  });

  test('ouverte sans carte (aucun relais), la visionneuse ne rejoue aucune ouverture', async () => {
    await open(POST_SCENE_DECORATED);
    expect(animateCalls).toEqual([]);
  });
});
