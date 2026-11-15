import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { act } from 'react';

import { frameUsageOf } from '@/lib/calls/frames/frame-filter';
import { recorder } from '@/lib/calls/frames/frame-recorder.test-support';
import { NO_IMAGES } from '@/lib/calls/frames/frame-scene-image';
import { createFrameStudio } from '@/lib/calls/frames/frame-studio';
import { frameUsageText, loadFrameUsageCatalog } from '@/lib/i18n-frame-usage-catalog';
import { describeFrameUsage } from '@meeshy/shared/types/frame-usage';
import type { PhotoEnv } from '@/lib/media/photo-develop';
import type { CameraEngine } from '@/lib/stories/studio-camera-engine';
import { studioCameraFrames } from '@/lib/stories/studio-camera-frames';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { StudioCamera } from './story-compose-camera';
import type { StudioCameraFramesDeps } from './story-compose-camera-frames';

/**
 * LA FAMILLE « CADRES » DE LA CAMÉRA DU COMPOSER (#10190, jumelle de la bande
 * Filtres · Effets · Cadres d'iOS, #9351) — « Cadres » ouvre la bande :
 * « Aucun cadre » en tête, puis les cadres de capture que la loi d'usage
 * autorise pour la photo et la vidéo, chacun avec son libellé d'usage. Un
 * cadre choisi, la photo et la vidéo passent par le peintre des cadres :
 * ce que l'aperçu montre est ce qui part. Rien ne se télécharge.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await Promise.all([loadFrameUsageCatalog('fr'), import('./story-compose-camera-frames')]);
});
afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
const mounter = createActMounter();
afterEach(() => mounter.unmountAll());

const rawPhoto = new File(['raw'], 'photo.jpg', { type: 'image/jpeg' });

function fakeEngine() {
  const journal: string[] = [];
  const stream = new MediaStream();
  const engine: CameraEngine = {
    open: async () => ({ ok: true, stream, torch: false, zoom: { mode: 'hardware', min: 1, max: 4, step: 0.1 } }),
    live: async () => undefined,
    lit: async () => undefined,
    setTorch: async () => undefined,
    photo: async () => {
      journal.push('photo:raw');
      return rawPhoto;
    },
    setZoom: async () => undefined,
    startRecording: (recorded) => {
      journal.push(recorded === stream ? 'record:camera' : 'record:framed');
    },
    stopRecording: async () => new File(['webm'], 'video.webm', { type: 'video/webm' }),
    release: () => undefined,
    maxBrightness: async () => null,
  };
  return { engine, journal, stream };
}

const studioOptions = { fonts: undefined, images: () => NO_IMAGES } as const;

function frameDeps() {
  const painted = recorder();
  const developed: string[] = [];
  const face = { label: 'video-frame' } as unknown as CanvasImageSource;
  const photo: PhotoEnv = {
    surface: () => ({ paint: () => undefined, pixels: () => null, put: () => undefined, encode: async (mime) => new Blob(['framed'], { type: mime }) }),
  };
  const film = new MediaStream();
  const deps: StudioCameraFramesDeps = {
    load: async () => ({ createFrameStudio: () => createFrameStudio(studioOptions) }),
    photo,
    canvas: (size) => {
      developed.push(`${size.width}x${size.height}`);
      return { context: painted.context, image: {} as CanvasImageSource };
    },
    face: () => ({ source: face, size: { width: 1280, height: 720 } }),
    film: () => film,
    viewer: () => ({ id: 'u-awa', handle: 'awa', displayName: 'Awa' }),
    now: () => new Date(Date.UTC(2026, 9, 25, 8, 30, 5)),
    viewport: () => ({ width: 390, height: 844 }),
  };
  return { deps, painted, developed, face, film };
}

async function settle() {
  for (let i = 0; i < 8; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function mount(deps: StudioCameraFramesDeps, engine: CameraEngine) {
  const taken: File[] = [];
  const host = await mounter.mount(
    <StudioCamera lang="fr" kind="POST" intent="manual" holding={false} flash={false} onFlash={() => undefined} engine={engine} frames={deps} onTake={(file) => taken.push(file)} onClose={() => undefined} />,
  );
  await settle();
  const press = async (selector: string) => {
    await act(async () => (host.querySelector(selector) as HTMLElement | null)?.click());
    await settle();
  };
  const items = () => [...host.querySelectorAll('[data-story-camera-frames] [data-carousel-item]')];
  return { host, taken, press, items };
}

describe('StudioCamera — la famille « Cadres »', () => {
  const offered = studioCameraFrames(createFrameStudio(studioOptions));
  const first = offered[0];

  test('« Cadres » ouvre la bande : « Aucun cadre » en tête, puis les cadres de capture avec leur libellé d’usage', async () => {
    const { engine } = fakeEngine();
    const view = await mount(frameDeps().deps, engine);
    const toggle = view.host.querySelector('[data-story-camera-frames-toggle]');
    expect(toggle?.getAttribute('aria-label')).toBe('Cadres');
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(view.items()).toEqual([]);

    await view.press('[data-story-camera-frames-toggle]');
    expect(view.host.querySelector('[data-story-camera-frames-toggle]')?.getAttribute('aria-expanded')).toBe('true');
    expect(view.host.querySelector('[data-story-camera-frames] [role="radiogroup"]')?.getAttribute('aria-label')).toBe('Cadres');
    const ids = view.items().map((item) => item.getAttribute('data-carousel-item'));
    expect(ids).toEqual(['none', ...offered.map((frame) => frame.id)]);
    expect(view.items()[0]?.getAttribute('aria-label')).toBe('Aucun cadre');
    expect(view.items()[0]?.getAttribute('aria-checked')).toBe('true');
    const firstItem = view.items()[1];
    expect(first).toBeDefined();
    expect(firstItem?.getAttribute('aria-label')).toBe(first?.name ?? '');
    expect(firstItem?.getAttribute('title')).toBe(first === undefined ? '' : frameUsageText('fr', describeFrameUsage(frameUsageOf(first))));
  });

  test('sans cadre, la photo est celle de l’objectif, telle quelle', async () => {
    const { engine, journal } = fakeEngine();
    const view = await mount(frameDeps().deps, engine);
    await view.press('[data-story-camera-frames-toggle]');
    await view.press('[data-story-camera-shutter]');
    expect(journal).toEqual(['photo:raw']);
    expect(view.taken).toEqual([rawPhoto]);
  });

  test('un cadre choisi : l’aperçu le peint, et la photo passe par son peintre, à la toile 9:16, l’auteur écrit dedans', async () => {
    const { engine, journal } = fakeEngine();
    const { deps, developed, painted } = frameDeps();
    const view = await mount(deps, engine);
    await view.press('[data-story-camera-frames-toggle]');
    await view.press(`[data-carousel-item="${first?.id ?? ''}"]`);
    expect(view.items()[1]?.getAttribute('aria-checked')).toBe('true');
    expect(view.host.querySelector(`[data-story-camera-frame-preview="${first?.id ?? ''}"]`)).not.toBeNull();

    await view.press('[data-story-camera-shutter]');
    expect(journal).toEqual([]);
    expect(developed).toEqual(['1080x1920']);
    expect(painted.log.some((entry) => entry.key === 'drawImage')).toBe(true);
    expect(view.taken).toHaveLength(1);
    expect(view.taken[0]?.name).toBe(`photo-cadre-${(first?.id ?? '').replaceAll('.', '-')}-2026-10-25T08-30-05-000Z.jpg`);
    expect(view.taken[0]?.type).toBe('image/jpeg');
  });

  test('« Aucun cadre » le retire d’un toucher : l’aperçu redevient l’objectif', async () => {
    const { engine } = fakeEngine();
    const view = await mount(frameDeps().deps, engine);
    await view.press('[data-story-camera-frames-toggle]');
    await view.press(`[data-carousel-item="${first?.id ?? ''}"]`);
    await view.press('[data-carousel-item="none"]');
    expect(view.host.querySelector('[data-story-camera-frame-preview]')).toBeNull();
  });

  test('un cadre choisi, la vidéo filme l’aperçu peint — et la bande se retire pendant le film', async () => {
    const { engine, journal } = fakeEngine();
    const view = await mount(frameDeps().deps, engine);
    await view.press('[data-story-camera-frames-toggle]');
    await view.press(`[data-carousel-item="${first?.id ?? ''}"]`);
    const shutter = view.host.querySelector('[data-story-camera-shutter]') as HTMLElement;
    await act(async () => {
      shutter.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: 0, clientY: 0 }));
      await new Promise((resolve) => setTimeout(resolve, 400));
    });
    await settle();
    expect(journal).toEqual(['record:framed']);
    expect(view.items()).toEqual([]);
    expect(view.host.querySelector('[data-story-camera-frames-toggle]')).toBeNull();
  });
});
