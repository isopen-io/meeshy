import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { CameraEngine } from '@/lib/stories/studio-camera-engine';
import type { StudioRetouchDeps } from '@/lib/stories/studio-retouch';
import { studioRetouchReturn } from '@/lib/stories/studio-retouch-finish';
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

  const clip = new File(['mp4'], 'clip.mp4', { type: 'video/mp4' });
  const written = (base: StudioPage): StudioPage => ({ ...base, texts: base.texts.map((layer) => ({ ...layer, text: 'Bonjour' })) });

  test('la retouche d’une IMAGE rend toujours le composite', () => {
    expect(studioRetouchReturn({ capturing: false, page: page({ background: visual(taken) }), original: taken })).toBe('render-image');
  });

  test('la caméra : prise intacte ⇒ la prise ; rien ⇒ annuler ; retouchée ⇒ composite', () => {
    expect(studioRetouchReturn({ capturing: true, page: page({ background: visual(taken) }), original: taken })).toBe('return-original');
    expect(studioRetouchReturn({ capturing: true, page: page(), original: null })).toBe('cancel');
    expect(studioRetouchReturn({ capturing: true, page: written(page({ background: visual(taken) })), original: taken })).toBe('render-image');
    expect(studioRetouchReturn({ capturing: true, page: page({ background: visual(taken, { filter: 'bw' }) }), original: taken })).toBe('render-image');
  });

  test('#9124 — une VIDÉO : intacte en attente ⇒ elle reste ; retouchée ⇒ une vidéo bakée', () => {
    const video = visual(clip, { mediaType: 'video' });
    expect(studioRetouchReturn({ capturing: false, page: page({ background: video }), original: clip })).toBe('cancel');
    expect(studioRetouchReturn({ capturing: false, page: written(page({ background: video })), original: clip })).toBe('render-video');
    expect(studioRetouchReturn({ capturing: true, page: written(page({ background: video })), original: clip })).toBe('render-video');
    expect(studioRetouchReturn({ capturing: true, page: page({ background: video }), original: clip })).toBe('return-original');
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

describe('#9124 — « Terminé » sur une vidéo retouchée rend une VIDÉO', () => {
  test('la scène qui porte une vidéo et un texte part bakée, nommée d’après la pièce', async () => {
    const { useStudioRetouchFinish } = await import('@/routes/use-studio-retouch');
    const clip = new File(['mp4'], 'clip.mov', { type: 'video/quicktime' });
    const base = emptyStudioPage('p', 't', 'fr');
    const scene: StudioPage = {
      ...base,
      texts: base.texts.map((layer) => ({ ...layer, text: 'Bonjour' })),
      background: { file: clip, previewUrl: 'blob:clip', mediaType: 'video', upload: { phase: 'uploading', progress: 0 }, caption: '', pose: { x: 0.5, y: 0.5, scale: 1, rotation: 0 } },
    };
    let done: File | null = null;
    let finish: (() => Promise<void>) | null = null;
    function Probe() {
      finish = useStudioRetouchFinish(
        {
          file: clip,
          onDone: (file) => (done = file),
          onCancel: () => undefined,
          renderVideo: {
            createSurface: () => null,
            loadImage: async () => null,
            loadVideo: async () => null,
            record: () => null,
          },
        },
        () => scene,
        () => null,
      ).finishRetouch;
      return null;
    }
    mount(<Probe />);
    await act(async () => {
      await finish!();
    });
    expect(done).toBeNull();

    let baked: File | null = null;
    function Baking() {
      finish = useStudioRetouchFinish(
        {
          file: clip,
          onDone: (file) => (baked = file),
          onCancel: () => undefined,
          renderVideo: {
            createSurface: () => ({ context: new Proxy({}, { get: (_t, key) => (key === 'measureText' ? () => ({ width: 1 }) : () => undefined), set: () => true }) as never, videoTracks: () => [] }),
            loadImage: async () => null,
            loadVideo: async () => ({ frame: {} as CanvasImageSource, aspectRatio: 9 / 16, audioTracks: [], seek: async () => undefined, play: async () => undefined, release: () => undefined }),
            record: () => ({ mimeType: 'video/mp4', stop: async () => new Blob(['mp4'], { type: 'video/mp4' }) }),
          },
        },
        () => scene,
        () => null,
      ).finishRetouch;
      return null;
    }
    mount(<Baking />);
    await act(async () => {
      await finish!();
    });
    expect((baked as File | null)?.name).toBe('clip-retouche.mp4');
    expect((baked as File | null)?.type).toBe('video/mp4');
  });
});
