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
    open: async () => ({ ok: true, stream: new MediaStream(), torch: false, zoom: { mode: 'hardware', min: 1, max: 8, step: 0.1 } }),
    live: async () => undefined,
    lit: async () => undefined,
    setTorch: async () => undefined,
    setZoom: async (_stream, value) => {
      journal.push(`zoom:${value.toFixed(1)}`);
    },
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

function press(host: ParentNode, type: 'pointerdown' | 'pointermove' | 'pointerup', offset: { readonly dx: number; readonly dy: number } = { dx: 0, dy: 0 }) {
  const layer = host.querySelector<HTMLElement>('[data-story-stage-gestures]');
  if (layer === null) throw new Error('aucun calque des gestes');
  layer.setPointerCapture = () => undefined;
  const point = { clientX: EMPTY_POINT.clientX + offset.dx, clientY: EMPTY_POINT.clientY + offset.dy };
  act(() => layer.dispatchEvent(new PointerEvent(type, { bubbles: true, button: 0, pointerId: 1, ...point })));
}

const emptyScene = (host: ParentNode) => host.querySelector('[data-story-empty-scene]');

describe('la scène vide dit ses gestes', () => {
  test('une indication grise nomme la photo et la vidéo ; le clavier a ses deux boutons', async () => {
    const el = mount({ ...harness({}).deps, camera: camera().engine });
    await flush(() => hint(el) !== null);
    expect(hint(el)?.textContent).toBe('Toucher : photo · Maintenir : vidéo');
    expect(el.querySelector('[data-story-quick-capture="photo"]')?.textContent).toBe('Prendre une photo');
    expect(el.querySelector('[data-story-quick-capture="video"]')?.textContent).toBe('Filmer');
  });

  test('elle donne envie (#8672) : un titre, une invitation à y poser texte, dessin, image, vidéo', async () => {
    const el = mount({ ...harness({}).deps, camera: camera().engine });
    await flush(() => emptyScene(el) !== null);
    expect(el.querySelector('[data-story-empty-scene-title]')?.textContent).toBe('Ceci est votre scène');
    expect(el.querySelector('[data-story-empty-scene-invite]')?.textContent).toBe('Donnez-lui vie : texte, dessin, image ou vidéo.');
    expect(emptyScene(el)?.contains(hint(el))).toBe(true);
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
    expect(emptyScene(withMedia)).toBeNull();

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

  test('l’appui long glissé jusqu’au cadenas verrouille (#8672) : relâcher ne clôt pas, le stop pose la vidéo', async () => {
    const { engine, journal } = camera();
    const el = mount({ ...harness({}).deps, camera: engine });
    await flush(() => hint(el) !== null);
    press(el, 'pointerdown');
    await flush(() => journal.includes('record'));
    press(el, 'pointermove', { dx: 0, dy: -140 });
    expect(journal).toContain('zoom:2.0');
    press(el, 'pointermove', { dx: -120, dy: -140 });
    expect(document.querySelector('[data-story-camera-recording]')?.textContent).toBe('Enregistrement verrouillé');
    press(el, 'pointerup', { dx: -120, dy: -140 });
    await flush(() => document.querySelector('[data-story-camera-shutter]') !== null);
    expect(journal).not.toContain('stop');
    act(() => document.querySelector<HTMLButtonElement>('[data-story-camera-shutter]')?.click());
    await flush(() => el.querySelector('[data-story-option="frame"]') !== null);
    expect(journal.filter((entry) => entry === 'record' || entry === 'stop')).toEqual(['record', 'stop']);
  });

  test('l’intensité du flash choisie est mémorisée d’une ouverture à l’autre (#8672)', async () => {
    const first = mount({ ...harness({}).deps, camera: camera().engine });
    await flush(() => hint(first) !== null);
    act(() => first.querySelector<HTMLButtonElement>('[data-story-quick-capture="video"]')?.click());
    await flush(() => document.querySelector('[data-story-camera-flash]') !== null);
    act(() => document.querySelector<HTMLButtonElement>('[data-story-camera-flash]')?.click());
    act(() => document.querySelector<HTMLButtonElement>('[data-story-camera-flip]')?.click());
    await flush(() => document.querySelector('[data-story-camera-flash-capsule="open"]') !== null);
    const slider = document.querySelector<HTMLInputElement>('[data-story-camera-flash-intensity]');
    if (slider === null) throw new Error('aucun curseur');
    act(() => {
      slider.value = '0.55';
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => document.querySelector<HTMLButtonElement>('[data-story-camera-close]')?.click());
    await flush(() => document.querySelector('[data-story-camera]') === null);

    const second = mount({ ...harness({}).deps, camera: camera().engine });
    await flush(() => hint(second) !== null);
    act(() => second.querySelector<HTMLButtonElement>('[data-story-quick-capture="video"]')?.click());
    await flush(() => document.querySelector('[data-story-camera-flash-intensity]') !== null);
    expect(document.querySelector<HTMLInputElement>('[data-story-camera-flash-intensity]')?.getAttribute('aria-valuetext')).toBe('55 %');
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
