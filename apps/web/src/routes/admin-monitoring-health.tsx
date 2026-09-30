import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { AdminStatCard, AdminStatGrid } from '@/components/admin/stat-card';
import { AdminInterpretedBadge } from '@/components/admin/badges';
import { AdminMomentText } from '@/components/admin/meta';
import { AdminDeniedInline, AdminEmptyState, AdminErrorState, AdminInlineNotice } from '@/components/admin/states';
import { BRAND, EDGE, INK, INK2, SURFACE, TONE_COLOR } from '@/components/admin/tone';
import { interpretServiceStatus } from '@/lib/admin/interpret/enums';
import { formatBytes, formatCount, formatPercent } from '@/lib/admin/interpret/numbers';
import { adminMomentOf, formatDuration } from '@/lib/admin/interpret/time';
import { HEALTH_REFRESH_MS, healthRefetchInterval } from '@/lib/admin/monitoring-state';
import { breakerStateOf, healthIssuesOf, megabytesToBytes } from '@/lib/admin/monitoring-view';
import { useDocumentVisible } from '@/lib/admin/monitoring-visibility';
import type { AdminDeps } from '@/lib/api/admin';
import { ADMIN_MONITORING_HEALTH_KEY, loadAdminMonitoring, type AdminCircuitBreaker, type AdminMonitoring } from '@/lib/api/admin-monitoring';
import { ApiError, unwrap } from '@/lib/api/client';
import { translateAdmin, type AdminPlainCatalogKey, type AdminLanguage } from '@/lib/i18n-admin-catalog';

import { MonitoringSection, RefreshButton, ServiceCard } from './admin-monitoring-parts';

/**
 * **LA SANTÉ DE LA PLATEFORME** (#8876, #6734) — une lecture (`GET /admin/monitoring`),
 * relue toutes les trente secondes TANT QUE l'écran est visible, et à la demande.
 *
 * Six blocs : passerelle, données (base, Redis), temps réel, traduction, coupe-circuits,
 * présence. Ce que la passerelle ne sait pas n'est pas dessiné en zéros : un traducteur
 * injoignable se DIT, la présence sans service vivant n'a pas de bloc (« inconnu » n'est
 * pas « zéro »). Un état porte toujours son mot — un coupe-circuit ouvert est « Coupé »,
 * en danger, avec ce que cela change.
 *
 * Cache d'abord : la dernière mesure reste à l'écran pendant qu'elle se renouvelle.
 */
const defaultNow = (): Date => new Date();

export type MonitoringHealthProps = {
  readonly language: AdminLanguage;
  readonly deps: AdminDeps;
  readonly now?: () => Date;
  readonly refreshMs?: number;
};

function Metric({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-caption" style={{ color: INK2 }}>
        {label}
      </dt>
      <dd className="text-body tabular-nums" style={{ color: INK }}>
        {children}
      </dd>
    </div>
  );
}

function BreakerItem({ language, breaker, now }: { readonly language: AdminLanguage; readonly breaker: AdminCircuitBreaker; readonly now: Date }) {
  const state = breakerStateOf(breaker.state, language);
  const open = state.raw.toUpperCase() === 'OPEN';
  const lastFailure = adminMomentOf(breaker.lastFailureAt, now, language);

  return (
    <li
      data-admin-breaker={breaker.name}
      data-admin-breaker-state={state.raw}
      className="grid gap-3 rounded-card p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:p-5"
      style={{ backgroundColor: SURFACE, border: `1px solid ${open ? TONE_COLOR.danger : EDGE}` }}
    >
      <div className="grid min-w-0 gap-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="min-w-0 break-words font-mono text-body font-semibold" style={{ color: INK }}>
            {breaker.name}
          </span>
          <AdminInterpretedBadge value={state} />
        </span>
        {state.explain === null ? null : (
          <span className="text-caption" style={{ color: INK2 }}>
            {state.explain}
          </span>
        )}
      </div>
      <dl className="flex flex-wrap gap-x-6 gap-y-2">
        <Metric label={translateAdmin(language, 'admin.monitoring.breakers.failures')}>{formatCount(breaker.failures, language)}</Metric>
        <Metric label={translateAdmin(language, 'admin.monitoring.breakers.successes')}>{formatCount(breaker.successes, language)}</Metric>
        <Metric label={translateAdmin(language, 'admin.monitoring.breakers.lastFailure')}>
          {lastFailure === null ? translateAdmin(language, 'admin.monitoring.breakers.never') : <AdminMomentText moment={lastFailure} />}
        </Metric>
      </dl>
    </li>
  );
}

function HealthBody({ language, monitoring, now }: { readonly language: AdminLanguage; readonly monitoring: AdminMonitoring; readonly now: Date }) {
  const t = (key: AdminPlainCatalogKey): string => translateAdmin(language, key);
  const { gateway, realtime, translator, presenceUpdates } = monitoring;
  const count = (value: number) => formatCount(value, language);

  return (
    <div className="grid gap-8">
      <MonitoringSection id="gateway" title={t('admin.monitoring.gateway.title')}>
        <AdminStatGrid columns={3}>
          <AdminStatCard
            language={language}
            anchor="gateway-uptime"
            label={t('admin.monitoring.gateway.uptime')}
            value={formatDuration(gateway.uptimeSeconds, 's', language)}
            caption={t('admin.monitoring.gateway.uptime.caption')}
          />
          <AdminStatCard
            language={language}
            anchor="gateway-heap"
            label={t('admin.monitoring.gateway.heap')}
            value={formatBytes(gateway.memory.heapUsed, language)}
            caption={translateAdmin(language, 'admin.monitoring.gateway.heap.caption', { total: formatBytes(gateway.memory.heapTotal, language) })}
          />
          <AdminStatCard
            language={language}
            anchor="gateway-rss"
            label={t('admin.monitoring.gateway.rss')}
            value={formatBytes(gateway.memory.rss, language)}
            caption={t('admin.monitoring.gateway.rss.caption')}
          />
        </AdminStatGrid>
      </MonitoringSection>

      <MonitoringSection id="data" title={t('admin.monitoring.data.title')}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4">
          <ServiceCard
            language={language}
            anchor="database"
            title={t('admin.monitoring.database.title')}
            status={interpretServiceStatus(monitoring.database.status, language)}
            latencyMs={monitoring.database.latencyMs}
          />
          <ServiceCard
            language={language}
            anchor="redis"
            title={t('admin.monitoring.redis.title')}
            status={interpretServiceStatus(monitoring.redis.status, language)}
            latencyMs={monitoring.redis.latencyMs}
          />
        </div>
      </MonitoringSection>

      <MonitoringSection id="realtime" title={t('admin.monitoring.realtime.title')}>
        <AdminStatGrid columns={3}>
          <AdminStatCard language={language} anchor="realtime-connections" label={t('admin.monitoring.realtime.connections')} value={count(realtime.connections)} caption={t('admin.monitoring.realtime.connections.caption')} />
          <AdminStatCard language={language} anchor="realtime-users" label={t('admin.monitoring.realtime.users')} value={count(realtime.connectedUsers)} />
          <AdminStatCard language={language} anchor="realtime-messages" label={t('admin.monitoring.realtime.messages')} value={count(realtime.messagesProcessed)} caption={t('admin.monitoring.realtime.messages.caption')} />
          <AdminStatCard language={language} anchor="realtime-translations" label={t('admin.monitoring.realtime.translations')} value={count(realtime.translationsSent)} />
          <AdminStatCard language={language} anchor="realtime-errors" label={t('admin.monitoring.realtime.errors')} value={count(realtime.errors)} />
        </AdminStatGrid>
      </MonitoringSection>

      <MonitoringSection id="translator" title={t('admin.monitoring.translator.title')}>
        {translator === null ? (
          <AdminEmptyState
            title={t('admin.monitoring.translator.unreachable')}
            hint={t('admin.monitoring.translator.unreachable.hint')}
            glyph="translate"
          />
        ) : (
          <AdminStatGrid columns={4}>
            <AdminStatCard language={language} anchor="translator-sent" label={t('admin.monitoring.translator.sent')} value={count(translator.requestsSent)} />
            <AdminStatCard language={language} anchor="translator-received" label={t('admin.monitoring.translator.received')} value={count(translator.received)} />
            <AdminStatCard language={language} anchor="translator-errors" label={t('admin.monitoring.translator.errors')} value={count(translator.errors)} />
            <AdminStatCard language={language} anchor="translator-pool-full" label={t('admin.monitoring.translator.poolFull')} value={count(translator.poolFullRejections)} caption={t('admin.monitoring.translator.poolFull.caption')} />
            <AdminStatCard language={language} anchor="translator-avg-time" label={t('admin.monitoring.translator.avgTime')} value={formatDuration(translator.avgProcessingTimeMs, 'ms', language)} />
            <AdminStatCard
              language={language}
              anchor="translator-cache-hit"
              label={t('admin.monitoring.translator.cacheHit')}
              value={formatPercent(translator.cacheHitRate, 'hundred', language, 1)}
              caption={t('admin.monitoring.translator.cacheHit.caption')}
            />
            <AdminStatCard language={language} anchor="translator-memory" label={t('admin.monitoring.translator.memory')} value={formatBytes(megabytesToBytes(translator.memoryUsageMb), language)} caption={t('admin.monitoring.translator.memory.caption')} />
            <AdminStatCard language={language} anchor="translator-uptime" label={t('admin.monitoring.translator.uptime')} value={formatDuration(translator.uptimeSeconds, 's', language)} caption={t('admin.monitoring.translator.uptime.caption')} />
          </AdminStatGrid>
        )}
      </MonitoringSection>

      <MonitoringSection id="breakers" title={t('admin.monitoring.breakers.title')} hint={t('admin.monitoring.breakers.intro')}>
        {monitoring.circuitBreakers.length === 0 ? (
          <AdminEmptyState title={t('admin.monitoring.breakers.empty')} hint={t('admin.monitoring.breakers.emptyHint')} glyph="lightning" />
        ) : (
          <ul className="grid gap-3">
            {monitoring.circuitBreakers.map((breaker) => (
              <BreakerItem key={breaker.name} language={language} breaker={breaker} now={now} />
            ))}
          </ul>
        )}
      </MonitoringSection>

      {presenceUpdates === null ? null : (
        <MonitoringSection id="presence" title={t('admin.monitoring.presence.title')}>
          <AdminStatGrid columns={3}>
            <AdminStatCard language={language} anchor="presence-total" label={t('admin.monitoring.presence.total')} value={count(presenceUpdates.totalRequests)} />
            <AdminStatCard language={language} anchor="presence-throttled" label={t('admin.monitoring.presence.throttled')} value={count(presenceUpdates.throttledRequests)} caption={t('admin.monitoring.presence.throttled.caption')} />
            <AdminStatCard language={language} anchor="presence-rate" label={t('admin.monitoring.presence.rate')} value={formatPercent(presenceUpdates.throttleRate, 'hundred', language, 1)} />
          </AdminStatGrid>
        </MonitoringSection>
      )}
    </div>
  );
}

export function MonitoringHealth({ language, deps, now = defaultNow, refreshMs = HEALTH_REFRESH_MS }: MonitoringHealthProps) {
  const visible = useDocumentVisible();
  const query = useQuery<AdminMonitoring>({
    queryKey: ADMIN_MONITORING_HEALTH_KEY,
    queryFn: async ({ signal }) => unwrap(await loadAdminMonitoring({ ...deps, signal })),
    refetchInterval: healthRefetchInterval(visible, refreshMs),
    staleTime: 10_000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const monitoring = query.data;

  if (monitoring === undefined) {
    if (query.isPending) {
      return (
        <div data-admin-monitoring-skeleton aria-busy="true" aria-label={translateAdmin(language, 'admin.kit.loading')} className="grid gap-3">
          {[0, 1, 2].map((slot) => (
            <div key={slot} aria-hidden="true" className="rounded-card" style={{ height: 112, backgroundColor: 'color-mix(in srgb, var(--color-ios-ink-3) 12%, transparent)' }} />
          ))}
        </div>
      );
    }
    return query.error instanceof ApiError && query.error.status === 403 ? (
      <AdminDeniedInline language={language} />
    ) : (
      <AdminErrorState language={language} onRetry={() => void query.refetch()} />
    );
  }

  const clock = now();
  const issues = healthIssuesOf(monitoring, language);
  const measured = adminMomentOf(monitoring.generatedAt, clock, language);

  return (
    <div className="grid gap-6" data-admin-monitoring-health>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid gap-0.5">
          <span className="text-body" style={{ color: INK }}>
            {translateAdmin(language, 'admin.monitoring.health.measured')} · <AdminMomentText moment={measured} />
          </span>
          <span className="text-caption" style={{ color: INK2 }}>
            {translateAdmin(language, 'admin.monitoring.health.auto')}
          </span>
        </div>
        <RefreshButton language={language} busy={query.isFetching} onRefresh={() => void query.refetch()} />
      </div>

      {query.isError ? (
        <AdminInlineNotice
          tone="warning"
          text={translateAdmin(language, 'admin.kit.cached')}
          action={
            <button
              type="button"
              data-admin-retry
              onClick={() => void query.refetch()}
              className="rounded-chip px-3 text-caption font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{ minHeight: 44, color: BRAND, outlineColor: BRAND }}
            >
              {translateAdmin(language, 'admin.kit.retry')}
            </button>
          }
        />
      ) : null}

      <div className="grid gap-2" data-admin-health-issues>
        {issues.length === 0 ? (
          <AdminInlineNotice tone="success" text={translateAdmin(language, 'admin.monitoring.health.allGood')} />
        ) : (
          issues.map((issue) => <AdminInlineNotice key={issue.id} tone={issue.tone} text={issue.text} />)
        )}
      </div>

      <HealthBody language={language} monitoring={monitoring} now={clock} />
    </div>
  );
}
