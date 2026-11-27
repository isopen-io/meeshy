import { AdminChartTable } from '@/components/admin/charts/chart-card';
import { AdminStatGrid } from '@/components/admin/stat-card';
import { AdminEmptyState, AdminInlineNotice, AdminSkeleton } from '@/components/admin/states';
import { gameWindowOf } from '@/lib/admin/analytics-windows';
import { gameStatsText, useGameStatsTexts, type GameStatsTexts } from '@/lib/admin/game-texts';
import { formatCount, formatPercent } from '@/lib/admin/interpret/numbers';
import type { AdminDeps } from '@/lib/api/admin';
import type { KpiPeriod } from '@/lib/api/admin-analytics';
import { RETENTION_HORIZONS, gameBaselineKey, loadGameBaseline, type GameBaseline } from '@/lib/api/admin-analytics-game';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';
import { GAME_BASELINE_COHORT_WEEKS } from '@meeshy/shared/types/game-baseline';

import { Metric, StaleDataNotice, StatsBlock, StatsSection, useStatsQuery, type Block } from './admin-analytics-parts';

const dayLabel = (day: string, language: AdminLanguage): string =>
  new Intl.DateTimeFormat(language, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`));

function RetentionTable({ language, texts, data }: { readonly language: AdminLanguage; readonly texts: GameStatsTexts; readonly data: GameBaseline }) {
  if (data.retention.length === 0) {
    return (
      <AdminEmptyState
        title={gameStatsText(texts, 'admin.analytics.game.retention.empty.title', { weeks: formatCount(GAME_BASELINE_COHORT_WEEKS, language) })}
        hint={gameStatsText(texts, 'admin.analytics.game.retention.empty.hint')}
      />
    );
  }
  const columns = [
    gameStatsText(texts, 'admin.analytics.game.retention.column.week'),
    gameStatsText(texts, 'admin.analytics.game.retention.column.accounts'),
    ...RETENTION_HORIZONS.map((horizon) => gameStatsText(texts, `admin.analytics.game.retention.column.${horizon}`)),
  ];
  const rows = [...data.retention]
    .sort((a, b) => b.weekStart.localeCompare(a.weekStart))
    .map((cohort) => [
      dayLabel(cohort.weekStart, language),
      formatCount(cohort.accounts, language),
      ...RETENTION_HORIZONS.map((horizon) => formatPercent(cohort[horizon].rate, 'hundred', language)),
    ]);
  return (
    <div data-admin-game-retention-table>
      <AdminChartTable table={{ caption: gameStatsText(texts, 'admin.analytics.game.retention.title'), columns, rows, noValue: gameStatsText(texts, 'admin.analytics.game.noValue') }} />
    </div>
  );
}

function DailyTable({ language, texts, data }: { readonly language: AdminLanguage; readonly texts: GameStatsTexts; readonly data: GameBaseline }) {
  const columns = (['day', 'offerings', 'minted', 'spent'] as const).map((column) => gameStatsText(texts, `admin.analytics.game.daily.column.${column}`));
  const rows = [...data.daily]
    .sort((a, b) => b.day.localeCompare(a.day))
    .map((day) => [dayLabel(day.day, language), formatCount(day.offeringsOpened, language), formatCount(day.meeshesMinted, language), formatCount(day.meeshesSpent, language)]);
  return (
    <div data-admin-game-daily-table>
      <AdminChartTable table={{ caption: gameStatsText(texts, 'admin.analytics.game.daily.title'), columns, rows, noValue: gameStatsText(texts, 'admin.analytics.game.noValue') }} />
    </div>
  );
}

function GameBody({ language, texts, block }: { readonly language: AdminLanguage; readonly texts: GameStatsTexts; readonly block: Block<GameBaseline> }) {
  const data = block.data;
  const question = translateAdmin(language, 'admin.analytics.measure.question');
  return (
    <div className="grid gap-6">
      {data?.sampled === true ? <AdminInlineNotice tone="warning" text={gameStatsText(texts, 'admin.analytics.game.sampled')} data={{ 'data-admin-game-sampled': '' }} /> : null}
      <StatsSection id="game-today" title={gameStatsText(texts, 'admin.analytics.game.today.title')} note={gameStatsText(texts, 'admin.analytics.game.today.hint')} noteQuestion={question}>
        <AdminStatGrid columns={3}>
          <Metric
            language={language}
            block={block}
            anchor="game-long-flames"
            label={gameStatsText(texts, 'admin.analytics.game.longFlames')}
            value={(summary) => formatCount(summary.longFlames?.alive, language)}
            caption={(summary) => (summary.longFlames === null ? '' : gameStatsText(texts, 'admin.analytics.game.longFlames.caption', { days: formatCount(summary.longFlames.minDays, language) }))}
          />
          <Metric language={language} block={block} anchor="game-hidden" label={gameStatsText(texts, 'admin.analytics.game.hidden')} value={(summary) => formatCount(summary.guards.gameHidden, language)} />
          <Metric
            language={language}
            block={block}
            anchor="game-notifications-off"
            label={gameStatsText(texts, 'admin.analytics.game.notificationsOff')}
            value={(summary) => formatCount(summary.guards.gameNotificationsOff, language)}
          />
        </AdminStatGrid>
      </StatsSection>
      {data === undefined ? null : (
        <>
          <StatsSection id="game-retention" title={gameStatsText(texts, 'admin.analytics.game.retention.title')} note={gameStatsText(texts, 'admin.analytics.game.retention.hint')} noteQuestion={question}>
            <RetentionTable language={language} texts={texts} data={data} />
          </StatsSection>
          <StatsSection id="game-daily" title={gameStatsText(texts, 'admin.analytics.game.daily.title')} note={gameStatsText(texts, 'admin.analytics.game.daily.hint')} noteQuestion={question}>
            <DailyTable language={language} texts={texts} data={data} />
          </StatsSection>
        </>
      )}
    </div>
  );
}

/**
 * **L'ONGLET JEU** (#20618, #17363) — le point de départ du Jeu tel que la
 * passerelle l'agrège : retour à 1, 7 et 30 jours par semaine d'inscription, les
 * Offrandes et les Meeshes par jour, les Flammes longues, les comptes en « Jeu
 * masqué » et sans notifications de jeu. Des agrégats sans identité ; un taux
 * qu'aucun compte n'a encore pu atteindre se dit « — ».
 */
export function AdminGameTab({ language, deps, period }: { readonly language: AdminLanguage; readonly deps: AdminDeps; readonly period: KpiPeriod }) {
  const days = gameWindowOf(period);
  const query = useStatsQuery(gameBaselineKey(days), (signal) => loadGameBaseline({ ...deps, days, signal }));
  const texts = useGameStatsTexts(language);

  return (
    <div className="grid gap-6" data-admin-tab-panel="game">
      <StaleDataNotice language={language} queries={[query]} />
      <StatsBlock language={language} query={query} groupError>
        {(block) => (texts === null ? <AdminSkeleton rows={4} /> : <GameBody language={language} texts={texts} block={block} />)}
      </StatsBlock>
    </div>
  );
}
