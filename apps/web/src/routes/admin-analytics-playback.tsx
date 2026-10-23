import { AdminChartTable } from '@/components/admin/charts/chart-card';
import { AdminStatGrid } from '@/components/admin/stat-card';
import { AdminEmptyState, AdminInlineNotice } from '@/components/admin/states';
import { playbackWindowOf } from '@/lib/admin/analytics-windows';
import { formatCount, formatPercent } from '@/lib/admin/interpret/numbers';
import { formatDuration } from '@/lib/admin/interpret/time';
import type { AdminDeps } from '@/lib/api/admin';
import type { KpiPeriod } from '@/lib/api/admin-analytics';
import { loadPlaybackQoe, playbackKey, type PlaybackCell, type PlaybackQoe, type QuantilePair } from '@/lib/api/admin-analytics-playback';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';

import { Metric, StaleDataNotice, StatsBlock, StatsSection, useStatsQuery, type Block } from './admin-analytics-parts';

const TIER_ORDER = ['low', 'mid', 'high', 'unknown'] as const;

const tierRank = (tier: string): number => {
  const index = TIER_ORDER.findIndex((candidate) => candidate === tier);
  return index === -1 ? TIER_ORDER.length : index;
};

const tierLabel = (tier: string, language: AdminLanguage): string => {
  switch (tier) {
    case 'low':
      return translateAdmin(language, 'admin.analytics.playback.tier.low');
    case 'mid':
      return translateAdmin(language, 'admin.analytics.playback.tier.mid');
    case 'high':
      return translateAdmin(language, 'admin.analytics.playback.tier.high');
    default:
      return translateAdmin(language, 'admin.analytics.playback.tier.unknown');
  }
};

const dayLabel = (day: string, language: AdminLanguage): string =>
  new Intl.DateTimeFormat(language, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`));

const ms = (pair: QuantilePair | null, key: 'p50' | 'p95', language: AdminLanguage): string => formatDuration(pair?.[key] ?? null, 'ms', language);

/** Du jour le plus récent au plus ancien, puis par surface, puis du petit appareil au grand. */
const ordered = (cells: readonly PlaybackCell[]): readonly PlaybackCell[] =>
  [...cells].sort((a, b) => b.day.localeCompare(a.day) || a.surface.localeCompare(b.surface) || tierRank(a.deviceTier) - tierRank(b.deviceTier));

function PlaybackBody({ language, block }: { readonly language: AdminLanguage; readonly block: Block<PlaybackQoe> }) {
  const data = block.data;
  const cells = data === undefined ? [] : ordered(data.cells);
  const columns = (['day', 'surface', 'tier', 'sessions', 'ttff.p50', 'ttff.p95', 'rebuffer.p50', 'rebuffer.p95', 'rebuffered'] as const).map((column) =>
    translateAdmin(language, `admin.analytics.playback.column.${column}`),
  );
  const rows = cells.map((cell) => [
    dayLabel(cell.day, language),
    cell.surface,
    tierLabel(cell.deviceTier, language),
    formatCount(cell.sessions, language),
    ms(cell.timeToFirstFrameMs, 'p50', language),
    ms(cell.timeToFirstFrameMs, 'p95', language),
    ms(cell.rebufferMs, 'p50', language),
    ms(cell.rebufferMs, 'p95', language),
    formatPercent(cell.rebufferedRate, 'ratio', language, 1),
  ]);

  return (
    <div className="grid gap-6">
      {data?.sampled === true ? (
        <AdminInlineNotice tone="warning" text={translateAdmin(language, 'admin.analytics.playback.sampled')} data={{ 'data-admin-playback-sampled': '' }} />
      ) : null}
      <StatsSection id="playback-overview" title={translateAdmin(language, 'admin.analytics.playback.title')} note={translateAdmin(language, 'admin.analytics.playback.hint')}>
        <AdminStatGrid columns={2}>
          <Metric
            language={language}
            block={block}
            anchor="playback-cells"
            label={translateAdmin(language, 'admin.analytics.playback.cells')}
            value={(qoe) => formatCount(qoe.cells.length, language)}
          />
          <Metric
            language={language}
            block={block}
            anchor="playback-suppressed"
            label={translateAdmin(language, 'admin.analytics.playback.suppressed')}
            value={(qoe) => formatCount(qoe.suppressedCells, language)}
            caption={(qoe) => translateAdmin(language, 'admin.analytics.playback.suppressed.caption', { count: formatCount(qoe.minDevices, language) })}
          />
        </AdminStatGrid>
      </StatsSection>
      {data !== undefined && cells.length === 0 ? (
        <AdminEmptyState title={translateAdmin(language, 'admin.analytics.playback.empty.title')} hint={translateAdmin(language, 'admin.analytics.playback.empty.hint')} />
      ) : data === undefined ? null : (
        <div data-admin-playback-table>
          <AdminChartTable table={{ caption: translateAdmin(language, 'admin.analytics.playback.title'), columns, rows }} />
        </div>
      )}
    </div>
  );
}

/**
 * **L'ONGLET LECTURE** (#11280) — le temps jusqu'à la première image et le
 * rebuffer, en p50/p95, par jour × surface × tier d'appareil, tels que la
 * passerelle les agrège. Une cellule sous le seuil de k-anonymat n'est jamais
 * servie : l'écran n'en dit que le nombre. Une mesure absente se dit « — ».
 */
export function AdminPlaybackTab({ language, deps, period }: { readonly language: AdminLanguage; readonly deps: AdminDeps; readonly period: KpiPeriod }) {
  const days = playbackWindowOf(period);
  const query = useStatsQuery(playbackKey(days), (signal) => loadPlaybackQoe({ ...deps, days, signal }));

  return (
    <div className="grid gap-6" data-admin-tab-panel="playback">
      <StaleDataNotice language={language} queries={[query]} />
      <StatsBlock language={language} query={query} groupError>
        {(block) => <PlaybackBody language={language} block={block} />}
      </StatsBlock>
    </div>
  );
}
