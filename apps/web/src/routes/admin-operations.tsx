import { AdminBadge } from '@/components/admin/badges';
import { AdminTimelineChart } from '@/components/admin/charts/timeline-chart';
import { AdminPageHeader } from '@/components/admin/page-header';
import { AdminSectionScreen } from '@/components/admin/section-screen';
import { AdminStatCard, AdminStatGrid } from '@/components/admin/stat-card';
import { AdminErrorState, AdminInlineNotice, AdminOfflineNotice, AdminSkeleton } from '@/components/admin/states';
import { INK2 } from '@/components/admin/tone';
import { hostSeriesOf, latestGauges } from '@/lib/admin/host-metrics';
import { formatBytes, formatCount, formatPercent } from '@/lib/admin/interpret/numbers';
import { useHostMetrics, type LiveSource } from '@/lib/admin/use-host-metrics';
import type { AdminDeps } from '@/lib/api/admin';
import { apiDeps } from '@/lib/api/deps';
import { currentAdminLanguage, suspendForAdminInterfaceCatalog, translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';
import type { HostMetricsSnapshot } from '@meeshy/shared/types/admin-ops';

import { AdminOperationsActions } from './admin-operations-actions';
import { AdminOperationsContainers } from './admin-operations-containers';

/**
 * **LES OPÉRATIONS DU SERVEUR** (#10391, #10396) — `/admin/operations` · `/adm/operations`.
 *
 * L'hôte EN DIRECT (socket `admin-metrics:subscribe`, repli par relecture toutes les 5 s) :
 * jauges de la dernière mesure (processeur, mémoire, disque, swap, Docker récupérable,
 * GPU), puis quatre graphes d'une heure (processeur, charge 1/5/15, mémoire et swap,
 * disque) — un axe par graphe, tableau des données au clavier. Un bandeau dit quand
 * l'hôte est PARTAGÉ (staging et production sur la même machine). Sous les graphes, les
 * CONTENEURS de l'environnement (état, image et sa date, durée de marche ; au toucher, la
 * consommation et les réseaux — #11441), puis la sauvegarde et le nettoyage de Docker
 * (rang d'administration, confirmation qui nomme l'opération).
 *
 * Rang d'administration (`requireAdminRank()` côté passerelle) : `adminRankOnly`.
 */
const percentOf = (value: number, language: AdminLanguage): string => formatPercent(value, 'hundred', language);

function HostGauges({ language, snapshot }: { readonly language: AdminLanguage; readonly snapshot: HostMetricsSnapshot }) {
  const gauges = latestGauges(snapshot);
  const docker = snapshot.docker;
  const reclaimable = docker === null ? null : docker.images.reclaimableBytes + docker.buildCache.reclaimableBytes + docker.volumes.reclaimableBytes;
  const dockerTotal = docker === null ? null : docker.images.totalBytes + docker.buildCache.totalBytes + docker.volumes.totalBytes;
  const gpu = snapshot.gpu;
  return (
    <section className="grid gap-3" data-admin-ops-gauges aria-label={translateAdmin(language, 'admin.ops.gauges.title')}>
      <h2 className="text-body font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
        {translateAdmin(language, 'admin.ops.gauges.title')}
      </h2>
      <AdminStatGrid columns={3}>
        <AdminStatCard
          language={language}
          anchor="ops-cpu"
          label={translateAdmin(language, 'admin.ops.gauge.cpu')}
          value={gauges === null ? '—' : percentOf(gauges.cpuPercent, language)}
          {...(gauges === null ? {} : { caption: translateAdmin(language, 'admin.ops.gauge.cpu.caption', { cores: formatCount(gauges.cores, language), load: gauges.load1.toFixed(2) }) })}
        />
        <AdminStatCard
          language={language}
          anchor="ops-memory"
          label={translateAdmin(language, 'admin.ops.gauge.memory')}
          value={gauges === null ? '—' : percentOf(gauges.memoryPercent, language)}
          {...(gauges === null ? {} : { caption: translateAdmin(language, 'admin.ops.gauge.memory.caption', { used: formatBytes(gauges.memoryUsedBytes, language), total: formatBytes(gauges.memoryTotalBytes, language) }) })}
        />
        <AdminStatCard
          language={language}
          anchor="ops-disk"
          label={translateAdmin(language, 'admin.ops.gauge.disk')}
          value={gauges === null ? '—' : percentOf(gauges.diskPercent, language)}
          {...(gauges === null ? {} : { caption: translateAdmin(language, 'admin.ops.gauge.disk.caption', { free: formatBytes(gauges.diskFreeBytes, language), total: formatBytes(gauges.diskTotalBytes, language) }) })}
        />
        <AdminStatCard language={language} anchor="ops-swap" label={translateAdmin(language, 'admin.ops.gauge.swap')} value={gauges === null ? '—' : percentOf(gauges.swapPercent, language)} />
        <AdminStatCard
          language={language}
          anchor="ops-docker"
          label={translateAdmin(language, 'admin.ops.docker.reclaimable')}
          value={reclaimable === null ? '—' : formatBytes(reclaimable, language)}
          caption={
            reclaimable === null || dockerTotal === null || docker === null
              ? translateAdmin(language, 'admin.ops.docker.unknown')
              : `${translateAdmin(language, 'admin.ops.docker.reclaimable.caption', { share: percentOf(dockerTotal === 0 ? 0 : (reclaimable / dockerTotal) * 100, language), total: formatBytes(dockerTotal, language) })} · ${translateAdmin(language, 'admin.ops.docker.images.caption', { count: formatCount(docker.images.count, language), active: formatCount(docker.images.activeCount, language), reclaimable: formatBytes(docker.images.reclaimableBytes, language) })}`
          }
        />
        <AdminStatCard
          language={language}
          anchor="ops-gpu"
          label={translateAdmin(language, 'admin.ops.gpu.title')}
          value={gpu.kind === 'present' ? (gpu.usedPercent === null ? gpu.name : percentOf(gpu.usedPercent, language)) : '—'}
          caption={gpu.kind === 'present' ? gpu.name : translateAdmin(language, gpu.reason === 'no-compute-gpu' ? 'admin.ops.gpu.absent' : 'admin.ops.gpu.hidden')}
        />
      </AdminStatGrid>
      {reclaimable !== null && dockerTotal !== null && dockerTotal > 0 && reclaimable / dockerTotal > 0.2 ? (
        <AdminInlineNotice tone="info" text={translateAdmin(language, 'admin.ops.docker.hint')} />
      ) : null}
    </section>
  );
}

function HostCharts({ language, snapshot }: { readonly language: AdminLanguage; readonly snapshot: HostMetricsSnapshot }) {
  const series = hostSeriesOf(snapshot, language);
  const pct = (value: number) => percentOf(value, language);
  const last = (points: readonly { readonly value: number }[]) => points.at(-1)?.value ?? 0;
  const peak = (points: readonly { readonly value: number }[]) => Math.max(0, ...points.map((point) => point.value));
  return (
    <div className="grid gap-4 @4xl:grid-cols-2" data-admin-ops-charts>
      <AdminTimelineChart
        language={language}
        id="ops-cpu"
        title={translateAdmin(language, 'admin.ops.chart.cpu')}
        series={[{ key: 'cpu', label: translateAdmin(language, 'admin.ops.gauge.cpu'), points: series.cpu }]}
        format={pct}
        summary={translateAdmin(language, 'admin.ops.chart.cpu.summary', { now: last(series.cpu).toFixed(1), max: peak(series.cpu).toFixed(1) })}
      />
      <AdminTimelineChart
        language={language}
        id="ops-load"
        title={translateAdmin(language, 'admin.ops.chart.load')}
        series={series.load.map((entry) => ({ key: entry.key, label: translateAdmin(language, `admin.ops.series.${entry.key}`), points: entry.points }))}
        format={(value) => value.toFixed(2)}
        summary={translateAdmin(language, 'admin.ops.chart.load.summary', { now: last(series.load[0]?.points ?? []).toFixed(2) })}
      />
      <AdminTimelineChart
        language={language}
        id="ops-memory"
        title={translateAdmin(language, 'admin.ops.chart.memory')}
        series={[
          { key: 'memory', label: translateAdmin(language, 'admin.ops.series.memory'), points: series.memory },
          { key: 'swap', label: translateAdmin(language, 'admin.ops.series.swap'), points: series.swap },
        ]}
        format={pct}
        summary={translateAdmin(language, 'admin.ops.chart.memory.summary', { now: last(series.memory).toFixed(1), swap: last(series.swap).toFixed(1) })}
      />
      <AdminTimelineChart
        language={language}
        id="ops-disk"
        title={translateAdmin(language, 'admin.ops.chart.disk')}
        series={[{ key: 'disk', label: translateAdmin(language, 'admin.ops.gauge.disk'), points: series.disk }]}
        format={pct}
        summary={translateAdmin(language, 'admin.ops.chart.disk.summary', { now: last(series.disk).toFixed(1) })}
      />
    </div>
  );
}

export function AdminOperationsPanel({
  language,
  deps = apiDeps,
  liveSource,
  now = () => new Date(),
}: {
  readonly language: AdminLanguage;
  readonly deps?: AdminDeps;
  readonly liveSource?: LiveSource | null;
  readonly now?: () => Date;
}) {
  const { query, live } = useHostMetrics({ deps, enabled: true, ...(liveSource === undefined ? {} : { liveSource }) });
  const snapshot = query.data;

  return (
    <div className="grid gap-6" data-admin-operations>
      <AdminPageHeader
        language={language}
        title={translateAdmin(language, 'admin.nav.operations')}
        subtitle={translateAdmin(language, 'admin.ops.subtitle')}
        place={{ section: 'operations' }}
      />
      <AdminOfflineNotice language={language} />
      {snapshot === undefined ? null : (
        <div className="flex flex-wrap items-center gap-2" data-admin-ops-host>
          <span className="text-caption" style={{ color: INK2 }}>
            {translateAdmin(language, 'admin.ops.environment', { name: snapshot.environment, host: snapshot.hostname })}
          </span>
          <span data-admin-ops-live={live ? 'socket' : 'polling'}>
            <AdminBadge tone={live ? 'success' : 'neutral'}>{translateAdmin(language, live ? 'admin.ops.live' : 'admin.ops.polling')}</AdminBadge>
          </span>
        </div>
      )}
      {snapshot?.sharedHost === true ? (
        <div data-admin-ops-shared>
          <AdminInlineNotice tone="warning" text={translateAdmin(language, 'admin.ops.shared')} />
        </div>
      ) : null}
      {snapshot === undefined ? (
        query.isPending ? (
          <AdminSkeleton rows={4} />
        ) : (
          <AdminErrorState language={language} message={translateAdmin(language, 'admin.ops.unavailable')} onRetry={() => void query.refetch()} />
        )
      ) : (
        <>
          <HostGauges language={language} snapshot={snapshot} />
          <HostCharts language={language} snapshot={snapshot} />
        </>
      )}
      <AdminOperationsContainers language={language} deps={deps} now={now} />
      <AdminOperationsActions language={language} deps={deps} now={now} />
    </div>
  );
}

export default function AdminOperationsScreen() {
  const language = currentAdminLanguage();
  suspendForAdminInterfaceCatalog(language);

  return (
    <AdminSectionScreen section="operations" language={language} title={translateAdmin(language, 'admin.nav.operations')}>
      {() => <AdminOperationsPanel language={language} />}
    </AdminSectionScreen>
  );
}
