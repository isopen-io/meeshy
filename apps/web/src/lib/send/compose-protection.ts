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
 * `viewOnce` a un contrôle permanent dans la rangée haute (#7597), valable
 * pour tout ce qui part (#7498) — cette LOI reste agnostique du contrôle
 * qui l'arme.
 */
export type ComposeProtection = {
  /** Durée en SECONDES avant expiration — `undefined` = pas d'éphémère,
   * `EPHEMERAL_AFTER_READ_SECONDS` = la flamme-œil (#8304), sans échéance.
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
 * LA FLAMME-ŒIL (#8304, contrat #8302) — le choix « disparaît après lecture »
 * n'a pas de durée : il voyage dans le MÊME champ que les durées
 * (`ephemeralSeconds`), sous cette valeur réservée, pour que le brouillon, la
 * préférence collante et le rail le portent sans seconde bascule. Aucune
 * durée réelle ne vaut 0 seconde : la valeur ne peut pas être prise pour une
 * échéance — `protectionFieldsOf` ne pose jamais de durée pour elle.
 */
export const EPHEMERAL_AFTER_READ_SECONDS = 0;

export function isAfterReadChoice(seconds: number | undefined): boolean {
  return seconds === EPHEMERAL_AFTER_READ_SECONDS;
}

/**
 * `EphemeralDuration` (`CoreModels.swift:947-977`) — la flamme-œil, puis les
 * SIX durées (#8304 : 15 s ajoutée en tête des durées). `seconds` EST
 * `rawValue` : jamais une seconde échelle. Le libellé COURT (capsule fermée)
 * est un nombre neutre ; le libellé LONG (a11y, sélecteur) vit au catalogue
 * d'interface, dans les sept langues.
 */
export type EphemeralDisplayKey =
  | 'composer.ephemeral.afterRead'
  | `composer.ephemeral.duration.${15 | 30 | 60 | 300 | 3600 | 86400}`;

export type EphemeralDurationOption = {
  readonly seconds: number;
  readonly label: string;
  readonly displayKey: EphemeralDisplayKey;
  readonly afterRead?: true;
};

export const EPHEMERAL_DURATIONS: readonly EphemeralDurationOption[] = [
  { seconds: EPHEMERAL_AFTER_READ_SECONDS, label: '', displayKey: 'composer.ephemeral.afterRead', afterRead: true },
  { seconds: 15, label: '15s', displayKey: 'composer.ephemeral.duration.15' },
  { seconds: 30, label: '30s', displayKey: 'composer.ephemeral.duration.30' },
  { seconds: 60, label: '1min', displayKey: 'composer.ephemeral.duration.60' },
  { seconds: 300, label: '5min', displayKey: 'composer.ephemeral.duration.300' },
  { seconds: 3600, label: '1h', displayKey: 'composer.ephemeral.duration.3600' },
  { seconds: 86400, label: '24h', displayKey: 'composer.ephemeral.duration.86400' },
];

export function ephemeralDurationLabelOf(seconds: number): EphemeralDurationOption | undefined {
  return EPHEMERAL_DURATIONS.find((d) => d.seconds === seconds);
}

/**
 * LES CHAMPS `Message` RÉSOLUS depuis la protection choisie. Consommée par
 * `localMessageOf` (`local-message.ts`) pour que la bulle optimiste porte
 * exactement ce qui partira, ET par `bodyOf` (`perform-send.ts`) qui relit ces
 * mêmes champs plutôt que de recomposer une seconde fois depuis
 * `ComposeProtection` — un seul site de composition, deux lecteurs.
 *
 * **UNE DURÉE, JAMAIS UNE ÉCHÉANCE (#8905).** L'envoi n'est pas une
 * réception : l'expéditeur lit « en attente de réception » jusqu'à ce que la
 * passerelle lui serve `max D(u)` (`message:countdown-started`). Une échéance
 * `envoi + durée` posée ici le faisait décompter dès l'envoi — miroir
 * `MessageProtectionIntent` (SDK iOS), qui n'en calcule plus aucune.
 */
export type ProtectionFields = {
  readonly isBlurred: boolean;
  readonly isViewOnce: boolean;
  readonly effectFlags: number;
  /** Secondes entières, > 0 — absente pour un message non éphémère et pour la flamme-œil. */
  readonly ephemeralDuration?: number;
};

export function protectionFieldsOf(protection: ComposeProtection): ProtectionFields {
  // Flou et vue unique sont EXCLUSIFS (#7667) : la vue unique, plus forte,
  // gagne — second verrou derrière `toggledVeil`, miroir
  // `MessageProtectionIntent.init` (SDK iOS).
  const blurred = protection.blurred === true && protection.viewOnce !== true;
  let flags = protection.effectFlags ?? 0;
  if (blurred) flags |= MESSAGE_EFFECT_FLAGS.BLURRED;
  if (protection.ephemeralSeconds !== undefined) flags |= MESSAGE_EFFECT_FLAGS.EPHEMERAL;
  const afterRead = isAfterReadChoice(protection.ephemeralSeconds);
  if (afterRead) flags |= MESSAGE_EFFECT_FLAGS.EPHEMERAL_AFTER_READ;
  if (protection.viewOnce === true) flags |= MESSAGE_EFFECT_FLAGS.VIEW_ONCE;

  return {
    isBlurred: blurred,
    isViewOnce: protection.viewOnce === true,
    effectFlags: flags,
    ...(protection.ephemeralSeconds === undefined || afterRead
      ? {}
      : { ephemeralDuration: protection.ephemeralSeconds }),
  };
}

/**
 * L'ACCENT SUBSTITUÉ DU COMPOSEUR — la protection la plus forte colore TOUTE
 * la barre (#7667, directive porteur 2026-09-24) : éphémère > vue unique >
 * flou, miroir `ComposerProtection.dominant` (iOS) ; un effet en attente ne
 * colore que si aucune protection n'est armée, sinon `null` (l'appelant garde
 * l'accent de la conversation). Lu depuis les bascules — jamais depuis
 * `effectFlags` recomposé (qui porterait aussi les bits de cycle de vie et
 * ferait gagner « effects » sur une protection par erreur).
 */
export type ComposerAccentState = 'ephemeral' | 'viewOnce' | 'blur' | 'effects' | null;

export function composerAccentOf(protection: ComposeProtection): ComposerAccentState {
  if (protection.ephemeralSeconds !== undefined) return 'ephemeral';
  if (protection.viewOnce === true) return 'viewOnce';
  if (protection.blurred === true) return 'blur';
  if ((protection.effectFlags ?? 0) !== 0) return 'effects';
  return null;
}

/**
 * LA BASCULE D'UN VOILE (#7667) — « le message ne peut pas être flou et vue
 * unique » : armer l'un éteint l'autre, désarmer ne touche qu'à lui. Miroir
 * `ComposerProtection.togglingVeil` (iOS).
 */
export type VeilState = { readonly blurred: boolean; readonly viewOnce: boolean };

export function toggledVeil(veil: 'blurred' | 'viewOnce', state: VeilState): VeilState {
  if (veil === 'blurred') {
    const blurred = !state.blurred;
    return { blurred, viewOnce: blurred ? false : state.viewOnce };
  }
  const viewOnce = !state.viewOnce;
  return { blurred: viewOnce ? false : state.blurred, viewOnce };
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
