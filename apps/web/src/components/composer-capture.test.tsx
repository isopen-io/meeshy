import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { CameraEngine } from '@/lib/stories/studio-camera-engine';
import type { StudioRetouchDeps } from '@/lib/stories/studio-retouch';
import { studioRetouchReturn } from '@/routes/use-studio-retouch';
import { emptyStudioPage, type StudioPage, type StudioVisualAsset } from '@/lib/stories/studio-page';
import { flush, registerStudioBench } from '@/test-support/story-studio-bench';

import { ComposerCapture } from './composer-retouch';
import { ComposerTopRow } from './composer-top-row';

/**
 * LA CAMÉRA DE LA BARRE DE COMPOSITION (#9123, miroir
 * `ConversationCaptureSceneEditor` iOS) — elle ouvre le studio plein écran,
 * VIDE et viseur ARMÉ ; la prise s'y édite, et « Terminé » la rend au message
 * en attente : telle quelle si l'auteur n'y a pas touché, composée sinon.
 */
registerStudioBench();

beforeAll(async () => {
  await Promise.all([import('@/routes/story-compose'), import('./composer-retouch'), import('@/lib/stories/studio-retouch'), import('@/routes/story-compose-camera')]);
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

const taken = new File(['jpg'], 'photo.jpg', { type: 'image/jpeg' });

function camera(): CameraEngine {
  return {
    open: async () => ({ ok: true, stream: new MediaStream(), torch: false, zoom: { mode: 'hardware', min: 1, max: 8, step: 0.1 } }),
    live: async () => undefined,
    lit: async () => undefined,
    setTorch: async () => undefined,
    setZoom: async () => undefined,
    photo: async () => taken,
    startRecording: () => undefined,
    stopRecording: async () => new File(['mp4'], 'video.mp4', { type: 'video/mp4' }),
    release: () => undefined,
    maxBrightness: async () => null,
  };
}

const fakeRender: StudioRetouchDeps = {
  createCanvas: () => ({
    context: new Proxy({}, { get: (_t, key) => (key === 'measureText' ? () => ({ width: 10 }) : () => undefined), set: () => true }) as never,
    toBlob: async (type) => new Blob(['jpeg'], { type }),
  }),
  loadImage: async () => ({ naturalWidth: 4, naturalHeight: 3 }) as unknown as CanvasImageSource,
};

describe('la caméra de la barre ouvre le studio, viseur ARMÉ', () => {
  test('le viseur est armé dès l’ouverture, sans aucun toucher', async () => {
    mount(<ComposerCapture onDone={() => undefined} onCancel={() => undefined} camera={camera()} render={fakeRender} />);
    await flush(() => document.querySelector('[data-composer-capture] [data-story-camera="live"]') !== null);
    expect(document.querySelector('[data-composer-capture] [data-story-retouch-done]')).not.toBeNull();
  });

  test('une prise intacte repart TELLE QUELLE au message', async () => {
    let done: File | null = null;
    mount(<ComposerCapture onDone={(file) => (done = file)} onCancel={() => undefined} camera={camera()} render={fakeRender} />);
    await flush(() => document.querySelector('[data-story-camera="live"]') !== null);
    act(() => document.querySelector<HTMLElement>('[data-story-camera-preview]')?.click());
    await flush(() => document.querySelector('[data-story-camera]') === null && document.querySelector('[data-story-option="frame"]') !== null);
    act(() => document.querySelector<HTMLButtonElement>('[data-story-retouch-done]')!.click());
    await flush(() => done !== null);
    expect(done).toBe(taken);
  });

  test('« Terminé » sans prise referme sans rien rendre', async () => {
    let cancelled = false;
    let done = false;
    mount(<ComposerCapture onDone={() => (done = true)} onCancel={() => (cancelled = true)} camera={camera()} render={fakeRender} />);
    await flush(() => document.querySelector('[data-story-retouch-done]') !== null);
    act(() => document.querySelector<HTMLButtonElement>('[data-story-retouch-done]')!.click());
    await flush(() => cancelled);
    expect(done).toBe(false);
  });
});

describe('ce que « Terminé » rend (studioRetouchReturn)', () => {
  const visual = (file: File, extra: Partial<StudioVisualAsset> = {}): StudioVisualAsset => ({
    file,
    previewUrl: 'blob:x',
    mediaType: 'image',
    upload: { phase: 'uploading', progress: 0 },
    caption: '',
    pose: { x: 0.5, y: 0.5, scale: 1, rotation: 0 },
    ...extra,
  });
  const page = (over: Partial<StudioPage> = {}): StudioPage => ({ ...emptyStudioPage('p', 't', 'fr'), ...over });

  test('la retouche d’une pièce rend toujours le composite', () => {
    expect(studioRetouchReturn({ capturing: false, page: page({ background: visual(taken) }), taken: null })).toBe('render');
  });

  test('la caméra : prise intacte ⇒ la prise ; rien ⇒ annuler ; retouchée ⇒ composite', () => {
    expect(studioRetouchReturn({ capturing: true, page: page({ background: visual(taken) }), taken })).toBe('return-capture');
    expect(studioRetouchReturn({ capturing: true, page: page(), taken: null })).toBe('cancel');
    const written = page({ background: visual(taken) });
    const withText = { ...written, texts: written.texts.map((layer) => ({ ...layer, text: 'Bonjour' })) };
    expect(studioRetouchReturn({ capturing: true, page: withText, taken })).toBe('render');
    expect(studioRetouchReturn({ capturing: true, page: page({ background: visual(taken, { filter: 'bw' }) }), taken })).toBe('render');
  });
});

describe('la caméra de la barre n’est plus l’`input capture` de l’OS', () => {
  test('un bouton qui ouvre le studio', () => {
    let opened = 0;
    const el = mount(
      <ComposerTopRow
        ephemeralPickerOpen={false}
        onToggleEphemeral={() => undefined}
        blurred={false}
        onToggleBlur={() => undefined}
        viewOnce={false}
        onToggleViewOnce={() => undefined}
        effectCount={0}
        effectsPanelOpen={false}
        onToggleEffects={() => undefined}
        languageCode="fr"
        onOpenLanguage={() => undefined}
        text=""
        onOpenCamera={() => (opened += 1)}
      />,
    );
    const button = el.querySelector<HTMLButtonElement>('button[data-composer-camera]');
    expect(button).not.toBeNull();
    expect(el.querySelector('input[capture]')).toBeNull();
    act(() => button!.click());
    expect(opened).toBe(1);
  });
});

describe('la tuile caméra du panneau suit la barre', () => {
  test('avec la porte du studio, la tuile l’ouvre', async () => {
    const { default: ComposerTray } = await import('./composer-tray');
    let opened = 0;
    const el = mount(
      <ComposerTray
        variant="panel"
        onPickPhotos={() => undefined}
        onPickCamera={() => undefined}
        onOpenCamera={() => (opened += 1)}
        onPickFile={() => undefined}
        onRequestLocation={() => undefined}
        onRequestEmoji={() => undefined}
        onStartVoice={() => undefined}
        canRecord
        canLocate
      />,
    );
    const tile = el.querySelector<HTMLButtonElement>('button[data-composer-source="camera"]');
    expect(tile).not.toBeNull();
    act(() => tile!.click());
    expect(opened).toBe(1);
  });
});
