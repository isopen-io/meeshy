import { useQuery } from '@tanstack/react-query';
import { useEffect, useId, useState } from 'react';

import { conversationStatsQueryOptions, type ConversationStats, type ConversationStatsParticipant } from '@/lib/api/conversation-stats';
import type { ConversationsDeps } from '@/lib/api/conversations';
import {
  isConversationStatsCatalogLoaded,
  loadConversationStatsCatalog,
  translateConversationStats,
  type ConversationStatsCatalogKey,
} from '@/lib/i18n-conversation-stats-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { useOnline } from '@/lib/net/online';
import {
  STATS_PERIODS,
  activitySeries,
  languageShares,
  seriesTotal,
  todayKey,
  topParticipants,
  type StatsPeriod,
} from '@/lib/view/conversation-stats';

/**
 * **LA SECTION « STATISTIQUES » DE LA FEUILLE DE DÉTAILS** (#7835) — miroir de
 * l'onglet Stats de `ConversationInfoSheet.swift` (`ConversationDashboardView`) :
 * les compteurs (messages, mots, photos, audio, vidéos, documents), l'activité
 * sur 7 jours, 30 jours ou depuis le début, les participants les plus actifs,
 * et les langues de la conversation. L'analyse IA et le sentiment d'iOS ne
 * sont pas portés : ils ne viennent pas de cette route.
 *
 * CHARGÉE À LA DEMANDE (`conversation-details-sheet.tsx`, `lazy()`), avec son
 * catalogue : le fil et la liste n'en paient aucun octet.
 *
 * CACHE D'ABORD : des statistiques déjà vues (la clé est persistée avec le
 * reste du cache de requêtes) se peignent tout de suite et se revalident en
 * fond ; le squelette ne paraît que sur un cache VIDE, et hors ligne on dit
 * ce qu'on montre plutôt que d'attendre.
 */
type Translate = (key: ConversationStatsCatalogKey, params?: Readonly<Record<string, string>>) => string;

/** La traduction d'une clé choisie à l'exécution (période, compteur) : les paramètres sont ceux du français, que le témoin du catalogue garde. */
const translateAny = translateConversationStats as (
  language: InterfaceLanguage,
  key: ConversationStatsCatalogKey,
  params?: Readonly<Record<string, string>>,
) => string;

const PERIOD_SHORT: Readonly<Record<StatsPeriod, ConversationStatsCatalogKey>> = {
  week: 'conversationStats.period.week.short',
  month: 'conversationStats.period.month.short',
  all: 'conversationStats.period.all.short',
};

const PERIOD_LONG: Readonly<Record<StatsPeriod, ConversationStatsCatalogKey>> = {
  week: 'conversationStats.period.week',
  month: 'conversationStats.period.month',
  all: 'conversationStats.period.all',
};

const CHART_HEIGHT = 96;
const MUTED = 'var(--color-ios-ink-2)';

/** Le seuil d'abrègement d'iOS (`formatNumber`) : « 3 452 mots » informe, « 3,5 k » non ; au-delà de 10 000, on abrège. */
const formatCount = (language: InterfaceLanguage, value: number): string =>
  new Intl.NumberFormat(language, value >= 10_000 ? { notation: 'compact', maximumFractionDigits: 1 } : {}).format(value);

const languageName = (language: InterfaceLanguage, code: string): string => {
  try {
    return new Intl.DisplayNames([language], { type: 'language' }).of(code) ?? code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
};

function useStatsCatalog(language: InterfaceLanguage): boolean {
  const [ready, setReady] = useState(() => isConversationStatsCatalogLoaded(language));
  useEffect(() => {
    if (isConversationStatsCatalogLoaded(language)) {
      setReady(true);
      return;
    }
    let live = true;
    setReady(false);
    void loadConversationStatsCatalog(language).then(
      () => live && setReady(true),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [language]);
  return ready;
}

export function ConversationStatsSection({
  conversationId,
  deps,
  today,
}: {
  readonly conversationId: string;
  readonly deps: ConversationsDeps;
  /** Le jour UTC qui clôt la série — l'horloge du lecteur, sauf dans les témoins. */
  readonly today?: string;
}) {
  const language = currentInterfaceLanguage();
  const ready = useStatsCatalog(language);
  const headingId = useId();
  const online = useOnline();
  const query = useQuery(conversationStatsQueryOptions(deps, conversationId));

  if (!ready) return <div aria-busy="true" className="px-4 pb-6" style={{ minHeight: CHART_HEIGHT }} data-conversation-stats-catalog-loading />;

  const t: Translate = (key, params) => translateAny(language, key, params);
  const stats = query.data;

  return (
    <section aria-labelledby={headingId} className="pb-6" data-conversation-stats>
      <h4 id={headingId} className="px-4 pb-2 text-caption font-semibold uppercase" style={{ color: MUTED }}>
        {t('conversationStats.section')}
      </h4>
      {stats === undefined ? (
        <StatsPending t={t} online={online} failed={query.isError} onRetry={() => void query.refetch()} />
      ) : (
        <>
          {online ? null : (
            <p role="status" className="px-4 pb-2 text-caption" style={{ color: MUTED }} data-conversation-stats-offline>
              {t('conversationStats.offline')}
            </p>
          )}
          {stats.totalMessages === 0 ? (
            <p className="px-4 py-2 text-body" style={{ color: MUTED }} data-conversation-stats-empty>
              {t('conversationStats.empty')}
            </p>
          ) : (
            <StatsBody stats={stats} t={t} language={language} today={today ?? todayKey()} />
          )}
        </>
      )}
    </section>
  );
}

function StatsPending({
  t,
  online,
  failed,
  onRetry,
}: {
  readonly t: Translate;
  readonly online: boolean;
  readonly failed: boolean;
  readonly onRetry: () => void;
}) {
  if (!online) {
    return (
      <p role="status" className="px-4 py-2 text-body" style={{ color: MUTED }} data-conversation-stats-offline-empty>
        {t('conversationStats.offline_empty')}
      </p>
    );
  }
  if (failed) {
    return (
      <div role="alert" className="flex flex-col items-center gap-2 px-4 py-4 text-center" data-conversation-stats-error>
        <p className="text-body" style={{ color: MUTED }}>
          {t('conversationStats.error')}
        </p>
        <button type="button" onClick={onRetry} className="rounded-chip px-4 font-semibold" style={{ minHeight: 44, color: 'var(--accent)' }}>
          {t('conversationStats.retry')}
        </button>
      </div>
    );
  }
  return (
    <div aria-busy="true" className="px-4" data-conversation-stats-loading>
      <span className="offscreen">{t('conversationStats.loading')}</span>
      <div aria-hidden className="grid grid-cols-3 gap-2">
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <span key={index} className="rounded-field" style={{ height: 56, backgroundColor: 'var(--color-ios-card)' }} />
        ))}
      </div>
      <span aria-hidden className="mt-3 block rounded-field" style={{ height: CHART_HEIGHT, backgroundColor: 'var(--color-ios-card)' }} />
    </div>
  );
}

function StatsBody({
  stats,
  t,
  language,
  today,
}: {
  readonly stats: ConversationStats;
  readonly t: Translate;
  readonly language: InterfaceLanguage;
  readonly today: string;
}) {
  const counters: ReadonlyArray<readonly [string, number, ConversationStatsCatalogKey]> = [
    ['messages', stats.totalMessages, 'conversationStats.messages'],
    ['words', stats.totalWords, 'conversationStats.words'],
    ['photos', stats.contentTypes.image, 'conversationStats.photos'],
    ['audio', stats.contentTypes.audio, 'conversationStats.audio'],
    ['videos', stats.contentTypes.video, 'conversationStats.videos'],
    ['documents', stats.contentTypes.file, 'conversationStats.documents'],
  ];
  const participants = topParticipants(stats.participants);
  const languages = languageShares(stats.languages);

  return (
    <div className="flex flex-col gap-5 px-4">
      <ul className="grid grid-cols-3 gap-2" data-conversation-stats-counters>
        {counters.map(([name, value, label]) => (
          <li
            key={name}
            data-conversation-stat={name}
            className="flex flex-col items-center justify-center rounded-field px-2 py-2 text-center"
            style={{ minHeight: 56, backgroundColor: 'var(--color-ios-card)' }}
          >
            <span className="text-section font-bold tabular-nums" style={{ color: 'var(--color-ios-ink)' }}>
              {formatCount(language, value)}
            </span>
            <span className="text-caption" style={{ color: MUTED }}>
              {t(label)}
            </span>
          </li>
        ))}
      </ul>

      <ActivityChart daily={stats.dailyActivity} t={t} language={language} today={today} />

      {participants.length === 0 ? null : <ParticipantsBreakdown participants={participants} t={t} language={language} />}

      {languages.length === 0 ? null : (
        <div>
          <h5 className="pb-2 text-body font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
            {t('conversationStats.languages')}
          </h5>
          <ul className="flex flex-col gap-2">
            {languages.map((entry) => (
              <li key={entry.language} className="flex items-center gap-3" data-conversation-stats-language>
                <span className="w-24 shrink-0 truncate text-body" style={{ color: 'var(--color-ios-ink)' }}>
                  {languageName(language, entry.language)}
                </span>
                <Bar ratio={entry.percent / 100} />
                <span className="w-12 shrink-0 text-end text-caption font-semibold tabular-nums" style={{ color: MUTED }}>
                  {new Intl.NumberFormat(language, { style: 'percent' }).format(entry.percent / 100)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ActivityChart({
  daily,
  t,
  language,
  today,
}: {
  readonly daily: ConversationStats['dailyActivity'];
  readonly t: Translate;
  readonly language: InterfaceLanguage;
  readonly today: string;
}) {
  const [period, setPeriod] = useState<StatsPeriod>('week');
  const series = activitySeries(daily, period, today);
  const total = seriesTotal(series);
  const peak = Math.max(1, ...series.map((day) => day.count));
  const summary = t(total === 1 ? 'conversationStats.activity.summary.one' : 'conversationStats.activity.summary.other', {
    count: formatCount(language, total),
    period: t(PERIOD_LONG[period]),
  });

  return (
    <div>
      <div className="flex items-center justify-between gap-2 pb-2">
        <h5 className="text-body font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
          {t('conversationStats.activity')}
        </h5>
        <div role="group" aria-label={t('conversationStats.periods.label')} className="flex rounded-chip" style={{ backgroundColor: 'var(--color-ios-card)' }}>
          {STATS_PERIODS.map((candidate) => {
            const selected = candidate === period;
            return (
              <button
                key={candidate}
                type="button"
                aria-pressed={selected}
                aria-label={t(PERIOD_LONG[candidate])}
                onClick={() => setPeriod(candidate)}
                data-conversation-stats-period={candidate}
                className="rounded-chip px-3 text-caption focus-visible:outline-2 focus-visible:outline-offset-2"
                style={{
                  minHeight: 44,
                  minWidth: 44,
                  fontWeight: selected ? 700 : 500,
                  color: selected ? 'var(--color-ios-on-brand)' : MUTED,
                  backgroundColor: selected ? 'var(--accent)' : 'transparent',
                  outlineColor: 'var(--accent)',
                }}
              >
                {t(PERIOD_SHORT[candidate])}
              </button>
            );
          })}
        </div>
      </div>
      <div role="img" aria-label={summary} className="flex items-end gap-px" style={{ height: CHART_HEIGHT }} data-conversation-stats-chart>
        {series.map((day) => (
          <span
            key={day.date}
            aria-hidden
            data-conversation-stats-bar
            title={`${day.date} · ${day.count}`}
            className="flex-1"
            style={{
              borderRadius: '2px 2px 0 0',
              height: day.count === 0 ? 2 : `${Math.max(4, (day.count / peak) * 100)}%`,
              backgroundColor: day.count === 0 ? 'var(--color-ios-card)' : 'var(--accent)',
            }}
          />
        ))}
      </div>
    </div>
  );
}

function ParticipantsBreakdown({
  participants,
  t,
  language,
}: {
  readonly participants: readonly ConversationStatsParticipant[];
  readonly t: Translate;
  readonly language: InterfaceLanguage;
}) {
  const peak = Math.max(1, participants[0]?.messageCount ?? 1);
  return (
    <div>
      <h5 className="pb-2 text-body font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
        {t('conversationStats.participants')}
      </h5>
      <ol className="flex flex-col gap-2">
        {participants.map((participant, index) => (
          <li key={participant.userId} className="flex items-center gap-3" data-conversation-stats-participant>
            <span className="w-6 shrink-0 text-center text-caption font-black" style={{ color: 'var(--accent)' }}>
              {index < 3 ? `#${index + 1}` : <span aria-hidden className="inline-block size-2 rounded-full" style={{ backgroundColor: MUTED }} />}
            </span>
            <span className="flex w-28 shrink-0 flex-col">
              <span className="truncate text-body font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
                {participant.name}
              </span>
              <span className="text-caption" style={{ color: MUTED }}>
                {t('conversationStats.words_count', { count: formatCount(language, participant.wordCount) })}
              </span>
            </span>
            <Bar ratio={participant.messageCount / peak} />
            <span className="w-10 shrink-0 text-end text-caption font-bold tabular-nums" style={{ color: MUTED }}>
              {formatCount(language, participant.messageCount)}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Bar({ ratio }: { readonly ratio: number }) {
  return (
    <span aria-hidden className="h-[18px] min-w-0 flex-1">
      <span className="block h-full rounded-chip" style={{ width: `${Math.max(4, Math.min(1, ratio) * 100)}%`, backgroundColor: 'var(--accent)' }} />
    </span>
  );
}
