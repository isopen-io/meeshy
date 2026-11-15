import { describe, expect, test } from 'bun:test';

import type { GallerySaver } from '@/lib/gallery/gallery-saver';
import type { FileDeliveryPortal } from '@/lib/media/deliver-file';

import type { PhotoEnv } from '@/lib/media/photo-develop';

import { captureStill, clipFileName, pickClipFormat, startClip, type ClipEnv } from './call-capture-live';
import { saveCaptures } from './call-capture-save';

/**
 * FILMER CE QUE L'APPEL MONTRE (#8625) — un appui long sur le style choisi
 * filme le montage rendu en direct, avec le son de l'appel (ma voix et celles
 * des autres, mixées) ; stop rend UN fichier, qui part où partent les photos.
 */

const track = (kind: 'audio' | 'video', id: string = kind) => ({ kind, id }) as unknown as MediaStreamTrack;

const streamOf = (tracks: readonly MediaStreamTrack[]) => ({ getTracks: () => tracks, getAudioTracks: () => tracks.filter((t) => t.kind === 'audio') }) as unknown as MediaStream;

type Recording = { readonly stream: MediaStream; readonly mimeType: string; readonly push: (blob: Blob) => void; readonly end: () => void; stopped: number };

const envWith = (options: { readonly supported?: readonly string[]; readonly recorder?: boolean } = {}) => {
  const recordings: Recording[] = [];
  const mixed: Array<readonly MediaStream[]> = [];
  const closed: number[] = [];
  const env: ClipEnv = {
    isTypeSupported: (mime) => (options.supported ?? ['video/webm;codecs=vp9,opus', 'video/webm']).includes(mime),
    record: (stream, mimeType, push, end) => {
      if (options.recorder === false) return null;
      const recording: Recording = { stream, mimeType, push, end, stopped: 0 };
      recordings.push(recording);
      return { stop: () => void (recording.stopped += 1) };
    },
    mixAudio: (streams) => {
      mixed.push(streams);
      return { track: streams.length === 0 ? null : track('audio', 'mix'), close: () => void closed.push(1) };
    },
    createStream: (tracks) => streamOf(tracks),
    now: () => new Date(2026, 8, 29, 18, 4, 9),
  };
  return { env, recordings, mixed, closed };
};

describe('pickClipFormat', () => {
  test('MP4 d’abord (la photothèque d’un iPhone le lit), sinon WebM ; rien de su : pas de vidéo', () => {
    expect(pickClipFormat((mime) => mime.startsWith('video/mp4'))).toEqual({ mimeType: 'video/mp4;codecs=avc1,mp4a.40.2', extension: 'mp4' });
    expect(pickClipFormat((mime) => mime === 'video/webm')).toEqual({ mimeType: 'video/webm', extension: 'webm' });
    expect(pickClipFormat(() => false)).toBeNull();
  });
});

test('le nom du fichier dit l’appel, le style et l’heure', () => {
  expect(clipFileName({ at: new Date(2026, 8, 29, 18, 4, 9), style: 'cover', extension: 'mp4' })).toBe('meeshy-appel-cover-20260929-180409.mp4');
});

describe('startClip', () => {
  const audio = [streamOf([track('audio', 'mic'), track('video', 'cam')]), streamOf([track('video', 'peer-cam')]), streamOf([track('audio', 'peer')])];

  test('filme l’image rendue ET le son de l’appel : seules les voix sont mixées, en une piste', () => {
    const { env, recordings, mixed } = envWith();
    const clip = startClip({ video: track('video', 'montage'), audio, style: 'grid', env });
    expect(clip).not.toBeNull();
    expect(mixed[0]).toHaveLength(2);
    expect(recordings[0]?.stream.getTracks().map((t) => t.id)).toEqual(['montage', 'mix']);
    expect(recordings[0]?.mimeType).toBe('video/webm;codecs=vp9,opus');
  });

  test('stop rend UN fichier, du bon type, et libère le mixage', async () => {
    const { env, recordings, closed } = envWith();
    const clip = startClip({ video: track('video'), audio, style: 'grid', env });
    const recording = recordings[0] as Recording;
    recording.push(new Blob(['a']));
    recording.push(new Blob(['b']));
    const done = clip?.stop();
    expect(recording.stopped).toBe(1);
    recording.end();
    const file = await done;
    expect(file?.fileName).toBe('meeshy-appel-grid-20260929-180409.webm');
    expect(file?.mimeType).toBe('video/webm;codecs=vp9,opus');
    expect(file?.blob.size).toBe(2);
    expect(closed).toHaveLength(1);
  });

  test('un second stop rend le même fichier, sans rien arrêter deux fois', async () => {
    const { env, recordings } = envWith();
    const clip = startClip({ video: track('video'), audio: [], style: 'grid', env });
    const recording = recordings[0] as Recording;
    recording.push(new Blob(['a']));
    const first = clip?.stop();
    const second = clip?.stop();
    recording.end();
    expect(await first).toBe(await second);
    expect(recording.stopped).toBe(1);
  });

  test('sans le moindre son (personne n’a de micro), la vidéo part muette', () => {
    const { env, recordings } = envWith();
    startClip({ video: track('video', 'v'), audio: [], style: 'grid', env });
    expect(recordings[0]?.stream.getTracks().map((t) => t.id)).toEqual(['v']);
  });

  test('rien d’enregistré : aucun fichier', async () => {
    const { env, recordings } = envWith();
    const clip = startClip({ video: track('video'), audio, style: 'grid', env });
    const done = clip?.stop();
    recordings[0]?.end();
    expect(await done).toBeNull();
  });

  test('un navigateur qui ne sait pas filmer : pas de vidéo, et rien ne reste ouvert', () => {
    expect(startClip({ video: track('video'), audio, style: 'grid', env: envWith({ supported: [] }).env })).toBeNull();
    const refused = envWith({ recorder: false });
    expect(startClip({ video: track('video'), audio, style: 'grid', env: refused.env })).toBeNull();
    expect(refused.closed).toHaveLength(1);
  });
});

describe('enregistrer une vidéo', () => {
  test('elle part dans la photothèque, ou par la porte de fichiers, avec SON type', async () => {
    const types: string[] = [];
    const saver: GallerySaver = { available: true, save: async (input) => (types.push(input.mimeType), 'saved') };
    const video = { blob: new Blob(['v']), fileName: 'meeshy-appel-grid.mp4', mimeType: 'video/mp4' };
    expect(await saveCaptures([video], { saver, portal: async () => null })).toEqual({ saved: 1, failed: 0, cancelled: 0 });
    const portal: FileDeliveryPortal = { deliver: async (_blob, _name, mime) => (types.push(mime), 'delivered') };
    expect(await saveCaptures([video], { saver: null, portal: async () => portal })).toEqual({ saved: 1, failed: 0, cancelled: 0 });
    expect(types).toEqual(['video/mp4', 'video/mp4']);
  });
});

describe('captureStill', () => {
  const videoOf = (width: number, mirrored: boolean) => ({ videoWidth: width, videoHeight: 720, hasAttribute: (name: string) => mirrored && name === 'data-call-mirrored' }) as unknown as HTMLVideoElement;

  const photoEnv = (painted: unknown[]): PhotoEnv => ({
    surface: () => ({
      paint: (_image, crop, size) => void painted.push({ crop, size }),
      pixels: () => null,
      put: () => undefined,
      encode: async (mime) => new Blob(['jpeg'], { type: mime }),
    }),
  });

  test('l’image de ma vidéo passe par le développement unique : JPEG, à l’endroit, nommée par son style (#8695, #8696)', async () => {
    const painted: unknown[] = [];
    const file = await captureStill({ video: videoOf(1280, true), style: 'angel', now: new Date(2026, 8, 29, 18, 4, 9), photo: photoEnv(painted) });
    expect(file?.fileName).toBe('meeshy-appel-angel-20260929-180409.jpg');
    expect(file?.mimeType).toBe('image/jpeg');
    expect(painted).toEqual([{ crop: { x: 0, y: 0, width: 1280, height: 720 }, size: { width: 1280, height: 720 } }]);
  });

  test('une vidéo sans image : rien', async () => {
    expect(await captureStill({ video: videoOf(0, false), style: 'angel', now: new Date(), photo: photoEnv([]) })).toBeNull();
  });
});
