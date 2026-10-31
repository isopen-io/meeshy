import { objectMediaSrc, type SceneCarrier } from '@/lib/canvas/carrier';
import type { CanvasDocument, CanvasObject } from '@/lib/canvas/document';
import { backgroundMediaTimeline, mediaTimeAt, objectMediaTimeline } from '@/lib/canvas/media-seek';
import { isBackground } from '@/lib/feed/scene-framing';
import { isVideoObject } from '@/lib/feed/scene-motion';
import { recordingMimeOf } from '@/lib/media/recording-codec';

import type { PreparedSceneExport } from './scene-export-assets';
import { playSoundSchedule, soundSchedule } from './scene-export-audio';
import { paintSceneFrame, type ExportPalette, type ScenePaintable } from './scene-export-paint';
import type { ExportSlide } from './scene-export-plan';

/**
 * **LE RENDU D'UN EXPORT** (#13873) — la composition filmée en temps réel :
 * chaque image peinte par `paintSceneFrame` sur un canvas 9:16, filmé
 * (`captureStream`) avec la piste son du graphe Web Audio (`soundSchedule`),
 * enregistré par `MediaRecorder` (MP4 quand le navigateur sait l'écrire, WebM
 * sinon). L'horloge est celle du contexte audio : l'image et le son ne
 * dérivent pas. Une scène purement statique et muette sort en PNG.
 *
 * Annulable à tout instant (`signal`) ; la progression va de 0 à 1 sur la
 * LONGUEUR rendue (`lengthMs` — toute la composition, ou la part choisie
 * dans « Imager »).
 */

export const EXPORT_WIDTH = 720;
export const EXPORT_HEIGHT = 1280;
const FRAME_RATE = 30;
const AUDIO_LEAD_S = 0.15;
const VIDEO_DRIFT_S = 0.3;

export type RenderEnvironment = {
  readonly doc: Document;
  readonly MediaRecorder: typeof MediaRecorder | undefined;
  /** Créé AU GESTE (la politique de lecture automatique) ; `null` : l'export sort muet. */
  readonly audioContext: AudioContext | null;
  readonly requestFrame: (callback: () => void) => void;
  readonly now: () => number;
  readonly palette: ExportPalette;
  readonly labels: { readonly placeHere: string };
};

export type RenderOutcome =
  | { readonly kind: 'video'; readonly blob: Blob; readonly mimeType: string }
  | { readonly kind: 'image'; readonly blob: Blob }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'unsupported' }
  | { readonly kind: 'failed' };

export type RenderParams = {
  readonly prepared: PreparedSceneExport;
  readonly document: CanvasDocument;
  readonly carrier: SceneCarrier;
  readonly preferredLanguages: readonly string[];
  readonly watermark: string | null;
  readonly lengthMs: number;
  readonly env: RenderEnvironment;
  readonly signal: AbortSignal;
  readonly onProgress: (fraction: number) => void;
};

type Stage = { readonly canvas: HTMLCanvasElement; readonly ctx: ScenePaintable };

function stageOf(doc: Document): Stage | null {
  const canvas = doc.createElement('canvas');
  canvas.width = EXPORT_WIDTH;
  canvas.height = EXPORT_HEIGHT;
  const ctx = canvas.getContext('2d');
  return ctx === null ? null : { canvas, ctx };
}

function slideAt(slides: readonly ExportSlide[], tMs: number): ExportSlide | undefined {
  return slides.find((slide) => tMs < slide.startMs + slide.durationMs) ?? slides[slides.length - 1];
}

function paintAt(params: RenderParams, stage: Stage, tMs: number): ExportSlide | undefined {
  const slide = slideAt(params.prepared.plan.slides, tMs);
  const scene = slide === undefined ? undefined : params.document.scenes[slide.sceneIndex];
  if (slide === undefined || scene === undefined) return slide;
  paintSceneFrame({
    ctx: stage.ctx,
    width: EXPORT_WIDTH,
    height: EXPORT_HEIGHT,
    scene,
    carrier: params.carrier,
    tSeconds: (tMs - slide.startMs) / 1000,
    assets: params.prepared.assets,
    preferredLanguages: params.preferredLanguages,
    palette: params.env.palette,
    labels: params.env.labels,
    watermark: params.watermark,
  });
  return slide;
}

const videoObjects = (params: RenderParams, slide: ExportSlide | undefined): readonly CanvasObject[] =>
  slide === undefined ? [] : (params.document.scenes[slide.sceneIndex]?.objects ?? []).filter(isVideoObject);

/** Chaque vidéo de la slide joue sa fenêtre, à sa coupe ; les autres attendent, en pause. */
function syncVideos(params: RenderParams, slide: ExportSlide | undefined, tMs: number): void {
  const active = new Set<HTMLVideoElement>();
  for (const object of videoObjects(params, slide)) {
    const src = objectMediaSrc(object, params.carrier);
    const video = src === undefined ? undefined : params.prepared.videos.get(src);
    if (video === undefined || slide === undefined) continue;
    active.add(video);
    const timeline = isBackground(object) ? backgroundMediaTimeline(object) : objectMediaTimeline(object);
    const target = mediaTimeAt({ t: (tMs - slide.startMs) / 1000, timeline, mediaDuration: video.duration });
    if (target === null) continue;
    if (Math.abs(video.currentTime - target.time) > VIDEO_DRIFT_S) video.currentTime = target.time;
    if (target.plays && video.paused) void video.play().catch(() => undefined);
    if (!target.plays && !video.paused) video.pause();
  }
  for (const video of params.prepared.videos.values()) if (!active.has(video) && !video.paused) video.pause();
}

function canvasBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), type));
}

async function runningAudio(context: AudioContext | null): Promise<AudioContext | null> {
  if (context === null) return null;
  if (context.state !== 'running') await Promise.race([context.resume().catch(() => undefined), new Promise((resolve) => setTimeout(resolve, 500))]);
  return context.state === 'running' ? context : null;
}

export async function renderSceneExport(params: RenderParams): Promise<RenderOutcome> {
  const { env, signal, prepared } = params;
  const stage = stageOf(env.doc);
  if (stage === null) return { kind: 'unsupported' };
  if (signal.aborted) return { kind: 'cancelled' };
  if (prepared.plan.still) {
    paintAt(params, stage, 0);
    const blob = await canvasBlob(stage.canvas, 'image/png');
    params.onProgress(1);
    return blob === null ? { kind: 'failed' } : { kind: 'image', blob };
  }
  const Recorder = env.MediaRecorder;
  const mimeType = Recorder === undefined ? undefined : recordingMimeOf('video', (candidate) => Recorder.isTypeSupported(candidate));
  if (Recorder === undefined || mimeType === undefined || typeof stage.canvas.captureStream !== 'function') return { kind: 'unsupported' };

  const lengthMs = Math.max(1, params.lengthMs);
  const plays = soundSchedule({
    sounds: prepared.plan.sounds,
    clipDurationsS: new Map([...prepared.buffers].map(([src, buffer]) => [src, buffer.duration] as const)),
    lengthMs,
  });
  const audio = plays.length === 0 ? null : await runningAudio(env.audioContext);
  const stream = stage.canvas.captureStream(FRAME_RATE);
  const destination = audio?.createMediaStreamDestination() ?? null;
  for (const track of destination?.stream.getAudioTracks() ?? []) stream.addTrack(track);

  const chunks: Blob[] = [];
  const recorder = new Recorder(stream, { mimeType, videoBitsPerSecond: 6_000_000 });
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  const stopped = new Promise<boolean>((resolve) => {
    recorder.onstop = () => resolve(true);
    recorder.onerror = () => resolve(false);
  });

  paintAt(params, stage, 0);
  const startAt = audio === null ? 0 : audio.currentTime + AUDIO_LEAD_S;
  const stopSounds = audio === null || destination === null ? () => undefined : playSoundSchedule({ context: audio, destination, plays, buffers: prepared.buffers, startAt });
  const startedAt = env.now() + AUDIO_LEAD_S * 1000;
  const clock = audio === null ? () => env.now() - startedAt : () => (audio.currentTime - startAt) * 1000;
  recorder.start(1000);

  await new Promise<void>((resolve) => {
    const tick = () => {
      if (signal.aborted) {
        resolve();
        return;
      }
      const tMs = Math.min(lengthMs, Math.max(0, clock()));
      const slide = paintAt(params, stage, tMs);
      syncVideos(params, slide, tMs);
      params.onProgress(tMs / lengthMs);
      if (tMs >= lengthMs) {
        resolve();
        return;
      }
      env.requestFrame(tick);
    };
    env.requestFrame(tick);
  });

  stopSounds();
  for (const video of prepared.videos.values()) video.pause();
  if (recorder.state !== 'inactive') recorder.stop();
  const ok = await stopped;
  for (const track of stream.getTracks()) track.stop();
  if (signal.aborted) return { kind: 'cancelled' };
  const type = mimeType.split(';')[0] ?? mimeType;
  return ok && chunks.length > 0 ? { kind: 'video', blob: new Blob(chunks, { type }), mimeType: type } : { kind: 'failed' };
}
