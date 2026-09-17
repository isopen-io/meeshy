import { type AdminDeps, asCount, asRecord, asText, pageServie } from './admin';
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
 * | `GET /admin/agent/scan-logs?page&limit&conversationId` | le journal |
 * | `GET /admin/agent/scan-logs/:logId` | le détail d'un scan |
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
 * `admin-agent-parts.tsx` — le second lot (LLM, rôles, facturation) rouvrira
 * les siens AVEC les libellés qui les rendent.
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

export const agentOverviewQueryKey = () => [ADMIN_SOUVERAIN_PREFIXE, 'agent', 'overview'] as const;

export const agentTrackedQueryKey = (page: number, search: string) =>
  [ADMIN_SOUVERAIN_PREFIXE, 'agent', 'configs', page, search] as const;

export const agentLiveQueryKey = (conversationId: string) =>
  [ADMIN_SOUVERAIN_PREFIXE, 'agent', 'live', conversationId] as const;

export const agentScanLogsQueryKey = (page: number, conversationId: string) =>
  [ADMIN_SOUVERAIN_PREFIXE, 'agent', 'scan-logs', page, conversationId] as const;

export const agentScanLogQueryKey = (logId: string) =>
  [ADMIN_SOUVERAIN_PREFIXE, 'agent', 'scan-log', logId] as const;

const asTextOrNull = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value : null;

/**
 * LA PAGE se lit par `pageServie` (`./admin`) — « où le transport la POSE, et
 * non là où le schéma la dessine ». Cette lecture vivait ICI (#6733) pendant
 * que quatre décodeurs voisins la faisaient FAUSSE au même moment (#6862) :
 * une loi juste, dans un seul fichier, ne garde pas ses voisins. Elle a donc
 * rejoint les trois helpers que toute l'administration partage déjà.
 */
const totalEtSuite = (
  meta: Readonly<Record<string, unknown>>,
  page: number,
  rendues: number,
): { readonly total: number; readonly hasMore: boolean } => {
  const total = asCount(meta.total);
  // `hasMore` vient du SERVEUR quand il le dit ; sinon il se recalcule depuis
  // la page et le total — jamais depuis la seule longueur, qui vaut aussi bien
  // « fin de liste » que « page pleine ».
  const hasMore = typeof meta.hasMore === 'boolean' ? meta.hasMore : page * ADMIN_AGENT_PAGE_SIZE < total;
  return { total: total || rendues, hasMore };
};

// ---------------------------------------------------------------------------
// LA VUE D'ENSEMBLE — GET /admin/agent/stats
// ---------------------------------------------------------------------------

export type AgentOverview = {
  readonly totalConfigs: number;
  readonly activeConfigs: number;
  readonly totalControlledUsers: number;
  readonly totalMessagesSent: number;
};

export async function loadAgentOverview(
  params: AdminDeps & { readonly signal?: AbortSignal },
): Promise<ApiResult<AgentOverview>> {
  const resultat = await params.transport.request<unknown>({
    method: 'GET',
    path: '/api/v1/admin/agent/stats',
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
  readonly enabled: boolean;
  /** Le handler l'élit depuis `scanStartedAt` (`isScanActive`), jamais un booléen stocké. */
  readonly isScanning: boolean;
  /** Le nœud du graphe LangGraph en cours — `null` hors scan, le handler le remet à `null` lui-même. */
  readonly currentNode: string | null;
  readonly controlledUsersCount: number;
  readonly messagesSent: number;
  readonly lastResponseAt: string | null;
};

export type AgentTrackedPage = {
  readonly conversations: readonly AgentTrackedConversation[];
  readonly page: number;
  readonly total: number;
  readonly hasMore: boolean;
};

function decodeTracked(raw: unknown): AgentTrackedConversation | null {
  const ligne = asRecord(raw);
  if (ligne === null || typeof ligne.conversationId !== 'string' || ligne.conversationId === '') return null;

  const conversation = asRecord(ligne.conversation) ?? {};
  const analytics = asRecord(ligne.analytics) ?? {};

  return {
    conversationId: ligne.conversationId,
    title: asTextOrNull(conversation.title),
    enabled: ligne.enabled === true,
    isScanning: ligne.isScanning === true,
    currentNode: asTextOrNull(ligne.currentNode),
    controlledUsersCount: (Array.isArray(ligne.controlledUserIds) ? ligne.controlledUserIds : []).length,
    messagesSent: asCount(analytics.messagesSent),
    lastResponseAt: asTextOrNull(analytics.lastResponseAt),
  };
}

export async function loadAgentTracked(
  params: AdminDeps & { readonly page: number; readonly search: string; readonly signal?: AbortSignal },
): Promise<ApiResult<AgentTrackedPage>> {
  const recherche = params.search.trim();
  const query = new URLSearchParams({
    // `page`, JAMAIS `offset` : l'inverse de `GET /admin/users`.
    page: String(params.page),
    limit: String(ADMIN_AGENT_PAGE_SIZE),
    ...(recherche === '' ? {} : { search: recherche }),
  });

  const resultat = await params.transport.request<unknown>({
    method: 'GET',
    path: `/api/v1/admin/agent/configs?${query.toString()}`,
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  if (!resultat.ok) return resultat;

  const { lignes, meta } = pageServie(resultat);
  const conversations = lignes
    .map(decodeTracked)
    .filter((ligne): ligne is AgentTrackedConversation => ligne !== null);

  return { ok: true, data: { conversations, page: params.page, ...totalEtSuite(meta, params.page, conversations.length) } };
}

// ---------------------------------------------------------------------------
// L'ÉTAT VIVANT — GET /admin/agent/configs/:conversationId/live
// ---------------------------------------------------------------------------

export type AgentLiveState = {
  readonly conversationId: string;
  readonly isScanning: boolean;
  readonly currentNode: string | null;
  readonly controlledUsersCount: number;
};

export async function loadAgentLive(
  params: AdminDeps & { readonly conversationId: string; readonly signal?: AbortSignal },
): Promise<ApiResult<AgentLiveState>> {
  const resultat = await params.transport.request<unknown>({
    method: 'GET',
    path: `/api/v1/admin/agent/configs/${params.conversationId}/live`,
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  if (!resultat.ok) return resultat;

  const charge = asRecord(resultat.data) ?? {};

  return {
    ok: true,
    data: {
      conversationId: asText(charge.conversationId) || params.conversationId,
      isScanning: charge.isScanning === true,
      currentNode: asTextOrNull(charge.currentNode),
      controlledUsersCount: (Array.isArray(charge.controlledUsers) ? charge.controlledUsers : []).length,
    },
  };
}

// ---------------------------------------------------------------------------
// LES DEUX GESTES — trigger et stop
// ---------------------------------------------------------------------------

export type AgentTriggerOutcome = {
  readonly triggered: boolean;
  readonly triggeredAt: number | null;
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
    path: `/api/v1/admin/agent/configs/${params.conversationId}/trigger`,
  });
  if (!resultat.ok) return resultat;

  const charge = asRecord(resultat.data) ?? {};
  return {
    ok: true,
    data: {
      triggered: charge.triggered === true,
      triggeredAt: typeof charge.triggeredAt === 'number' ? charge.triggeredAt : null,
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
    path: `/api/v1/admin/agent/configs/${params.conversationId}/stop`,
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
  readonly trigger: string;
  readonly startedAt: string | null;
  readonly durationMs: number;
  readonly outcome: string;
  readonly messagesSent: number;
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
    trigger: asText(ligne.trigger),
    startedAt: asTextOrNull(ligne.startedAt),
    durationMs: asCount(ligne.durationMs),
    outcome: asText(ligne.outcome),
    messagesSent: asCount(ligne.messagesSent),
  };
}

export type AgentScanLogsPage = {
  readonly logs: readonly AgentScanLogRow[];
  readonly page: number;
  readonly total: number;
  readonly hasMore: boolean;
};

export async function loadAgentScanLogs(
  params: AdminDeps & { readonly page: number; readonly conversationId: string; readonly signal?: AbortSignal },
): Promise<ApiResult<AgentScanLogsPage>> {
  const query = new URLSearchParams({
    page: String(params.page),
    limit: String(ADMIN_AGENT_PAGE_SIZE),
    ...(params.conversationId === '' ? {} : { conversationId: params.conversationId }),
  });

  const resultat = await params.transport.request<unknown>({
    method: 'GET',
    path: `/api/v1/admin/agent/scan-logs?${query.toString()}`,
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  if (!resultat.ok) return resultat;

  const { lignes, meta } = pageServie(resultat);
  const logs = lignes.map(decodeScanLog).filter((ligne): ligne is AgentScanLogRow => ligne !== null);

  return { ok: true, data: { logs, page: params.page, ...totalEtSuite(meta, params.page, logs.length) } };
}

export async function loadAgentScanLog(
  params: AdminDeps & { readonly logId: string; readonly signal?: AbortSignal },
): Promise<ApiResult<AgentScanLogDetail>> {
  const resultat = await params.transport.request<unknown>({
    method: 'GET',
    path: `/api/v1/admin/agent/scan-logs/${params.logId}`,
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
