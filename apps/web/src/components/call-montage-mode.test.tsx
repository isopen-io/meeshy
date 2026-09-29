import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import type { CaptureEnv, CaptureFile, SaveOutcome } from '@/lib/calls/call-capture';
import type { ClipEnv } from '@/lib/calls/call-capture-live';
import { loadCallStudioCatalog } from '@/lib/i18n-call-studio-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { CallMontageMode } from './call-montage-mode';

/**
 * LE MODE MONTAGE (#8552, #8578, #8580) — l'écran se libère : le montage
 * choisi en plein écran et en direct, le carrousel des treize styles en bas
 * (chacun sa vignette vivante), la barre ✕ · « Chaque visage ». Plus de
 * déclencheur (#8625) : deux tapes sur le style choisi l'enregistrent, un
 * appui long le filme jusqu'au stop ; le statut dit ce qui est parti.
 */

const place = (element: Element, box: { left: number; top: number; width: number; height: number }): void => {
  Object.defineProperty(element, 'getBoundingClientRect', { value: () => ({ ...box, x: box.left, y: box.top, right: box.left + box.width, bottom: box.top + box.height }) });
};

const stageOf = (count: number): Element => {
  const stage = document.createElement('div');
  place(stage, { left: 0, top: 0, width: 400, height: 800 });
  Array.from({ length: count }, (_, index) => {
    const video = document.createElement('video');
    video.setAttribute('data-call-stream', 'cover');
    Object.defineProperty(video, 'videoWidth', { value: 1280 });
    Object.defineProperty(video, 'videoHeight', { value: 720 });
    place(video, { left: 0, top: index * 250, width: 400, height: 250 });
    stage.appendChild(video);
  });
  return stage;
};

const env: CaptureEnv = {
  canvas: () => ({
    context: new Proxy({}, { get: (_t, key) => (key === 'createLinearGradient' ? () => ({ addColorStop: () => undefined }) : () => undefined), set: () => true }) as unknown as CanvasRenderingContext2D,
    toBlob: async () => new Blob(['png'], { type: 'image/png' }),
  }),
  detector: null,
  now: () => new Date(2026, 8, 28, 9, 5, 3),
};

describe('CallMontageMode', () => {
  const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

  beforeAll(async () => {
    await loadCallStudioCatalog('fr');
    ensureHappyDomRegistered();
    globals.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(async () => {
    await act(async () => {});
    delete globals.IS_REACT_ACT_ENVIRONMENT;
    await releaseHappyDomIfRegistered();
  });

  const clips: Array<{ readonly end: () => void; readonly push: (blob: Blob) => void; readonly tracks: readonly string[] }> = [];
  const clipEnv = (): ClipEnv => ({
    isTypeSupported: (mime) => mime === 'video/webm',
    record: (stream, _mime, push, end) => {
      clips.push({ end, push, tracks: stream.getTracks().map((track) => track.kind) });
      return { stop: () => queueMicrotask(() => (push(new Blob(['clip'])), end())) };
    },
    mixAudio: (streams) => ({ track: streams.length === 0 ? null : ({ kind: 'audio' } as MediaStreamTrack), close: () => undefined }),
    createStream: (tracks) => ({ getTracks: () => tracks }) as unknown as MediaStream,
    now: () => new Date(2026, 8, 29, 18, 4, 9),
  });

  const mount = (options: { readonly tiles?: number; readonly outcome?: SaveOutcome } = {}) => {
    const stage = stageOf(options.tiles ?? 2);
    const saved: Array<readonly CaptureFile[]> = [];
    const closed: string[] = [];
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const save = async (files: readonly CaptureFile[]) => {
      saved.push(files);
      return options.outcome ?? { saved: files.length, failed: 0, cancelled: 0 };
    };
    act(() =>
      root.render(
        <CallMontageMode
          language="fr"
          quitGlyph={null}
          onExit={() => void closed.push('close')}
          stage={() => stage}
          audio={() => [{ getAudioTracks: () => [{}] } as unknown as MediaStream]}
          env={env}
          save={save}
          clipEnv={clipEnv}
          viewport={() => ({ width: 390, height: 844 })}
        />,
      ),
    );
    const find = (selector: string) => host.querySelector(selector);
    const all = (selector: string) => [...host.querySelectorAll(selector)];
    const press = async (selector: string) => {
      await act(async () => (find(selector) as HTMLElement | null)?.click());
      await act(async () => {});
    };
    const twice = async (selector: string) => {
      await press(selector);
      await press(selector);
    };
    const done = () => {
      act(() => root.unmount());
      host.remove();
    };
    return { find, all, press, twice, saved, closed, done, root };
  };

  test('une région nommée ; le montage en plein écran, en direct, derrière le carrousel', () => {
    const view = mount();
    const region = view.find('[data-call-mode="montage"]');
    expect(region?.getAttribute('role')).toBe('region');
    expect(region?.getAttribute('aria-label')).toBe('Capturer l’appel');
    expect(view.find('[data-call-mode-preview="montage"]')?.className).toContain('fixed inset-0');
    const preview = view.find('[data-call-mode-preview="montage"] [data-call-capture-preview]');
    expect(preview?.tagName).toBe('CANVAS');
    expect(preview?.getAttribute('aria-label')).toBe('Aperçu du montage Mosaïque');
    expect([preview?.getAttribute('width'), preview?.getAttribute('height')]).toEqual(['540', '960']);
    expect(view.all('[data-call-mode-carousel]')).toHaveLength(1);
    view.done();
  });

  test('treize montages dans le carrousel, dans l’ordre, chacun sa vignette ; il défile à l’horizontale', () => {
    const view = mount();
    const radios = view.all('[data-call-mode-carousel] [role="radio"]');
    expect(radios.map((radio) => radio.getAttribute('aria-label'))).toEqual(['Plein écran', 'Couverture', 'Doré', 'Tapis rouge', 'Mosaïque', 'Photomaton', 'Polaroïd', 'Magazine', 'Pellicule', 'Néon', 'Noir et blanc', 'BD', 'Cœur']);
    expect(radios.map((radio) => radio.getAttribute('aria-checked'))).toEqual(['false', 'false', 'false', 'false', 'true', 'false', 'false', 'false', 'false', 'false', 'false', 'false', 'false']);
    expect(radios.every((radio) => radio.querySelector('canvas[data-call-capture-thumb]') !== null)).toBe(true);
    expect(view.find('[data-call-mode-carousel] [data-call-row-scroll]')?.className).toContain('overflow-x-auto');
    view.done();
  });

  test('choisir « BD » change l’aperçu ; plus de déclencheur : le geste se dit sur le style choisi (#8625)', async () => {
    const view = mount();
    await view.press('[data-carousel-item="comic"]');
    expect(view.find('[data-carousel-item="comic"]')?.getAttribute('aria-checked')).toBe('true');
    expect(view.find('[data-call-mode-selected]')?.textContent).toBe('BD');
    expect(view.find('[data-call-capture-preview]')?.getAttribute('data-call-capture-preview')).toBe('comic');
    expect(view.find('[data-call-capture-shoot]')).toBeNull();
    const hint = view.find('[data-carousel-item="comic"]')?.getAttribute('aria-describedby') ?? '';
    expect(view.find(`[id="${hint}"]`)?.textContent).toBe('Deux tapes, ou Entrée : une photo. Appui long : une vidéo, avec le son.');
    view.done();
  });

  test('deux tapes sur le style choisi l’enregistrent, et le disent ; une seule tape ne capture rien (#8625)', async () => {
    const view = mount();
    await view.press('[data-carousel-item="polaroid"]');
    await view.press('[data-carousel-item="polaroid"]');
    expect(view.saved).toEqual([]);
    await view.press('[data-carousel-item="polaroid"]');
    expect(view.saved.map((files) => files.map((file) => file.fileName))).toEqual([['meeshy-appel-polaroid-20260928-090503.png']]);
    expect(view.find('[data-call-capture-status]')?.textContent).toBe('Capture enregistrée');
    expect(view.find('[data-call-capture-status]')?.getAttribute('role')).toBe('status');
    view.done();
  });

  test('« Chaque visage » enregistre un portrait par tuile affichée', async () => {
    const view = mount({ tiles: 3 });
    await view.press('[data-call-capture-faces]');
    expect(view.saved[0]).toHaveLength(3);
    expect(view.find('[data-call-capture-status]')?.textContent).toBe('3 visages enregistrés');
    view.done();
  });

  test('rien d’affiché : rien n’est enregistré, et on le dit', async () => {
    const view = mount({ tiles: 0 });
    await view.twice('[data-carousel-item="grid"]');
    expect(view.saved).toEqual([]);
    expect(view.find('[data-call-capture-status]')?.textContent).toBe('Rien à capturer : aucune image n’est affichée');
    view.done();
  });

  test('un enregistrement qui échoue se dit en erreur', async () => {
    const view = mount({ outcome: { saved: 0, failed: 1, cancelled: 0 } });
    await view.twice('[data-carousel-item="grid"]');
    expect(view.find('[data-call-capture-status]')?.getAttribute('data-call-capture-status')).toBe('error');
    view.done();
  });

  test('au clavier, Entrée sur le style choisi le capture (#8625)', async () => {
    const view = mount();
    await act(async () => view.find('[data-carousel-item="grid"]')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })));
    await act(async () => {});
    expect(view.saved.map((files) => files.map((file) => file.fileName))).toEqual([['meeshy-appel-grid-20260928-090503.png']]);
    view.done();
  });

  test('filmer : le montage rendu ET le son ; stop, au centre, enregistre UNE vidéo (#8625)', async () => {
    const original = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'captureStream');
    const stopped: string[] = [];
    Object.defineProperty(HTMLCanvasElement.prototype, 'captureStream', { configurable: true, value: () => ({ getVideoTracks: () => [{ kind: 'video', stop: () => void stopped.push('video') }] }) });
    clips.length = 0;
    const view = mount();
    await view.press('[data-call-record-key]');
    expect(clips[0]?.tracks).toEqual(['video', 'audio']);
    const stop = view.find('[data-call-recording] [data-call-record-stop]');
    expect(stop).not.toBeNull();
    expect(view.find('[data-call-record-clock]')?.textContent).toBe('0:00');
    expect(stop?.getAttribute('aria-label')).toContain('Arrêter la vidéo et l’enregistrer');
    await view.press('[data-call-record-stop]');
    await act(async () => {});
    expect(view.saved.map((files) => files.map((file) => [file.fileName, file.mimeType]))).toEqual([[['meeshy-appel-grid-20260929-180409.webm', 'video/webm']]]);
    expect(stopped).toEqual(['video']);
    expect(view.find('[data-call-recording]')).toBeNull();
    expect(view.find('[data-call-capture-status]')?.textContent).toBe('Vidéo enregistrée');
    view.done();
    if (original === undefined) delete (HTMLCanvasElement.prototype as { captureStream?: unknown }).captureStream;
    else Object.defineProperty(HTMLCanvasElement.prototype, 'captureStream', original);
  });

  test('quitter le mode pendant une vidéo l’enregistre quand même (#8625)', async () => {
    Object.defineProperty(HTMLCanvasElement.prototype, 'captureStream', { configurable: true, value: () => ({ getVideoTracks: () => [{ kind: 'video', stop: () => undefined }] }) });
    const view = mount();
    await view.press('[data-call-record-key]');
    act(() => view.root.unmount());
    await act(async () => {});
    await act(async () => {});
    expect(view.saved.map((files) => files.map((file) => file.mimeType))).toEqual([['video/webm']]);
    delete (HTMLCanvasElement.prototype as { captureStream?: unknown }).captureStream;
  });

  test('un navigateur qui ne sait pas filmer le dit (#8625)', async () => {
    const view = mount();
    await view.press('[data-call-record-key]');
    expect(view.find('[data-call-recording]')).toBeNull();
    expect(view.find('[data-call-capture-status]')?.getAttribute('data-call-capture-status')).toBe('error');
    view.done();
  });

  test('✕ quitte le mode ; Échap aussi', () => {
    const view = mount();
    act(() => (view.find('[data-call-mode-quit]') as HTMLElement).click());
    act(() => view.find('[data-call-mode="montage"]')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(view.closed).toEqual(['close', 'close']);
    view.done();
  });
});
