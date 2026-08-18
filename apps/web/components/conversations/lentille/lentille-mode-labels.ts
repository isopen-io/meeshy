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
import type { ConversationBridge } from '@meeshy/shared/types/conversation-bridge';
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
 * R6-5 — projection INVERSE de `toBridgeSuggestedMode`
 * (`packages/shared/utils/reading-modes.ts`) : `bridge.suggestedMode` n'est
 * PAS une nouvelle loi, c'est déjà un mode RENDU légal (le sous-ensemble
 * `'focal' | 'resume'` que la loi projette), reçu tel quel du wire. Cette
 * fonction ne fait que le reconvertir vers le vocabulaire de
 * `decisionModeLabel` (`ConversationReadingMode`) pour partager EXACTEMENT
 * les mêmes clés i18n que le recalcul local — jamais un second nommage.
 * `'resume'` → `'summary'` (même mot, deux catalogues voisins,
 * cf. `ConversationReadingMode` vs `ConversationBridge.suggestedMode`) ;
 * `'focal'` → `'focal'`, identité.
 */
function bridgeSuggestedRenderMode(suggestedMode: ConversationBridge['suggestedMode']): ConversationReadingMode {
  return suggestedMode === 'resume' ? 'summary' : 'focal';
}

/**
 * Texte de l'encoche (critère LWS-8 : « elle affiche "AUTO · <décision
 * courante>" — l'utilisateur voit ce qui VA se passer, pas une étiquette
 * générique »).
 *
 * Préférence `auto` ⇒ prévision « AUTO · <décision> ». Mode mémorisé ⇒ le
 * nom du mode SEUL : ce n'est plus une prévision mais un CHIP, l'orchestrateur
 * étant débrayé pour cette conversation.
 *
 * R6-5 — HIÉRARCHIE SERVEUR PUIS LOCAL, jamais l'inverse : `suggestedMode`
 * (`conversation.bridge?.suggestedMode`, précalculé par les 3 producteurs —
 * gateway `ConversationBridgeService`, substitut `LocalBridgeProvider`, iOS
 * `LentilleProviders` — via la MÊME loi que `decision`) PRIME quand il est
 * PRÉSENT. `decision.mode` (le recalcul LOCAL de ce composant,
 * `resolveOrchestratorDecision` rejoué sur les données déjà en main) reste le
 * SEUL repli quand `suggestedMode` est ABSENT (aucun pont sur cette
 * conversation) — jamais un vide, jamais une valeur inventée : c'est
 * exactement ce que `resolveOrchestratorDecision` aurait rendu ici de toute
 * façon, avant ce branchement.
 *
 * Q142-c (2026-08-18, TRANCHÉE) — LES DEUX PRIMENT SOUS `isReadingModesFlagActive`.
 * Ni `suggestedMode` ni `decision.mode` ne connaissent le défaut provisoire
 * « Bulles » du fil WEB (`PROVISIONAL_DEFAULT_RENDER`,
 * `hooks/lentille/use-thread-reading-mode.ts`) : c'est une décision
 * exclusivement web, jamais amendée dans la loi partagée que gateway/iOS/le
 * recalcul local appellent tous les trois. Sans choix explicite du lecteur
 * (`preference === 'auto'`) ET le drapeau du fil (`useReadingModesFlag`) allumé, OUVRIR cette
 * conversation dans le fil web rend les bulles — quoi que `suggestedMode` ou
 * `decision.mode` aient prédit. `isReadingModesFlagActive` (résolu par
 * l'appelant, `LentillePeek`, jamais recalculé ici) fait donc primer «
 * Bulles » sur les deux avant même de les regarder : DÉFAUT à `false`, donc
 * AUCUN appelant existant n'est affecté tant qu'il ne fournit pas ce
 * cinquième argument (non-régression R6-4/R6-5).
 *
 * @see hooks/lentille/use-thread-reading-mode.ts (`useThreadActiveReadingMode`)
 *      — même correction, pour `LensSwitcher`.
 */
export function notchText(
  decision: OrchestratorDecision,
  preference: ReadingModePreference,
  t: LentilleRowTranslate,
  suggestedMode?: ConversationBridge['suggestedMode'] | null,
  isReadingModesFlagActive = false
): string {
  if (preference !== 'auto') return preferenceLabel(preference, t);
  if (isReadingModesFlagActive) {
    return t('lentille.modes.autoBadge', { decision: decisionModeLabel('bubbles', t) });
  }
  const mode = suggestedMode != null ? bridgeSuggestedRenderMode(suggestedMode) : decision.mode;
  return t('lentille.modes.autoBadge', { decision: decisionModeLabel(mode, t) });
}
