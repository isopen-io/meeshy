import { electBackgroundTrack, sceneHasAudibleBackgroundVideo } from '@/lib/canvas/background-sound';
import { objectMediaSrc, type SceneCarrier } from '@/lib/canvas/carrier';
import { backgroundAudioOf, isBackgroundAudio, type CanvasDocument, type CanvasObject, type CanvasScene } from '@/lib/canvas/document';
import { backgroundMediaTimeline, objectMediaTimeline, trackMediaTimeline, type MediaTimeline } from '@/lib/canvas/media-seek';
import { fadeFactor, keyframeOverrides } from '@/lib/canvas/pose';
import { hasTimedObjects, sceneDurationSeconds } from '@/lib/canvas/timeline';
import { backgroundMedia, isBackground } from '@/lib/feed/scene-framing';
import { isVideoObject } from '@/lib/feed/scene-motion';
import { slideDurationForScene } from '@/lib/stories/playback';

/**
 * **LE PLAN D'UN EXPORT DE SCÈNE** (#13873) — ce que « Enregistrer », « Partager »
 * et « Imager » rendent d'une story, d'un post à scène ou d'un réel : chaque
 * slide à sa durée, l'une après l'autre, et chaque son à sa place sur la
 * timeline commune (son de fond, vidéo de fond, sons et vidéos posés), avec
 * son gain et sa coupe. Les muets de l'auteur sont respectés.
 *
 * La durée d'une slide suit la loi du lecteur (`slideDurationForScene` : la
 * timeline épinglée fait autorité ; sinon la vidéo de fond, bouclée à des
 * cycles entiers, plancher 6 s) et, comme iOS (`contentDerivedDuration`), la
 * donnée la plus longue qui y joue : un vocal ou une musique de 4 min font
 * une slide de 4 min. Loi pure : les durées des médias sont REÇUES.
 */

export type ExportSlide = { readonly sceneIndex: number; readonly startMs: number; readonly durationMs: number };

export type ExportSoundRole = 'background-track' | 'background-video' | 'foreground-audio' | 'foreground-video';

export type ExportSound = {
  readonly src: string;
  readonly role: ExportSoundRole;
  readonly objectId: string | null;
  readonly startMs: number;
  readonly endMs: number;
  readonly trimStartMs: number;
  readonly trimEndMs: number | null;
  readonly loop: boolean;
  readonly gain: number;
  /** La courbe de volume (#13880), en millisecondes de la timeline ; absente : le gain fixe. */
  readonly envelope?: readonly VolumePoint[];
};

export type VolumePoint = { readonly atMs: number; readonly gain: number };

export type SceneExportPlan = {
  readonly slides: readonly ExportSlide[];
  readonly totalMs: number;
  readonly sounds: readonly ExportSound[];
  readonly still: boolean;
};

export type MediaDurations = ReadonlyMap<string, number>;

type Level = (tSeconds: number) => number;

type SceneSound = Omit<ExportSound, 'startMs' | 'endMs'> & { readonly timeline: MediaTimeline; readonly level: Level | null };

const clampGain = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1);

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * LE VOLUME D'UN SON POSÉ À L'INSTANT (#13880) — ses keyframes de volume
 * l'emportent sur son gain de base (l'automation iOS remplace le volume), et
 * ses fondus d'entrée et de sortie le portent à zéro aux bords de sa fenêtre
 * (`fadeFactor`, la même loi que l'opacité de sa pastille). `null` : rien ne
 * varie, le gain reste fixe.
 */
function levelOf(object: CanvasObject | undefined, base: number): Level | null {
  if (object === undefined) return null;
  const keyframes = object.timing?.keyframes ?? [];
  const automated = keyframes.some((keyframe) => typeof keyframe.volume === 'number');
  const faded = [object.payload.fadeIn, object.payload.fadeOut].some((fade) => typeof fade === 'number' && fade > 0);
  if (!automated && !faded) return null;
  const start = object.timing?.start ?? 0;
  return (t) => clamp01((keyframeOverrides(keyframes, t, start).volume ?? base) * (fadeFactor(object, t) ?? 1));
}

const ENVELOPE_STEP_MS = 50;
const ENVELOPE_MAX_POINTS = 600;

function envelopeOf(level: Level, slide: ExportSlide, fromMs: number, toMs: number): readonly VolumePoint[] {
  const span = Math.max(0, toMs - fromMs);
  const step = Math.max(ENVELOPE_STEP_MS, span / ENVELOPE_MAX_POINTS);
  const count = Math.max(1, Math.ceil(span / step));
  /* Le dernier point juste avant la fin : à la fin même, la fenêtre est close et le fondu ne se lit plus. */
  return Array.from({ length: count + 1 }, (_, index) => {
    const atMs = Math.min(fromMs + index * step, toMs);
    const sampledMs = Math.max(fromMs, Math.min(atMs, toMs - 1));
    return { atMs: slide.startMs + atMs, gain: level(sampledMs / 1000) };
  });
}

const secondsToMs = (seconds: number | undefined): number | null => (seconds === undefined ? null : Math.round(seconds * 1000));

function soundOf(params: {
  readonly src: string | undefined;
  readonly role: ExportSoundRole;
  readonly objectId: string | null;
  readonly timeline: MediaTimeline;
  readonly gain: number;
  readonly object?: CanvasObject;
}): SceneSound | null {
  if (params.src === undefined || params.src === '') return null;
  return {
    src: params.src,
    role: params.role,
    objectId: params.objectId,
    trimStartMs: secondsToMs(params.timeline.trimStart) ?? 0,
    trimEndMs: secondsToMs(params.timeline.trimEnd),
    loop: params.timeline.loop,
    gain: params.gain,
    timeline: params.timeline,
    level: levelOf(params.object, params.gain),
  };
}

const sounds = (object: CanvasObject): boolean => object.payload.muted !== true;

function foregroundSounds(scene: CanvasScene, carrier: SceneCarrier, background: CanvasObject | undefined): readonly SceneSound[] {
  return scene.objects.flatMap((object): readonly SceneSound[] => {
    if (object.id === background?.id || !sounds(object)) return [];
    const audio = object.kind === 'audio' && !isBackgroundAudio(object);
    const video = isVideoObject(object) && !isBackground(object);
    if (!audio && !video) return [];
    const sound = soundOf({
      src: objectMediaSrc(object, carrier),
      role: audio ? 'foreground-audio' : 'foreground-video',
      objectId: object.id,
      timeline: objectMediaTimeline(object),
      gain: clampGain(object.payload.volume),
      object,
    });
    return sound === null ? [] : [sound];
  });
}

function sceneSounds(document: CanvasDocument, sceneIndex: number, carrier: SceneCarrier): readonly SceneSound[] {
  const scene = document.scenes[sceneIndex];
  if (scene === undefined) return [];
  const background = backgroundMedia(scene);
  const track = electBackgroundTrack({ document, sceneIndex, carrier });
  const trackSound =
    track === null
      ? null
      : soundOf({
          src: track.src,
          role: 'background-track',
          objectId: backgroundAudioOf(scene.objects)?.id ?? null,
          timeline: trackMediaTimeline(track),
          gain: track.volume,
        });
  const videoSound =
    background !== undefined && sceneHasAudibleBackgroundVideo({ document, sceneIndex })
      ? soundOf({
          src: objectMediaSrc(background, carrier),
          role: 'background-video',
          objectId: background.id,
          timeline: backgroundMediaTimeline(background),
          gain: clampGain(background.payload.volume),
          object: background,
        })
      : null;
  return [trackSound, videoSound, ...foregroundSounds(scene, carrier, background)].filter((sound): sound is SceneSound => sound !== null);
}

/** Le temps de scène où un son se tait de lui-même — `Infinity` s'il tient jusqu'à la fin de la slide. */
function naturalEndMs(sound: SceneSound, durations: MediaDurations): number {
  const windowEnd = sound.timeline.windowEnd * 1000;
  if (sound.loop) return windowEnd;
  const duration = durations.get(sound.src);
  if (duration === undefined || !Number.isFinite(duration) || duration <= 0) return windowEnd;
  const played = Math.max(0, Math.min(sound.trimEndMs ?? duration, duration) - sound.trimStartMs);
  return Math.min(windowEnd, sound.timeline.windowStart * 1000 + played);
}

function backgroundVideoDurationMs(scene: CanvasScene, carrier: SceneCarrier, durations: MediaDurations): number | null {
  const background = backgroundMedia(scene);
  if (background === undefined || !isVideoObject(background)) return null;
  const src = objectMediaSrc(background, carrier);
  return src === undefined ? null : durations.get(src) ?? null;
}

function slideDurationOf(params: {
  readonly scene: CanvasScene;
  readonly sounds: readonly SceneSound[];
  readonly carrier: SceneCarrier;
  readonly durations: MediaDurations;
}): number {
  const { scene, durations } = params;
  const reader = slideDurationForScene({ scene, mediaDurationMs: backgroundVideoDurationMs(scene, params.carrier, durations) });
  const pinned = typeof scene.timelineDuration === 'number' && Number.isFinite(scene.timelineDuration) && scene.timelineDuration > 0;
  if (pinned) return reader;
  const timedEnd = (sceneDurationSeconds(scene) ?? 0) * 1000;
  const soundEnds = params.sounds.map((sound) => naturalEndMs(sound, durations)).filter((end) => Number.isFinite(end));
  return Math.max(reader, timedEnd, ...soundEnds);
}

function placed(sound: SceneSound, slide: ExportSlide): ExportSound | null {
  const windowStartMs = sound.timeline.windowStart * 1000;
  if (windowStartMs >= slide.durationMs) return null;
  const windowEndMs = Math.min(sound.timeline.windowEnd * 1000, slide.durationMs);
  const { timeline: _timeline, level, ...rest } = sound;
  const envelope = level === null ? undefined : envelopeOf(level, slide, windowStartMs, windowEndMs);
  return { ...rest, startMs: slide.startMs + windowStartMs, endMs: slide.startMs + windowEndMs, ...(envelope === undefined ? {} : { envelope }) };
}

const isStill = (document: CanvasDocument, sounds: readonly ExportSound[]): boolean =>
  document.scenes.length === 1 &&
  sounds.length === 0 &&
  document.scenes.every((scene) => !hasTimedObjects(scene) && !scene.objects.some(isVideoObject) && !scene.objects.some((o) => o.kind === 'sticker' && o.payload.animation !== undefined));

export function planSceneExport(params: {
  readonly document: CanvasDocument;
  readonly carrier: SceneCarrier;
  readonly durations: MediaDurations;
}): SceneExportPlan {
  const { document, carrier, durations } = params;
  const perScene = document.scenes.map((scene, sceneIndex) => {
    const sceneSoundList = sceneSounds(document, sceneIndex, carrier);
    return { sceneIndex, sounds: sceneSoundList, durationMs: slideDurationOf({ scene, sounds: sceneSoundList, carrier, durations }) };
  });
  const slides = perScene.reduce<readonly ExportSlide[]>((acc, entry) => {
    const previous = acc[acc.length - 1];
    const startMs = previous === undefined ? 0 : previous.startMs + previous.durationMs;
    return [...acc, { sceneIndex: entry.sceneIndex, startMs, durationMs: entry.durationMs }];
  }, []);
  const allSounds = perScene.flatMap((entry, index) => {
    const slide = slides[index];
    return slide === undefined ? [] : entry.sounds.map((sound) => placed(sound, slide)).filter((sound): sound is ExportSound => sound !== null);
  });
  const last = slides[slides.length - 1];
  return {
    slides,
    totalMs: last === undefined ? 0 : last.startMs + last.durationMs,
    sounds: allSounds,
    still: isStill(document, allSounds),
  };
}

export type SceneExportSources = {
  readonly images: readonly string[];
  readonly videos: readonly string[];
  readonly sounds: readonly string[];
};

const unique = (values: readonly (string | undefined)[]): readonly string[] =>
  values.filter((value): value is string => value !== undefined && value !== '').filter((value, index, all) => all.indexOf(value) === index);

const isPictureMedia = (object: CanvasObject): boolean => object.kind === 'media' && !isVideoObject(object);

const stickerImageSrc = (object: CanvasObject, carrier: SceneCarrier): string | undefined =>
  object.kind === 'sticker' && !(typeof object.payload.emoji === 'string' && object.payload.emoji !== '') ? objectMediaSrc(object, carrier) : undefined;

/** Tout ce que la composition doit avoir en main avant sa première image : pixels, vidéos, sons. */
export function sceneExportSources(params: { readonly document: CanvasDocument; readonly carrier: SceneCarrier }): SceneExportSources {
  const { document, carrier } = params;
  const objects = document.scenes.flatMap((scene) => scene.objects);
  return {
    images: unique(objects.flatMap((object) => [isPictureMedia(object) ? objectMediaSrc(object, carrier) : undefined, stickerImageSrc(object, carrier)])),
    videos: unique(objects.filter(isVideoObject).map((object) => objectMediaSrc(object, carrier))),
    sounds: unique(document.scenes.flatMap((_, sceneIndex) => sceneSounds(document, sceneIndex, carrier).map((sound) => sound.src))),
  };
}
