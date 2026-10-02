import { describe, expect, test } from 'bun:test';

import { renderStudioRetouchVideo, retouchedVideoFileName, type StudioRetouchVideoDeps } from './studio-retouch-video';
import { emptyStudioPage, type StudioPage, type StudioVisualAsset } from './studio-page';
import { IDENTITY_POSE } from './studio-pose';

/**
 * UNE VIDÉO RETOUCHÉE REPART EN VIDÉO (#9124, miroir de
 * `ComposerSceneExportController.bakeForMessage` iOS) — la scène est repeinte
 * à chaque image de la vidéo qui joue (fond, Cadre, textes) dans un canvas
 * enregistré avec le son de la vidéo ; « Terminé » rend ce fichier.
 */
const video = (overrides: Partial<StudioVisualAsset> = {}): StudioVisualAsset => ({
  previewUrl: 'blob:clip',
  mediaType: 'video',
  upload: { phase: 'uploading', progress: 0 },
  caption: '',
  pose: IDENTITY_POSE,
  ...overrides,
});

const withText = (page: StudioPage): StudioPage => ({ ...page, texts: page.texts.map((layer) => ({ ...layer, text: 'Bonjour' })) });

function bench(frames = 3) {
  const journal: string[] = [];
  const audio = { kind: 'audio', id: 'a' } as unknown as MediaStreamTrack;
  const canvasTrack = { kind: 'video', id: 'v' } as unknown as MediaStreamTrack;
  const context = new Proxy(
    {},
    {
      get: (_t, key) => {
        if (key === 'measureText') return (text: string) => ({ width: text.length * 10 });
        if (key === 'drawImage') return () => journal.push('drawImage');
        if (key === 'fillText') return (text: string) => journal.push(`fillText:${text}`);
        return () => undefined;
      },
      set: () => true,
    },
  ) as never;
  const deps: StudioRetouchVideoDeps = {
    createSurface: () => ({ context, videoTracks: () => [canvasTrack] }),
    loadImage: async () => null,
    loadVideo: async (src) => ({
      frame: { src } as unknown as CanvasImageSource,
      aspectRatio: 9 / 16,
      audioTracks: [audio],
      play: async (onFrame, window) => {
        journal.push(window === null ? 'play' : `play:${window.start}-${window.end}`);
        Array.from({ length: frames }).forEach(() => onFrame());
      },
      release: () => journal.push('release'),
    }),
    record: (tracks) => {
      journal.push(`record:${tracks.map((track) => track.kind).join('+')}`);
      return { mimeType: 'video/mp4', stop: async () => new Blob(['mp4'], { type: 'video/mp4' }) };
    },
  };
  return { deps, journal };
}

describe('renderStudioRetouchVideo', () => {
  test('repeint la scène à chaque image, enregistre image ET son, et rend la vidéo', async () => {
    const { deps, journal } = bench(3);
    const result = await renderStudioRetouchVideo(withText({ ...emptyStudioPage('p', 't', 'fr'), background: video() }), deps);
    expect(result?.mimeType).toBe('video/mp4');
    expect(result?.blob.size).toBeGreaterThan(0);
    expect(journal[0]).toBe('record:video+audio');
    expect(journal.filter((entry) => entry === 'fillText:Bonjour').length).toBe(4);
    expect(journal.filter((entry) => entry === 'drawImage').length).toBeGreaterThanOrEqual(4);
    expect(journal.at(-1)).toBe('release');
  });

  test('une vidéo COUPÉE ne joue que sa fenêtre (#9136)', async () => {
    const { deps, journal } = bench(2);
    await renderStudioRetouchVideo({ ...emptyStudioPage('p', 't', 'fr'), background: video({ trim: { start: 2, end: 5 } }) }, deps);
    expect(journal).toContain('play:2-5');
  });

  test('une vidéo MUETTE part sans piste audio (#9136)', async () => {
    const { deps, journal } = bench(2);
    await renderStudioRetouchVideo({ ...emptyStudioPage('p', 't', 'fr'), background: video({ muted: true }) }, deps);
    expect(journal[0]).toBe('record:video');
  });

  test('sans vidéo dans la scène, ou sans enregistreur, rien n’est rendu', async () => {
    const { deps } = bench();
    expect(await renderStudioRetouchVideo(emptyStudioPage('p', 't', 'fr'), deps)).toBeNull();
    expect(await renderStudioRetouchVideo({ ...emptyStudioPage('p', 't', 'fr'), background: video() }, { ...deps, record: () => null })).toBeNull();
  });

  test('le nom suit le conteneur enregistré', () => {
    expect(retouchedVideoFileName('clip.mov', 'video/mp4')).toBe('clip-retouche.mp4');
    expect(retouchedVideoFileName('clip', 'video/webm;codecs=vp9,opus')).toBe('clip-retouche.webm');
  });
});
