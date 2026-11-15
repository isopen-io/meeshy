import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

/**
 * LA LECTURE DES EFFETS D'UN MESSAGE (#7596) — miroir de `MessageEffectPlan`
 * (`packages/MeeshySDK/.../Models/MessageEffects.swift`) et des durées de
 * `MessageEffectModifiers.swift` (app iOS). Décision porteur 2026-09-23 : les
 * effets s'EXÉCUTENT comme sur iOS, ils ne se comptent plus (le badge
 * `EffectsIndicator` et son compteur sont retirés).
 *
 * Ce module est PUR : aucune dépendance au DOM. Il dit QUOI jouer, avec quelles
 * images clés et quelles durées ; `components/message-effects-host.tsx` décide
 * QUAND (à l'écran seulement) et l'exécute.
 *
 * **Un effet d'apparition joue une fois PAR VENUE À L'ÉCRAN** (horloge
 * d'AFFICHAGE, pas de réception) : refaire défiler la bulle le rejoue, comme
 * sur iOS. Aucune mémoire de lecture.
 *
 * **Sous « réduire les animations », le message garde son intention et perd son
 * mouvement** : aucune apparition ne se déplace (un éclat d'opacité la
 * remplace), `glow` et `rainbow` restent POSÉS et fixes, `pulse` et `sparkle`
 * (du mouvement pur) disparaissent — `reduceMotionSafeMask` d'iOS.
 */
export type EntranceEffect = 'shake' | 'zoom' | 'explode' | 'confetti' | 'fireworks' | 'waoo';
export type PersistentEffect = 'glow' | 'pulse' | 'rainbow' | 'sparkle';

const ENTRANCE_BITS: readonly (readonly [EntranceEffect, number])[] = [
  ['shake', MESSAGE_EFFECT_FLAGS.SHAKE],
  ['zoom', MESSAGE_EFFECT_FLAGS.ZOOM],
  ['explode', MESSAGE_EFFECT_FLAGS.EXPLODE],
  ['confetti', MESSAGE_EFFECT_FLAGS.CONFETTI],
  ['fireworks', MESSAGE_EFFECT_FLAGS.FIREWORKS],
  ['waoo', MESSAGE_EFFECT_FLAGS.WAOO],
];

const PERSISTENT_BITS: readonly (readonly [PersistentEffect, number])[] = [
  ['glow', MESSAGE_EFFECT_FLAGS.GLOW],
  ['pulse', MESSAGE_EFFECT_FLAGS.PULSE],
  ['rainbow', MESSAGE_EFFECT_FLAGS.RAINBOW],
  ['sparkle', MESSAGE_EFFECT_FLAGS.SPARKLE],
];

const REDUCE_MOTION_SAFE: readonly PersistentEffect[] = ['glow', 'rainbow'];

export type EffectPlaybackPlan = {
  readonly appearance: readonly EntranceEffect[];
  readonly persistent: readonly PersistentEffect[];
  /** `false` sous « réduire les animations » : les persistants sont posés FIXES. */
  readonly animatesPersistent: boolean;
  /** Un éclat d'opacité remplace les apparitions sous « réduire les animations ». */
  readonly flash: boolean;
};

export function hasDecorativeEffects(effectFlags: number | undefined): boolean {
  const flags = effectFlags ?? 0;
  return [...ENTRANCE_BITS, ...PERSISTENT_BITS].some(([, bit]) => (flags & bit) !== 0);
}

export function effectPlaybackPlanOf(effectFlags: number | undefined, reduceMotion: boolean): EffectPlaybackPlan {
  const flags = effectFlags ?? 0;
  const appearance = ENTRANCE_BITS.filter(([, bit]) => (flags & bit) !== 0).map(([name]) => name);
  const persistent = PERSISTENT_BITS.filter(([, bit]) => (flags & bit) !== 0).map(([name]) => name);
  if (!reduceMotion) return { appearance, persistent, animatesPersistent: true, flash: false };
  return {
    appearance: [],
    persistent: persistent.filter((effect) => REDUCE_MOTION_SAFE.includes(effect)),
    animatesPersistent: false,
    flash: appearance.length > 0,
  };
}

/** Une animation posée sur la SURFACE du message (Web Animations API). */
export type SurfaceAnimation = {
  readonly keyframes: readonly Keyframe[];
  readonly options: KeyframeAnimationOptions;
};

/** Ressort d'iOS (`.spring(response:dampingFraction:)`) approché par une courbe à dépassement. */
const SPRING_EASE = 'cubic-bezier(0.34, 1.56, 0.64, 1)';

/**
 * `ShakeGeometryEffect` : `travel · sin(phase · π · 4)`, 8 px, 0,6 s easeOut —
 * la sinusoïde est ÉCHANTILLONNÉE (17 points) pour être réellement parcourue,
 * même piège qu'iOS : animer de 0 à 0 ne secoue rien.
 */
function shakeKeyframes(): readonly Keyframe[] {
  const steps = 16;
  return Array.from({ length: steps + 1 }, (_unused, i) => {
    const phase = i / steps;
    const x = 8 * Math.sin(phase * Math.PI * 4);
    return { offset: phase, transform: `translateX(${x.toFixed(2)}px)` };
  });
}

export const ENTRANCE_SURFACE_ANIMATIONS: Readonly<Partial<Record<EntranceEffect, SurfaceAnimation>>> = {
  shake: { keyframes: shakeKeyframes(), options: { duration: 600, easing: 'ease-out' } },
  zoom: {
    keyframes: [{ transform: 'scale(0.3)' }, { transform: 'scale(1)' }],
    options: { duration: 500, easing: SPRING_EASE },
  },
  explode: {
    keyframes: [
      { offset: 0, transform: 'scale(0.1)', opacity: 0 },
      { offset: 0.33, opacity: 1 },
      { offset: 1, transform: 'scale(1)', opacity: 1 },
    ],
    options: { duration: 400, easing: SPRING_EASE },
  },
  waoo: {
    keyframes: [
      { offset: 0, transform: 'scale(0.5)', filter: 'drop-shadow(0 0 0 rgba(250, 204, 21, 0))' },
      { offset: 0.5, filter: 'drop-shadow(0 0 20px rgba(250, 204, 21, 0.6))' },
      { offset: 1, transform: 'scale(1)', filter: 'drop-shadow(0 0 0 rgba(250, 204, 21, 0))' },
    ],
    options: { duration: 500, easing: SPRING_EASE },
  },
};

/** L'éclat d'opacité qui remplace toute apparition sous « réduire les animations ». */
export const REDUCED_MOTION_FLASH: SurfaceAnimation = {
  keyframes: [{ opacity: 0.55 }, { opacity: 1 }],
  options: { duration: 450, easing: 'ease-out' },
};

/**
 * LE HALO (`GlowEffect`) — une ombre indigo de la marque, peinte UNE fois sur
 * un calque, dont seule l'OPACITÉ respire (1,5 s aller-retour, 30 % ↔ 100 %).
 * Animer `filter`/`box-shadow` repeindrait la bulle à chaque image ; l'opacité
 * d'un calque se compose sans repeindre — c'est ce qui tient 60 i/s au
 * défilement. Sans mouvement permis, le calque reste posé à pleine intensité
 * (`null` : aucune animation).
 */
export const GLOW_SHADOW = '0 0 12px 2px rgba(99, 102, 241, 0.5)';

export function glowLayerAnimation(animated: boolean): SurfaceAnimation | null {
  if (!animated) return null;
  return {
    keyframes: [{ opacity: 0.3 }, { opacity: 1 }],
    options: { duration: 1500, easing: 'ease-in-out', iterations: Infinity, direction: 'alternate' },
  };
}

/** `PulseEffect` : échelle 1 ↔ 1,02, 1 s aller-retour, jamais sous « réduire les animations ». */
export const PULSE_ANIMATION: SurfaceAnimation = {
  keyframes: [{ transform: 'scale(1)' }, { transform: 'scale(1.02)' }],
  options: { duration: 1000, easing: 'ease-in-out', iterations: Infinity, direction: 'alternate' },
};

/**
 * LE SPECTRE DE LA MAISON (`RainbowEffect.houseSpectrum`) — refermé sur sa
 * première couleur : un dégradé conique ouvert montrerait sa couture.
 */
export const RAINBOW_SPECTRUM: readonly string[] = [
  '#818CF8',
  '#E879F9',
  '#FB7185',
  '#FBBF24',
  '#34D399',
  '#38BDF8',
  '#818CF8',
];

/**
 * LA COMÈTE DU CONTOUR (`RainbowSweep`) — cycle de 4,5 s ; elle ne court que
 * pendant les 55 premiers pour cent, puis se REPOSE ; arc de 12 % du
 * périmètre, fondu d'entrée et de sortie sur 12 % du parcours. Portée sur un
 * `<rect pathLength="1">` : la tête vaut `-dashoffset + ARC`, donc parcourir le
 * périmètre revient à mener `strokeDashoffset` de `ARC` à `ARC - 1`.
 */
export const RAINBOW_COMET_CYCLE_MS = 4500;
export const RAINBOW_COMET_ARC = 0.12;
const SWEEP = 0.55;
const FADE = 0.12;

export function rainbowCometAnimation(): SurfaceAnimation {
  const start = RAINBOW_COMET_ARC;
  const end = RAINBOW_COMET_ARC - 1;
  const at = (progress: number) => start + (end - start) * progress;
  return {
    keyframes: [
      { offset: 0, strokeDashoffset: at(0), opacity: 0 },
      { offset: SWEEP * FADE, strokeDashoffset: at(FADE), opacity: 1 },
      { offset: SWEEP * (1 - FADE), strokeDashoffset: at(1 - FADE), opacity: 1 },
      { offset: SWEEP, strokeDashoffset: at(1), opacity: 0 },
      { offset: 1, strokeDashoffset: at(1), opacity: 0 },
    ],
    options: { duration: RAINBOW_COMET_CYCLE_MS, easing: 'linear', iterations: Infinity },
  };
}

/** Durée totale d'une apparition — au-delà, ses calques sont retirés. */
export const ENTRANCE_OVERLAY_DURATION_MS: Readonly<Record<'confetti' | 'fireworks' | 'explode' | 'waoo', number>> = {
  confetti: 1700,
  fireworks: 1000,
  explode: 600,
  waoo: 800,
};

export type Rng = () => number;

export type ConfettiSeed = {
  readonly startXFraction: number;
  readonly driftX: number;
  readonly color: string;
  readonly size: number;
  readonly rotation: number;
};

const CONFETTI_COLORS = ['#EF4444', '#3B82F6', '#22C55E', '#EAB308', '#A855F7', '#F97316', '#EC4899'];
const FIREWORK_COLORS = ['#6366F1', '#818CF8', '#EAB308', '#F97316', '#FFFFFF'];

const pick = <T,>(items: readonly T[], rng: Rng): T => items[Math.min(items.length - 1, Math.floor(rng() * items.length))] as T;

/** `ConfettiOverlay` : 30 rectangles, tirés UNE fois, qui tombent en 1,5 s. */
export function confettiSeeds(rng: Rng = Math.random): readonly ConfettiSeed[] {
  return Array.from({ length: 30 }, () => ({
    startXFraction: rng(),
    driftX: -30 + rng() * 60,
    color: pick(CONFETTI_COLORS, rng),
    size: 4 + rng() * 4,
    rotation: rng() * 360,
  }));
}

export type ParticleFrame = { readonly x: number; readonly y: number; readonly opacity: number };

const easeIn = (t: number) => t * t;
const easeOut = (t: number) => 1 - (1 - t) * (1 - t);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

/** Position d'un confetti à `elapsedMs` : chute easeIn 1,5 s, fondu 0,5 s dès 1,2 s. */
export function confettiFrame(seed: ConfettiSeed, elapsedMs: number, width: number, height: number): ParticleFrame {
  const progress = easeIn(clamp01(elapsedMs / 1500));
  const fade = easeIn(clamp01((elapsedMs - 1200) / 500));
  return {
    x: seed.startXFraction * width + seed.driftX * progress,
    y: -10 + progress * (height + 30),
    opacity: 1 - fade,
  };
}

export type FireworkSeed = { readonly angle: number; readonly distance: number; readonly color: string };

/** `FireworksOverlay` : 20 étincelles réparties sur le cercle, 40 à 80 px. */
export function fireworkSeeds(rng: Rng = Math.random): readonly FireworkSeed[] {
  return Array.from({ length: 20 }, (_unused, i) => ({
    angle: (i * 360) / 20,
    distance: 40 + rng() * 40,
    color: pick(FIREWORK_COLORS, rng),
  }));
}

/** Gerbe easeOut 0,8 s depuis le centre, fondu 0,4 s dès 0,6 s. */
export function fireworkFrame(seed: FireworkSeed, elapsedMs: number, width: number, height: number): ParticleFrame {
  const progress = easeOut(clamp01(elapsedMs / 800));
  const fade = easeIn(clamp01((elapsedMs - 600) / 400));
  const rad = (seed.angle * Math.PI) / 180;
  return {
    x: width / 2 + Math.cos(rad) * seed.distance * progress,
    y: height / 2 + Math.sin(rad) * seed.distance * progress,
    opacity: 1 - fade,
  };
}

export type SparkleDot = ParticleFrame & { readonly size: number };

/** `SparkleEffect` : huit points blancs, formule d'iOS, redessinés à 10 Hz. */
export function sparkleDots(timeSeconds: number, width: number, height: number): readonly SparkleDot[] {
  return Array.from({ length: 8 }, (_unused, i) => {
    const phase = timeSeconds + i * 0.5;
    return {
      x: (Math.sin(phase * 1.3 + i) * 0.4 + 0.5) * width,
      y: (Math.cos(phase * 0.9 + i * 0.7) * 0.4 + 0.5) * height,
      size: (Math.sin(phase * 2 + i) * 0.5 + 0.5) * 6 + 2,
      opacity: Math.sin(phase * 2 + i) * 0.3 + 0.4,
    };
  });
}

export const SPARKLE_FRAME_INTERVAL_MS = 100;
