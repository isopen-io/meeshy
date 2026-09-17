import type { CanvasKeyframe, CanvasObject } from './document';

/**
 * LA LOI DE POSE D'UN OBJET CANVAS (#6901, D4/D6) — miroir canal par canal de
 * `StoryRenderer.swift` : la fenêtre temporelle (`:442-454`), les fondus
 * (`:1174-1197`) et les keyframes (`:1069-1123`, `KeyframeInterpolator.swift:
 * 75-110`). Une pose est calculée à un instant `t` (secondes depuis le début
 * de la SCÈNE, `local = t − startTime` par objet) — jamais recopiée dans un
 * état React : l'horloge (`components/scene-clock.ts`) écrit le résultat
 * directement en `style` pour ne re-rendre AUCUN composant par trame (Zero
 * Unnecessary Re-render).
 */

/** `CanvasBandAnchorY` (`CanvasV3Migration.swift:11-14`) — où un objet à
 * ancre `band` est PEINT. CE N'EST PAS `BAND_TOP_Y`/`BAND_BOTTOM_Y` de
 * `lib/feed/scene-framing.ts` (0.12/0.88), qui cote la BOÎTE DE CADRAGE d'une
 * carte de fil, pas le point où l'objet est rendu (§ 9, Q8 de la
 * spécification) : deux questions, iOS porte les deux valeurs. */
export const BAND_ANCHOR_Y = { top: 0.08, bottom: 0.92 } as const;

export type AnchorPoint = { readonly x: number; readonly y: number };

/** Le point d'ancrage NORMALISÉ (0..1) d'un objet — base de toute pose,
 * avant keyframes. */
export function anchorPoint(object: CanvasObject): AnchorPoint {
  if (object.anchor.t === 'free') return { x: object.anchor.x, y: object.anchor.y };
  return { x: 0.5, y: object.anchor.edge === 'top' ? BAND_ANCHOR_Y.top : BAND_ANCHOR_Y.bottom };
}

export type EasingName = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut';

/** `StoryEasing` (`StoryModels.swift:2367-2385`) — quatre courbes ; tout ce
 * qui n'en fait pas partie (dont `'spring'`, accepté par le contrat zod, § 9
 * Q3) retombe sur `linear` : iOS ne la connaît pas, en inventer une
 * divergerait des trois plateformes. */
export function applyEasing(name: string | undefined, t: number): number {
  const clamped = Math.min(Math.max(t, 0), 1);
  switch (name) {
    case 'easeIn':
      return clamped * clamped;
    case 'easeOut':
      return 1 - (1 - clamped) * (1 - clamped);
    case 'easeInOut':
      return clamped < 0.5 ? 2 * clamped * clamped : 1 - ((-2 * clamped + 2) ** 2) / 2;
    default:
      return clamped;
  }
}

type Channel = 'x' | 'y' | 'scale' | 'opacity' | 'volume';

/**
 * `KeyframeInterpolator.interpolate` (`:75-110`) — pour UN canal : trie par
 * `time`, un seul point ⇒ constante, clamp avant le premier / après le
 * dernier, sinon interpolation du segment encadrant avec l'easing du
 * keyframe BAS. Rend `undefined` quand le canal n'a AUCUN point (l'objet
 * garde sa pose de base) — la porte « avant le premier keyframe du canal »
 * (T-D5) est un cas de ce même clamp : `t` avant le premier point clampe SUR
 * ce point, mais l'appelant (`keyframeOverrides`) ne l'applique que si le
 * PREMIER point du canal est déjà atteint (miroir exact de
 * `StoryRenderer.swift:1085-1094`, qui laisse la base avant le premier
 * keyframe plutôt que de la clamper).
 */
function interpolateChannel(keyframes: readonly CanvasKeyframe[], channel: Channel, at: number): number | undefined {
  const points = keyframes
    .filter((k): k is CanvasKeyframe & Record<Channel, number> => typeof k[channel] === 'number')
    .slice()
    .sort((a, b) => a.time - b.time);
  if (points.length === 0) return undefined;
  const first = points[0];
  if (first === undefined) return undefined;
  // AVANT le premier keyframe du canal ⇒ la base gouverne (T-D5,
  // `StoryRenderer.swift:1085-1094`) — ce gate précède `KeyframeInterpolator`
  // lui-même, y compris pour un canal à UN SEUL point (T-D6 : `time: 0` rend
  // le gate trivialement franchi pour tout `t >= 0`).
  if (at < first.time) return undefined;
  if (points.length === 1) return first[channel];
  const last = points[points.length - 1];
  if (last !== undefined && at >= last.time) return last[channel];
  for (let i = 0; i < points.length - 1; i += 1) {
    const lo = points[i];
    const hi = points[i + 1];
    if (lo === undefined || hi === undefined) continue;
    if (at >= lo.time && at <= hi.time) {
      const span = hi.time - lo.time;
      const progress = span <= 0 ? 1 : (at - lo.time) / span;
      const eased = applyEasing(lo.easing, progress); // l'easing du keyframe BAS (§ 1.7)
      return lo[channel] + (hi[channel] - lo[channel]) * eased;
    }
  }
  return last?.[channel];
}

export type KeyframeOverrides = {
  readonly x?: number;
  readonly y?: number;
  readonly scale?: number;
  readonly opacity?: number;
  readonly volume?: number;
};

/**
 * `applyKeyframes` (`:1069-1123`) — `local = t − startTime` ; par canal ; la
 * POSITION n'est écrasée que si `x` ET `y` sont TOUS DEUX résolus (T-D6,
 * `StoryRenderer.swift:1118`) — un seul des deux ne rendrait qu'une moitié de
 * position, jamais posée par un auteur.
 */
export function keyframeOverrides(keyframes: readonly CanvasKeyframe[] | undefined, t: number, startTime: number): KeyframeOverrides {
  if (keyframes === undefined || keyframes.length === 0) return {};
  const local = Math.max(0, t - startTime);
  const x = interpolateChannel(keyframes, 'x', local);
  const y = interpolateChannel(keyframes, 'y', local);
  const scale = interpolateChannel(keyframes, 'scale', local);
  const opacity = interpolateChannel(keyframes, 'opacity', local);
  const volume = interpolateChannel(keyframes, 'volume', local);
  return {
    ...(x !== undefined && y !== undefined ? { x, y } : {}),
    ...(scale !== undefined ? { scale } : {}),
    ...(opacity !== undefined ? { opacity } : {}),
    ...(volume !== undefined ? { volume } : {}),
  };
}

export type VisibilityWindow = { readonly start: number; readonly end: number };

/**
 * `shouldRender` (`:442-454`) — `start = timing.start ?? 0`, `end =
 * timing.end ?? (payload.duration ? start + duration : Infinity)` : le
 * contrat de fil porte `timing.end`, iOS lit `duration` — on lit les DEUX,
 * `end` déclaré en premier (§ Étape 4 de la spécification).
 */
export function visibilityWindow(object: CanvasObject): VisibilityWindow {
  const start = object.timing?.start ?? 0;
  const explicitEnd = object.timing?.end;
  if (explicitEnd !== undefined) return { start, end: explicitEnd };
  const duration = object.payload.duration;
  if (typeof duration === 'number' && duration > 0) return { start, end: start + duration };
  return { start, end: Infinity };
}

/** Porte NETTE (§ 1.7) — pas de fondu de visibilité, seulement d'opacité. */
export function isWithinWindow(object: CanvasObject, t: number): boolean {
  const { start, end } = visibilityWindow(object);
  return t >= start && t < end;
}

/**
 * `fadeOpacity` (`:1174-1197`) — `undefined` hors fenêtre de fondu ou sans
 * fondu déclaré : l'enveloppe de fondu REMPLACE l'opacité keyframe quand elle
 * existe (`StoryRenderer.swift:227`, § Étape 4) — jamais un produit des deux.
 */
export function fadeFactor(object: CanvasObject, t: number): number | undefined {
  const { start, end } = visibilityWindow(object);
  const fadeIn = object.payload.fadeIn;
  const fadeOut = object.payload.fadeOut;
  if (typeof fadeIn === 'number' && fadeIn > 0 && t >= start && t < start + fadeIn) return (t - start) / fadeIn;
  if (typeof fadeOut === 'number' && fadeOut > 0 && end !== Infinity && t > end - fadeOut && t < end) return (end - t) / fadeOut;
  return undefined;
}

export type ObjectPose = {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly rotation: number;
  readonly opacity: number;
  readonly visible: boolean;
};

/**
 * `objectPose` — LA loi de pose, publique, testée par son API seule (T-D1…
 * T-D6). Sans `timing`, la pose de base EST le transform : `visible` vaut
 * toujours vrai (T-D2).
 */
export function objectPose(object: CanvasObject, t: number): ObjectPose {
  const anchor = anchorPoint(object);
  const visible = isWithinWindow(object, t);
  const start = object.timing?.start ?? 0;
  const overrides = keyframeOverrides(object.timing?.keyframes, t, start);
  const fade = fadeFactor(object, t);
  const keyframeOpacity = overrides.opacity ?? 1;
  const opacity = object.transform.opacity * (fade ?? keyframeOpacity);
  return {
    x: overrides.x ?? anchor.x,
    y: overrides.y ?? anchor.y,
    scale: overrides.scale ?? object.transform.scale,
    rotation: object.transform.rotation,
    opacity,
    visible,
  };
}
