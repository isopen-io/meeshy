import { browserPhotoEnv, developPhoto, PHOTO_MIME, type PhotoEnv } from '@/lib/media/photo-develop';

import { captureStamp, type CaptureFile } from './call-capture-save';

/**
 * **FILMER, OU PRENDRE, CE QUE L'APPEL MONTRE** (#8625) — le geste sur le
 * style choisi (`call-capture-gesture.ts`) déclenche l'un des deux :
 *
 * - `startClip` : un appui long filme une piste VIDÉO déjà rendue en direct
 *   (le canevas du montage, ou ma vidéo et son effet), avec le SON de
 *   l'appel — ma voix et celles des autres, mixées en une piste par Web
 *   Audio. MP4 là où le navigateur sait l'écrire (Safari : la photothèque
 *   d'un iPhone le lit), sinon WebM. `stop` rend UN fichier ;
 * - `captureStill` : deux tapes prennent l'image affichée d'une vidéo, à
 *   l'endroit (#8696), par le développement unique des photos (#8695).
 *
 * Tout ce qui touche au navigateur passe par `ClipEnv`, que les témoins
 * remplacent.
 */

export type ClipFormat = { readonly mimeType: string; readonly extension: 'mp4' | 'webm' };

const FORMATS: readonly ClipFormat[] = [
  { mimeType: 'video/mp4;codecs=avc1,mp4a.40.2', extension: 'mp4' },
  { mimeType: 'video/mp4', extension: 'mp4' },
  { mimeType: 'video/webm;codecs=vp9,opus', extension: 'webm' },
  { mimeType: 'video/webm;codecs=vp8,opus', extension: 'webm' },
  { mimeType: 'video/webm', extension: 'webm' },
];

export const pickClipFormat = (supported: (mimeType: string) => boolean): ClipFormat | null => FORMATS.find((format) => supported(format.mimeType)) ?? null;

export const clipFileName = ({ at, style, extension }: { readonly at: Date; readonly style: string; readonly extension: string }): string => `meeshy-appel-${style}-${captureStamp(at)}.${extension}`;

export type ClipEnv = {
  readonly isTypeSupported: (mimeType: string) => boolean;
  /** Enregistre `stream` ; chaque morceau part dans `push`, la fin dans `end`. `null` : le navigateur refuse. */
  readonly record: (stream: MediaStream, mimeType: string, push: (blob: Blob) => void, end: () => void) => { readonly stop: () => void } | null;
  /** Une seule piste audio, mêlant les voix de `streams` ; `track` nul sans aucune voix. */
  readonly mixAudio: (streams: readonly MediaStream[]) => { readonly track: MediaStreamTrack | null; readonly close: () => void };
  readonly createStream: (tracks: readonly MediaStreamTrack[]) => MediaStream;
  readonly now: () => Date;
};

export type Clip = { readonly stop: () => Promise<CaptureFile | null> };

type ClipInput = { readonly video: MediaStreamTrack; readonly audio: readonly MediaStream[]; readonly style: string; readonly env: ClipEnv };

export function startClip({ video, audio, style, env }: ClipInput): Clip | null {
  const format = pickClipFormat(env.isTypeSupported);
  if (format === null) return null;
  const mix = env.mixAudio(audio.filter((stream) => stream.getAudioTracks().length > 0));
  const stream = env.createStream(mix.track === null ? [video] : [video, mix.track]);
  const parts: Blob[] = [];
  const at = env.now();
  const finished: { resolve: () => void } = { resolve: () => undefined };
  const ended = new Promise<void>((resolve) => void (finished.resolve = resolve));
  const recorder = env.record(stream, format.mimeType, (blob) => void parts.push(blob), () => finished.resolve());
  if (recorder === null) {
    mix.close();
    return null;
  }
  const result = { pending: null as Promise<CaptureFile | null> | null };
  const stop = (): Promise<CaptureFile | null> => {
    result.pending ??= (async () => {
      recorder.stop();
      await ended;
      mix.close();
      const blob = new Blob(parts, { type: format.mimeType });
      return blob.size === 0 ? null : { blob, fileName: clipFileName({ at, style, extension: format.extension }), mimeType: format.mimeType };
    })();
    return result.pending;
  };
  return { stop };
}

type AudioContextCtor = new () => AudioContext;

const audioContextCtor = (): AudioContextCtor | null => {
  if (typeof window === 'undefined') return null;
  const scope = window as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
  return scope.AudioContext ?? scope.webkitAudioContext ?? null;
};

function browserMix(streams: readonly MediaStream[]): { readonly track: MediaStreamTrack | null; readonly close: () => void } {
  const Ctor = audioContextCtor();
  if (Ctor === null || streams.length === 0) return { track: null, close: () => undefined };
  const context = new Ctor();
  const destination = context.createMediaStreamDestination();
  streams.forEach((stream) => context.createMediaStreamSource(stream).connect(destination));
  return { track: destination.stream.getAudioTracks()[0] ?? null, close: () => void context.close().catch(() => undefined) };
}

function browserRecord(stream: MediaStream, mimeType: string, push: (blob: Blob) => void, end: () => void): { readonly stop: () => void } | null {
  try {
    const recorder = new MediaRecorder(stream, { mimeType });
    recorder.addEventListener('dataavailable', (event) => {
      if (event.data.size > 0) push(event.data);
    });
    recorder.addEventListener('stop', end);
    recorder.start(1000);
    return { stop: () => (recorder.state === 'inactive' ? end() : recorder.stop()) };
  } catch {
    return null;
  }
}

export const browserClipEnv = (): ClipEnv => ({
  isTypeSupported: (mimeType) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mimeType),
  record: browserRecord,
  mixAudio: browserMix,
  createStream: (tracks) => new MediaStream([...tracks]),
  now: () => new Date(),
});

const paintVideo = (context: CanvasRenderingContext2D, video: HTMLVideoElement): void => {
  const { width, height } = context.canvas;
  context.drawImage(video, 0, 0, width, height);
};

const canvasFor = (video: HTMLVideoElement): { readonly canvas: HTMLCanvasElement; readonly context: CanvasRenderingContext2D } | null => {
  if (typeof document === 'undefined' || video.videoWidth === 0) return null;
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const context = canvas.getContext('2d');
  return context === null ? null : { canvas, context };
};

type StillInput = { readonly video: HTMLVideoElement; readonly style: string; readonly now: Date; readonly photo?: PhotoEnv };

/** L'image qu'une vidéo affiche, à l'endroit, développée (`developPhoto`). */
export async function captureStill({ video, style, now, photo = browserPhotoEnv }: StillInput): Promise<CaptureFile | null> {
  if (video.videoWidth === 0 || video.videoHeight === 0) return null;
  const blob = await developPhoto({ image: video, size: { width: video.videoWidth, height: video.videoHeight } }, photo);
  return blob === null ? null : { blob, fileName: `meeshy-appel-${style}-${captureStamp(now)}.jpg`, mimeType: blob.type || PHOTO_MIME };
}

/** Une vidéo repeinte à l'endroit, en piste filmable — `release` arrête tout. */
export function filmedTrack(video: HTMLVideoElement, fps: number): { readonly track: MediaStreamTrack; readonly release: () => void } | null {
  const surface = canvasFor(video);
  const track = surface?.canvas.captureStream?.(fps).getVideoTracks()[0];
  if (surface === null || track === undefined) return null;
  const timer = setInterval(() => paintVideo(surface.context, video), 1000 / fps);
  return {
    track,
    release: () => {
      clearInterval(timer);
      track.stop();
    },
  };
}
