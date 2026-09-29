import { describe, expect, test } from 'bun:test';
import { act } from 'react';

import type { CameraEngine } from '@/lib/stories/studio-camera-engine';
import { flush, harness, mount, registerStudioBench, selectFile, image, tapInvite } from '@/test-support/story-studio-bench';

/**
 * LA CAPTURE RAPIDE, DANS LE STUDIO (#8654, jumelle de #8653) — une scène vide
 * dit en gris ce que font ses gestes ; le toucher ouvre la caméra ET pose la
 * photo en fond, l'appui long filme tant qu'il dure et pose la vidéo ;
 * quitter par le (X) rend la scène telle qu'elle était.
 */
registerStudioBench();

function camera(): { readonly engine: CameraEngine; readonly journal: string[] } {
  const journal: string[] = [];
  const engine: CameraEngine = {
    open: async () => ({ ok: true, stream: new MediaStream(), torch: false }),
    live: async () => undefined,
    lit: async () => undefined,
    setTorch: async () => undefined,
    photo: async () => {
      journal.push('photo');
      return new File(['jpg'], 'photo.jpg', { type: 'image/jpeg' });
    },
    startRecording: () => {
      journal.push('record');
    },
    stopRecording: async () => {
      journal.push('stop');
      return new File(['mp4'], 'video.mp4', { type: 'video/mp4' });
    },
    release: () => undefined,
    maxBrightness: async () => null,
  };
  return { engine, journal };
}

const EMPTY_POINT = { clientX: 300, clientY: 500 } as const;
const hint = (host: ParentNode) => host.querySelector('[data-story-quick-capture-hint]');

function press(host: ParentNode, type: 'pointerdown' | 'pointerup') {
  const layer = host.querySelector<HTMLElement>('[data-story-stage-gestures]');
  if (layer === null) throw new Error('aucun calque des gestes');
  layer.setPointerCapture = () => undefined;
  act(() => layer.dispatchEvent(new PointerEvent(type, { bubbles: true, button: 0, pointerId: 1, ...EMPTY_POINT })));
}

describe('la scène vide dit ses gestes', () => {
  test('une indication grise nomme la photo et la vidéo ; le clavier a ses deux boutons', async () => {
    const el = mount({ ...harness({}).deps, camera: camera().engine });
    await flush(() => hint(el) !== null);
    expect(hint(el)?.textContent).toBe('Toucher : photo · Maintenir : vidéo');
    expect(el.querySelector('[data-story-quick-capture="photo"]')?.textContent).toBe('Prendre une photo');
    expect(el.querySelector('[data-story-quick-capture="video"]')?.textContent).toBe('Filmer');
  });

  test('un réel ne propose que de filmer', async () => {
    const el = mount({ ...harness({}).deps, camera: camera().engine }, 'REEL');
    await flush(() => hint(el) !== null);
    expect(hint(el)?.textContent).toBe('Maintenir pour filmer');
    expect(el.querySelector('[data-story-quick-capture="photo"]')).toBeNull();
  });

  test('une scène qui porte un média, ou un outil ouvert, n’a plus d’indication', async () => {
    const withMedia = mount({ ...harness({}).deps, camera: camera().engine });
    selectFile(withMedia, 'visual', image());
    await flush(() => withMedia.querySelector('[data-story-option="frame"]') !== null);
    expect(hint(withMedia)).toBeNull();

    const writing = mount({ ...harness({}).deps, camera: camera().engine });
    tapInvite(writing);
    await flush(() => writing.querySelector('[data-story-edit-plaque]') !== null);
    expect(hint(writing)).toBeNull();
  });
});

describe('toucher = photo, appui long = vidéo', () => {
  test('toucher le vide ouvre la caméra, prend la photo et la pose en fond', async () => {
    const { engine, journal } = camera();
    const el = mount({ ...harness({}).deps, camera: engine });
    await flush(() => hint(el) !== null);
    press(el, 'pointerdown');
    press(el, 'pointerup');
    await flush(() => el.querySelector('[data-story-option="frame"]') !== null);
    expect(journal).toEqual(['photo']);
    expect(document.querySelector('[data-story-camera]')).toBeNull();
    expect(el.querySelector('[data-story-option="frame"]')).not.toBeNull();
    expect(hint(el)).toBeNull();
  });

  test('l’appui long ouvre et filme tant qu’il dure ; relâcher pose la vidéo', async () => {
    const { engine, journal } = camera();
    const el = mount({ ...harness({}).deps, camera: engine });
    await flush(() => hint(el) !== null);
    press(el, 'pointerdown');
    await flush(() => journal.includes('record'));
    expect(document.querySelector('[data-story-camera-recording]')).not.toBeNull();
    press(el, 'pointerup');
    await flush(() => el.querySelector('[data-story-option="frame"]') !== null);
    expect(journal).toEqual(['record', 'stop']);
    expect(document.querySelector('[data-story-camera]')).toBeNull();
  });

  test('le (X) quitte la caméra à tout moment : la scène revient vide, rien n’est posé', async () => {
    const { engine, journal } = camera();
    const el = mount({ ...harness({}).deps, camera: engine });
    await flush(() => hint(el) !== null);
    act(() => el.querySelector<HTMLButtonElement>('[data-story-quick-capture="video"]')?.click());
    await flush(() => document.querySelector('[data-story-camera-close]') !== null);
    act(() => document.querySelector<HTMLButtonElement>('[data-story-camera-close]')?.click());
    await flush(() => document.querySelector('[data-story-camera]') === null);
    expect(journal).toEqual([]);
    expect(hint(el)).not.toBeNull();
    expect(el.querySelector('[data-story-option="frame"]')).toBeNull();
  });
});
