import {
  resolveCapabilities,
  resolveOrchestratorDecision,
  type OrchestratorDecisionReason,
  type ReadingModeCapabilities,
  type RiverEligibilityReason,
} from '@meeshy/shared/utils/reading-modes';
import type { ConversationReadingMode, ReadingModePreference } from '@meeshy/shared/types/reading-modes';
import type { ConversationType } from '@meeshy/shared/types/conversation';

import { apiConfig } from '@/lib/api/config';

/**
 * LA LOI DE CHOIX DU FIL — le domicile de la décision reste
 * `packages/shared/utils/reading-modes.ts` (D-14) : ce fichier ne réécrit
 * RIEN de la loi, il la CONSOMME avec le catalogue de CET écran, exactement
 * comme `ReadingModeController` (iOS, `Focal/Preferences/`) enveloppe la même
 * loi gelée avec le stockage local.
 *
 * `THREAD_RENDERABLE_MODES` est le catalogue que la v3.1 sait DESSINER
 * aujourd'hui : `focal` (D-7, le défaut), `script` (même rangée plate, sans
 * perspective) et `summary` (le Résumé Vivant, #5695 — D-21 : un corpus qui
 * l'ATTEINT, le gate DOM inversé, le cadrage des dates par la langue du
 * lecteur). `river` (Rivière) reste LISTÉ au menu (`catalog.ts`) mais hors
 * de ce catalogue de rendu — la loi partagée le CLAMPE donc elle-même sur
 * `focal`/`clamped-unavailable` (D-8 : jamais un mode qu'on ne sait pas
 * rendre). Aucune réécriture de la loi n'est nécessaire : c'est le
 * mécanisme même que `resolveOrchestratorDecision` expose pour ça.
 */
export const THREAD_RENDERABLE_MODES: readonly ConversationReadingMode[] = ['focal', 'script', 'summary'];

export type ThreadCapabilities = {
  readonly availableModes: readonly ConversationReadingMode[];
  readonly riverEligibilityReason: RiverEligibilityReason;
};

/**
 * Le catalogue de CET écran : les modes rendables (`THREAD_RENDERABLE_MODES`)
 * bornés à ceux que la loi partagée accorde à cette identité — DÉSORMAIS
 * OBSERVABLE (#5695) : `summary` est dans `THREAD_RENDERABLE_MODES`, et un
 * invité le perd via CETTE intersection (la loi partagée retire `summary`
 * du catalogue anonyme, `reading-modes.ts:284-285` — 403 serveur sur
 * `/conversations/:id/analysis`) plutôt qu'en amont.
 *
 * `activeParticipantCount: null` — la v3.1 n'a AUCUNE source de ce compte
 * aujourd'hui (comme iOS avant G-123) : le mentir en `0` afficherait
 * « 0 aujourd'hui » au menu. `riverEligibilityReason` reste servie dans tous
 * les cas (drapeau Rivière off compris) : c'est elle qui alimente le libellé
 * grisé de `catalog.ts`.
 *
 * `readingModesEnabled` — LE PARAMÈTRE DE CONSTRUCTION (D-20,
 * `VITE_READING_MODES`, miroir `MEESHY_FLAG_READING_MODES`). Défaut
 * `apiConfig.readingModesEnabled` quand l'appelant ne le précise pas — un
 * témoin peut l'injecter, l'écran ne le fait jamais. Drapeau éteint ⇒
 * `resolveCapabilities` rend `['bubbles']`, hors `THREAD_RENDERABLE_MODES` :
 * `availableModes` ressort donc VIDE, jamais `['focal', 'script']` comme si
 * le drapeau était toujours ON.
 */
export function threadCapabilities(input: {
  readonly isAnonymous: boolean;
  readonly conversationType: ConversationType;
  readonly readingModesEnabled?: boolean;
}): ThreadCapabilities {
  const full = resolveCapabilities({
    identity: { isAnonymous: input.isAnonymous },
    isFlagEnabled: input.readingModesEnabled ?? apiConfig.readingModesEnabled,
    conversationType: input.conversationType,
    activeParticipantCount: null,
  });
  return {
    availableModes: full.availableModes.filter((mode) => THREAD_RENDERABLE_MODES.includes(mode)),
    riverEligibilityReason: full.riverEligibilityReason,
  };
}

export type ResolveThreadModeInput = {
  readonly unreadCount: number;
  readonly lastOpenedAt: Date | string | number | null;
  readonly now: Date | string | number;
  readonly sticky: ReadingModePreference;
  readonly isAnonymous: boolean;
  readonly conversationType: ConversationType;
  /** Défaut `apiConfig.readingModesEnabled` — voir doc-comment de `threadCapabilities`. */
  readonly readingModesEnabled?: boolean;
};

/** Les deux modes que la RANGÉE PLATE rend ; `bubbles` garde la peau bulle. */
export type FlatRowMode = 'focal' | 'script';

export type ThreadModeDecision = {
  readonly mode: FlatRowMode | 'bubbles' | 'summary';
  readonly reason: OrchestratorDecisionReason;
};

/**
 * RÈGLE DE RENDU (miroir de `ReadingModeController.renderDecision`,
 * `Focal/Preferences/ReadingModeController.swift:120-127`) : un choix collant
 * `bulles` drapeau ON est RENDU `bubbles`/`sticky`, là où la loi partagée le
 * clampe sur `focal`/`clamped-unavailable` (« bubbles » n'appartient à AUCUN
 * catalogue drapeau-on). La loi reste INTACTE — cette règle vit à la
 * CONSOMMATION, pas dans `resolveOrchestratorDecision`.
 *
 * ORDRE (D-20, miroir `ReadingModeOrchestrator.resolveOrchestratorDecision`,
 * table de priorité Swift — branche 1 AVANT branche 2) : le drapeau éteint
 * PRIME sur le choix collant, y compris `sticky === 'bulles'`. La loi partagée
 * le garantit déjà (`isFlagEnabled: false` court-circuite AVANT
 * `stickyChoice`), donc `lawDecision.mode === 'bubbles'` ne peut provenir que
 * de CETTE branche — un `bulles` collant drapeau ON est toujours CLAMPÉ par
 * la loi (`'bubbles'` n'appartient à aucun catalogue drapeau-on) avant
 * d'atteindre ce point. Tester `lawDecision.mode` plutôt que relire le
 * drapeau une seconde fois évite qu'une re-vérification diverge de la loi.
 */
export function resolveThreadMode(input: ResolveThreadModeInput): ThreadModeDecision {
  const readingModesEnabled = input.readingModesEnabled ?? apiConfig.readingModesEnabled;
  const capabilities = threadCapabilities({ ...input, readingModesEnabled });
  const orchestratorCapabilities: ReadingModeCapabilities = {
    availableModes: capabilities.availableModes,
    riverEligible: capabilities.riverEligibilityReason.riverReason === 'eligible',
    riverEligibilityReason: capabilities.riverEligibilityReason,
  };

  const lawDecision = resolveOrchestratorDecision({
    unreadCount: input.unreadCount,
    lastOpenedAt: input.lastOpenedAt,
    now: input.now,
    stickyChoice: input.sticky,
    capabilities: orchestratorCapabilities,
    isFlagEnabled: readingModesEnabled,
  });

  if (lawDecision.mode === 'bubbles') {
    return { mode: 'bubbles', reason: lawDecision.reason };
  }

  if (input.sticky === 'bulles') {
    return { mode: 'bubbles', reason: 'sticky' };
  }

  if (usesFlatRow(lawDecision.mode)) {
    return { mode: lawDecision.mode, reason: lawDecision.reason };
  }

  /**
   * `summary` (#5695) — la loi ne rend ce mode que si `threadCapabilities`
   * l'a laissé dans `availableModes`, ce qui exige `isAnonymous: false`
   * (§9 question, `reading-modes.ts:284-285`) : un invité à 26 non-lus ne
   * traverse JAMAIS cette branche, la loi l'a déjà clampé sur `focal` avant
   * d'y arriver (`REGISTERED_AVAILABLE_MODES` vs `ANONYMOUS_AVAILABLE_MODES`).
   */
  if (lawDecision.mode === 'summary') {
    return { mode: 'summary', reason: lawDecision.reason };
  }

  /**
   * Reste ATTEIGNABLE pour UNE raison désormais : `riviere` (Rivière)
   * collant seul — drapeau ON, catalogue de rendu web (`focal`/`script`/
   * `summary`), sur lequel la loi clampe elle-même. Le repli
   * `focal`/`clamped-unavailable` reste juste pour CE cas ; le drapeau éteint
   * ne l'atteint plus jamais (retenu par le premier `if` ci-dessus). ÉCRIT
   * plutôt que CASTÉ : le jour où `THREAD_RENDERABLE_MODES` s'élargit, c'est
   * cette ligne qu'on relit, là où un `as` aurait menti en silence.
   */
  return { mode: 'focal', reason: 'clamped-unavailable' };
}

/**
 * `focal` et `script` partagent la rangée plate ; `bubbles` reste la bulle
 * historique. GARDE DE TYPE, et pas un simple booléen : c'est elle qui
 * dispense les appelants (ici et `thread.tsx`) d'une assertion `as`.
 */
export function usesFlatRow(mode: ConversationReadingMode): mode is FlatRowMode {
  return mode === 'focal' || mode === 'script';
}

/**
 * TRADUCTION mode RENDU (mémorisé par `store.ts`) ⇄ préférence (les mots du
 * menu) — miroir de `ReadingModePreferenceMapping` (iOS,
 * `Focal/Preferences/ReadingModePreferenceStore.swift:150-180`). `null`
 * (rien de mémorisé) ⇔ `'auto'` : « revenir en mode auto » EFFACE la clé,
 * ce n'est jamais un troisième état à interpréter.
 */
export function toStickyPreference(mode: ConversationReadingMode | null): ReadingModePreference {
  if (mode === null) return 'auto';
  switch (mode) {
    case 'focal':
      return 'focal';
    case 'script':
      return 'script';
    case 'summary':
      return 'resume';
    case 'river':
      return 'riviere';
    case 'bubbles':
      return 'bulles';
  }
}

/** Réciproque de `toStickyPreference` — ce que `store.ts` mémorise pour une préférence choisie. */
export function toStoredMode(preference: ReadingModePreference): ConversationReadingMode | null {
  switch (preference) {
    case 'auto':
      return null;
    case 'focal':
      return 'focal';
    case 'script':
      return 'script';
    case 'resume':
      return 'summary';
    case 'riviere':
      return 'river';
    case 'bulles':
      return 'bubbles';
  }
}
