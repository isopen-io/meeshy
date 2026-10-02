import { AdminBarChart } from '@/components/admin/charts/bar-chart';
import { AdminShareChart } from '@/components/admin/charts/share-chart';
import { AdminTimelineChart } from '@/components/admin/charts/timeline-chart';
import { AdminFilterChips } from '@/components/admin/list-toolbar';
import { AdminPageHeader } from '@/components/admin/page-header';
import { AdminSectionScreen } from '@/components/admin/section-screen';
import { AdminEmptyState, AdminOfflineNotice } from '@/components/admin/states';
import { AdminStatGrid } from '@/components/admin/stat-card';
import { INK3 } from '@/components/admin/tone';
import { mergeByLabel } from '@/lib/admin/analytics-labels';
import { LANGUAGES_DEFAULT, LANGUAGES_PERIODS, timelinePeriodOf } from '@/lib/admin/analytics-windows';
import { formatCount, formatPercent } from '@/lib/admin/interpret/numbers';
import { adminDayLabel } from '@/lib/admin/interpret/time';
import { OTHERS_KEY, foldLanguageTimeline, languageTitle } from '@/lib/admin/languages-view';
import type { AdminDeps } from '@/lib/api/admin';
import {
  languagesKeys,
  loadLanguageStats,
  loadLanguagesTimeline,
  loadTranslationAccuracy,
  type LanguageDay,
  type LanguageStats,
} from '@/lib/api/admin-languages';
import { apiDeps } from '@/lib/api/deps';
import { currentAdminLanguage, suspendForAdminInterfaceCatalog, translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';

import { Metric, StaleDataNotice, StatsBlock, StatsSection, periodLabel, useStatsQuery, usePeriodParam, windowNote, type Block } from './admin-analytics-parts';
import { LanguagePairsTable, LanguagesDetailTable, TranslationAccuracyTable } from './admin-languages-parts';

/** Les dix langues les plus écrites : la passerelle borne par `limit`, l'écran n'en offre pas le réglage (un contrôle de plus pour un usage nominal qui n'en a pas besoin). */
const LIMIT = 10;
const NAMED_SERIES = 3;
const USER_LANGUAGES_SHOWN = 10;

function ShareChart({ language, block }: { readonly language: AdminLanguage; readonly block: Block<LanguageStats> }) {
  const languages = block.data?.languages ?? [];
  const top = languages[0];
  const summary =
    top === undefined
      ? ''
      : translateAdmin(language, 'admin.lang.share.summary', { language: languageTitle(top.code, language), percent: formatPercent(top.percentage, 'hundred', language) });

  return (
    <AdminShareChart
      language={language}
      id="language-share"
      title={translateAdmin(language, 'admin.lang.share.title')}
      data={languages.map((row) => ({ key: row.code, label: languageTitle(row.code, language), value: row.messageCount }))}
      format={(value) => formatCount(value, language)}
      summary={summary}
      state={block.state}
      onRetry={block.retry}
    />
  );
}

/** Les comptes par langue d'interface : les dix premières langues, le reste sommé dans « Autres langues ». */
function UsersChart({ language, block }: { readonly language: AdminLanguage; readonly block: Block<LanguageStats> }) {
  const entries = block.data?.usersByLanguage ?? [];
  const named = mergeByLabel(entries.map((entry) => ({ key: entry.code, label: languageTitle(entry.code, language), value: entry.count })));
  const others = named.slice(USER_LANGUAGES_SHOWN).reduce((sum, entry) => sum + entry.value, 0);
  const data = others === 0 ? named : [...named.slice(0, USER_LANGUAGES_SHOWN), { key: 'others', label: translateAdmin(language, 'admin.lang.users.others'), value: others }];
  const top = data[0];

  return (
    <AdminBarChart
      language={language}
      id="language-users"
      title={translateAdmin(language, 'admin.lang.users.title')}
      data={data}
      format={(value) => formatCount(value, language)}
      summary={top === undefined ? '' : translateAdmin(language, 'admin.lang.users.summary', { language: top.label, count: formatCount(top.value, language) })}
      state={block.state}
      onRetry={block.retry}
    />
  );
}

/** Trois langues nommées + « Autres langues » : le kit dessine quatre séries au plus. */
function TimelineChart({ language, block }: { readonly language: AdminLanguage; readonly block: Block<readonly LanguageDay[]> }) {
  const folded = foldLanguageTimeline(block.data ?? [], NAMED_SERIES);
  const labels = folded.dates.map((date) => adminDayLabel(date, language));
  const series = folded.series.map((entry) => ({
    key: entry.key,
    label: entry.key === OTHERS_KEY ? translateAdmin(language, 'admin.lang.timeline.others') : languageTitle(entry.key, language),
    points: entry.points.map((value, index) => ({ x: labels[index] ?? '', value })),
  }));
  const leading = folded.series[0];
  const summary =
    leading === undefined || leading.key === OTHERS_KEY
      ? ''
      : translateAdmin(language, 'admin.lang.timeline.summary', { language: languageTitle(leading.key, language), count: formatCount(leading.total, language) });

  return (
    <AdminTimelineChart
      language={language}
      id="language-timeline"
      title={translateAdmin(language, 'admin.lang.timeline.title')}
      series={series}
      format={(value) => formatCount(value, language)}
      summary={summary}
      state={block.state}
      onRetry={block.retry}
    />
  );
}

function PeriodBody({ language, block, period }: { readonly language: AdminLanguage; readonly block: Block<LanguageStats>; readonly period: '7d' | '30d' | '90d' }) {
  const data = block.data;
  const languages = data?.languages ?? [];

  if (block.state === 'ready' && languages.length === 0) {
    return (
      <AdminEmptyState title={translateAdmin(language, 'admin.lang.empty.title')} hint={translateAdmin(language, 'admin.lang.empty.hint')} glyph="translate" />
    );
  }

  const top = languages[0];
  const capped = languages.length >= LIMIT;

  return (
    <>
      <AdminStatGrid columns={3}>
        <Metric
          language={language}
          block={block}
          anchor="messages-analysed"
          label={translateAdmin(language, 'admin.lang.messages')}
          value={(stats) => formatCount(stats.totalMessages, language)}
          caption={(stats) => translateAdmin(language, 'admin.lang.messages.caption', { count: formatCount(stats.languages.length, language) })}
        />
        <Metric
          language={language}
          block={block}
          anchor="languages-written"
          label={translateAdmin(language, 'admin.lang.count')}
          value={(stats) => formatCount(stats.totalLanguages, language)}
          caption={() => (capped ? translateAdmin(language, 'admin.lang.count.capped', { limit: formatCount(LIMIT, language) }) : translateAdmin(language, 'admin.lang.count.all'))}
        />
        <Metric
          language={language}
          block={block}
          anchor="top-language"
          label={translateAdmin(language, 'admin.lang.top')}
          value={() => (top === undefined ? '—' : languageTitle(top.code, language))}
          caption={() => (top === undefined ? '' : translateAdmin(language, 'admin.lang.top.caption', { percent: formatPercent(top.percentage, 'hundred', language) }))}
        />
      </AdminStatGrid>
      <ShareChart language={language} block={block} />
      <StatsSection id="language-detail" title={translateAdmin(language, 'admin.lang.detail.title')} note={windowNote(language, period)}>
        <LanguagesDetailTable language={language} rows={languages} />
      </StatsSection>
    </>
  );
}

/**
 * **LANGUES ET TRADUCTIONS** (#8876, #6728) — quelles langues s'écrivent, lesquelles
 * se traduisent, avec quelle confiance. Langues NOMMÉES (`Intl.DisplayNames`, jamais
 * un code), paires « français → anglais ».
 *
 * `translations` et `messages` (#6919) ne sont JAMAIS appelés : la précision est une
 * moyenne de confiance, pas un contenu. Les DEUX échelles de confiance (`ratio` des
 * paires, `hundred` de la précision) sont écrites une fois chacune dans
 * `languages-view.ts` et mesurées.
 *
 * La période vit dans l'adresse ; la chronologie n'existe que sur 7 et 30 jours (90
 * jours retombe sur 30, et la fenêtre réelle est écrite) ; la précision porte sur
 * toutes les périodes.
 */
export function AdminLanguagesPanel({ language, deps = apiDeps }: { readonly language: AdminLanguage; readonly deps?: AdminDeps }) {
  const [period, setPeriod] = usePeriodParam(LANGUAGES_PERIODS, LANGUAGES_DEFAULT);
  const timelinePeriod = timelinePeriodOf(period);
  const stats = useStatsQuery(languagesKeys.stats(period, LIMIT), (signal) => loadLanguageStats({ ...deps, period, limit: LIMIT, signal }));
  const timeline = useStatsQuery(languagesKeys.timeline(timelinePeriod), (signal) => loadLanguagesTimeline({ ...deps, period: timelinePeriod, signal }));
  const accuracy = useStatsQuery(languagesKeys.accuracy(LIMIT), (signal) => loadTranslationAccuracy({ ...deps, limit: LIMIT, signal }));

  return (
    <div className="grid gap-6" data-admin-languages>
      <AdminPageHeader language={language} title={translateAdmin(language, 'admin.nav.languages')} subtitle={translateAdmin(language, 'admin.lang.subtitle')} />
      <AdminOfflineNotice language={language} />
      <StaleDataNotice language={language} queries={[stats, timeline, accuracy]} />
      <AdminFilterChips
        label={translateAdmin(language, 'admin.kit.period.label')}
        options={LANGUAGES_PERIODS.map((value) => ({ value, label: periodLabel(language, value) }))}
        value={period}
        onChange={(value) => {
          const next = LANGUAGES_PERIODS.find((candidate) => candidate === value);
          if (next !== undefined) setPeriod(next);
        }}
      />

      <StatsSection id="language-overview" title={translateAdmin(language, 'admin.lang.overview.title')} note={windowNote(language, period)}>
        <StatsBlock language={language} query={stats} groupError>
          {(block) => <PeriodBody language={language} block={block} period={period} />}
        </StatsBlock>
      </StatsSection>

      <StatsSection id="language-users" title={translateAdmin(language, 'admin.lang.users.title')} note={translateAdmin(language, 'admin.lang.users.hint')}>
        <StatsBlock language={language} query={stats}>
          {(block) => <UsersChart language={language} block={block} />}
        </StatsBlock>
      </StatsSection>

      <StatsSection id="language-pairs" title={translateAdmin(language, 'admin.lang.pairs.title')} note={`${translateAdmin(language, 'admin.lang.pairs.hint')} ${windowNote(language, period)}`}>
        <StatsBlock language={language} query={stats} groupError>
          {(block) =>
            block.state === 'ready' && (block.data?.pairs.length ?? 0) === 0 ? (
              <p className="px-1 text-caption" style={{ color: INK3 }}>
                {translateAdmin(language, 'admin.lang.pairs.empty')}
              </p>
            ) : (
              <LanguagePairsTable language={language} rows={block.data?.pairs ?? []} />
            )
          }
        </StatsBlock>
      </StatsSection>

      <StatsSection id="language-timeline" title={translateAdmin(language, 'admin.lang.timeline.title')} note={`${translateAdmin(language, 'admin.lang.timeline.hint')} ${windowNote(language, timelinePeriod)}`}>
        <StatsBlock language={language} query={timeline}>
          {(block) => <TimelineChart language={language} block={block} />}
        </StatsBlock>
      </StatsSection>

      <StatsSection id="language-accuracy" title={translateAdmin(language, 'admin.lang.accuracy.title')} note={translateAdmin(language, 'admin.lang.accuracy.hint')}>
        <StatsBlock language={language} query={accuracy} groupError>
          {(block) =>
            block.state === 'ready' && (block.data?.length ?? 0) === 0 ? (
              <p className="px-1 text-caption" style={{ color: INK3 }}>
                {translateAdmin(language, 'admin.lang.accuracy.empty')}
              </p>
            ) : (
              <TranslationAccuracyTable language={language} rows={block.data ?? []} />
            )
          }
        </StatsBlock>
      </StatsSection>
    </div>
  );
}

/** **LANGUES ET TRADUCTIONS** — `/admin/languages` et `/adm/languages`, gardés par `canViewAnalytics` (la section). */
export default function AdminLanguagesScreen() {
  const language = currentAdminLanguage();
  suspendForAdminInterfaceCatalog(language);
  return (
    <AdminSectionScreen section="languages" language={language} title={translateAdmin(language, 'admin.nav.languages')}>
      {() => <AdminLanguagesPanel language={language} />}
    </AdminSectionScreen>
  );
}
