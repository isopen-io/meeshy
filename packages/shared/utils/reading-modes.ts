/**
 * Lois de lecture des conversations — La Lentille × Focal.
 *
 * Lois pures, sans I/O, sans dépendance de plateforme (aucune vue, aucun
 * singleton, aucun `Date.now()` — `now` est toujours injecté). Domicile
 * TypeScript partagé par les trois frontends (iOS en miroir phase 1,
 * Android en miroir phase 2).
 *
 * @see tasks/lentille-implementation-contract.md LWS-0
 * @see tasks/lentille-focal-workshop.md §4.4 (cascade d'assistance)
 * @see tasks/focal-implementation-contract.md §3.2, §5.1-5.2 (ConversationCapabilitySet — co-défini)
 */
import type { ConversationReadingMode, ReadingModePreference } from '../types/reading-modes.js';
import type { ConversationType } from '../types/conversation.js';
import type { EncryptionMode } from '../types/encryption.js';

// =============================================================================
// C-011 — resolveOrchestratorDecision
// =============================================================================

/** Pourquoi l'orchestrateur a rendu cette décision — libellé de l'encoche « AUTO · <raison> ». */
export type OrchestratorDecisionReason =
  | 'flag-disabled'
  | 'sticky'
  | 'unread-over-cap'
  | 'stale-absence'
  | 'default';

export type OrchestratorDecision = {
  readonly mode: ConversationReadingMode;
  readonly reason: OrchestratorDecisionReason;
};

/** Seuil « > 25 non-lus » qui bascule en Résumé Vivant. */
export const ORCHESTRATOR_UNREAD_CAP = 25;

/** Plancher de non-lus de la branche d'absence (« ≥ 10 »). */
export const ORCHESTRATOR_ABSENCE_UNREAD_FLOOR = 10;

/** Fenêtre d'absence du lecteur (« > 24 h »). */
export const ORCHESTRATOR_ABSENCE_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * `ReadingModePreference` est ce que l'utilisateur a choisi (mots du menu) ;
 * `ConversationReadingMode` est le mode réellement rendu. `auto` n'a pas
 * d'image ici : il rend la main aux branches numériques de la loi.
 */
const STICKY_MODE_BY_PREFERENCE: Readonly<
  Record<Exclude<ReadingModePreference, 'auto'>, ConversationReadingMode>
> = {
  focal: 'focal',
  script: 'script',
  resume: 'summary',
  riviere: 'river',
};

export type OrchestratorDecisionInput = {
  readonly unreadCount: number;
  readonly lastOpenedAt: Date | string | number | null;
  readonly now: Date | string | number;
  readonly stickyChoice: ReadingModePreference;
  /**
   * Réservé — figé par la signature du contrat (LWS-0, `lentille-implementation-contract.md`
   * §2 « Lois à extraire »). Aucun des quatre critères d'acceptation ne gate la décision par
   * le catalogue de capacités : le clamp éventuel d'un mode indisponible (ex. `summary` pour
   * un invité) est un raffinement de couche UI/produit pour un lot ultérieur (LWS-1/LWS-5),
   * pas une loi de l'orchestrateur. La loi ne lit donc pas ce champ aujourd'hui.
   */
  readonly capabilities: ReadingModeCapabilities;
  readonly isFlagEnabled: boolean;
};

const toEpochMs = (value: Date | string | number): number =>
  value instanceof Date ? value.getTime() : new Date(value).getTime();

/**
 * « Absence » = jamais ouverte (`null`) OU dernière ouverture il y a plus de
 * `ORCHESTRATOR_ABSENCE_WINDOW_MS`. Une horloge fournie illisible (NaN) est
 * traitée comme une absence plutôt que comme une distance infinie — même
 * parti pris défensif que `getUserPresenceStatus` pour `lastActiveAt`.
 */
const isReaderAbsent = (lastOpenedAt: Date | string | number | null, nowMs: number): boolean => {
  if (lastOpenedAt === null) return true;
  const lastOpenedMs = toEpochMs(lastOpenedAt);
  if (Number.isNaN(lastOpenedMs)) return true;
  return nowMs - lastOpenedMs > ORCHESTRATOR_ABSENCE_WINDOW_MS;
};

/**
 * Orchestrateur des modes de lecture. Priorité stricte, dans cet ordre :
 *
 * 1. `isFlagEnabled === false` → `'bubbles'` (mode historique — c'est le
 *    SEUL cas qui produit `'bubbles'` ; le choix collant appartient au
 *    système drapeau-on et ne s'applique pas ici).
 * 2. `stickyChoice !== 'auto'` → il gagne TOUJOURS, sur les trois branches
 *    numériques qui suivent, y compris `unreadCount > 25`.
 * 3. `unreadCount > 25` → `'summary'` (Résumé Vivant).
 * 4. absence (> 24 h depuis `lastOpenedAt`, ou jamais ouverte) ET
 *    `unreadCount >= 10` → `'summary'`.
 * 5. défaut (`unreadCount <= 25`, lecteur présent ou peu de non-lus) →
 *    `'focal'` + pont ✦.
 */
export function resolveOrchestratorDecision(input: OrchestratorDecisionInput): OrchestratorDecision {
  if (!input.isFlagEnabled) {
    return { mode: 'bubbles', reason: 'flag-disabled' };
  }

  if (input.stickyChoice !== 'auto') {
    return { mode: STICKY_MODE_BY_PREFERENCE[input.stickyChoice], reason: 'sticky' };
  }

  if (input.unreadCount > ORCHESTRATOR_UNREAD_CAP) {
    return { mode: 'summary', reason: 'unread-over-cap' };
  }

  const nowMs = toEpochMs(input.now);
  if (
    input.unreadCount >= ORCHESTRATOR_ABSENCE_UNREAD_FLOOR &&
    isReaderAbsent(input.lastOpenedAt, nowMs)
  ) {
    return { mode: 'summary', reason: 'stale-absence' };
  }

  return { mode: 'focal', reason: 'default' };
}

// =============================================================================
// C-012 — resolveCapabilities
// =============================================================================

/** Seuil de participants actifs à partir duquel la Rivière gagne son procès. */
export const RIVER_ELIGIBILITY_THRESHOLD = 5;

/** Raison structurée pour le libellé grisé (« s'ouvrira à 5 personnes actives — N aujourd'hui »). */
export type RiverEligibilityReason = {
  readonly threshold: number;
  readonly current: number;
};

export type ReadingModeIdentity = {
  /**
   * UNIQUE point de branchement invité/inscrit du chantier reading-modes.
   * Toute autre lecture d'`isAnonymous` (ou équivalent : session anonyme
   * non nulle, utilisateur authentifié absent) dans les lois de lecture —
   * ce fichier, `focus-curve.ts`, `scroll-activity.ts` — ou dans leurs
   * miroirs plateforme, est un bug de contrat.
   * @see tasks/lentille-implementation-contract.md LWS-0
   * @see tasks/focal-implementation-contract.md §5.1 (ConversationCapabilitySet.resolve, même règle côté Swift)
   */
  readonly isAnonymous: boolean;
};

export type ReadingModeCapabilities = {
  readonly availableModes: readonly ConversationReadingMode[];
  readonly riverEligible: boolean;
  readonly riverEligibilityReason: RiverEligibilityReason;
};

export type ResolveCapabilitiesInput = {
  readonly identity: ReadingModeIdentity;
  readonly isFlagEnabled: boolean;
  readonly conversationType: ConversationType;
  readonly activeParticipantCount: number;
};

/**
 * Catalogues de modes sélectionnables par identité, drapeau on. `'river'`
 * n'apparaît JAMAIS ici : le mode est « en sursis » (présent au catalogue
 * produit, jamais sélectionnable) indépendamment de `riverEligible`, qui ne
 * sert que le libellé grisé. `'summary'` (Résumé Vivant) est masqué pour un
 * invité : `GET /conversations/:id/stats` et `/analysis` sont `requiredAuth`
 * → 403 pour une session anonyme (focal-implementation-contract.md §5.2).
 * `'bubbles'` n'apparaît que drapeau éteint (branche dédiée ci-dessous).
 */
const REGISTERED_AVAILABLE_MODES: readonly ConversationReadingMode[] = ['focal', 'script', 'summary'];
const ANONYMOUS_AVAILABLE_MODES: readonly ConversationReadingMode[] = ['focal', 'script'];
const FLAG_DISABLED_AVAILABLE_MODES: readonly ConversationReadingMode[] = ['bubbles'];

/**
 * Capacités de mode de lecture pour une conversation donnée : catalogue de
 * modes sélectionnables + éligibilité Rivière (≥ 5 participants actifs,
 * jamais en `direct`), avec sa raison structurée pour le libellé grisé.
 */
export function resolveCapabilities(input: ResolveCapabilitiesInput): ReadingModeCapabilities {
  const riverEligibilityReason: RiverEligibilityReason = {
    threshold: RIVER_ELIGIBILITY_THRESHOLD,
    current: input.activeParticipantCount,
  };
  const riverEligible =
    input.activeParticipantCount >= RIVER_ELIGIBILITY_THRESHOLD &&
    input.conversationType !== 'direct';

  if (!input.isFlagEnabled) {
    return { availableModes: FLAG_DISABLED_AVAILABLE_MODES, riverEligible, riverEligibilityReason };
  }

  return {
    availableModes: input.identity.isAnonymous
      ? ANONYMOUS_AVAILABLE_MODES
      : REGISTERED_AVAILABLE_MODES,
    riverEligible,
    riverEligibilityReason,
  };
}

// =============================================================================
// C-013 — resolveAssistTier + AssistCapabilityProbing
// =============================================================================

export type AssistTier = 'localAgent' | 'serverAgent' | 'deterministic';

export type AssistTierInput = {
  readonly deviceCapability: boolean;
  readonly encryptionMode: EncryptionMode;
  readonly userConsent: boolean;
  /**
   * Réservé — figé par la signature du contrat (workshop §4.4). Aucune
   * branche de la cascade ne dépend du type de conversation aujourd'hui :
   * l'éligibilité par type (ex. DM exclues par défaut du résumé agent) est
   * une politique de configuration côté `services/agent`
   * (`eligibleConversationTypes`, `mongo-persistence.ts:421`,
   * `conversation-scanner.ts:209`) — « pas par construction » selon le
   * workshop — donc pas une règle structurelle de cette loi partagée.
   */
  readonly conversationType: ConversationType;
};

/**
 * Contrat de sonde de capacité d'agent local. Une vraie implémentation
 * plateforme (résultat mis en cache, réévalué au changement d'OS ou de
 * réglages) remplacera `neverCapableProbe` à moyen terme, sans jamais
 * changer la signature de `resolveAssistTier`.
 */
export interface AssistCapabilityProbing {
  probe(input: { readonly conversationType: ConversationType }): boolean;
}

/** Implémentation d'aujourd'hui : aucun appareil n'est jamais capable. */
export const neverCapableProbe: AssistCapabilityProbing = {
  probe: () => false,
};

/**
 * Cascade de confidentialité de l'assistance — agent local (rang 1) →
 * `services/agent` (rang 2) → pont déterministe (rang 3, plancher
 * permanent).
 *
 * GARDE NON NÉGOCIABLE (workshop §4.4) : `encryptionMode === 'e2ee'` exclut
 * le rang serveur quelle que soit la sonde de capacité ou le consentement —
 * le serveur ne détient jamais le clair d'une conversation e2ee
 * (`schema.prisma:413-416`, `signal_v3`), l'y faire résumer romprait la
 * promesse de bout en bout. Un appareil incapable en e2ee retombe
 * directement au rang 3, jamais au rang 2.
 */
export function resolveAssistTier(input: AssistTierInput): AssistTier {
  if (input.deviceCapability) return 'localAgent';
  if (input.encryptionMode === 'e2ee') return 'deterministic';
  return input.userConsent ? 'serverAgent' : 'deterministic';
}
