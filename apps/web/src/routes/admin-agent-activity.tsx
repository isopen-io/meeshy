import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { AdminBadge } from '@/components/admin/badges';
import { AdminTimelineChart } from '@/components/admin/charts/timeline-chart';
import { AdminEntityIdentity } from '@/components/admin/entity-chip';
import { AdminFicheSection } from '@/components/admin/fiche';
import { AdminMomentText } from '@/components/admin/meta';
import { AdminEmptyState, AdminErrorState } from '@/components/admin/states';
import { BRAND, EDGE, INK, INK2, SURFACE } from '@/components/admin/tone';
import { agentConversationRefOf } from '@/lib/admin/agent-model';
import { formatCount, formatMoney, formatPercent } from '@/lib/admin/interpret/numbers';
import { adminDate, adminDayLabel, adminMomentOf } from '@/lib/admin/interpret/time';
import type { AdminDeps } from '@/lib/api/admin';
import {
  agentRecentActivityQueryKey,
  agentScanStatsQueryKey,
  loadAgentRecentActivity,
  loadAgentScanStats,
  type AgentScanBucket,
} from '@/lib/api/admin-agent-activity';
import { unwrap } from '@/lib/api/client';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';
import { AdminSkeleton } from '@/routes/admin-parts';

/**
 * **LA MODALE « ACTIVITÉ RÉCENTE »** (lot Agent complet) — les conversations où
 * l'agent a répondu, la plus récente d'abord (`GET /recent-activity`, cherchable
 * par titre), et le journal des scans replié dans le temps
 * (`GET /scan-logs/stats`, par jour ou par semaine, sur un à douze mois).
 *
 * Montée seulement à l'ouverture (`AdminDetailSheet`) : aucune de ces deux
 * lectures ne part tant que personne ne les regarde.
 */
const MONTHS = [1, 3, 6, 12] as const;
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2';
const SELECT_STYLE = { minHeight: 44, backgroundColor: SURFACE, border: `1px solid ${EDGE}`, color: INK, outlineColor: BRAND } as const;

export function AgentActivityDetail({ language, deps, now }: { readonly language: AdminLanguage; readonly deps: AdminDeps; readonly now: () => Date }) {
  return (
    <>
      <AgentScanChart language={language} deps={deps} />
      <AgentRecentActivity language={language} deps={deps} now={now} />
    </>
  );
}

function AgentRecentActivity({ language, deps, now }: { readonly language: AdminLanguage; readonly deps: AdminDeps; readonly now: () => Date }) {
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setSearch(draft.trim()), 300);
    return () => clearTimeout(timer);
  }, [draft]);

  const activity = useQuery({
    queryKey: agentRecentActivityQueryKey(search),
    queryFn: async ({ signal }) => unwrap(await loadAgentRecentActivity({ ...deps, search, signal })),
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 15_000,
  });

  const rows = activity.data;

  return (
    <AdminFicheSection id="recent-activity" title={translateAdmin(language, 'admin.agentPanel.card.activity')}>
      <label className="grid gap-1">
        <span className="text-caption font-medium" style={{ color: INK2 }}>
          {translateAdmin(language, 'admin.agentPanel.activity.search')}
        </span>
        <input
          type="search"
          data-agent-activity-search
          value={draft}
          onInput={(event) => setDraft(event.currentTarget.value)}
          onChange={() => undefined}
          className={`w-full rounded-chip px-3 text-body ${FOCUS}`}
          style={SELECT_STYLE}
        />
      </label>
      {rows === undefined ? (
        activity.isPending ? (
          <AdminSkeleton rows={3} />
        ) : (
          <AdminErrorState language={language} onRetry={() => void activity.refetch()} />
        )
      ) : rows.length === 0 ? (
        <AdminEmptyState
          title={translateAdmin(language, search === '' ? 'admin.agentPanel.activity.empty' : 'admin.agentPanel.activity.filteredEmpty')}
          glyph="chartLine"
        />
      ) : (
        <ul className="grid gap-2" data-agent-activity-list>
          {rows.map((row) => (
            <li
              key={row.conversationId}
              data-agent-activity={row.conversationId}
              className="grid gap-1 rounded-card p-3"
              style={{ backgroundColor: SURFACE, border: `1px solid ${EDGE}` }}
            >
              <span className="flex flex-wrap items-center justify-between gap-2">
                <AdminEntityIdentity language={language} entity={agentConversationRefOf(row, language)} />
                {row.enabled === null ? null : (
                  <AdminBadge tone={row.enabled ? 'success' : 'neutral'} glyph={row.enabled ? 'checkCircle' : 'prohibit'}>
                    {translateAdmin(language, row.enabled ? 'admin.agentPanel.state.on' : 'admin.agentPanel.state.off')}
                  </AdminBadge>
                )}
              </span>
              <span className="text-caption" style={{ color: INK2 }}>
                {translateAdmin(language, 'admin.agentPanel.activity.line', {
                  messages: formatCount(row.messagesSent, language),
                  words: formatCount(row.totalWordsSent, language),
                  confidence: formatPercent(row.avgConfidence, 'ratio', language),
                })}
              </span>
              <span className="text-caption" style={{ color: INK2 }}>
                {row.lastResponseAt === null ? (
                  translateAdmin(language, 'admin.agentPanel.lastResponse.never')
                ) : (
                  <AdminMomentText moment={adminMomentOf(row.lastResponseAt, now(), language)} />
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </AdminFicheSection>
  );
}

function AgentScanChart({ language, deps }: { readonly language: AdminLanguage; readonly deps: AdminDeps }) {
  const [months, setMonths] = useState<number>(3);
  const [bucket, setBucket] = useState<AgentScanBucket>('day');

  const stats = useQuery({
    queryKey: agentScanStatsQueryKey(months, bucket),
    queryFn: async ({ signal }) => unwrap(await loadAgentScanStats({ ...deps, months, bucket, signal })),
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 60_000,
  });

  const data = stats.data;
  const cost = data?.buckets.reduce((total, entry) => total + entry.costUsd, 0) ?? 0;
  const point = (value: (entry: NonNullable<typeof data>['buckets'][number]) => number) =>
    (data?.buckets ?? []).map((entry) => ({ x: adminDayLabel(entry.date, language), value: value(entry) }));

  return (
    <AdminFicheSection id="scan-stats" title={translateAdmin(language, bucket === 'day' ? 'admin.agentPanel.chart.day' : 'admin.agentPanel.chart.week')}>
      <div className="flex flex-wrap gap-3">
        <label className="grid gap-1">
          <span className="text-caption font-medium" style={{ color: INK2 }}>
            {translateAdmin(language, 'admin.agentPanel.chart.months')}
          </span>
          <select
            data-agent-chart-months
            value={String(months)}
            onChange={(event) => setMonths(Number(event.currentTarget.value))}
            className={`rounded-chip px-3 text-body ${FOCUS}`}
            style={SELECT_STYLE}
          >
            {MONTHS.map((count) => (
              <option key={count} value={String(count)}>
                {translateAdmin(language, 'admin.agentPanel.chart.monthsValue', { count: formatCount(count, language) })}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-caption font-medium" style={{ color: INK2 }}>
            {translateAdmin(language, 'admin.agentPanel.chart.bucket')}
          </span>
          <select
            data-agent-chart-bucket
            value={bucket}
            onChange={(event) => setBucket(event.currentTarget.value === 'week' ? 'week' : 'day')}
            className={`rounded-chip px-3 text-body ${FOCUS}`}
            style={SELECT_STYLE}
          >
            <option value="day">{translateAdmin(language, 'admin.agentPanel.chart.bucket.day')}</option>
            <option value="week">{translateAdmin(language, 'admin.agentPanel.chart.bucket.week')}</option>
          </select>
        </label>
      </div>
      <AdminTimelineChart
        language={language}
        id="agent-scans"
        title={translateAdmin(language, bucket === 'day' ? 'admin.agentPanel.chart.day' : 'admin.agentPanel.chart.week')}
        series={[
          { key: 'scans', label: translateAdmin(language, 'admin.agentPanel.chart.scans'), points: point((entry) => entry.scans) },
          { key: 'messages', label: translateAdmin(language, 'admin.agentPanel.logs.col.messages'), points: point((entry) => entry.messagesSent) },
        ]}
        format={(value) => formatCount(value, language)}
        summary={
          data === undefined
            ? ''
            : translateAdmin(language, 'admin.agentPanel.chart.summary', {
                scans: formatCount(data.totalLogs, language),
                since: adminDate(data.since, language),
                cost: formatMoney(cost, language),
              })
        }
        state={data === undefined ? (stats.isPending ? 'loading' : 'error') : 'ready'}
        onRetry={() => void stats.refetch()}
      />
    </AdminFicheSection>
  );
}
