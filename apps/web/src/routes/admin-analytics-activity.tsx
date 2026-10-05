import { AdminBarChart } from '@/components/admin/charts/bar-chart';
import { peakOf } from '@/components/admin/charts/chart-scale';
import { AdminShareChart } from '@/components/admin/charts/share-chart';
import { AdminTimelineChart } from '@/components/admin/charts/timeline-chart';
import { AdminStatGrid } from '@/components/admin/stat-card';
import { INK3 } from '@/components/admin/tone';
import { interpretActivityBucket, interpretMessageType } from '@/lib/admin/interpret/enums';
import { formatCount, formatPercent } from '@/lib/admin/interpret/numbers';
import { adminMomentOf, dayLabelsEndingToday, hourLabel } from '@/lib/admin/interpret/time';
import { mergeByLabel, formatDecimal } from '@/lib/admin/analytics-labels';
import { typesPeriodOf } from '@/lib/admin/analytics-windows';
import type { AdminDeps } from '@/lib/api/admin';
import {
  analyticsKeys,
  loadAnalyticsHourlyActivity,
  loadAnalyticsKpis,
  loadAnalyticsMessageTypes,
  loadAnalyticsRealtime,
  loadAnalyticsUserDistribution,
  loadAnalyticsVolumeTimeline,
  type HourlyBucket,
  type KpiPeriod,
  type MessageTypeShare,
} from '@/lib/api/admin-analytics';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';

import { Metric, StaleDataNotice, StatsBlock, StatsSection, useStatsQuery, windowNote, type Block } from './admin-analytics-parts';

type TabProps = {
  readonly language: AdminLanguage;
  readonly deps: AdminDeps;
  readonly now: Date;
  readonly period: KpiPeriod;
};

const noMessages = (language: AdminLanguage): string => translateAdmin(language, 'admin.analytics.messages.trends.none');

function VolumeChart({ language, now, block }: { readonly language: AdminLanguage; readonly now: Date; readonly block: Block<readonly number[]> }) {
  const values = block.data ?? [];
  const labels = dayLabelsEndingToday(values.length, now, language);
  const points = values.map((value, index) => ({ x: labels[index] ?? '', value }));
  const peak = peakOf(points);
  const summary =
    peak === null || peak.value === 0
      ? noMessages(language)
      : translateAdmin(language, 'admin.analytics.peak.day', { day: points[peak.index]?.x ?? '', count: formatCount(peak.value, language) });

  return (
    <AdminTimelineChart
      language={language}
      id="volume"
      title={translateAdmin(language, 'admin.analytics.activity.volume.title')}
      series={[{ key: 'messages', label: translateAdmin(language, 'admin.analytics.messages.total'), points }]}
      format={(value) => formatCount(value, language)}
      summary={summary}
      state={block.state}
      onRetry={block.retry}
    />
  );
}

/** Les tranches sont étiquetées par leur HEURE DE DÉBUT : la barre « 14 h » compte de 14 h à 17 h. */
function HourlyChart({ language, block }: { readonly language: AdminLanguage; readonly block: Block<readonly HourlyBucket[]> }) {
  const buckets = block.data ?? [];
  const busiest = peakOf(buckets.map((bucket) => ({ value: bucket.messages })));
  const top = busiest === null ? undefined : buckets[busiest.index];
  const summary =
    top === undefined || top.messages === 0
      ? noMessages(language)
      : translateAdmin(language, 'admin.analytics.activity.hourly.summary', { hour: hourLabel(top.hour, language), count: formatCount(top.messages, language) });

  return (
    <AdminBarChart
      language={language}
      id="hourly"
      title={translateAdmin(language, 'admin.analytics.activity.hourly.title')}
      data={buckets.map((bucket) => ({ key: String(bucket.hour), label: hourLabel(bucket.hour, language), value: bucket.messages }))}
      format={(value) => formatCount(value, language)}
      summary={summary}
      orientation="vertical"
      state={block.state}
      onRetry={block.retry}
    />
  );
}

/** Les tranches d'engagement sont NOMMÉES par leur position servie (très actifs, actifs, occasionnels, inactifs) : le nom français du serveur est ignoré. */
function DistributionChart({ language, block }: { readonly language: AdminLanguage; readonly block: Block<readonly number[]> }) {
  const counts = block.data ?? [];
  const total = counts.reduce((sum, count) => sum + count, 0);
  const data = counts.map((count, index) => ({ key: `bucket-${index}`, label: interpretActivityBucket(index, language).label, value: count }));
  const largest = peakOf(data);
  const top = largest === null ? undefined : data[largest.index];
  const summary =
    top === undefined || total === 0
      ? ''
      : translateAdmin(language, 'admin.analytics.activity.distribution.summary', {
          label: top.label,
          count: formatCount(top.value, language),
          percent: formatPercent(top.value / total, 'ratio', language),
        });

  return (
    <div className="grid gap-2">
      <AdminShareChart
        language={language}
        id="distribution"
        title={translateAdmin(language, 'admin.analytics.activity.distribution.title')}
        data={data}
        format={(value) => formatCount(value, language)}
        summary={summary}
        state={block.state}
        onRetry={block.retry}
      />
      <p className="px-1 text-caption" style={{ color: INK3 }}>
        {translateAdmin(language, 'admin.analytics.activity.distribution.hint')}
      </p>
    </div>
  );
}

function TypesChart({ language, block }: { readonly language: AdminLanguage; readonly block: Block<readonly MessageTypeShare[]> }) {
  const shares = [...(block.data ?? [])].sort((left, right) => right.count - left.count);
  const data = mergeByLabel(shares.map((share) => ({ key: share.type, label: interpretMessageType(share.type, language).label, value: share.count })));
  const top = shares[0];
  const summary =
    top === undefined
      ? ''
      : translateAdmin(language, 'admin.analytics.types.summary', {
          type: interpretMessageType(top.type, language).label,
          percent: formatPercent(top.percentage, 'hundred', language),
        });

  return (
    <AdminShareChart
      language={language}
      id="message-types"
      title={translateAdmin(language, 'admin.analytics.types.title')}
      data={data}
      format={(value) => formatCount(value, language)}
      summary={summary}
      state={block.state}
      onRetry={block.retry}
    />
  );
}

/**
 * **L'ONGLET ACTIVITÉ** (#8876, #6728) — le temps réel (rafraîchi chaque minute
 * tant que l'onglet est visible), la santé de l'usage sur la période choisie, et
 * les tendances.
 *
 * `avgSessionTime` et `peakHours` — codés en dur côté serveur — ne sont ni lus
 * ni affichés. Les libellés français du serveur (jours, tranches, niveaux
 * d'engagement) sont remplacés par des libellés dans la langue d'interface,
 * calculés depuis la position.
 */
export function AdminActivityTab({ language, deps, now, period }: TabProps) {
  const typesPeriod = typesPeriodOf(period);
  const realtime = useStatsQuery(analyticsKeys.realtime(), (signal) => loadAnalyticsRealtime({ ...deps, signal }), { staleTime: 30_000, refetchInterval: 60_000 });
  const kpis = useStatsQuery(analyticsKeys.kpis(period), (signal) => loadAnalyticsKpis({ ...deps, period, signal }));
  const volume = useStatsQuery(analyticsKeys.volume(), (signal) => loadAnalyticsVolumeTimeline({ ...deps, signal }));
  const hourly = useStatsQuery(analyticsKeys.hourly(), (signal) => loadAnalyticsHourlyActivity({ ...deps, signal }));
  const distribution = useStatsQuery(analyticsKeys.distribution(), (signal) => loadAnalyticsUserDistribution({ ...deps, signal }));
  const types = useStatsQuery(analyticsKeys.messageTypes(typesPeriod), (signal) => loadAnalyticsMessageTypes({ ...deps, period: typesPeriod, signal }));

  const measured = adminMomentOf(realtime.data?.timestamp, now, language);

  return (
    <div className="grid gap-6" data-admin-tab-panel="activity">
      <StaleDataNotice language={language} queries={[realtime, kpis, volume, hourly, distribution, types]} />

      <StatsSection
        id="analytics-now"
        title={translateAdmin(language, 'admin.analytics.activity.now.title')}
        {...(measured === null ? {} : { note: translateAdmin(language, 'admin.analytics.activity.now.updated', { moment: measured.relative }) })}
      >
        <StatsBlock language={language} query={realtime} groupError>
          {(block) => (
            <AdminStatGrid columns={3}>
              <Metric
                language={language}
                block={block}
                anchor="online"
                label={translateAdmin(language, 'admin.analytics.activity.now.online')}
                value={(data) => formatCount(data.onlineUsers, language)}
                caption={() => translateAdmin(language, 'admin.analytics.activity.now.online.caption')}
              />
              <Metric
                language={language}
                block={block}
                anchor="messages-last-hour"
                label={translateAdmin(language, 'admin.analytics.activity.now.messages')}
                value={(data) => formatCount(data.messagesLastHour, language)}
                caption={() => translateAdmin(language, 'admin.analytics.activity.now.messages.caption')}
              />
              <Metric
                language={language}
                block={block}
                anchor="active-conversations"
                label={translateAdmin(language, 'admin.analytics.activity.now.conversations')}
                value={(data) => formatCount(data.activeConversations, language)}
                caption={() => translateAdmin(language, 'admin.analytics.activity.now.conversations.caption')}
              />
            </AdminStatGrid>
          )}
        </StatsBlock>
      </StatsSection>

      <StatsSection id="analytics-health" title={translateAdmin(language, 'admin.analytics.activity.health.title')} note={windowNote(language, period)}>
        <StatsBlock language={language} query={kpis} groupError>
          {(block) => (
            <AdminStatGrid columns={4}>
              <Metric
                language={language}
                block={block}
                anchor="engagement-rate"
                label={translateAdmin(language, 'admin.analytics.activity.health.engagement')}
                value={(data) => formatPercent(data.engagementRate, 'hundred', language)}
                caption={() => translateAdmin(language, 'admin.analytics.activity.health.engagement.caption')}
              />
              <Metric
                language={language}
                block={block}
                anchor="growth-rate"
                label={translateAdmin(language, 'admin.analytics.activity.health.growth')}
                value={(data) => formatPercent(data.growthRate, 'hundred', language)}
                caption={() => translateAdmin(language, 'admin.analytics.activity.health.growth.caption')}
              />
              <Metric
                language={language}
                block={block}
                anchor="messages-per-user"
                label={translateAdmin(language, 'admin.analytics.activity.health.perUser')}
                value={(data) => formatDecimal(data.messagesPerUser, language)}
                caption={() => translateAdmin(language, 'admin.analytics.activity.health.perUser.caption')}
              />
              <Metric
                language={language}
                block={block}
                anchor="active-user-rate"
                label={translateAdmin(language, 'admin.analytics.activity.health.active')}
                value={(data) => formatPercent(data.activeUserRate, 'hundred', language)}
                caption={() => translateAdmin(language, 'admin.analytics.activity.health.active.caption')}
              />
            </AdminStatGrid>
          )}
        </StatsBlock>
      </StatsSection>

      <StatsSection id="analytics-trends" title={translateAdmin(language, 'admin.analytics.activity.trends.title')}>
        <div className="grid gap-4 @4xl:grid-cols-2">
          <StatsBlock language={language} query={volume}>
            {(block) => <VolumeChart language={language} now={now} block={block} />}
          </StatsBlock>
          <div className="grid content-start gap-2">
            <StatsBlock language={language} query={hourly}>
              {(block) => <HourlyChart language={language} block={block} />}
            </StatsBlock>
            <p className="px-1 text-caption" style={{ color: INK3 }}>
              {translateAdmin(language, 'admin.analytics.activity.hourly.hint')}
            </p>
          </div>
          <StatsBlock language={language} query={distribution}>
            {(block) => <DistributionChart language={language} block={block} />}
          </StatsBlock>
          <div className="grid content-start gap-2">
            <StatsBlock language={language} query={types}>
              {(block) => <TypesChart language={language} block={block} />}
            </StatsBlock>
            <p className="px-1 text-caption" style={{ color: INK3 }}>
              {windowNote(language, typesPeriod)}
            </p>
          </div>
        </div>
      </StatsSection>
    </div>
  );
}
