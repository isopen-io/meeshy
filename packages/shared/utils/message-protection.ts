/**
 * Ce qu'un message DÉCLARE de sa protection — lu depuis ses colonnes ET depuis
 * le bitfield `effectFlags`, qui portent la même information par deux chemins.
 *
 * Remonté du composeur de bannière du gateway (`protectedPreview`,
 * `notification-preview.ts`) pour #7546 : la ligne d'aperçu de la liste pose la
 * même question, et deux lectures des mêmes drapeaux divergeraient au premier
 * canal ajouté. Seule la LECTURE est commune ; la PRÉSÉANCE entre protections
 * reste au site qui compose, parce qu'elle n'y répond pas à la même question —
 * une bannière d'écran verrouillé cache un éphémère, une ligne de liste le
 * montre avec son compteur.
 */

import { MESSAGE_EFFECT_FLAGS } from '../types/message-effect-flags.js';

export type MessageProtectionInput = {
  readonly isEncrypted?: boolean | null;
  readonly isViewOnce?: boolean | null;
  readonly isBlurred?: boolean | null;
  readonly effectFlags?: number | null;
  readonly expiresAt?: Date | string | number | null;
  readonly ephemeralDuration?: number | null;
};

export type MessageProtection = {
  readonly ephemeral: boolean;
  readonly viewOnce: boolean;
  readonly blurred: boolean;
  readonly encrypted: boolean;
};

export function messageProtection(input: MessageProtectionInput): MessageProtection {
  const flags = input.effectFlags ?? 0;
  const hasDuration = typeof input.ephemeralDuration === 'number' && input.ephemeralDuration > 0;
  return {
    ephemeral: input.expiresAt != null || hasDuration || (flags & MESSAGE_EFFECT_FLAGS.EPHEMERAL) !== 0,
    viewOnce: input.isViewOnce === true || (flags & MESSAGE_EFFECT_FLAGS.VIEW_ONCE) !== 0,
    blurred: input.isBlurred === true || (flags & MESSAGE_EFFECT_FLAGS.BLURRED) !== 0,
    encrypted: input.isEncrypted === true,
  };
}

/**
 * Les effets COMPORTEMENTAUX d'un message — apparition et persistance, jamais
 * le cycle de vie (éphémère, flou, vue unique), qui est une protection.
 * Rendus dans l'ordre des bits, donc dans le même ordre sur toutes les
 * plateformes.
 */
export const BEHAVIORAL_EFFECTS = [
  'SHAKE',
  'ZOOM',
  'EXPLODE',
  'CONFETTI',
  'FIREWORKS',
  'WAOO',
  'GLOW',
  'PULSE',
  'RAINBOW',
  'SPARKLE',
] as const satisfies ReadonlyArray<keyof typeof MESSAGE_EFFECT_FLAGS>;

export type BehavioralEffect = (typeof BEHAVIORAL_EFFECTS)[number];

export function behavioralEffects(effectFlags: number | null | undefined): readonly BehavioralEffect[] {
  const flags = effectFlags ?? 0;
  return BEHAVIORAL_EFFECTS.filter((effect) => (flags & MESSAGE_EFFECT_FLAGS[effect]) !== 0);
}
