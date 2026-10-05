import * as adminEndpoints from '@meeshy/shared/api/endpoints/admin';

import { type AdminDeps, asCount, asRecord } from './admin';
import { AGENT_ROOT_KEY, decodeAgentActivity, type AgentActivityRow } from './admin-agent';
import type { ApiResult } from './http';

/**
 * **CE QUE L'AGENT A FAIT RÉCEMMENT** (lot Agent complet) — deux lectures de la
 * vue d'ensemble, ouvertes dans la modale « Activité » de l'écran Agent.
 *
 * | adresse | ce qu'elle sert |
 * |---|---|
 * | `GET /admin/agent/recent-activity?limit&search` | les conversations où l'agent a répondu, la plus récente d'abord |
 * | `GET /admin/agent/scan-logs/stats?months&bucket&conversationId` | le journal des scans replié en jours ou semaines |
 *
 * Gardées par `canManageAgent` (`agent-observability.ts`) ; clés sous
 * `AGENT_ROOT_KEY`, donc sous le préfixe souverain (jamais sur le disque).
 */
export const AGENT_ACTIVITY_LIMIT = 20;

export const agentRecentActivityQueryKey = (search: string) => [...AGENT_ROOT_KEY, 'recent-activity', search] as const;

export const agentScanStatsQueryKey = (months: number, bucket: AgentScanBucket) =>
  [...AGENT_ROOT_KEY, 'scan-stats', months, bucket] as const;

export async function loadAgentRecentActivity(
  params: AdminDeps & { readonly search: string; readonly limit?: number; readonly signal?: AbortSignal },
): Promise<ApiResult<readonly AgentActivityRow[]>> {
  const search = params.search.trim();
  const query = new URLSearchParams({ limit: String(params.limit ?? AGENT_ACTIVITY_LIMIT), ...(search === '' ? {} : { search }) });
  const resultat = await params.transport.request<unknown>({
    method: 'GET',
    path: `${adminEndpoints.agentRecentActivity}?${query.toString()}`,
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  if (!resultat.ok) return resultat;
  const rows = (Array.isArray(resultat.data) ? resultat.data : [])
    .map(decodeAgentActivity)
    .filter((row): row is AgentActivityRow => row !== null);
  return { ok: true, data: rows };
}

export type AgentScanBucket = 'day' | 'week';

export type AgentScanStatsBucket = {
  /** Le jour (`AAAA-MM-JJ`) ou la semaine que le handler a replié. */
  readonly date: string;
  readonly scans: number;
  readonly messagesSent: number;
  readonly reactionsSent: number;
  readonly costUsd: number;
};

export type AgentScanStats = {
  readonly buckets: readonly AgentScanStatsBucket[];
  readonly totalLogs: number;
  readonly since: string | null;
};

function decodeBucket(raw: unknown): AgentScanStatsBucket | null {
  const ligne = asRecord(raw);
  if (ligne === null || typeof ligne.date !== 'string' || ligne.date === '') return null;
  return {
    date: ligne.date,
    scans: asCount(ligne.scans),
    messagesSent: asCount(ligne.messagesSent),
    reactionsSent: asCount(ligne.reactionsSent),
    costUsd: typeof ligne.costUsd === 'number' && Number.isFinite(ligne.costUsd) && ligne.costUsd >= 0 ? ligne.costUsd : 0,
  };
}

export async function loadAgentScanStats(
  params: AdminDeps & { readonly months: number; readonly bucket: AgentScanBucket; readonly signal?: AbortSignal },
): Promise<ApiResult<AgentScanStats>> {
  const query = new URLSearchParams({ months: String(params.months), bucket: params.bucket });
  const resultat = await params.transport.request<unknown>({
    method: 'GET',
    path: `${adminEndpoints.agentScanLogsStats}?${query.toString()}`,
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  if (!resultat.ok) return resultat;
  const charge = asRecord(resultat.data) ?? {};
  return {
    ok: true,
    data: {
      buckets: (Array.isArray(charge.buckets) ? charge.buckets : [])
        .map(decodeBucket)
        .filter((bucket): bucket is AgentScanStatsBucket => bucket !== null),
      totalLogs: asCount(charge.totalLogs),
      since: typeof charge.since === 'string' && charge.since !== '' ? charge.since : null,
    },
  };
}
