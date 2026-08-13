import { MESSAGE_EFFECT_FLAGS, hasEffect } from '@meeshy/shared/types/message-effect-flags';

/**
 * Ce qu'il faut RÉELLEMENT rendre pour un message, ici et maintenant.
 *
 * Miroir web de `MessageEffectPlan`
 * (`packages/MeeshySDK/Sources/MeeshySDK/Models/MessageEffects.swift`). Les deux
 * plateformes lisent le MÊME bitfield `effectFlags` persisté par le gateway :
 * elles doivent en tirer les mêmes conclusions, sinon le même message pétille
 * sur iPhone et reste inerte dans le navigateur. Toute évolution de la règle
 * touche les deux sites.
 */

export type AppearanceEffect = 'shake' | 'zoom' | 'explode' | 'confetti' | 'fireworks' | 'waoo';
export type PersistentEffect = 'glow' | 'pulse' | 'rainbow' | 'sparkle';

export interface MessageEffectPlan {
  /** Effets one-shot à jouer MAINTENANT (vide s'ils ont déjà joué). */
  readonly appearance: readonly AppearanceEffect[];
  /** Effets continus à rendre. */
  readonly persistent: readonly PersistentEffect[];
  /** `false` sous `prefers-reduced-motion` : les persistants sont rendus FIXES. */
  readonly animatesPersistent: boolean;
  /** `true` quand il n'y a rien à rendre — l'appelant NE DOIT PAS envelopper sa vue. */
  readonly isEmpty: boolean;
}

const APPEARANCE_BITS: ReadonlyArray<readonly [AppearanceEffect, number]> = [
  ['shake', MESSAGE_EFFECT_FLAGS.SHAKE],
  ['zoom', MESSAGE_EFFECT_FLAGS.ZOOM],
  ['explode', MESSAGE_EFFECT_FLAGS.EXPLODE],
  ['confetti', MESSAGE_EFFECT_FLAGS.CONFETTI],
  ['fireworks', MESSAGE_EFFECT_FLAGS.FIREWORKS],
  ['waoo', MESSAGE_EFFECT_FLAGS.WAOO],
];

const PERSISTENT_BITS: ReadonlyArray<readonly [PersistentEffect, number]> = [
  ['glow', MESSAGE_EFFECT_FLAGS.GLOW],
  ['pulse', MESSAGE_EFFECT_FLAGS.PULSE],
  ['rainbow', MESSAGE_EFFECT_FLAGS.RAINBOW],
  ['sparkle', MESSAGE_EFFECT_FLAGS.SPARKLE],
];

/**
 * Effets persistants qui gardent du sens en rendu FIXE.
 *
 * `pulse` et `sparkle` sont du mouvement pur — figés ils ne veulent plus rien
 * dire — donc ils sont retirés plutôt que rendus inertes. Identique au
 * `reduceMotionSafeMask` Swift.
 */
const REDUCE_MOTION_SAFE: ReadonlySet<PersistentEffect> = new Set<PersistentEffect>(['glow', 'rainbow']);

export interface ResolveOptions {
  readonly hasPlayedAppearance: boolean;
  readonly reduceMotion: boolean;
}

export function resolveMessageEffectPlan(
  effectFlags: number | undefined | null,
  { hasPlayedAppearance, reduceMotion }: ResolveOptions,
): MessageEffectPlan {
  const flags = typeof effectFlags === 'number' && Number.isFinite(effectFlags) ? effectFlags : 0;

  const appearance: AppearanceEffect[] =
    flags <= 0 || hasPlayedAppearance || reduceMotion
      ? []
      : APPEARANCE_BITS.filter(([, bit]) => hasEffect(flags, bit)).map(([name]) => name);

  const persistent: PersistentEffect[] =
    flags <= 0
      ? []
      : PERSISTENT_BITS.filter(([name, bit]) => hasEffect(flags, bit) && (!reduceMotion || REDUCE_MOTION_SAFE.has(name)))
          .map(([name]) => name);

  return {
    appearance,
    persistent,
    animatesPersistent: !reduceMotion,
    isEmpty: appearance.length === 0 && persistent.length === 0,
  };
}

/**
 * Classes CSS portant les effets (définies dans `app/globals.css`).
 *
 * Les effets one-shot sont des animations `forwards` à durée finie ; les
 * persistants bouclent, sauf sous `-static` où ils rendent la même intention
 * sans mouvement.
 */
export function messageEffectClassNames(plan: MessageEffectPlan): string[] {
  const classes = plan.appearance.map((effect) => `msg-fx-${effect}`);
  for (const effect of plan.persistent) {
    classes.push(plan.animatesPersistent ? `msg-fx-${effect}` : `msg-fx-${effect}-static`);
  }
  return classes;
}

/** Effets rendus par des particules superposées plutôt que par du CSS sur la bulle. */
export function messageEffectOverlays(plan: MessageEffectPlan): AppearanceEffect[] {
  return plan.appearance.filter((e): e is AppearanceEffect => e === 'confetti' || e === 'fireworks');
}
