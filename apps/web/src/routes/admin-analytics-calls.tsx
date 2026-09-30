import { AdminBarChart } from '@/components/admin/charts/bar-chart';
import { peakOf } from '@/components/admin/charts/chart-scale';
import { AdminShareChart } from '@/components/admin/charts/share-chart';
import { AdminStatGrid } from '@/components/admin/stat-card';
import { AdminEmptyState, AdminInlineNotice } from '@/components/admin/states';
import { callEndReasonLabel, callIssueLabel, formatDecimal, mergeByLabel } from '@/lib/admin/analytics-labels';
import { callsWindowOf } from '@/lib/admin/analytics-windows';
import { interpretCallQuality } from '@/lib/admin/interpret/enums';
import { platformLabel } from '@/lib/admin/interpret/language';
import { formatCount, formatPercent } from '@/lib/admin/interpret/numbers';
import { formatDuration } from '@/lib/admin/interpret/time';
import type { AdminTone } from '@/lib/admin/interpret/types';
import type { AdminDeps } from '@/lib/api/admin';
import { analyticsKeys, loadAnalyticsCalls, type AnalyticsCalls, type KpiPeriod } from '@/lib/api/admin-analytics';
import { translateAdmin } from '@/lib/i18n-admin-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

import { Metric, StaleDataNotice, StatsBlock, StatsSection, useStatsQuery, windowNote, type Block } from './admin-analytics-parts';

type TabProps = {
  readonly language: InterfaceLanguage;
  readonly deps: AdminDeps;
  readonly period: KpiPeriod;
};

/** Une part (0–1) ; une décimale sous 10 %, sans quoi « 1,2 % d'échecs » se lirait « 1 % ». */
const rateText = (value: number | null, language: InterfaceLanguage): string =>
  formatPercent(value, 'ratio', language, value !== null && value < 0.1 ? 1 : 0);

function QualityChart({ language, calls, state, retry }: { readonly language: InterfaceLanguage; readonly calls: AnalyticsCalls | undefined; readonly state: Block<AnalyticsCalls>['state']; readonly retry: () => void }) {
  const shares = calls?.qualityDistribution;
  const codes = ['excellent', 'good', 'fair', 'poor'] as const;
  const interpreted = codes.map((code) => ({ code, view: interpretCallQuality(code, language) }));
  const data = interpreted.map(({ code, view }) => ({ key: code, label: view.label, value: shares?.[code] ?? 0 }));
  const tones = Object.fromEntries(interpreted.map(({ code, view }): [string, AdminTone] => [code, view.tone]));
  const top = peakOf(data);
  const leading = top === null ? undefined : data[top.index];
  const summary =
    leading === undefined || leading.value === 0
      ? ''
      : translateAdmin(language, 'admin.analytics.calls.quality.summary', { label: leading.label, percent: formatPercent(leading.value, 'ratio', language) });

  return (
    <AdminShareChart
      language={language}
      id="call-quality"
      title={translateAdmin(language, 'admin.analytics.calls.quality.title')}
      data={data}
      format={(value) => formatPercent(value, 'ratio', language)}
      summary={summary}
      statusTones={tones}
      state={state}
      onRetry={retry}
    />
  );
}

function CountChart({
  language,
  id,
  title,
  summaryKey,
  entries,
  label,
  state,
  retry,
}: {
  readonly language: InterfaceLanguage;
  readonly id: string;
  readonly title: string;
  readonly summaryKey: 'admin.analytics.calls.platform.summary' | 'admin.analytics.calls.reasons.summary' | 'admin.analytics.calls.feedback.issues.summary';
  readonly entries: readonly { readonly key: string; readonly count: number }[];
  readonly label: (code: string) => string;
  readonly state: Block<AnalyticsCalls>['state'];
  readonly retry: () => void;
}) {
  const data = mergeByLabel(entries.map((entry) => ({ key: entry.key, label: label(entry.key), value: entry.count })));
  const top = data[0];
  const summary = top === undefined ? '' : translateAdmin(language, summaryKey, { label: top.label, count: formatCount(top.value, language) });

  return (
    <AdminBarChart
      language={language}
      id={id}
      title={title}
      data={data}
      format={(value) => formatCount(value, language)}
      summary={summary}
      state={state}
      onRetry={retry}
    />
  );
}

function FeedbackSection({ language, block }: { readonly language: InterfaceLanguage; readonly block: Block<AnalyticsCalls> }) {
  const feedback = block.data?.feedback;
  const rated = feedback?.ratedCalls ?? 0;
  const ratings = (feedback?.ratingDistribution ?? []).map((count, index) => ({
    key: String(index + 1),
    label: translateAdmin(language, 'admin.analytics.calls.feedback.stars', { count: String(index + 1) }),
    value: count,
  }));
  const most = peakOf(ratings);
  const favourite = most === null ? undefined : ratings[most.index];
  const summary =
    favourite === undefined || favourite.value === 0
      ? ''
      : translateAdmin(language, 'admin.analytics.calls.feedback.distribution.summary', { stars: String(Number(favourite.key)), count: formatCount(favourite.value, language) });

  return (
    <StatsSection id="calls-feedback" title={translateAdmin(language, 'admin.analytics.calls.feedback.title')}>
      <AdminStatGrid columns={2}>
        <Metric
          language={language}
          block={block}
          anchor="rated-calls"
          label={translateAdmin(language, 'admin.analytics.calls.feedback.rated')}
          value={(data) => formatCount(data.feedback.ratedCalls, language)}
          caption={() => translateAdmin(language, 'admin.analytics.calls.feedback.rated.caption')}
        />
        <Metric
          language={language}
          block={block}
          anchor="average-rating"
          label={translateAdmin(language, 'admin.analytics.calls.feedback.average')}
          value={(data) =>
            data.feedback.avgRating === null ? '—' : translateAdmin(language, 'admin.analytics.calls.feedback.average.value', { rating: formatDecimal(data.feedback.avgRating, language) })
          }
          caption={() => translateAdmin(language, 'admin.analytics.calls.feedback.average.caption')}
        />
      </AdminStatGrid>
      {block.state === 'ready' && rated === 0 ? (
        <AdminInlineNotice tone="info" text={translateAdmin(language, 'admin.analytics.calls.feedback.empty')} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <AdminBarChart
            language={language}
            id="call-ratings"
            title={translateAdmin(language, 'admin.analytics.calls.feedback.distribution.title')}
            data={ratings}
            format={(value) => formatCount(value, language)}
            summary={summary}
            orientation="vertical"
            state={block.state}
            onRetry={block.retry}
          />
          {block.state === 'ready' && (feedback?.byIssue.length ?? 0) === 0 ? null : (
            <CountChart
              language={language}
              id="call-issues"
              title={translateAdmin(language, 'admin.analytics.calls.feedback.issues.title')}
              summaryKey="admin.analytics.calls.feedback.issues.summary"
              entries={feedback?.byIssue ?? []}
              label={(code) => callIssueLabel(code, language)}
              state={block.state}
              retry={block.retry}
            />
          )}
        </div>
      )}
    </StatsSection>
  );
}

function CallsBody({ language, block, period }: { readonly language: InterfaceLanguage; readonly block: Block<AnalyticsCalls>; readonly period: KpiPeriod }) {
  const data = block.data;

  if (block.state === 'ready' && data !== undefined && data.totalCalls === 0) {
    return (
      <AdminEmptyState
        title={translateAdmin(language, 'admin.analytics.calls.empty.title')}
        hint={translateAdmin(language, 'admin.analytics.calls.empty.hint')}
        glyph="phoneCall"
      />
    );
  }

  return (
    <div className="grid gap-6">
      {data?.sampled === true ? <AdminInlineNotice tone="warning" text={translateAdmin(language, 'admin.analytics.calls.sampled')} /> : null}

      <StatsSection id="calls-reliability" title={translateAdmin(language, 'admin.analytics.calls.reliability.title')} note={windowNote(language, period)}>
        <AdminStatGrid columns={4}>
          <Metric
            language={language}
            block={block}
            anchor="total-calls"
            label={translateAdmin(language, 'admin.analytics.calls.total')}
            value={(calls) => formatCount(calls.totalCalls, language)}
            caption={() => translateAdmin(language, 'admin.analytics.calls.total.caption')}
          />
          <Metric
            language={language}
            block={block}
            anchor="video-share"
            label={translateAdmin(language, 'admin.analytics.calls.video')}
            value={(calls) => rateText(calls.videoShare, language)}
            caption={() => translateAdmin(language, 'admin.analytics.calls.video.caption')}
          />
          <Metric
            language={language}
            block={block}
            anchor="connect-rate"
            label={translateAdmin(language, 'admin.analytics.calls.connect')}
            value={(calls) => rateText(calls.connectSuccessRate, language)}
            caption={() => translateAdmin(language, 'admin.analytics.calls.connect.caption')}
          />
          <Metric
            language={language}
            block={block}
            anchor="failure-rate"
            label={translateAdmin(language, 'admin.analytics.calls.failure')}
            value={(calls) => rateText(calls.callFailureRate, language)}
            caption={() => translateAdmin(language, 'admin.analytics.calls.failure.caption')}
          />
        </AdminStatGrid>
      </StatsSection>

      <StatsSection id="calls-timing" title={translateAdmin(language, 'admin.analytics.calls.timing.title')}>
        <AdminStatGrid columns={4}>
          <Metric
            language={language}
            block={block}
            anchor="setup-time"
            label={translateAdmin(language, 'admin.analytics.calls.setup')}
            value={(calls) => formatDuration(calls.avgSetupTimeMs, 'ms', language)}
            caption={() => translateAdmin(language, 'admin.analytics.calls.setup.caption')}
          />
          <Metric
            language={language}
            block={block}
            anchor="negotiation-time"
            label={translateAdmin(language, 'admin.analytics.calls.negotiation')}
            value={(calls) => formatDuration(calls.avgNegotiationTimeMs, 'ms', language)}
            caption={() => translateAdmin(language, 'admin.analytics.calls.negotiation.caption')}
          />
          <Metric
            language={language}
            block={block}
            anchor="duration"
            label={translateAdmin(language, 'admin.analytics.calls.duration')}
            value={(calls) => formatDuration(calls.avgDurationSeconds, 's', language)}
            caption={() => translateAdmin(language, 'admin.analytics.calls.duration.caption')}
          />
          <Metric
            language={language}
            block={block}
            anchor="reconnection-rate"
            label={translateAdmin(language, 'admin.analytics.calls.reconnection')}
            value={(calls) => rateText(calls.reconnectionRate, language)}
            caption={(calls) => translateAdmin(language, 'admin.analytics.calls.reconnection.caption', { count: formatDecimal(calls.avgReconnectionCount, language) })}
          />
        </AdminStatGrid>
      </StatsSection>

      <StatsSection id="calls-network" title={translateAdmin(language, 'admin.analytics.calls.network.title')}>
        <AdminStatGrid columns={4}>
          <Metric
            language={language}
            block={block}
            anchor="rtt"
            label={translateAdmin(language, 'admin.analytics.calls.rtt')}
            value={(calls) => formatDuration(calls.avgRtt, 'ms', language)}
            caption={() => translateAdmin(language, 'admin.analytics.calls.rtt.caption')}
          />
          <Metric
            language={language}
            block={block}
            anchor="packet-loss"
            label={translateAdmin(language, 'admin.analytics.calls.loss')}
            value={(calls) => formatPercent(calls.avgPacketLoss, 'hundred', language, 1)}
            caption={() => translateAdmin(language, 'admin.analytics.calls.loss.caption')}
          />
          <Metric
            language={language}
            block={block}
            anchor="packet-loss-max"
            label={translateAdmin(language, 'admin.analytics.calls.lossMax')}
            value={(calls) => formatPercent(calls.maxPacketLoss, 'hundred', language, 1)}
            caption={() => translateAdmin(language, 'admin.analytics.calls.lossMax.caption')}
          />
          <Metric
            language={language}
            block={block}
            anchor="network-transitions"
            label={translateAdmin(language, 'admin.analytics.calls.transitions')}
            value={(calls) => formatDecimal(calls.avgNetworkTransitions, language)}
            caption={() => translateAdmin(language, 'admin.analytics.calls.transitions.caption')}
          />
        </AdminStatGrid>
        <div className="grid gap-4 lg:grid-cols-2">
          <QualityChart language={language} calls={data} state={block.state} retry={block.retry} />
          <CountChart
            language={language}
            id="call-platforms"
            title={translateAdmin(language, 'admin.analytics.calls.platform.title')}
            summaryKey="admin.analytics.calls.platform.summary"
            entries={data?.byPlatform ?? []}
            label={(code) => platformLabel(code, language)}
            state={block.state}
            retry={block.retry}
          />
        </div>
      </StatsSection>

      <StatsSection id="calls-reasons" title={translateAdmin(language, 'admin.analytics.calls.reasons.title')} note={translateAdmin(language, 'admin.analytics.calls.reasons.hint')}>
        <CountChart
          language={language}
          id="call-reasons"
          title={translateAdmin(language, 'admin.analytics.calls.reasons.title')}
          summaryKey="admin.analytics.calls.reasons.summary"
          entries={data?.byEndReason ?? []}
          label={(code) => callEndReasonLabel(code, language)}
          state={block.state}
          retry={block.retry}
        />
      </StatsSection>

      <FeedbackSection language={language} block={block} />
    </div>
  );
}

/**
 * **L'ONGLET APPELS** (#8876, #6728) — la fiabilité des appels d'après la
 * télémétrie que chaque participant envoie à la raccrochée : connexion, échec
 * technique, délais, latence, pertes, qualité, plateformes, motifs de fin, avis.
 *
 * **Échelles** écrites au site d'appel : parts (0–1) pour la vidéo, la connexion,
 * l'échec et la reconnexion ; POURCENTAGES (0–100) pour les pertes de paquets ;
 * millisecondes pour les délais et la latence ; secondes pour la durée.
 * Une moyenne `null` (aucun appel connecté) se dit « — », jamais « 0 ms ».
 */
export function AdminCallsTab({ language, deps, period }: TabProps) {
  const days = callsWindowOf(period);
  const calls = useStatsQuery(analyticsKeys.calls(days), (signal) => loadAnalyticsCalls({ ...deps, days, signal }));

  return (
    <div className="grid gap-6" data-admin-tab-panel="calls">
      <StaleDataNotice language={language} queries={[calls]} />
      <StatsBlock language={language} query={calls} groupError>
        {(block) => <CallsBody language={language} block={block} period={period} />}
      </StatsBlock>
    </div>
  );
}
