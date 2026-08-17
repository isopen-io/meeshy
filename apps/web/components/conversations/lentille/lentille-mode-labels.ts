/**
 * `lentille-mode-labels` — WL-108 (LWS-8 « encoche actionnable », LWS-11).
 *
 * Source UNIQUE des noms de mode pour les surfaces web qui les affichent —
 * jumeau exact de `LentilleModeLabels.swift` (I-071/I-072) et sa raison
 * d'être, mot pour mot : « les trois DOIVENT nommer un même mode de la même
 * façon, sinon "AUTO · Focal" sur la carte et "Focale" dans le menu
 * raconteraient deux histoires différentes de la même décision. »
 *
 * Fonctions PURES : elles reçoivent le `t` déjà scopé (`useI18n
 * ('conversations')`), comme `LentilleRow`/`ReadingModeMenu` — jamais
 * d'appel à `useI18n` ici, ce qui les rend testables sans rendu.
 *
 * Les CLÉS ne sont pas neuves (re-prouvé, `apps/web/locales/<locale>/
 * conversations.json`) : `lentille.modes.{auto,focal,script,resume,riviere}` et
 * `lentille.modes.autoBadge` = « AUTO · {decision} » ont été posées par
 * S-005 et sont déjà verrouillées par `__tests__/locales/lentille-i18n-keys
 * .test.ts`. Ce module les CENTRALISE ; `ReadingModeMenu` les épelait en
 * ligne, il les consomme désormais ici (mêmes clés, même rendu).
 *
 * Seule `lentille.modes.bubbles` est ajoutée par WL-108 — le pendant du
 * `lentille.mode.name.bubbles` iOS, pour la même raison DÉFENSIVE : rendre
 * `decisionModeLabel` exhaustif sur `ConversationReadingMode` plutôt que de
 * prétendre un cas inatteignable. `bubbles` est la décision du drapeau
 * ÉTEINT (`resolveOrchestratorDecision`, branche `flag-disabled`) et la
 * carte de focus n'existe que drapeau ALLUMÉ : la clé ne devrait jamais
 * s'afficher, et elle existe quand même.
 *
 * @see tasks/lentille-implementation-contract.md LWS-8
 * @see apps/ios/Meeshy/Features/Main/Lentille/Mode/LentilleModeLabels.swift
 */
import type { ConversationReadingMode, ReadingModePreference } from '@meeshy/shared/types/reading-modes';
import type { OrchestratorDecision } from '@meeshy/shared/utils/reading-modes';
import type { LentilleRowTranslate } from './LentilleRow';

/**
 * Clé i18n du nom d'une PRÉFÉRENCE (mots du menu, chip d'un mode forcé).
 *
 * AMENDEMENT S1 (REV-4bis/B2) — `bulles` RÉUTILISE `lentille.modes.bubbles`,
 * la clé que WL-108 avait déjà posée pour le mode RENDU homonyme (voir
 * `DECISION_LABEL_KEY` ci-dessous, et la note de tête de ce fichier). Aucune
 * clé neuve n'est créée : c'est le même mot pour le lecteur, et `bulles`
 * n'est offert par AUCUN des trois chemins d'entrée du menu de mode
 * (`ReadingModeMenu`, catalogue inchangé) — seul le sélecteur historique
 * `LensSwitcher` l'écrit, drapeau éteint. La table reste TOTALE sur
 * l'énumération amendée, ce qui est sa seule raison d'exister :
 * `preferenceLabel` ne doit jamais rendre `undefined`.
 */
const PREFERENCE_LABEL_KEY: Readonly<Record<ReadingModePreference, string>> = {
  auto: 'lentille.modes.auto',
  focal: 'lentille.modes.focal',
  script: 'lentille.modes.script',
  resume: 'lentille.modes.resume',
  riviere: 'lentille.modes.riviere',
  bulles: 'lentille.modes.bubbles',
};

/**
 * Clé i18n du nom d'un mode RENDU (`OrchestratorDecision.mode`). Le
 * catalogue des modes rendus et celui des préférences ne coïncident pas :
 * `auto` n'est pas un mode (il rend la main à la loi), `summary`/`river`
 * portent les noms `resume`/`riviere` côté menu, et `bubbles` n'a pas de
 * préférence correspondante.
 */
const DECISION_LABEL_KEY: Readonly<Record<ConversationReadingMode, string>> = {
  focal: 'lentille.modes.focal',
  script: 'lentille.modes.script',
  summary: 'lentille.modes.resume',
  river: 'lentille.modes.riviere',
  bubbles: 'lentille.modes.bubbles',
};

/** Nom d'une préférence — le libellé du menu ET du chip d'un mode forcé. */
export function preferenceLabel(preference: ReadingModePreference, t: LentilleRowTranslate): string {
  return t(PREFERENCE_LABEL_KEY[preference]);
}

/** Nom du mode que l'orchestrateur a RÉELLEMENT rendu — utilisé dans « AUTO · … » seulement. */
export function decisionModeLabel(mode: ConversationReadingMode, t: LentilleRowTranslate): string {
  return t(DECISION_LABEL_KEY[mode]);
}

/**
 * Texte de l'encoche (critère LWS-8 : « elle affiche "AUTO · <décision
 * courante>" — l'utilisateur voit ce qui VA se passer, pas une étiquette
 * générique »).
 *
 * Préférence `auto` ⇒ prévision « AUTO · <décision> ». Mode mémorisé ⇒ le
 * nom du mode SEUL : ce n'est plus une prévision mais un CHIP, l'orchestrateur
 * étant débrayé pour cette conversation.
 */
export function notchText(
  decision: OrchestratorDecision,
  preference: ReadingModePreference,
  t: LentilleRowTranslate
): string {
  if (preference !== 'auto') return preferenceLabel(preference, t);
  return t('lentille.modes.autoBadge', { decision: decisionModeLabel(decision.mode, t) });
}
