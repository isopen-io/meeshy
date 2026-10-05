import { encodeGif, quantize, type GifFrame } from './gif-encoder';
import { layoutMessageCard, type CardLayout, type MessageCardInput } from './message-card-layout';
import { videoAt } from './message-card-media-load';
import { GIF_FPS, pickRecorderType } from './message-card-output';
import { loadCardFonts, paintMessageCard, strokeFloorAt, type CardSource } from './message-card-paint';
import { templateOf, type MessageCardTemplate } from './message-card-templates';

/**
 * **« IMAGER » EN GIF OU EN VIDÉO** (#8693) — premier jet, entièrement dans le
 * navigateur : la MÊME peinture que l'image (`message-card-paint.ts`), image
 * après image, pendant que le média joue.
 *
 *  - VIDÉO : le canvas est filmé (`captureStream`) et enregistré
 *    (`MediaRecorder`, MP4 quand le navigateur sait l'écrire, WebM sinon). Le
 *    média temporel joue en silence pour l'utilisateur ; sa piste son est
 *    MIXÉE dans l'enregistrement par un graphe Web Audio. Une vidéo jointe
 *    anime sa case ; un audio fait avancer son onde.
 *  - GIF : une vidéo, échantillonnée à dix images par seconde et réduite à
 *    480 px de large, encodée par `gif-encoder.ts`. Jamais pour un audio.
 *
 * Tout ce qui manque (enregistreur absent, média illisible, contexte refusé)
 * rend `null` : la feuille l'annonce et l'image fixe reste possible.
 */

export type MotionTrack = {
  /** L'URL (blob) du média temporel — la vidéo jointe ou l'audio. */
  readonly url: string;
  readonly kind: 'video' | 'audio';
  /** Le rang de la vidéo dans `input.media` — elle y remplace son image d'attente. */
  readonly index: number | null;
};

type MotionEnvironment = {
  readonly doc: Document;
  readonly requestFrame: (callback: () => void) => void;
  readonly MediaRecorder: typeof MediaRecorder | undefined;
  readonly AudioContext: typeof AudioContext | undefined;
};

export const browserMotionEnvironment = (): MotionEnvironment => ({
  doc: document,
  requestFrame: (callback) => {
    requestAnimationFrame(() => callback());
  },
  MediaRecorder: typeof MediaRecorder === 'undefined' ? undefined : MediaRecorder,
  AudioContext: typeof AudioContext === 'undefined' ? undefined : AudioContext,
});

type Stage = { readonly canvas: HTMLCanvasElement; readonly ctx: CanvasRenderingContext2D; readonly layout: CardLayout; readonly template: MessageCardTemplate; readonly scale: number };

async function stageOf(input: MessageCardInput, doc: Document, width: number | null): Promise<Stage | null> {
  const template = templateOf(input.template);
  await loadCardFonts(template, doc.fonts);
  const canvas = doc.createElement('canvas');
  /* Le GIF relit chaque image (`getImageData`) : le contexte le sait d'avance, et garde ses pixels côté processeur. */
  const ctx = canvas.getContext('2d', { willReadFrequently: width !== null });
  if (ctx === null) return null;
  const layout = layoutMessageCard(input, (text, font) => {
    ctx.font = font;
    return ctx.measureText(text).width;
  });
  const scale = width === null ? 1 : width / layout.width;
  canvas.width = Math.max(2, Math.round((layout.width * scale) / 2) * 2);
  canvas.height = Math.max(2, Math.round((layout.height * scale) / 2) * 2);
  return { canvas, ctx, layout, template, scale };
}

function paintFrame(stage: Stage, sources: readonly (CardSource | null)[], progress: number): void {
  stage.ctx.setTransform(stage.scale, 0, 0, stage.scale, 0, 0);
  paintMessageCard(stage.ctx, stage.layout, stage.template, { sources, progress, strokeFloor: strokeFloorAt(stage.scale) });
}

const withSource = (sources: readonly (CardSource | null)[], index: number | null, source: CardSource): readonly (CardSource | null)[] =>
  index === null ? sources : sources.map((current, i) => (i === index ? source : current));


function audioOf(url: string, doc: Document): HTMLAudioElement {
  const audio = doc.createElement('audio');
  audio.preload = 'auto';
  audio.src = url;
  return audio;
}

/** La vidéo de la carte, son compris — `null` si le navigateur ne sait pas enregistrer. */
export async function recordCardVideo(params: {
  readonly input: MessageCardInput;
  readonly sources: readonly (CardSource | null)[];
  readonly track: MotionTrack;
  readonly durationMs: number;
  readonly env?: MotionEnvironment;
}): Promise<Blob | null> {
  const env = params.env ?? browserMotionEnvironment();
  const Recorder = env.MediaRecorder;
  if (Recorder === undefined) return null;
  const type = pickRecorderType((candidate) => Recorder.isTypeSupported(candidate));
  if (type === null) return null;
  const stage = await stageOf(params.input, env.doc, null);
  if (stage === null || typeof stage.canvas.captureStream !== 'function') return null;
  const video = params.track.kind === 'video' ? await videoAt(params.track.url, env.doc, 0) : null;
  const element: HTMLMediaElement | null = params.track.kind === 'video' ? video : audioOf(params.track.url, env.doc);
  if (element === null) return null;

  const stream = stage.canvas.captureStream(30);
  const audio = env.AudioContext === undefined ? null : new env.AudioContext();
  if (audio !== null) {
    const destination = audio.createMediaStreamDestination();
    audio.createMediaElementSource(element).connect(destination);
    for (const track of destination.stream.getAudioTracks()) stream.addTrack(track);
  }
  element.muted = audio === null;
  const chunks: Blob[] = [];
  const recorder = new Recorder(stream, { mimeType: type });
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });

  const sources = video === null ? params.sources : withSource(params.sources, params.track.index, video);
  paintFrame(stage, sources, 0);
  element.currentTime = 0;
  try {
    await element.play();
  } catch {
    await audio?.close().catch(() => undefined);
    return null;
  }
  recorder.start(250);
  const started = performance.now();
  await new Promise<void>((resolve) => {
    const tick = () => {
      const elapsed = performance.now() - started;
      const progress = Math.min(1, elapsed / params.durationMs);
      paintFrame(stage, sources, progress);
      if (progress >= 1 || element.ended) {
        resolve();
        return;
      }
      env.requestFrame(tick);
    };
    env.requestFrame(tick);
  });
  element.pause();
  recorder.stop();
  await stopped;
  for (const track of stream.getTracks()) track.stop();
  await audio?.close().catch(() => undefined);
  return chunks.length === 0 ? null : new Blob(chunks, { type: type.split(';')[0] ?? type });
}

const GIF_WIDTH = 480;

/** Le GIF de la carte d'une vidéo — dix images par seconde, en boucle. */
export async function recordCardGif(params: {
  readonly input: MessageCardInput;
  readonly sources: readonly (CardSource | null)[];
  readonly track: MotionTrack;
  readonly durationMs: number;
  readonly env?: Pick<MotionEnvironment, 'doc'>;
  /** Rend la main au fil entre deux images — l'interface reste vivante pendant l'encodage. */
  readonly yieldFrame?: () => Promise<void>;
}): Promise<Blob | null> {
  const doc = params.env?.doc ?? document;
  if (params.track.kind !== 'video') return null;
  const stage = await stageOf(params.input, doc, GIF_WIDTH);
  if (stage === null) return null;
  const video = await videoAt(params.track.url, doc, 0);
  if (video === null) return null;
  const sources = withSource(params.sources, params.track.index, video);
  const count = Math.max(1, Math.floor((params.durationMs / 1000) * GIF_FPS));
  const delayMs = 1000 / GIF_FPS;
  const frames: GifFrame[] = [];
  const yieldFrame = params.yieldFrame ?? (() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
  for (let i = 0; i < count; i += 1) {
    const seeked = new Promise<void>((resolve) => {
      const done = () => resolve();
      video.addEventListener('seeked', done, { once: true });
      setTimeout(done, 1500);
    });
    video.currentTime = i / GIF_FPS;
    await seeked;
    paintFrame(stage, sources, (i + 1) / count);
    const { data } = stage.ctx.getImageData(0, 0, stage.canvas.width, stage.canvas.height);
    frames.push({ indices: quantize(data, stage.canvas.width, stage.canvas.height), delayMs });
    await yieldFrame();
  }
  const gif = encodeGif(stage.canvas.width, stage.canvas.height, frames);
  return new Blob([gif], { type: 'image/gif' });
}
