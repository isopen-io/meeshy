import { createStore } from 'zustand/vanilla';

/**
 * **LES EFFETS DE MA VIDÉO** (#8442) — les règles et l'état, sans traitement
 * d'image : ce module est LÉGER, l'écran d'appel le lit ; le traitement vit
 * dans un chunk à part (`video-effects-pipeline.ts`), chargé au premier effet
 * de couleur, et le moteur le branche par `camera-effects.ts`.
 *
 * Miroir de `VideoFilterPreset` d'iOS : naturel, chaud, froid, vif, doux, et la
 * luminosité (±50 %). Les effets s'appliquent à la piste ENVOYÉE : ce que je
 * vois dans ma vignette est ce que l'autre voit.
 *
 * Les EFFETS DE VISAGE (#8551) — lissage de peau, crapaud, ange, démon,
 * éruption volcanique — se choisissent un à la fois, par-dessus la couleur :
 * ils demandent le même traitement d'images, même quand la couleur est
 * naturelle (`needsFramePipeline`). Leur dessin vit avec le traitement
 * (`face-effects.ts`), jamais ici.
 *
 * Le flou d'arrière-plan est celui du NAVIGATEUR (contrainte `backgroundBlur`,
 * là où la caméra l'offre — Chrome sur ChromeOS, Windows et macOS récents,
 * Safari sur macOS) : aucune segmentation n'est téléchargée. Là où la caméra
 * ne l'offre pas, l'interrupteur n'existe pas.
 */

export const VIDEO_PRESETS = ['natural', 'warm', 'cool', 'vivid', 'muted'] as const;

export type VideoPreset = (typeof VIDEO_PRESETS)[number];

/** Les effets de visage, dans l'ordre partagé avec iOS (`CallFaceEffect`). */
export const FACE_EFFECTS = ['none', 'smoothing', 'toad', 'angel', 'demon', 'volcano'] as const;

export type FaceEffect = (typeof FACE_EFFECTS)[number];

export type VideoEffects = { readonly preset: VideoPreset; readonly brightness: number; readonly blur: boolean; readonly faceEffect: FaceEffect };

export const NO_EFFECTS: VideoEffects = { preset: 'natural', brightness: 0, blur: false, faceEffect: 'none' };

export const BRIGHTNESS_LIMIT = 0.5;

/* La colorimétrie d'iOS (température, contraste, saturation) rendue en filtres CSS. */
const PRESET_FILTER: Readonly<Record<VideoPreset, string>> = {
  natural: '',
  warm: 'sepia(0.18) saturate(1.1) contrast(1.05) brightness(1.02)',
  cool: 'hue-rotate(-10deg) saturate(0.95) contrast(1.05)',
  vivid: 'saturate(1.3) contrast(1.15) brightness(1.03)',
  muted: 'saturate(0.7) contrast(0.9) brightness(0.98)',
};

const clampBrightness = (value: number): number => Math.max(-BRIGHTNESS_LIMIT, Math.min(BRIGHTNESS_LIMIT, value));

/** Le filtre de canevas que le traitement pose sur chaque image — `none` quand il n'y a rien à faire. */
export function effectsFilter(effects: VideoEffects): string {
  const brightness = clampBrightness(effects.brightness);
  const parts = [PRESET_FILTER[effects.preset], brightness === 0 ? '' : `brightness(${Math.round((1 + brightness) * 100) / 100})`].filter((part) => part !== '');
  return parts.length === 0 ? 'none' : parts.join(' ');
}

/** Faut-il traiter les images ? Le flou seul non : il se règle sur la caméra elle-même. */
export const needsFramePipeline = (effects: VideoEffects): boolean => effectsFilter(effects) !== 'none' || effects.faceEffect !== 'none';

/** Les noms que `call:analytics` retient (`effectsUsed`). */
export function effectsUsedOf(effects: VideoEffects): readonly string[] {
  return [...(effects.preset === 'natural' ? [] : [`filter:${effects.preset}`]), ...(clampBrightness(effects.brightness) === 0 ? [] : ['brightness']), ...(effects.blur ? ['background-blur'] : []), ...(effects.faceEffect === 'none' ? [] : [`face:${effects.faceEffect}`])];
}

type CanvasProbe = { readonly getContext: (kind: '2d') => unknown; readonly captureStream?: unknown };

export type EffectsEnvironment = {
  readonly MediaStreamTrackProcessor?: unknown;
  readonly MediaStreamTrackGenerator?: unknown;
  readonly VideoTrackGenerator?: unknown;
  readonly OffscreenCanvas?: unknown;
  readonly createCanvas: () => CanvasProbe | null;
};

const hasFilter = (context: unknown): boolean => typeof context === 'object' && context !== null && 'filter' in context;

/**
 * Le traitement de couleur est possible quand le canevas sait FILTRER
 * (`ctx.filter`) et qu'on peut en tirer une piste : images traitables
 * (`MediaStreamTrackProcessor` + un générateur, Chrome et la coque Android),
 * sinon un canevas filmé (`captureStream`).
 */
export function colorPipelineSupported(env: EffectsEnvironment): boolean {
  const canvas = env.createCanvas();
  if (canvas === null || !hasFilter(canvas.getContext('2d'))) return false;
  const frames = env.MediaStreamTrackProcessor !== undefined && (env.MediaStreamTrackGenerator !== undefined || env.VideoTrackGenerator !== undefined) && env.OffscreenCanvas !== undefined;
  return frames || typeof canvas.captureStream === 'function';
}

/** L'environnement du navigateur, lu une fois. */
export function browserEffectsEnvironment(): EffectsEnvironment {
  const scope = globalThis as unknown as Record<string, unknown>;
  return {
    MediaStreamTrackProcessor: scope.MediaStreamTrackProcessor,
    MediaStreamTrackGenerator: scope.MediaStreamTrackGenerator,
    VideoTrackGenerator: scope.VideoTrackGenerator,
    OffscreenCanvas: scope.OffscreenCanvas,
    createCanvas: () => (typeof document === 'undefined' ? null : document.createElement('canvas')),
  };
}

let colorSupport: boolean | null = null;

/** Le navigateur sait-il traiter la couleur ? Mesuré une fois par session. */
export function browserColorSupport(): boolean {
  colorSupport ??= colorPipelineSupported(browserEffectsEnvironment());
  return colorSupport;
}

type BlurCapabilities = MediaTrackCapabilities & { readonly backgroundBlur?: unknown };

/** La caméra offre-t-elle son flou d'arrière-plan ? */
export function blurCapable(track: MediaStreamTrack | null): boolean {
  if (track === null || typeof track.getCapabilities !== 'function') return false;
  const blur = (track.getCapabilities() as BlurCapabilities).backgroundBlur;
  return Array.isArray(blur) && blur.includes(true);
}

export const effectsOffered = (support: { readonly color: boolean; readonly blur: boolean }): boolean => support.color || support.blur;

/* La caméra DERRIÈRE une piste traitée : le zoom et le flou se règlent sur elle. */
const sources = new WeakMap<MediaStreamTrack, MediaStreamTrack>();

export const registerCameraSource = (sent: MediaStreamTrack, camera: MediaStreamTrack): void => void sources.set(sent, camera);

export const forgetCameraSource = (sent: MediaStreamTrack): void => void sources.delete(sent);

/** La caméra d'où vient une piste envoyée — elle-même si elle n'est pas traitée. */
export const cameraSourceOf = (track: MediaStreamTrack): MediaStreamTrack => sources.get(track) ?? track;

/** Les effets choisis — gardés d'un appel à l'autre pendant la session, comme iOS. */
export const videoEffectsStore = createStore<{ readonly effects: VideoEffects }>(() => ({ effects: NO_EFFECTS }));

export const setVideoEffects = (patch: Partial<VideoEffects>): void => videoEffectsStore.setState(({ effects }) => ({ effects: { ...effects, ...patch, brightness: clampBrightness(patch.brightness ?? effects.brightness) } }));
