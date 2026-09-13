import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

/**
 * LES DIX EFFETS DÉCORATIFS — SITE UNIQUE (#6175, revue-correction défaut
 * majeur 1) : bit, libellé français et famille (entrée / permanent), DANS
 * L'ORDRE d'iOS (`EffectsPickerView.swift:65-96`).
 *
 * Avant ce fichier, la MÊME décomposition vivait à DEUX endroits qui avaient
 * déjà commencé à diverger : `compose-protection.ts` portait les DIX bits
 * SANS libellé (pour compter), `effects-sheet.tsx` portait bit + libellé
 * séparés en deux tableaux locaux SANS le nom partagé (pour choisir). Une
 * troisième déclaration — pour RENDRE l'effet sur la bulle — aurait fait
 * diverger trois listes en trois cycles, exactement le motif que le CLAUDE.md
 * racine documente pour le Prisme (trois résolveurs, trois clients, trois
 * dérives). `compose-protection.ts` et `effects-sheet.tsx` lisent désormais
 * CETTE liste.
 */
export type DecorativeEffectKind = 'entrance' | 'persistent';

export type DecorativeEffect = {
  readonly flag: number;
  readonly label: string;
  readonly kind: DecorativeEffectKind;
};

export const DECORATIVE_EFFECTS: readonly DecorativeEffect[] = [
  { flag: MESSAGE_EFFECT_FLAGS.SHAKE, label: 'Secousse', kind: 'entrance' },
  { flag: MESSAGE_EFFECT_FLAGS.ZOOM, label: 'Zoom', kind: 'entrance' },
  { flag: MESSAGE_EFFECT_FLAGS.EXPLODE, label: 'Explosion', kind: 'entrance' },
  { flag: MESSAGE_EFFECT_FLAGS.CONFETTI, label: 'Confettis', kind: 'entrance' },
  { flag: MESSAGE_EFFECT_FLAGS.FIREWORKS, label: "Feux d'artifice", kind: 'entrance' },
  { flag: MESSAGE_EFFECT_FLAGS.WAOO, label: 'Waouh', kind: 'entrance' },
  { flag: MESSAGE_EFFECT_FLAGS.GLOW, label: 'Lueur', kind: 'persistent' },
  { flag: MESSAGE_EFFECT_FLAGS.PULSE, label: 'Pulsation', kind: 'persistent' },
  { flag: MESSAGE_EFFECT_FLAGS.RAINBOW, label: 'Arc-en-ciel', kind: 'persistent' },
  { flag: MESSAGE_EFFECT_FLAGS.SPARKLE, label: 'Scintillant', kind: 'persistent' },
];

/** Les effets décoratifs ACTIFS d'un bitfield, dans l'ordre ci-dessus —
 * jamais l'ordre d'itération des bits (qui ne dit rien de l'ordre iOS). */
export function activeDecorativeEffects(effectFlags: number | undefined): readonly DecorativeEffect[] {
  const flags = effectFlags ?? 0;
  return DECORATIVE_EFFECTS.filter((effect) => (flags & effect.flag) !== 0);
}
