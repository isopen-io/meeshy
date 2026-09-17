/**
 * LE DOCUMENT CANVAS V3, TOLÉRANT (#6898, D-79) — `parseCanvasDocument` lit
 * `Post.storyEffects` EXACTEMENT comme la passerelle le sert sur staging
 * (§ 3.2-3.3 de la spécification), jamais comme `CanvasV3Schema`
 * (`packages/shared/types/canvas-v3.ts`) l'exigerait à l'écriture.
 *
 * **`transform: {}` existe en base** (staging, post « Trois scènes — mesure
 * des dispositions ») : `CANVAS_V3_WRITE_STRICT` n'est pas armé, et un objet
 * peut donc porter un `transform` PARTIEL ou VIDE. `CanvasV3Schema` rejette
 * cette forme (`scale`/`rotation`/`opacity` requis) ; ce parseur applique les
 * mêmes défauts que `TransformV3.init` côté Swift (`CanvasV3.swift:328`) et ne
 * refuse QUE ce qu'aucun défaut ne peut réparer : un rang hors `v >= 3`
 * (entier) ou `scenes` absent/vide.
 *
 * Ce module n'est PAS chargé à la demande (D-79 ne réserve le chargement
 * différé qu'au PLAYER, `scene-player.tsx`) : il tourne pour CHAQUE carte du
 * fil, à chaque page reçue — rester une fonction pure sans dépendance lourde
 * (aucun zod) est ce qui le garde bon marché.
 */
import type { CanvasV3, KeyframeV3, ObjectV3, SceneV3 } from '@meeshy/shared/types/canvas-v3';

export type CanvasAnchor =
  | { readonly t: 'free'; readonly x: number; readonly y: number }
  | { readonly t: 'band'; readonly edge: 'top' | 'bottom' };

export type CanvasTransform = {
  readonly scale: number;
  readonly rotation: number;
  readonly opacity: number;
};

/**
 * `KeyframeV3` (`canvas-v3.ts:12-19`), lu avec la même tolérance que le reste
 * du document (D-79) : un `time` fini `>= 0` est la SEULE clé requise, les
 * canaux (`x`,`y`,`scale`,`opacity`) sont optionnels et jetés individuellement
 * s'ils ne sont pas des nombres finis. `easing` voyage tel quel, y compris
 * `'spring'` — la loi de pose (`lib/canvas/pose.ts`) le lira comme `linear`
 * (§ 9, Q3 de la spécification) : ce module ne DÉCIDE rien de la lecture.
 */
export type CanvasKeyframe = {
  readonly time: number;
  readonly x?: number;
  readonly y?: number;
  readonly scale?: number;
  readonly opacity?: number;
  readonly volume?: number;
  readonly easing?: string;
};

export type CanvasTiming = {
  readonly start?: number;
  readonly end?: number;
  readonly keyframes?: readonly CanvasKeyframe[];
};

export type CanvasObject = {
  readonly id: string;
  readonly kind: string;
  readonly anchor: CanvasAnchor;
  readonly plane: 'bg' | 'content' | 'fg';
  readonly z: number;
  readonly transform: CanvasTransform;
  readonly locale?: string;
  readonly timing?: CanvasTiming;
  readonly payload: Readonly<Record<string, unknown>>;
};

export type CanvasScene = {
  readonly id: string;
  readonly objects: readonly CanvasObject[];
  readonly opening?: unknown;
  readonly closing?: unknown;
  readonly clipTransitions?: readonly unknown[];
  readonly carrierAspect?: number;
  /** `SceneV3.timelineDuration` (`canvas-v3.ts:146`) — secondes, AUTORITAIRE
   * quand positif fini (#6899, T5) : gouverne `slideDurationForScene`
   * (`lib/stories/playback.ts`), jamais lu ailleurs. */
  readonly timelineDuration?: number;
  /** `SceneV3.thumbHash` (`canvas-v3.ts:149`) — l'empreinte du CANVAS
   * COMPOSITE, distincte du hash d'un média individuel (#6899, T5) : le
   * dernier candidat de `letterboxHashes` (`lib/stories/letterbox.ts`). */
  readonly thumbHash?: string;
};

export type CanvasDocument = {
  /**
   * Un ENTIER `>= 3` — miroir `isCanvasV3OrNewer`
   * (`services/gateway/src/services/posts/storyEffectsV3.ts:37-41`, `mark >=
   * 3` sur un `number`). Un rang supérieur se lit à travers la même lentille
   * v3 (rétrécissement optimiste) — c'est la tolérance au FUTUR ; la
   * sévérité de l'ÉCRITURE vit ailleurs (`isCanvasV3Exactly`, jamais
   * réimplémenté ici, D-79). `Number.isInteger` en plus de la passerelle
   * (§ 9, Q1 de la spécification) : une version fractionnaire n'a jamais
   * existé côté fil, et la garde de jumelage ci-dessous ne compare que les
   * CLÉS — élargir `v` en `number` ne la fait pas rougir.
   */
  readonly v: number;
  readonly scenes: readonly CanvasScene[];
  readonly layout?: string;
  readonly sound?: unknown;
};

/**
 * LA GARDE DE JUMELAGE (D-14). Ces types ne sont pas DÉRIVÉS de
 * `@meeshy/shared/types/canvas-v3` — mesuré pendant la revue-correction de
 * #6898 : `Pick`/`Omit` sur les types que zod y infère perdent l'optionalité
 * (`opening`, `closing`, `carrierAspect` deviennent requis), et les types
 * exacts (`KeyframeV3[]`, `BackgroundSoundV3`) exigeraient une validation que
 * ce parseur TOLÉRANT refuse précisément de faire. Ils sont donc déclarés ici,
 * et `tsc` rougit dès qu'ils inventent un champ que le schéma partagé ne
 * connaît pas, ou qu'une ancre, un plan ou un transform s'en écarte.
 */
type Assert<T extends true> = T;
type KeysWithin<Local, Shared> = Exclude<keyof Local, keyof Shared> extends never ? true : false;
type Within<Local, Shared> = [Local] extends [Shared] ? true : false;
export type CanvasTypesFollowShared = [
  Assert<KeysWithin<CanvasObject, ObjectV3>>,
  Assert<KeysWithin<CanvasScene, SceneV3>>,
  Assert<KeysWithin<CanvasDocument, CanvasV3>>,
  Assert<KeysWithin<CanvasKeyframe, KeyframeV3>>,
  Assert<Within<CanvasAnchor, ObjectV3['anchor']>>,
  Assert<Within<CanvasObject['plane'], ObjectV3['plane']>>,
  Assert<Within<CanvasTransform, ObjectV3['transform']>>,
];

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const numberOf = (value: unknown, fallback: number): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);

function parseAnchor(raw: unknown): CanvasAnchor {
  if (isRecord(raw) && raw.t === 'band') {
    const edge = raw.edge === 'bottom' ? 'bottom' : 'top';
    return { t: 'band', edge };
  }
  if (isRecord(raw) && raw.t === 'free') {
    return { t: 'free', x: numberOf(raw.x, 0.5), y: numberOf(raw.y, 0.5) };
  }
  // Un objet sans ancre exploitable se pose au centre — mieux qu'un rejet
  // total de l'objet, qui perdrait aussi son texte ou son média.
  return { t: 'free', x: 0.5, y: 0.5 };
}

/** `TransformV3.init` (Swift) : chaque champ ABSENT ou hors-type reçoit son
 * défaut — jamais l'objet entier rejeté pour un `transform: {}`. */
function parseTransform(raw: unknown): CanvasTransform {
  const record = isRecord(raw) ? raw : {};
  return {
    scale: numberOf(record.scale, 1),
    rotation: numberOf(record.rotation, 0),
    opacity: numberOf(record.opacity, 1),
  };
}

const finiteOf = (value: unknown): number | undefined => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);

/** Un keyframe SANS `time` fini `>= 0` est jeté — jamais l'objet entier
 * (T-A2) : un canal absent garde sa pose de base à la lecture (`pose.ts`). */
function parseKeyframe(raw: unknown): CanvasKeyframe | null {
  if (!isRecord(raw)) return null;
  const time = finiteOf(raw.time);
  if (time === undefined || time < 0) return null;
  const x = finiteOf(raw.x);
  const y = finiteOf(raw.y);
  const scale = finiteOf(raw.scale);
  const opacity = finiteOf(raw.opacity);
  const volume = finiteOf(raw.volume);
  const easing = typeof raw.easing === 'string' ? raw.easing : undefined;
  return {
    time,
    ...(x !== undefined ? { x } : {}),
    ...(y !== undefined ? { y } : {}),
    ...(scale !== undefined ? { scale } : {}),
    ...(opacity !== undefined ? { opacity } : {}),
    ...(volume !== undefined ? { volume } : {}),
    ...(easing !== undefined ? { easing } : {}),
  };
}

function parseKeyframes(raw: unknown): readonly CanvasKeyframe[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const keyframes = raw.map(parseKeyframe).filter((k): k is CanvasKeyframe => k !== null);
  return keyframes.length > 0 ? keyframes : undefined;
}

function parseTiming(raw: unknown): CanvasTiming | undefined {
  if (!isRecord(raw)) return undefined;
  const start = typeof raw.start === 'number' ? raw.start : undefined;
  const end = typeof raw.end === 'number' ? raw.end : undefined;
  const keyframes = parseKeyframes(raw.keyframes);
  if (start === undefined && end === undefined && keyframes === undefined) return undefined;
  return {
    ...(start !== undefined ? { start } : {}),
    ...(end !== undefined ? { end } : {}),
    ...(keyframes !== undefined ? { keyframes } : {}),
  };
}

function parseObject(raw: unknown, fallbackId: string): CanvasObject | null {
  if (!isRecord(raw)) return null;
  const kind = typeof raw.kind === 'string' ? raw.kind : undefined;
  if (kind === undefined) return null;
  const id = typeof raw.id === 'string' && raw.id !== '' ? raw.id : fallbackId;
  const plane = raw.plane === 'bg' || raw.plane === 'fg' ? raw.plane : 'content';
  const z = numberOf(raw.z, 0);
  const payload = isRecord(raw.payload) ? raw.payload : {};
  const locale = typeof raw.locale === 'string' ? raw.locale : undefined;
  const timing = parseTiming(raw.timing);
  return {
    id,
    kind,
    anchor: parseAnchor(raw.anchor),
    plane,
    z,
    transform: parseTransform(raw.transform),
    payload,
    ...(locale !== undefined ? { locale } : {}),
    ...(timing !== undefined ? { timing } : {}),
  };
}

function parseScene(raw: unknown, sceneIndex: number): CanvasScene | null {
  if (!isRecord(raw)) return null;
  const rawObjects = Array.isArray(raw.objects) ? raw.objects : [];
  const objects = rawObjects
    .map((o, i) => parseObject(o, `${sceneIndex}-${i}`))
    .filter((o): o is CanvasObject => o !== null);
  const id = typeof raw.id === 'string' && raw.id !== '' ? raw.id : `scene-${sceneIndex}`;
  const carrierAspect = typeof raw.carrierAspect === 'number' && raw.carrierAspect > 0 ? raw.carrierAspect : undefined;
  const clipTransitions = Array.isArray(raw.clipTransitions) ? raw.clipTransitions.filter(isRecord) : undefined;
  const timelineDuration =
    typeof raw.timelineDuration === 'number' && Number.isFinite(raw.timelineDuration) && raw.timelineDuration > 0
      ? raw.timelineDuration
      : undefined;
  const thumbHash = typeof raw.thumbHash === 'string' && raw.thumbHash !== '' ? raw.thumbHash : undefined;
  return {
    id,
    objects,
    ...(isRecord(raw.opening) ? { opening: raw.opening } : {}),
    ...(isRecord(raw.closing) ? { closing: raw.closing } : {}),
    ...(clipTransitions !== undefined ? { clipTransitions } : {}),
    ...(carrierAspect !== undefined ? { carrierAspect } : {}),
    ...(timelineDuration !== undefined ? { timelineDuration } : {}),
    ...(thumbHash !== undefined ? { thumbHash } : {}),
  };
}

/**
 * `parseCanvasDocument` — `null` sur tout ce qu'aucun défaut ne peut
 * réparer : pas un objet, un rang hors `v >= 3` (entier — miroir
 * `isCanvasV3OrNewer`, voir `CanvasDocument.v`), ou `scenes` absent/vide (O3
 * du contrat de fil — un canvas sans scène n'est jamais un canvas, il tombe
 * au repli média, D-78).
 */
export function parseCanvasDocument(storyEffects: unknown): CanvasDocument | null {
  if (!isRecord(storyEffects)) return null;
  const v = storyEffects.v;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 3) return null;
  const rawScenes = storyEffects.scenes;
  if (!Array.isArray(rawScenes) || rawScenes.length === 0) return null;
  const scenes = rawScenes.map((s, i) => parseScene(s, i)).filter((s): s is CanvasScene => s !== null);
  if (scenes.length === 0) return null;
  const layout = typeof storyEffects.layout === 'string' ? storyEffects.layout : undefined;
  return {
    v,
    scenes,
    ...(layout !== undefined ? { layout } : {}),
    ...(storyEffects.sound !== undefined ? { sound: storyEffects.sound } : {}),
  };
}
