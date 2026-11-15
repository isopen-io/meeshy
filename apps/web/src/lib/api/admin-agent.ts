import * as adminEndpoints from '@meeshy/shared/api/endpoints/admin';

import { type AdminDeps, asCount, asRecord, asText } from './admin';
import { adminPageOf, type AdminPage } from './admin-page';
import type { ApiResult } from './http';
import { ADMIN_SOUVERAIN_PREFIXE } from './souverain';

/**
 * **LE PORT DU PILOTAGE DE L'AGENT** (#6733) — les routes `/admin/agent/*`,
 * qui existent TOUTES déjà (`services/gateway/src/routes/admin/agent-*.ts`).
 * Ce module n'en crée aucune : il les CONSOMME.
 *
 * | adresse | ce qu'elle sert |
 * |---|---|
 * | `GET /admin/agent/stats` | les compteurs de la vue d'ensemble |
 * | `GET /admin/agent/configs?page&limit&search` | les conversations SUIVIES |
 * | `GET /admin/agent/configs/:id/live` | l'état VIVANT d'une conversation |
 * | `POST /admin/agent/configs/:id/trigger` | **la relance du cycle** |
 * | `POST /admin/agent/configs/:id/stop` | l'arrêt d'un scan en cours |
 * | `GET /admin/agent/scan-logs?page&limit&outcome&trigger&conversationId&from&to` | le journal |
 * | `GET /admin/agent/scan-logs/:logId` | le détail d'un scan |
 *
 * Les autres routes de l'agent ont leur port, chacun à côté de son écran :
 * `admin-agent-activity.ts` (activité récente, statistiques du journal),
 * `admin-agent-settings.ts` (modèle, configuration globale, remise à zéro
 * totale), `admin-agent-conversation.ts` (réglages, résumé, planning, rôles,
 * messages, remises à zéro ciblées), `admin-agent-topics.ts` (sujets, file de
 * livraison).
 *
 * Toutes sont gardées par `requirePermission('canManageAgent')`
 * (`routes/admin/agent-shared.ts`) — le seuil que la v2 lit désormais dans sa
 * matrice servie, et non plus `canAccessAdmin`.
 *
 * ## CE QUE LA RELANCE FAIT VRAIMENT
 *
 * `POST /configs/:id/trigger` remet `agent:last-scan` à zéro et publie
 * `agent:trigger-scan`. Le service agent rejoue alors le cycle **COMPLET** du
 * graphe LangGraph : `observer` → `strategist` → `generator` → `qualityGate`.
 * Il ne « refait pas l'analyse » — il peut faire **PUBLIER un message par
 * l'agent dans la vraie conversation**. Tout libellé d'interface posé sur
 * cette fonction doit le dire ; c'est pourquoi la clé de catalogue qui la
 * nomme s'appelle `admin.agent.relaunch`, et jamais « relancer l'analyse ».
 *
 * ## LES DEUX PIÈGES DE FORME, PAYÉS UNE FOIS
 *
 * 1. **`page`, jamais `offset`.** L'INVERSE de `GET /admin/users`, dont le
 *    doc-comment avertit déjà de la symétrie. Ces routes-ci lisent `page` ; un
 *    `?offset=2` serait IGNORÉ et la deuxième page rendrait la première, sans
 *    erreur, indéfiniment.
 * 2. **La pagination voyage À CÔTÉ de `data`** (`sendPaginatedSuccess`), et le
 *    transport de la v2 la pose sur `result.pagination`, SIBLING de
 *    `result.data` (`http.ts` : `envelope.pagination` y est relevé à part).
 *    La chercher dans `data` rendrait `total: 0` et `hasMore: false` — une
 *    liste qui s'arrête à la première page sans que rien n'échoue.
 *
 * ## CE QUI EST DÉCODÉ ATTEINT UN PIXEL, ET RIEN D'AUTRE
 *
 * Ces handlers servent BEAUCOUP plus que ce qui est décodé ici — cinquante
 * champs de configuration, réactions, refus, coût estimé, jetons consommés,
 * profils de ton, cache Redis. Un champ décodé que personne ne rend est du
 * poids déguisé en feature : il grossit le type, le cache et les témoins, et
 * il donne l'impression qu'une donnée est SERVIE alors qu'elle n'est nulle
 * part à l'écran. Chaque champ ci-dessous a un consommateur dans
 * `admin-agent-parts.tsx` ou ses modales — les ports voisins décodent les leurs
 * AVEC les libellés qui les rendent.
 *
 * ## Le schéma ne gouverne pas la forme
 *
 * Ces routes déclarent leurs `data` en `additionalProperties: true`
 * (`agent-shared.ts`). Les champs décodés ici sont ceux que les HANDLERS
 * servent, lus dans les handlers — jamais déduits des schémas.
 *
 * ## Rien de ce qui est lu ici ne touche le disque
 *
 * Les clés descendent d'{@link ADMIN_SOUVERAIN_PREFIXE}, qu'exclut le filtre de
 * déshydratation de `query-client.ts`. Ces lectures nomment les conversations
 * de l'instance et l'activité qu'un agent y a eue : sans le préfixe, elles
 * survivraient à la session dans `localStorage`, sur le poste de
 * l'administrateur — une copie qu'`AdminAuditLog` ne connaît pas.
 */

export const ADMIN_AGENT_PAGE_SIZE = 20;

/** Les tailles de page que le pager offre — la passerelle borne `limit` à 100. */
export const ADMIN_AGENT_PAGE_SIZES = [20, 50, 100] as const;

/** La RACINE de tout ce que l'agent lit : ce qu'un geste (relance, arrêt) relit en bloc. */
export const AGENT_ROOT_KEY = [ADMIN_SOUVERAIN_PREFIXE, 'agent'] as const;

export const agentOverviewQueryKey = () => [...AGENT_ROOT_KEY, 'overview'] as const;

export const agentTrackedQueryKey = (offset: number, limit: number, search: string) =>
  [...AGENT_ROOT_KEY, 'configs', offset, limit, search] as const;

export const agentLiveQueryKey = (conversationId: string) => [...AGENT_ROOT_KEY, 'live', conversationId] as const;

/** Les filtres du journal que la route lit ; `''` n'est pas un filtre. `from`/`to` sont des jours `AAAA-MM-JJ`. */
export type AgentScanLogFilters = {
  readonly outcome?: string;
  readonly trigger?: string;
  readonly conversationId?: string;
  readonly from?: string;
  readonly to?: string;
};

export const agentScanLogsQueryKey = (offset: number, limit: number, filters: AgentScanLogFilters) =>
  [
    ...AGENT_ROOT_KEY,
    'scan-logs',
    offset,
    limit,
    filters.outcome ?? '',
    filters.trigger ?? '',
    filters.conversationId ?? '',
    filters.from ?? '',
    filters.to ?? '',
  ] as const;

export const agentScanLogQueryKey = (logId: string) => [...AGENT_ROOT_KEY, 'scan-log', logId] as const;

export const asTextOrNull = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value : null;

/** Une page servie PAR PAGE (`?page=`) devient une page par OFFSET pour la manette commune : l'offset d'une page est `(page − 1) × limit`. */
const pageOfOffset = (offset: number, limit: number): number => Math.floor(offset / limit) + 1;

// ---------------------------------------------------------------------------
// LA VUE D'ENSEMBLE — GET /admin/agent/stats
// ---------------------------------------------------------------------------

/** Une conversation où l'agent a répondu récemment — `GET /stats` (dix) et `GET /recent-activity` servent la même ligne. */
export type AgentActivityRow = {
  readonly conversationId: string;
  readonly title: string | null;
  readonly conversationType: string | null;
  /** `null` quand la route ne le sert pas (`/stats`) : ni « activé » ni « désactivé » ne s'inventent. */
  readonly enabled: boolean | null;
  readonly messagesSent: number;
  readonly totalWordsSent: number;
  /** La confiance moyenne, ratio 0–1 ; `null` si non servie. */
  readonly avgConfidence: number | null;
  readonly lastResponseAt: string | null;
  readonly controlledUsersCount: number | null;
};

export type AgentOverview = {
  readonly totalConfigs: number;
  readonly activeConfigs: number;
  readonly totalControlledUsers: number;
  readonly totalMessagesSent: number;
  /** `null` quand la passerelle ne le sert pas — zéro mot affirmerait un agent muet. */
  readonly totalWordsSent: number | null;
  readonly avgConfidence: number | null;
  readonly recentActivity: readonly AgentActivityRow[];
};

const ratioOrNull = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.min(1, value) : null;

const countOrNull = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;

export function decodeAgentActivity(raw: unknown): AgentActivityRow | null {
  const ligne = asRecord(raw);
  if (ligne === null || typeof ligne.conversationId !== 'string' || ligne.conversationId === '') return null;
  const conversation = asRecord(ligne.conversation) ?? {};
  return {
    conversationId: ligne.conversationId,
    title: asTextOrNull(conversation.title),
    conversationType: asTextOrNull(conversation.type),
    enabled: typeof ligne.enabled === 'boolean' ? ligne.enabled : null,
    messagesSent: asCount(ligne.messagesSent),
    totalWordsSent: asCount(ligne.totalWordsSent),
    avgConfidence: ratioOrNull(ligne.avgConfidence),
    lastResponseAt: asTextOrNull(ligne.lastResponseAt),
    controlledUsersCount: countOrNull(ligne.controlledUsersCount),
  };
}

export async function loadAgentOverview(
  params: AdminDeps & { readonly signal?: AbortSignal },
): Promise<ApiResult<AgentOverview>> {
  const resultat = await params.transport.request<unknown>({
    method: 'GET',
    path: adminEndpoints.agentStats,
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  if (!resultat.ok) return resultat;

  const charge = asRecord(resultat.data) ?? {};
  return {
    ok: true,
    data: {
      totalConfigs: asCount(charge.totalConfigs),
      activeConfigs: asCount(charge.activeConfigs),
      totalControlledUsers: asCount(charge.totalControlledUsers),
      totalMessagesSent: asCount(charge.totalMessagesSent),
      totalWordsSent: countOrNull(charge.totalWordsSent),
      avgConfidence: ratioOrNull(charge.avgConfidence),
      recentActivity: (Array.isArray(charge.recentActivity) ? charge.recentActivity : [])
        .map(decodeAgentActivity)
        .filter((row): row is AgentActivityRow => row !== null),
    },
  };
}

// ---------------------------------------------------------------------------
// LES CONVERSATIONS SUIVIES — GET /admin/agent/configs
// ---------------------------------------------------------------------------

export type AgentTrackedConversation = {
  readonly conversationId: string;
  /** `null` sur un direct, qui n'a pas de titre stocké (D-75). */
  readonly title: string | null;
  /** Le type de la conversation, que son nom (`conversationLabel`) et son genre lisent. */
  readonly conversationType: string | null;
  readonly enabled: boolean;
  /** Le handler l'élit depuis `scanStartedAt` (`isScanActive`), jamais un booléen stocké. */
  readonly isScanning: boolean;
  /** Le nœud du graphe LangGraph en cours — `null` hors scan, le handler le remet à `null` lui-même. */
  readonly currentNode: string | null;
  readonly controlledUsersCount: number;
  readonly messagesSent: number;
  readonly lastResponseAt: string | null;
};

function decodeTracked(raw: unknown): AgentTrackedConversation | null {
  const ligne = asRecord(raw);
  if (ligne === null || typeof ligne.conversationId !== 'string' || ligne.conversationId === '') return null;

  const conversation = asRecord(ligne.conversation) ?? {};
  const analytics = asRecord(ligne.analytics) ?? {};

  return {
    conversationId: ligne.conversationId,
    title: asTextOrNull(conversation.title),
    conversationType: asTextOrNull(conversation.type),
    enabled: ligne.enabled === true,
    isScanning: ligne.isScanning === true,
    currentNode: asTextOrNull(ligne.currentNode),
    controlledUsersCount: (Array.isArray(ligne.controlledUserIds) ? ligne.controlledUserIds : []).length,
    messagesSent: asCount(analytics.messagesSent),
    lastResponseAt: asTextOrNull(analytics.lastResponseAt),
  };
}

export async function loadAgentTracked(
  params: AdminDeps & {
    readonly offset: number;
    readonly limit: number;
    readonly search: string;
    readonly signal?: AbortSignal;
  },
): Promise<ApiResult<AdminPage<AgentTrackedConversation>>> {
  const recherche = params.search.trim();
  const query = new URLSearchParams({
    // `page`, JAMAIS `offset` : l'inverse de `GET /admin/users`.
    page: String(pageOfOffset(params.offset, params.limit)),
    limit: String(params.limit),
    ...(recherche === '' ? {} : { search: recherche }),
  });

  const resultat = await params.transport.request<unknown>({
    method: 'GET',
    path: `${adminEndpoints.agentConfigs}?${query.toString()}`,
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });

  return adminPageOf(resultat, decodeTracked, { kind: 'page-based' });
}

// ---------------------------------------------------------------------------
// L'ÉTAT VIVANT — GET /admin/agent/configs/:conversationId/live
// ---------------------------------------------------------------------------

/**
 * UN MEMBRE PILOTÉ, tel que la vue en DIRECT le nomme — la seule lecture de
 * l'agent qui résolve les noms (`GET /configs/:id/live` joint les comptes). Les
 * listes (`/configs`, `/scan-logs`) ne servent que des IDENTIFIANTS : elles ne
 * disent donc que leur NOMBRE.
 *
 * Le handler retombe sur l'identifiant quand le compte n'existe plus
 * (`displayName ?? username ?? userId`) : cette valeur n'est pas un nom, et elle
 * est jetée — `displayName` vaut alors `null`, et l'écran dit « Compte sans nom ».
 */
export type AgentControlledUser = {
  readonly userId: string;
  readonly displayName: string | null;
  readonly username: string | null;
  readonly language: string | null;
};

export type AgentLiveState = {
  readonly conversationId: string;
  readonly isScanning: boolean;
  readonly currentNode: string | null;
  readonly controlledUsers: readonly AgentControlledUser[];
  readonly messagesSent: number | null;
  readonly lastResponseAt: string | null;
};

const OBJECT_ID = /^[0-9a-f]{24}$/;

function decodeControlledUser(raw: unknown): AgentControlledUser | null {
  const ligne = asRecord(raw);
  if (ligne === null || typeof ligne.userId !== 'string' || ligne.userId === '') return null;

  const name = asTextOrNull(ligne.displayName);
  return {
    userId: ligne.userId,
    displayName: name === null || name === ligne.userId || OBJECT_ID.test(name) ? null : name,
    username: asTextOrNull(ligne.username),
    /* La langue RÉSOLUE (`language`, 2e2842185b) quand le serveur la sert — même `null` : `systemLanguage` y vaut un « fr » inventé, gardé pour les anciens clients. */
    language: Object.hasOwn(ligne, 'language') ? asTextOrNull(ligne.language) : asTextOrNull(ligne.systemLanguage),
  };
}

export async function loadAgentLive(
  params: AdminDeps & { readonly conversationId: string; readonly signal?: AbortSignal },
): Promise<ApiResult<AgentLiveState>> {
  const resultat = await params.transport.request<unknown>({
    method: 'GET',
    path: adminEndpoints.agentConfigsByConversationIdLive(params.conversationId),
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  if (!resultat.ok) return resultat;

  const charge = asRecord(resultat.data) ?? {};
  const analytics = asRecord(charge.analytics);

  return {
    ok: true,
    data: {
      conversationId: asText(charge.conversationId) || params.conversationId,
      isScanning: charge.isScanning === true,
      currentNode: asTextOrNull(charge.currentNode),
      controlledUsers: (Array.isArray(charge.controlledUsers) ? charge.controlledUsers : [])
        .map(decodeControlledUser)
        .filter((user): user is AgentControlledUser => user !== null),
      messagesSent: analytics === null ? null : asCount(analytics.messagesSent),
      lastResponseAt: analytics === null ? null : asTextOrNull(analytics.lastResponseAt),
    },
  };
}

// ---------------------------------------------------------------------------
// LES DEUX GESTES — trigger et stop
// ---------------------------------------------------------------------------

export type AgentTriggerOutcome = {
  readonly triggered: boolean;
  readonly triggeredAt: number | null;
  /** Pourquoi RIEN n'a été relancé (2e2842185b) : l'agent est désactivé pour la conversation, ou partout ; `null` sinon. */
  readonly reason: 'CONVERSATION_DISABLED' | 'GLOBAL_DISABLED' | null;
};

/**
 * **LA RELANCE DU CYCLE COMPLET** — voir le doc-comment du module : ce geste
 * refait l'analyse ET peut faire publier un message par l'agent.
 *
 * `triggered` est lu tel que le handler le DIT, jamais supposé vrai parce que
 * la requête a réussi : une réponse 200 qui porterait `triggered: false`
 * signifierait que rien n'a été relancé, et l'interface n'a pas à l'inventer.
 */
export async function relancerAgent(
  params: AdminDeps & { readonly conversationId: string },
): Promise<ApiResult<AgentTriggerOutcome>> {
  const resultat = await params.transport.request<unknown>({
    method: 'POST',
    path: adminEndpoints.agentConfigsByConversationIdTrigger(params.conversationId),
  });
  if (!resultat.ok) return resultat;

  const charge = asRecord(resultat.data) ?? {};
  return {
    ok: true,
    data: {
      triggered: charge.triggered === true,
      triggeredAt: typeof charge.triggeredAt === 'number' ? charge.triggeredAt : null,
      reason: charge.reason === 'CONVERSATION_DISABLED' || charge.reason === 'GLOBAL_DISABLED' ? charge.reason : null,
    },
  };
}

export type AgentStopOutcome = {
  readonly stopped: boolean;
  /**
   * LE SUCCÈS PARTIEL QUE LE HANDLER SERT DÉLIBÉRÉMENT — le marqueur en base
   * est effacé (la pastille se décoince même si le service agent est à terre),
   * mais le service n'a PAS été joint. Le confondre avec un arrêt franc ferait
   * dire à l'interface que tout va bien alors que rien n'a été arrêté en aval.
   */
  readonly agentUnavailable: boolean;
};

export async function stopperScanAgent(
  params: AdminDeps & { readonly conversationId: string },
): Promise<ApiResult<AgentStopOutcome>> {
  const resultat = await params.transport.request<unknown>({
    method: 'POST',
    path: adminEndpoints.agentConfigsByConversationIdStop(params.conversationId),
  });
  if (!resultat.ok) return resultat;

  const charge = asRecord(resultat.data) ?? {};
  return {
    ok: true,
    data: { stopped: charge.stopped === true, agentUnavailable: charge.agentUnavailable === true },
  };
}

// ---------------------------------------------------------------------------
// LE JOURNAL DES SCANS — GET /admin/agent/scan-logs
// ---------------------------------------------------------------------------

export type AgentScanLogRow = {
  readonly id: string;
  readonly conversationId: string;
  readonly title: string | null;
  readonly conversationType: string | null;
  readonly trigger: string;
  readonly startedAt: string | null;
  readonly durationMs: number;
  readonly outcome: string;
  readonly messagesSent: number;
  readonly reactionsSent: number;
  readonly messagesRejected: number;
  readonly totalInputTokens: number;
  readonly totalOutputTokens: number;
  /** `null` quand le coût n'a pas été estimé : zéro dollar affirmerait un scan gratuit. */
  readonly estimatedCostUsd: number | null;
};

export type AgentScanLogDetail = AgentScanLogRow & {
  readonly userIdsUsed: readonly string[];
};

function decodeScanLog(raw: unknown): AgentScanLogRow | null {
  const ligne = asRecord(raw);
  if (ligne === null || typeof ligne.id !== 'string' || ligne.id === '') return null;

  const conversation = asRecord(ligne.conversation) ?? {};

  return {
    id: ligne.id,
    conversationId: asText(ligne.conversationId),
    title: asTextOrNull(conversation.title),
    conversationType: asTextOrNull(conversation.type),
    trigger: asText(ligne.trigger),
    startedAt: asTextOrNull(ligne.startedAt),
    durationMs: asCount(ligne.durationMs),
    outcome: asText(ligne.outcome),
    messagesSent: asCount(ligne.messagesSent),
    reactionsSent: asCount(ligne.reactionsSent),
    messagesRejected: asCount(ligne.messagesRejected),
    totalInputTokens: asCount(ligne.totalInputTokens),
    totalOutputTokens: asCount(ligne.totalOutputTokens),
    estimatedCostUsd:
      typeof ligne.estimatedCostUsd === 'number' && Number.isFinite(ligne.estimatedCostUsd) && ligne.estimatedCostUsd >= 0
        ? ligne.estimatedCostUsd
        : null,
  };
}

export async function loadAgentScanLogs(
  params: AdminDeps & {
    readonly offset: number;
    readonly limit: number;
    readonly signal?: AbortSignal;
  } & AgentScanLogFilters,
): Promise<ApiResult<AdminPage<AgentScanLogRow>>> {
  const query = new URLSearchParams({
    page: String(pageOfOffset(params.offset, params.limit)),
    limit: String(params.limit),
  });
  for (const key of ['outcome', 'trigger', 'conversationId'] as const) {
    const value = params[key]?.trim() ?? '';
    if (value !== '') query.set(key, value);
  }
  /* Un JOUR, borné à sa journée entière : `from` à minuit, `to` à la dernière milliseconde (UTC, comme `startedAt`). */
  if (params.from !== undefined && params.from !== '') query.set('from', `${params.from}T00:00:00.000Z`);
  if (params.to !== undefined && params.to !== '') query.set('to', `${params.to}T23:59:59.999Z`);

  const resultat = await params.transport.request<unknown>({
    method: 'GET',
    path: `${adminEndpoints.agentScanLogs}?${query.toString()}`,
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });

  return adminPageOf(resultat, decodeScanLog, { kind: 'page-based' });
}

export async function loadAgentScanLog(
  params: AdminDeps & { readonly logId: string; readonly signal?: AbortSignal },
): Promise<ApiResult<AgentScanLogDetail>> {
  const resultat = await params.transport.request<unknown>({
    method: 'GET',
    path: adminEndpoints.agentScanLogsByLogId(params.logId),
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  if (!resultat.ok) return resultat;

  const ligne = decodeScanLog(resultat.data);
  if (ligne === null) return { ok: false, status: 0, error: 'scan illisible' };

  const charge = asRecord(resultat.data) ?? {};
  return {
    ok: true,
    data: {
      ...ligne,
      userIdsUsed: (Array.isArray(charge.userIdsUsed) ? charge.userIdsUsed : []).filter(
        (valeur): valeur is string => typeof valeur === 'string',
      ),
    },
  };
}
