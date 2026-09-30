import { AdminChartCard, seriesColor } from '@/components/admin/charts/chart-card';
import { AdminBarChart } from '@/components/admin/charts/bar-chart';
import { peakOf } from '@/components/admin/charts/chart-scale';
import { AdminShareChart } from '@/components/admin/charts/share-chart';
import { AdminTimelineChart } from '@/components/admin/charts/timeline-chart';
import { AdminEntityChip, type AdminEntityRef } from '@/components/admin/entity-chip';
import { AdminStatGrid } from '@/components/admin/stat-card';
import { AdminInlineNotice } from '@/components/admin/states';
import { INK, INK2 } from '@/components/admin/tone';
import { formatDecimal, mergeByLabel } from '@/lib/admin/analytics-labels';
import { engagementPeriodOf } from '@/lib/admin/analytics-windows';
import { interpretMessageType } from '@/lib/admin/interpret/enums';
import { guestLabel, personLabel, personSecondary } from '@/lib/admin/interpret/labels';
import { formatCount, formatPercent } from '@/lib/admin/interpret/numbers';
import { adminDayLabel, hourLabel, weekdayName } from '@/lib/admin/interpret/time';
import type { AdminDeps } from '@/lib/api/admin';
import {
  loadMessagesEngagement,
  loadMessagesStats,
  loadMessagesTrends,
  messageStatsKeys,
  type MessagesPeriod,
  type MessagesStats,
  type MessagesTrends,
  type TopSender,
} from '@/lib/api/admin-message-stats';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';

import { Metric, StaleDataNotice, StatsBlock, StatsSection, useStatsQuery, windowNote, type Block } from './admin-analytics-parts';

type TabProps = {
  readonly language: AdminLanguage;
  readonly deps: AdminDeps;
  readonly period: MessagesPeriod;
};

const noMessages = (language: AdminLanguage): string => translateAdmin(language, 'admin.analytics.messages.trends.none');

/** Un compte de messages, dit avec son unité (« 320 messages »). */
const messageCount = (count: number, language: AdminLanguage): string =>
  translateAdmin(language, 'admin.analytics.messages.senders.count', { count: formatCount(count, language) });

function TimelineChart({ language, block }: { readonly language: AdminLanguage; readonly block: Block<MessagesStats> }) {
  const days = block.data?.byDay ?? [];
  const points = days.map((day) => ({ x: adminDayLabel(day.date, language), value: day.count }));
  const peak = peakOf(points);
  const summary =
    peak === null || peak.value === 0
      ? noMessages(language)
      : translateAdmin(language, 'admin.analytics.peak.day', { day: points[peak.index]?.x ?? '', count: formatCount(peak.value, language) });

  if (block.state === 'ready' && points.length < 2) {
    return <AdminInlineNotice tone="info" text={translateAdmin(language, 'admin.analytics.messages.timeline.single')} />;
  }

  return (
    <AdminTimelineChart
      language={language}
      id="messages-timeline"
      title={translateAdmin(language, 'admin.analytics.messages.timeline.title')}
      series={[{ key: 'messages', label: translateAdmin(language, 'admin.analytics.messages.total'), points }]}
      format={(value) => formatCount(value, language)}
      summary={summary}
      state={block.state}
      onRetry={block.retry}
    />
  );
}

function TypesChart({ language, block }: { readonly language: AdminLanguage; readonly block: Block<MessagesStats> }) {
  const byType = block.data?.byType ?? [];
  const total = byType.reduce((sum, entry) => sum + entry.count, 0);
  const data = mergeByLabel(byType.map((entry) => ({ key: entry.type, label: interpretMessageType(entry.type, language).label, value: entry.count })));
  const top = byType[0];
  const summary =
    top === undefined || total === 0
      ? ''
      : translateAdmin(language, 'admin.analytics.types.summary', {
          type: interpretMessageType(top.type, language).label,
          percent: formatPercent(top.count / total, 'ratio', language),
        });

  return (
    <AdminShareChart
      language={language}
      id="messages-types"
      title={translateAdmin(language, 'admin.analytics.types.title')}
      data={data}
      format={(value) => formatCount(value, language)}
      summary={summary}
      state={block.state}
      onRetry={block.retry}
    />
  );
}

/** Un membre du classement : un compte est une fiche, un invité (dont le serveur ne sert aucun nom) renvoie à sa fiche d'invité. */
function senderEntity(sender: TopSender, language: AdminLanguage): AdminEntityRef {
  if (sender.guest) return { kind: 'anonymous', id: sender.userId, label: guestLabel(null, language) };
  const secondary = personSecondary(sender.username);
  return {
    kind: 'user',
    id: sender.userId,
    label: personLabel({ displayName: sender.displayName, username: sender.username }, language),
    ...(secondary === null || sender.displayName === null ? {} : { secondary }),
  };
}

function TopSenders({ language, block }: { readonly language: AdminLanguage; readonly block: Block<MessagesStats> }) {
  const senders = block.data?.topSenders ?? [];
  const max = Math.max(1, ...senders.map((sender) => sender.messageCount));

  return (
    <AdminChartCard
      language={language}
      id="top-senders"
      title={translateAdmin(language, 'admin.analytics.messages.senders.title')}
      summary={translateAdmin(language, 'admin.analytics.messages.senders.hint')}
      state={block.state}
      onRetry={block.retry}
      empty={senders.length === 0}
      height={44 * 3}
      table={{
        caption: translateAdmin(language, 'admin.analytics.messages.senders.title'),
        columns: [translateAdmin(language, 'admin.kit.chart.columnLabel'), translateAdmin(language, 'admin.kit.chart.columnValue')],
        rows: senders.map((sender) => [senderEntity(sender, language).label, formatCount(sender.messageCount, language)]),
      }}
    >
      <ol className="grid gap-2">
        {senders.map((sender, index) => (
          <li key={`${sender.userId}-${index}`} data-admin-top-sender={sender.userId} className="grid gap-1">
            <div className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-3">
                <span className="w-5 shrink-0 text-end text-caption tabular-nums" style={{ color: INK2 }}>
                  {index + 1}
                </span>
                <AdminEntityChip language={language} entity={senderEntity(sender, language)} />
              </span>
              <span className="shrink-0 text-body font-semibold tabular-nums" style={{ color: INK }}>
                {messageCount(sender.messageCount, language)}
              </span>
            </div>
            <span aria-hidden="true" className="ms-8 block h-1.5">
              <span className="block h-full rounded-full" style={{ width: `${Math.round((sender.messageCount / max) * 100)}%`, minWidth: 4, backgroundColor: seriesColor(0) }} />
            </span>
          </li>
        ))}
      </ol>
    </AdminChartCard>
  );
}

/**
 * L'heure et le jour de pointe se lisent par INDICE (0 = dimanche) et se nomment
 * dans la langue d'interface ; sans aucun message il n'y a PAS de pic.
 */
function TrendCards({ language, block }: { readonly language: AdminLanguage; readonly block: Block<MessagesTrends> }) {
  return (
    <AdminStatGrid columns={2}>
      <Metric
        language={language}
        block={block}
        anchor="peak-hour"
        label={translateAdmin(language, 'admin.analytics.messages.trends.peakHour')}
        value={(data) => (data.peakHour === null ? '—' : hourLabel(data.peakHour.index, language))}
        caption={(data) =>
          data.peakHour === null ? noMessages(language) : translateAdmin(language, 'admin.analytics.messages.trends.peak.caption', { count: formatCount(data.peakHour.count, language) })
        }
      />
      <Metric
        language={language}
        block={block}
        anchor="peak-day"
        label={translateAdmin(language, 'admin.analytics.messages.trends.peakDay')}
        value={(data) => (data.peakWeekday === null ? '—' : weekdayName(data.peakWeekday.index, language))}
        caption={(data) =>
          data.peakWeekday === null ? noMessages(language) : translateAdmin(language, 'admin.analytics.messages.trends.peak.caption', { count: formatCount(data.peakWeekday.count, language) })
        }
      />
    </AdminStatGrid>
  );
}

/** Vingt-quatre colonnes : à 375 px le kit en ferait des bâtons illisibles, d'où ce dessin local — un libellé toutes les trois heures, toutes les valeurs dans le tableau. */
function HoursChart({ language, block }: { readonly language: AdminLanguage; readonly block: Block<MessagesTrends> }) {
  const hourly = block.data?.hourly ?? [];
  const peak = peakOf(hourly.map((value) => ({ value })));
  const max = Math.max(1, ...hourly);
  const summary =
    peak === null || peak.value === 0
      ? noMessages(language)
      : translateAdmin(language, 'admin.analytics.peak.hour', { hour: hourLabel(peak.index, language), count: formatCount(peak.value, language) });

  return (
    <AdminChartCard
      language={language}
      id="hours"
      title={translateAdmin(language, 'admin.analytics.messages.trends.hours.title')}
      summary={summary}
      state={block.state}
      onRetry={block.retry}
      empty={hourly.length === 0}
      height={140}
      table={{
        caption: translateAdmin(language, 'admin.analytics.messages.trends.hours.title'),
        columns: [translateAdmin(language, 'admin.kit.chart.columnLabel'), translateAdmin(language, 'admin.kit.chart.columnValue')],
        rows: hourly.map((value, hour) => [hourLabel(hour, language), formatCount(value, language)]),
      }}
    >
      <ul aria-hidden="true" dir="ltr" className="flex items-end gap-0.5" style={{ height: 140 }}>
        {hourly.map((value, hour) => (
          <li key={hour} data-admin-bar={String(hour)} title={`${hourLabel(hour, language)} : ${formatCount(value, language)}`} className="relative flex h-full min-w-0 flex-1 items-end">
            <span
              aria-hidden="true"
              className="block w-full"
              style={{ height: `${Math.round((value / max) * 100)}%`, minHeight: value > 0 ? 2 : 0, backgroundColor: seriesColor(0), borderStartStartRadius: 4, borderStartEndRadius: 4 }}
            />
            {hour % 3 === 0 ? (
              <span aria-hidden="true" className="absolute start-0 text-caption" style={{ bottom: -18, color: INK2 }}>
                {hour}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      <div style={{ height: 18 }} />
    </AdminChartCard>
  );
}

function WeekdaysChart({ language, block }: { readonly language: AdminLanguage; readonly block: Block<MessagesTrends> }) {
  const weekday = block.data?.weekday ?? [];
  const peak = peakOf(weekday.map((value) => ({ value })));
  const summary =
    peak === null || peak.value === 0
      ? noMessages(language)
      : translateAdmin(language, 'admin.analytics.peak.day', { day: weekdayName(peak.index, language), count: formatCount(peak.value, language) });

  return (
    <AdminBarChart
      language={language}
      id="weekdays"
      title={translateAdmin(language, 'admin.analytics.messages.trends.days.title')}
      data={weekday.map((value, day) => ({ key: String(day), label: weekdayName(day, language), value }))}
      format={(value) => formatCount(value, language)}
      summary={summary}
      state={block.state}
      onRetry={block.retry}
    />
  );
}

/**
 * **L'ONGLET MESSAGES** (#8876, #6728) — des COMPTES : volume, répartition,
 * rythme, engagement, membres les plus actifs. **Aucun contenu de message** :
 * `GET /admin/messages` et `GET /admin/translations` (#6919) ne sont jamais
 * appelés ; un contenu se lit par la lecture souveraine d'une conversation, avec
 * un motif écrit.
 *
 * Le rythme (`messagesTrends`) porte toujours sur les 7 derniers jours et
 * l'engagement n'existe que sur 7 ou 30 jours : la fenêtre RÉELLE de chaque bloc
 * est écrite sous son titre.
 */
export function AdminMessagesTab({ language, deps, period }: TabProps) {
  const engagementPeriod = engagementPeriodOf(period);
  const stats = useStatsQuery(messageStatsKeys.stats(period), (signal) => loadMessagesStats({ ...deps, period, signal }));
  const trends = useStatsQuery(messageStatsKeys.trends(), (signal) => loadMessagesTrends({ ...deps, signal }));
  const engagement = useStatsQuery(messageStatsKeys.engagement(engagementPeriod), (signal) => loadMessagesEngagement({ ...deps, period: engagementPeriod, signal }));

  return (
    <div className="grid gap-6" data-admin-tab-panel="messages">
      <StaleDataNotice language={language} queries={[stats, trends, engagement]} />

      <StatsSection id="messages-overview" title={translateAdmin(language, 'admin.analytics.messages.overview.title')} note={windowNote(language, period)}>
        <StatsBlock language={language} query={stats} groupError>
          {(block) => (
            <>
              <AdminStatGrid columns={3}>
                <Metric
                  language={language}
                  block={block}
                  anchor="total-messages"
                  label={translateAdmin(language, 'admin.analytics.messages.total')}
                  value={(data) => formatCount(data.totalMessages, language)}
                  caption={() => translateAdmin(language, 'admin.analytics.messages.total.caption')}
                />
                <Metric
                  language={language}
                  block={block}
                  anchor="deleted-messages"
                  label={translateAdmin(language, 'admin.analytics.messages.deleted')}
                  value={(data) => formatCount(data.deletedMessages, language)}
                  caption={() => translateAdmin(language, 'admin.analytics.messages.deleted.caption')}
                />
                <Metric
                  language={language}
                  block={block}
                  anchor="edited-messages"
                  label={translateAdmin(language, 'admin.analytics.messages.edited')}
                  value={(data) => formatCount(data.editedMessages, language)}
                  caption={() => translateAdmin(language, 'admin.analytics.messages.edited.caption')}
                />
                <Metric
                  language={language}
                  block={block}
                  anchor="average-length"
                  label={translateAdmin(language, 'admin.analytics.messages.length')}
                  value={(data) =>
                    data.averageLength === null ? '—' : translateAdmin(language, 'admin.analytics.messages.length.value', { count: formatCount(data.averageLength, language) })
                  }
                  caption={() => translateAdmin(language, 'admin.analytics.messages.length.caption')}
                />
                <Metric
                  language={language}
                  block={block}
                  anchor="translated"
                  label={translateAdmin(language, 'admin.analytics.messages.translated')}
                  value={(data) => formatPercent(data.translatedPercentage, 'hundred', language)}
                  caption={(data) => translateAdmin(language, 'admin.analytics.messages.translated.caption', { count: formatCount(data.translatedMessages, language) })}
                />
                <Metric
                  language={language}
                  block={block}
                  anchor="attachments"
                  label={translateAdmin(language, 'admin.analytics.messages.attachments')}
                  value={(data) => formatPercent(data.attachmentRate, 'hundred', language)}
                  caption={(data) => translateAdmin(language, 'admin.analytics.messages.attachments.caption', { count: formatCount(data.messagesWithAttachments, language) })}
                />
              </AdminStatGrid>
              <div className="grid gap-4 lg:grid-cols-2">
                <TimelineChart language={language} block={block} />
                <TypesChart language={language} block={block} />
              </div>
              <TopSenders language={language} block={block} />
            </>
          )}
        </StatsBlock>
      </StatsSection>

      <StatsSection id="messages-trends" title={translateAdmin(language, 'admin.analytics.messages.trends.title')} note={translateAdmin(language, 'admin.analytics.messages.trends.hint')}>
        <StatsBlock language={language} query={trends} groupError>
          {(block) => (
            <>
              <TrendCards language={language} block={block} />
              <div className="grid gap-4 lg:grid-cols-2">
                <HoursChart language={language} block={block} />
                <WeekdaysChart language={language} block={block} />
              </div>
            </>
          )}
        </StatsBlock>
      </StatsSection>

      <StatsSection id="messages-engagement" title={translateAdmin(language, 'admin.analytics.messages.engagement.title')} note={windowNote(language, engagementPeriod)}>
        <StatsBlock language={language} query={engagement} groupError>
          {(block) => (
            <AdminStatGrid columns={4}>
              <Metric
                language={language}
                block={block}
                anchor="reaction-rate"
                label={translateAdmin(language, 'admin.analytics.messages.engagement.reactionRate')}
                value={(data) => formatPercent(data.reactionRate, 'hundred', language)}
                caption={(data) => translateAdmin(language, 'admin.analytics.messages.engagement.reactionRate.caption', { count: formatCount(data.messagesWithReactions, language) })}
              />
              <Metric
                language={language}
                block={block}
                anchor="reply-rate"
                label={translateAdmin(language, 'admin.analytics.messages.engagement.replyRate')}
                value={(data) => formatPercent(data.replyRate, 'hundred', language)}
                caption={(data) => translateAdmin(language, 'admin.analytics.messages.engagement.replyRate.caption', { count: formatCount(data.messagesWithReplies, language) })}
              />
              <Metric
                language={language}
                block={block}
                anchor="reactions-per-message"
                label={translateAdmin(language, 'admin.analytics.messages.engagement.reactionsPer')}
                value={(data) => formatDecimal(data.avgReactionsPerMessage, language)}
                caption={(data) => translateAdmin(language, 'admin.analytics.messages.engagement.reactionsPer.caption', { count: formatCount(data.totalReactions, language) })}
              />
              <Metric
                language={language}
                block={block}
                anchor="replies-per-message"
                label={translateAdmin(language, 'admin.analytics.messages.engagement.repliesPer')}
                value={(data) => formatDecimal(data.avgRepliesPerMessage, language)}
                caption={(data) => translateAdmin(language, 'admin.analytics.messages.engagement.repliesPer.caption', { count: formatCount(data.totalReplies, language) })}
              />
            </AdminStatGrid>
          )}
        </StatsBlock>
      </StatsSection>
    </div>
  );
}
