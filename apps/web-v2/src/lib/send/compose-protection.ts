import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

import { DECORATIVE_EFFECTS } from '@/lib/effects';

/**
 * LA LOI DE PROTECTION D'UN MESSAGE À L'ENVOI (#6175) — miroir de la
 * recomposition serveur (`messages-send.ts:240-245`) : le SITE UNIQUE qui
 * combine les trois bascules de la rangée haute (éphémère, flou, effets) en
 * les quatre champs du fil `Message` (`isBlurred`, `expiresAt`,
 * `effectFlags`, `isViewOnce`) — mêmes bits, même composition, pour que la
 * bulle optimiste et le corps envoyé au serveur portent TOUJOURS la même
 * vérité (D-41 : ce qu'on envoie flouté se rend flouté chez soi).
 *
 * `viewOnce` n'a AUCUN contrôle dans la rangée haute d'une conversation
 * standard (`showViewOnce: previewMode`, réservé au composeur de
 * prévisualisation de notification, iOS) — la loi le porte quand même, fail
 * pour l'avenir et pour que le témoin de la charge (`perform-send.test.ts`)
 * puisse prouver que la loi ELLE-MÊME sait le composer, même sans bouton
 * (loi 4 : un CONTRÔLE sans effet ne se rend pas, mais une LOI sans contrôle
 * peut très bien exister — elle sert d'autres composeurs, `EffectsPickerView`
 * côté iOS).
 */
export type ComposeProtection = {
  /** Durée en SECONDES avant expiration — `undefined` = pas d'éphémère.
   * Miroir de `EphemeralDuration.rawValue` (`CoreModels.swift:947-977`). */
  readonly ephemeralSeconds?: number;
  readonly blurred?: boolean;
  readonly viewOnce?: boolean;
  /** Bits DÉCORATIFS uniquement (animations d'entrée + effets permanents,
   * `MESSAGE_EFFECT_FLAGS.SHAKE` à `SPARKLE`) — jamais les bits de cycle de
   * vie (`EPHEMERAL`/`BLURRED`/`VIEW_ONCE`), composés séparément par cette
   * loi à partir des trois champs ci-dessus (§1.2 point 3 de la
   * spécification #6175 : une seule porte pour chaque fait). */
  readonly effectFlags?: number;
};

/** Aucune protection choisie — identité STABLE pour les appelants qui
 * omettent `protection` (même discipline que `NO_PREFERRED_LANGUAGES`,
 * `composer.tsx`). */
export const NO_PROTECTION: ComposeProtection = {};

/**
 * `EphemeralDuration` (`CoreModels.swift:947-977`) — les CINQ durées et leurs
 * DEUX libellés (court, pour la capsule fermée ; long, pour l'a11y et le
 * sélecteur). `seconds` EST `rawValue` : jamais une seconde échelle.
 */
export type EphemeralDurationOption = {
  readonly seconds: number;
  readonly label: string;
  readonly displayLabel: string;
};

export const EPHEMERAL_DURATIONS: readonly EphemeralDurationOption[] = [
  { seconds: 30, label: '30s', displayLabel: '30 secondes' },
  { seconds: 60, label: '1min', displayLabel: '1 minute' },
  { seconds: 300, label: '5min', displayLabel: '5 minutes' },
  { seconds: 3600, label: '1h', displayLabel: '1 heure' },
  { seconds: 86400, label: '24h', displayLabel: '24 heures' },
];

export function ephemeralDurationLabelOf(seconds: number): EphemeralDurationOption | undefined {
  return EPHEMERAL_DURATIONS.find((d) => d.seconds === seconds);
}

/**
 * LES CHAMPS `Message` RÉSOLUS depuis la protection choisie, À L'INSTANT
 * `now` (évalué UNE fois, à la création du message local — jamais relu au
 * renvoi, miroir `EphemeralDuration.expiresAt` évaluée « à l'ENVOI »,
 * `CoreModels.swift:977`). Consommée par `localMessageOf` (`local-message.ts`)
 * pour que la bulle optimiste porte exactement ce qui partira, ET par
 * `bodyOf` (`perform-send.ts`) qui relit ces mêmes champs plutôt que de
 * recomposer une seconde fois depuis `ComposeProtection` — un seul site de
 * composition, deux lecteurs.
 */
export type ProtectionFields = {
  readonly isBlurred: boolean;
  readonly isViewOnce: boolean;
  readonly effectFlags: number;
  readonly expiresAt?: Date;
};

export function protectionFieldsOf(protection: ComposeProtection, now: number): ProtectionFields {
  let flags = protection.effectFlags ?? 0;
  if (protection.blurred === true) flags |= MESSAGE_EFFECT_FLAGS.BLURRED;
  if (protection.ephemeralSeconds !== undefined) flags |= MESSAGE_EFFECT_FLAGS.EPHEMERAL;
  if (protection.viewOnce === true) flags |= MESSAGE_EFFECT_FLAGS.VIEW_ONCE;

  return {
    isBlurred: protection.blurred === true,
    isViewOnce: protection.viewOnce === true,
    effectFlags: flags,
    ...(protection.ephemeralSeconds === undefined
      ? {}
      : { expiresAt: new Date(now + protection.ephemeralSeconds * 1000) }),
  };
}

/**
 * L'ACCENT SUBSTITUÉ DU COMPOSEUR — miroir `composerAccent`
 * (`ConversationView+Composer.swift:49-59`) : éphémère armé PRIME sur flou,
 * qui PRIME sur un effet en attente, sinon `null` (l'appelant garde alors
 * l'accent de la conversation). Lu depuis les TROIS bascules — jamais depuis
 * `effectFlags` recomposé (qui porterait aussi les bits de cycle de vie et
 * ferait gagner « effects » sur « ephemeral »/« blur » par erreur).
 */
export type ComposerAccentState = 'ephemeral' | 'blur' | 'effects' | null;

export function composerAccentOf(protection: ComposeProtection): ComposerAccentState {
  if (protection.ephemeralSeconds !== undefined) return 'ephemeral';
  if (protection.blurred === true) return 'blur';
  if ((protection.effectFlags ?? 0) !== 0) return 'effects';
  return null;
}

/**
 * LE COMPTEUR DE CARACTÈRES — loi PURE, non câblée cette itération (§1.2
 * point 2 de la spécification #6175) : iOS n'en rend aucun en conversation
 * (`ComposerMode.message.maxLength == nil`) et aucune source honnête de la
 * limite n'est atteignable côté client (`MAX_MESSAGE_LENGTH` de
 * `@meeshy/shared` DIVERGE de la limite serveur effective — issue gateway
 * compagnon). La fonction existe pour le jour où `maxLength` sera fourni
 * (compteur passé en prop, jamais un littéral) : `null` tant qu'aucune limite
 * n'est donnée, ou sous 80 % — miroir `UniversalComposerBar+Toolbar.swift:71-79`.
 */
export type CharacterCounter = { readonly text: string; readonly overflow: boolean };

/** Le NOMBRE d'effets décoratifs actifs — la capsule de la rangée haute
 * l'affiche, jamais un booléen (miroir `effectsToggleButton`,
 * `+Toolbar.swift`, `nonzeroBitCount`). Compte depuis `DECORATIVE_EFFECTS`
 * (`lib/effects.ts`) — le SITE UNIQUE des dix bits décoratifs, aussi lu par
 * `effects-sheet.tsx` (le choix) et par le rendu du fil (`message-blocks.tsx`,
 * revue-correction #6175 défaut majeur 1). */
export function decorativeEffectCountOf(effectFlags: number): number {
  return DECORATIVE_EFFECTS.filter((effect) => (effectFlags & effect.flag) !== 0).length;
}

export function characterCounterOf(input: { readonly text: string; readonly maxLength?: number }): CharacterCounter | null {
  const { text, maxLength } = input;
  if (maxLength === undefined) return null;
  const count = text.length;
  if (count <= Math.floor(maxLength * 0.8)) return null;
  return { text: `${count}/${maxLength}`, overflow: count >= maxLength };
}
