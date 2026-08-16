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
  | 'clamped-unavailable'
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
   * Le catalogue BORNE la décision, drapeau on : la loi ne rend jamais un mode
   * que l'écran ne saurait pas ouvrir (REV-1, blocage 3). Un invité poussé en
   * Résumé Vivant s'ouvrirait sur un 403 de `/conversations/:id/analysis`
   * (`focal-implementation-contract.md` §5.2) ; un choix collant `riviere`
   * mémorisé avant l'extinction du drapeau Rivière rendrait un mode que
   * personne ne sait dessiner. Voir `resolveOrchestratorDecision`.
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
 * Repli du clamp : `'focal'` est le PLANCHER de la loi, présent dans tous les
 * catalogues drapeau-on (`REGISTERED_AVAILABLE_MODES`,
 * `ANONYMOUS_AVAILABLE_MODES`). C'est aussi pourquoi la branche par défaut
 * n'est pas clampée : elle rend déjà le repli, et se clamper soi-même serait
 * circulaire.
 */
const CLAMP_FALLBACK_MODE: ConversationReadingMode = 'focal';

/**
 * Borne une décision naturelle au catalogue du lecteur. Hors catalogue ⇒
 * repli `'focal'` avec sa raison dédiée, pour que l'encoche « AUTO · … » dise
 * la vérité : le mode n'a pas été choisi, il a été rabattu.
 */
const clampToCapabilities = (
  decision: OrchestratorDecision,
  capabilities: ReadingModeCapabilities,
): OrchestratorDecision =>
  capabilities.availableModes.includes(decision.mode)
    ? decision
    : { mode: CLAMP_FALLBACK_MODE, reason: 'clamped-unavailable' };

/**
 * Orchestrateur des modes de lecture. Priorité stricte, dans cet ordre :
 *
 * 1. `isFlagEnabled === false` → `'bubbles'` (mode historique — c'est le
 *    SEUL cas qui produit `'bubbles'` ; le choix collant appartient au
 *    système drapeau-on et ne s'applique pas ici). **Cette branche n'est PAS
 *    clampée** : `'bubbles'` est hors catalogue par définition — drapeau
 *    éteint, `resolveCapabilities` rend `['bubbles']` et rien d'autre, et le
 *    catalogue drapeau-on ne le contient jamais. Le clamper reviendrait à
 *    rendre `'focal'` à un client qui n'a pas la Lentille.
 * 2. `stickyChoice !== 'auto'` → il gagne TOUJOURS, sur les trois branches
 *    numériques qui suivent, y compris `unreadCount > 25` — mais il est
 *    CLAMPÉ (un `riviere` mémorisé ne ressuscite pas un mode retiré du
 *    catalogue).
 * 3. `unreadCount > 25` → `'summary'` (Résumé Vivant), clampé.
 * 4. absence (> 24 h depuis `lastOpenedAt`, ou jamais ouverte) ET
 *    `unreadCount >= 10` → `'summary'`, clampé.
 * 5. défaut (`unreadCount <= 25`, lecteur présent ou peu de non-lus) →
 *    `'focal'` + pont ✦.
 *
 * INVARIANT (REV-1, blocage 3) : drapeau on, le mode rendu appartient
 * TOUJOURS à `capabilities.availableModes`. Un invité à 26 non-lus reçoit
 * `focal`/`'clamped-unavailable'`, jamais un Résumé Vivant qui s'ouvrirait
 * sur un 403.
 */
export function resolveOrchestratorDecision(input: OrchestratorDecisionInput): OrchestratorDecision {
  if (!input.isFlagEnabled) {
    return { mode: 'bubbles', reason: 'flag-disabled' };
  }

  const clamp = (decision: OrchestratorDecision): OrchestratorDecision =>
    clampToCapabilities(decision, input.capabilities);

  if (input.stickyChoice !== 'auto') {
    return clamp({ mode: STICKY_MODE_BY_PREFERENCE[input.stickyChoice], reason: 'sticky' });
  }

  if (input.unreadCount > ORCHESTRATOR_UNREAD_CAP) {
    return clamp({ mode: 'summary', reason: 'unread-over-cap' });
  }

  const nowMs = toEpochMs(input.now);
  if (
    input.unreadCount >= ORCHESTRATOR_ABSENCE_UNREAD_FLOOR &&
    isReaderAbsent(input.lastOpenedAt, nowMs)
  ) {
    return clamp({ mode: 'summary', reason: 'stale-absence' });
  }

  return { mode: CLAMP_FALLBACK_MODE, reason: 'default' };
}

/**
 * Projection de la décision d'orchestrateur vers `ConversationBridge.suggestedMode`
 * (`packages/shared/types/conversation-bridge.ts`, contrat §3.2), qui ne connaît
 * que deux images : `'focal'` et `'resume'`.
 *
 * Fonction TOTALE, et c'est tout son intérêt (REV-1, blocage 2) : sans elle,
 * chaque producteur de pont — gateway, substitut client, miroirs Swift/Kotlin —
 * réinventerait sa propre correspondance, et le rang suggérerait un mode que
 * l'orchestrateur n'a pas décidé. Seul `'summary'` (le Résumé Vivant) se
 * projette en `'resume'` ; `'focal'`, `'script'`, `'river'` et `'bubbles'`
 * ouvrent tous le fil, donc `'focal'`. La `reason` n'entre pas dans la
 * projection : le pont annonce une destination, pas un motif.
 */
export function toBridgeSuggestedMode(decision: OrchestratorDecision): 'focal' | 'resume' {
  return decision.mode === 'summary' ? 'resume' : 'focal';
}

// =============================================================================
// C-012 — resolveCapabilities
// =============================================================================

/** Seuil de participants actifs à partir duquel la Rivière gagne son procès. */
export const RIVER_ELIGIBILITY_THRESHOLD = 5;

/**
 * POURQUOI la Rivière est fermée (ou ouverte) — discriminant AMENDEMENT S1
 * (REV-3/B3). Sans lui, le libellé grisé ne savait dire qu'une chose : « elle
 * s'ouvrira à 5 personnes actives », y compris sur une conversation `direct`
 * où elle ne s'ouvrira JAMAIS (l'éligibilité exclut `direct`
 * STRUCTURELLEMENT, quel que soit le compte — un duo n'atteindra jamais 5).
 * Promettre une porte qui n'existe pas est une donnée fabriquée comme une
 * autre.
 *
 * - `neverEligible` — la conversation est `direct` : aucun compte ne l'ouvrira.
 * - `belowThreshold` — type éligible, mais le seuil n'est pas atteint (ou le
 *   compte est INCONNU, cf. `current: null`).
 * - `eligible` — le seuil est franchi ; la porte est ouverte par la loi
 *   (le drapeau `riviere_mode` reste, lui, une décision séparée).
 */
export type RiverEligibilityReasonKind = 'neverEligible' | 'belowThreshold' | 'eligible';

/** Raison structurée pour le libellé grisé (« s'ouvrira à 5 personnes actives — N aujourd'hui »). */
export type RiverEligibilityReason = {
  readonly threshold: number;
  /**
   * `null` = compte de participants actifs INCONNU — pas « zéro ». Aucune
   * surface client n'expose aujourd'hui de décompte d'actifs par conversation
   * (livrable gateway G-123) : rendre `0` faisait AFFICHER « 0 aujourd'hui »,
   * un chiffre fabriqué. Le libellé doit alors se taire sur le compte plutôt
   * que d'en inventer un.
   */
  readonly current: number | null;
  readonly riverReason: RiverEligibilityReasonKind;
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
  /**
   * Drapeau PROPRE à la Rivière (`riviere_mode`, défaut OFF — amendement R,
   * `tasks/lentille-workshop-execution.md` §7). Distinct de `isFlagEnabled`
   * (la Lentille) : la Rivière s'allume APRÈS, sur son propre calendrier.
   * Absent ⇒ `false` : un appelant qui ignore l'amendement obtient
   * exactement le catalogue d'avant.
   */
  readonly isRiverFlagEnabled?: boolean;
  readonly conversationType: ConversationType;
  /**
   * `null` = INCONNU (amendement S1, REV-3/B3). Rétro-compatible : un appelant
   * qui connaît le compte passe toujours un nombre, et la loi se comporte
   * exactement comme avant. Un appelant qui ne le connaît PAS doit désormais
   * le DIRE — il n'a plus à choisir entre mentir (`0`) et ne pas appeler la
   * loi. Un compte inconnu ne rend jamais éligible : le risque reste un faux
   * négatif temporaire, jamais un faux positif.
   */
  readonly activeParticipantCount: number | null;
};

/**
 * Catalogues de modes sélectionnables par identité, drapeau on. `'summary'`
 * (Résumé Vivant) est masqué pour un invité : `GET /conversations/:id/stats`
 * et `/analysis` sont `requiredAuth` → 403 pour une session anonyme
 * (focal-implementation-contract.md §5.2). `'bubbles'` n'apparaît que drapeau
 * éteint (branche dédiée ci-dessous). `'river'` s'AJOUTE à ces catalogues
 * quand son propre drapeau est on ET la conversation éligible — voir
 * `resolveCapabilities`.
 */
const REGISTERED_AVAILABLE_MODES: readonly ConversationReadingMode[] = ['focal', 'script', 'summary'];
const ANONYMOUS_AVAILABLE_MODES: readonly ConversationReadingMode[] = ['focal', 'script'];
const FLAG_DISABLED_AVAILABLE_MODES: readonly ConversationReadingMode[] = ['bubbles'];

/**
 * Capacités de mode de lecture pour une conversation donnée : catalogue de
 * modes sélectionnables + éligibilité Rivière (≥ 5 participants actifs,
 * jamais en `direct`), avec sa raison structurée pour le libellé grisé.
 *
 * AMENDEMENT R (workshop §7, décision produit du 2026-08-15) : la Rivière a
 * gagné son procès. Elle n'est plus « en sursis » — elle entre au catalogue
 * dès que `isRiverFlagEnabled && riverEligible`.
 *
 * DÉCISION CONTRACTUELLE — la Rivière est ACCORDÉE aux invités éligibles.
 * Le catalogue invité est amputé du seul `'summary'`, et pour une raison
 * précise : le Résumé Vivant lit `/conversations/:id/analysis` et
 * `/conversations/:id/stats`, tous deux `requiredAuth`, donc 403 pour une
 * session anonyme. La Rivière ne consomme AUCUN de ces deux endpoints : elle
 * dessine des couloirs à partir des messages déjà rendus par le fil, que
 * l'invité reçoit déjà. Lui refuser la Rivière serait un branchement
 * invité/inscrit sans cause technique — exactement ce que `ReadingModeIdentity`
 * interdit de multiplier. L'éligibilité (≥ 5 actifs, jamais en `direct`) reste
 * l'unique porte.
 *
 * `riverEligibilityReason` est servie dans TOUS les cas — y compris drapeau
 * éteint et conversation inéligible : c'est elle qui alimente le libellé grisé.
 *
 * AMENDEMENT S1 (REV-3/B3) — la raison se TRIFURQUE, et le compte devient
 * faillible. Trois formes, trois textes :
 *   - `neverEligible` (conversation `direct`) ⇒ « jamais en conversation
 *     directe ». L'ancienne raison unique promettait « s'ouvrira à 5 personnes
 *     actives — N aujourd'hui » à un duo qui n'atteindra jamais 5 : une porte
 *     annoncée qui n'existe pas.
 *   - `belowThreshold` avec `current: number` ⇒ la formule à deux nombres,
 *     inchangée.
 *   - `belowThreshold` avec `current: null` ⇒ le seuil SEUL. Le compte d'actifs
 *     n'est pas encore une donnée client (G-123) ; l'appelant qui l'ignore
 *     passe `null` au lieu d'un `0` fabriqué, et le libellé se tait sur le
 *     nombre au lieu d'afficher « 0 aujourd'hui ».
 */
export function resolveCapabilities(input: ResolveCapabilitiesInput): ReadingModeCapabilities {
  const activeParticipantCount = input.activeParticipantCount;
  const isNeverEligible = input.conversationType === 'direct';
  const riverEligible =
    !isNeverEligible &&
    activeParticipantCount !== null &&
    activeParticipantCount >= RIVER_ELIGIBILITY_THRESHOLD;

  /**
   * AMENDEMENT S1 (REV-3/B3) : trois raisons, jamais une seule formule.
   * `direct` d'abord — c'est la seule branche que le compte ne peut PAS
   * renverser, et la seule à laquelle « s'ouvrira à 5 » mentait.
   */
  const riverReason: RiverEligibilityReasonKind = isNeverEligible
    ? 'neverEligible'
    : riverEligible
      ? 'eligible'
      : 'belowThreshold';

  const riverEligibilityReason: RiverEligibilityReason = {
    threshold: RIVER_ELIGIBILITY_THRESHOLD,
    current: activeParticipantCount,
    riverReason,
  };

  if (!input.isFlagEnabled) {
    return { availableModes: FLAG_DISABLED_AVAILABLE_MODES, riverEligible, riverEligibilityReason };
  }

  const baseModes = input.identity.isAnonymous
    ? ANONYMOUS_AVAILABLE_MODES
    : REGISTERED_AVAILABLE_MODES;
  const riverSelectable = input.isRiverFlagEnabled === true && riverEligible;

  return {
    availableModes: riverSelectable ? [...baseModes, 'river'] : baseModes,
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
