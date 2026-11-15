import { describe, expect, test } from 'bun:test';
import { act } from 'react';

import type { CameraEngine } from '@/lib/stories/studio-camera-engine';
import { flush, harness, image, mount, registerStudioBench, selectFile } from '@/test-support/story-studio-bench';

/**
 * #10306 — **UN APPUI LONG SUR LA PHOTOTHÈQUE OUVRE LA CAMÉRA** (directive
 * porteur 2026-10-12) : la seconde entrée de la caméra, là où la scène porte
 * déjà quelque chose et n'offre plus sa capture rapide. Le clic court ouvre
 * toujours la photothèque ; le clavier et le lecteur d'écran nomment l'action.
 */
registerStudioBench();

function camera(): { readonly engine: CameraEngine; readonly journal: string[] } {
  const journal: string[] = [];
  const engine: CameraEngine = {
    open: async (facing) => {
      journal.push(`open:${facing}`);
      return { ok: true, stream: new MediaStream(), torch: false, zoom: { mode: 'preview', min: 1, max: 1, step: 0 } };
    },
    live: async () => undefined,
    lit: async () => undefined,
    setTorch: async () => undefined,
    setZoom: async () => undefined,
    photo: async () => new File(['jpg'], 'photo.jpg', { type: 'image/jpeg' }),
    startRecording: () => undefined,
    stopRecording: async () => null,
    release: () => undefined,
    maxBrightness: async () => null,
  };
  return { engine, journal };
}

const libraryInput = (host: ParentNode) => host.querySelector<HTMLInputElement>('input[data-door="visual"]');
const libraryDoor = (host: ParentNode) => libraryInput(host)?.closest('label') ?? null;
const cameraScreen = () => document.querySelector('[data-story-camera]');

function pointer(target: Element | null, type: 'pointerdown' | 'pointerup' | 'pointermove', at: { readonly x: number; readonly y: number } = { x: 20, y: 20 }) {
  if (target === null) throw new Error('aucune porte');
  act(() => target.dispatchEvent(new PointerEvent(type, { bubbles: true, button: 0, pointerId: 1, clientX: at.x, clientY: at.y })));
}

async function wait(ms: number) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

async function sceneWithMedia() {
  const { engine, journal } = camera();
  const el = mount({ ...harness({}).deps, camera: engine });
  selectFile(el, 'visual', image());
  await flush(() => el.querySelector('[data-story-option="frame"]') !== null);
  return { el, journal };
}

describe('la photothèque, tenue, ouvre la caméra (#10306)', () => {
  test('une scène qui porte déjà un média : tenir la photothèque ouvre la caméra, et le clic qui suit n’ouvre pas la photothèque', async () => {
    const { el, journal } = await sceneWithMedia();
    const door = libraryDoor(el);
    pointer(door, 'pointerdown');
    await wait(550);
    pointer(door, 'pointerup');
    await flush(() => cameraScreen() !== null);
    expect(journal).toEqual(['open:environment']);
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    act(() => door?.dispatchEvent(click));
    expect(click.defaultPrevented).toBe(true);
  });

  test('un clic court reste la photothèque : aucune caméra ne s’ouvre', async () => {
    const { el, journal } = await sceneWithMedia();
    const door = libraryDoor(el);
    pointer(door, 'pointerdown');
    await wait(80);
    pointer(door, 'pointerup');
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    act(() => door?.dispatchEvent(click));
    await wait(550);
    expect(click.defaultPrevented).toBe(false);
    expect(cameraScreen()).toBeNull();
    expect(journal).toEqual([]);
  });

  test('le doigt qui glisse (un défilement du rail) n’ouvre rien', async () => {
    const { el, journal } = await sceneWithMedia();
    const door = libraryDoor(el);
    pointer(door, 'pointerdown');
    pointer(door, 'pointermove', { x: 20, y: 60 });
    await wait(550);
    expect(cameraScreen()).toBeNull();
    expect(journal).toEqual([]);
  });

  test('le lecteur d’écran entend l’action, et le clavier l’a : Maj+Entrée ouvre la caméra', async () => {
    const { el, journal } = await sceneWithMedia();
    const input = libraryInput(el);
    const describedBy = input?.getAttribute('aria-describedby') ?? '';
    expect(describedBy).not.toBe('');
    expect(el.querySelector(`[id="${describedBy}"]`)?.textContent).toBe('Maintenir : ouvrir la caméra');
    expect(input?.getAttribute('aria-keyshortcuts')).toBe('Shift+Enter');
    act(() => input?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter', shiftKey: true })));
    await flush(() => cameraScreen() !== null);
    expect(journal).toEqual(['open:environment']);
  });
});
