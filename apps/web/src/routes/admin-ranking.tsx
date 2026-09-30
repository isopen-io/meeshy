import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { AdminFilterChips, AdminListToolbar, type AdminToolbarFilter } from '@/components/admin/list-toolbar';
import { AdminPageHeader } from '@/components/admin/page-header';
import { AdminSectionScreen } from '@/components/admin/section-screen';
import { AdminDeniedInline, AdminEmptyState, AdminErrorState, AdminInlineNotice, AdminOfflineNotice } from '@/components/admin/states';
import { BRAND } from '@/components/admin/tone';
import { formatCount } from '@/lib/admin/interpret/numbers';
import {
  RANKING_ENTITY_TYPES,
  RANKING_LIMITS,
  RANKING_PERIODS,
  criteriaOf,
  criterionDefinition,
  criterionShowsValue,
  isDefaultRankingState,
  parseRankingState,
  periodScopeOf,
  rankingBranchOf,
  serializeRankingState,
  withCriterion,
  withEntityType,
  withLimit,
  withPeriod,
  type RankingState,
} from '@/lib/admin/ranking-state';
import { rankingRowViews } from '@/lib/admin/ranking-view';
import type { AdminDeps } from '@/lib/api/admin';
import { adminRankingQueryKey, loadAdminRanking, type AdminRankingResult } from '@/lib/api/admin-ranking';
import { ApiError, unwrap } from '@/lib/api/client';
import { apiDeps } from '@/lib/api/deps';
import { translateAdmin } from '@/lib/i18n-admin-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { useSearch } from '@/lib/router';
import type { AdminOption } from '@/routes/admin-table';

import { RankingPodium, RankingSkeleton, RankingTable, type RankingLabels } from './admin-ranking-parts';

/**
 * **LE CLASSEMENT** (#8876, #6730) — les plus actifs de la plateforme, par genre
 * d'entité (membres, conversations, messages, liens), critère, période et taille.
 *
 * Tout ce qui se choisit est dans l'adresse (`ranking-state.ts`, liste blanche) : un
 * classement se partage et se retrouve en revenant d'une fiche. Le podium des trois
 * premiers, puis le tableau des suivants ; chaque ligne est une PUCE nommée qui ouvre
 * la fiche de l'entité — pour un message, celle de sa conversation : le texte d'un
 * message ne se lit que par la lecture souveraine, jamais ici.
 *
 * Ce que la passerelle ne sert pas n'est pas dessiné : pas de tendance (aucune
 * période précédente n'est servie), pas de recherche, pas de période pour un critère
 * qui porte sur tout l'historique. Changer de filtre garde le classement précédent à
 * l'écran (atténué) le temps que le suivant arrive — jamais un spinner sur du déjà vu.
 */
const defaultNow = (): Date => new Date();

const option = (value: string, label: string): AdminOption => ({ value, label });

type RankingPanelProps = {
  readonly language: InterfaceLanguage;
  readonly deps?: AdminDeps;
  readonly now?: () => Date;
};

function labelsOf(language: InterfaceLanguage, shown: AdminRankingResult): RankingLabels {
  const branch = rankingBranchOf(shown.entityType, shown.criterion);
  return {
    entity: translateAdmin(language, `admin.ranking.col.entity.${branch}`),
    value: translateAdmin(language, criterionDefinition(shown.entityType, shown.criterion).label),
    when: translateAdmin(language, branch === 'users' || branch === 'conversations' ? 'admin.ranking.col.lastActivity' : 'admin.ranking.col.created'),
    creator: translateAdmin(language, 'admin.ranking.col.creator'),
  };
}

export function AdminRankingPanel({ language, deps = apiDeps, now = defaultNow }: RankingPanelProps) {
  const [search, setSearch] = useSearch();
  const state = parseRankingState(search);
  const write = (next: RankingState) => setSearch(serializeRankingState(next), true);

  const query = useQuery<AdminRankingResult>({
    queryKey: adminRankingQueryKey(state),
    queryFn: async ({ signal }) => unwrap(await loadAdminRanking({ ...deps, state, signal })),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const scope = periodScopeOf(state.entityType, state.criterion);

  const filters: readonly AdminToolbarFilter[] = [
    {
      id: 'criterion',
      label: translateAdmin(language, 'admin.ranking.criterion.label'),
      value: state.criterion,
      options: criteriaOf(state.entityType).map((definition) => option(definition.code, translateAdmin(language, definition.label))),
      onChange: (value) => write(withCriterion(state, value)),
    },
    ...(scope === 'none'
      ? []
      : [
          {
            id: 'period',
            label: translateAdmin(language, 'admin.ranking.period.label'),
            value: state.period,
            options: RANKING_PERIODS.map((period) => option(period, translateAdmin(language, `admin.ranking.period.${period}`))),
            onChange: (value: string) => write(withPeriod(state, value)),
          },
        ]),
    {
      id: 'limit',
      label: translateAdmin(language, 'admin.ranking.limit.label'),
      value: String(state.limit),
      options: RANKING_LIMITS.map((limit) => option(String(limit), translateAdmin(language, 'admin.ranking.limit.option', { count: formatCount(limit, language) }))),
      onChange: (value) => write(withLimit(state, value)),
    },
  ];

  const body = (): ReactNode => {
    const shown = query.data;
    if (shown === undefined) {
      if (query.isPending) return <RankingSkeleton language={language} />;
      return query.error instanceof ApiError && query.error.status === 403 ? (
        <AdminDeniedInline language={language} />
      ) : (
        <AdminErrorState language={language} onRetry={() => void query.refetch()} />
      );
    }

    if (shown.rows.length === 0) {
      const widenable = state.period !== 'all' && scope !== 'none';
      return (
        <AdminEmptyState
          title={translateAdmin(language, 'admin.ranking.empty')}
          hint={translateAdmin(language, widenable ? 'admin.ranking.empty.hint.period' : 'admin.ranking.empty.hint.all')}
          glyph="trophy"
          {...(widenable
            ? {
                action: (
                  <button
                    type="button"
                    data-admin-action="widen-period"
                    onClick={() => write(withPeriod(state, 'all'))}
                    className="rounded-chip px-4 text-body font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
                    style={{ minHeight: 44, color: BRAND, outlineColor: BRAND }}
                  >
                    {translateAdmin(language, 'admin.ranking.widen')}
                  </button>
                ),
              }
            : {})}
        />
      );
    }

    const showValue = criterionShowsValue(shown.entityType, shown.criterion);
    const labels = labelsOf(language, shown);
    const views = rankingRowViews(shown.rows, { language, now: now(), showValue });
    const podium = views.length >= 3 ? views.slice(0, 3) : [];
    const rest = views.slice(podium.length);

    return (
      <div className="grid gap-6">
        {podium.length === 0 ? null : <RankingPodium language={language} views={podium} labels={labels} showValue={showValue} dimmed={query.isPlaceholderData} />}
        {rest.length === 0 ? null : (
          <RankingTable
            language={language}
            views={rest}
            labels={labels}
            showValue={showValue}
            title={translateAdmin(language, podium.length === 0 ? 'admin.ranking.table.title' : 'admin.ranking.table.titleRest')}
            caption={translateAdmin(language, 'admin.ranking.table.caption', {
              criterion: labels.value,
              period: translateAdmin(language, `admin.ranking.period.${shown.period}`),
            })}
            dimmed={query.isPlaceholderData}
          />
        )}
      </div>
    );
  };

  const total = query.data?.rows.length;

  return (
    <div className="grid gap-6" data-admin-ranking>
      <AdminPageHeader
        language={language}
        title={translateAdmin(language, 'admin.nav.ranking')}
        subtitle={translateAdmin(language, 'admin.ranking.subtitle')}
        crumbs={[{ label: translateAdmin(language, 'admin.group.growth') }, { label: translateAdmin(language, 'admin.nav.ranking') }]}
      />
      <AdminOfflineNotice language={language} />

      <div className="grid gap-4">
        <AdminFilterChips
          label={translateAdmin(language, 'admin.ranking.entity.label')}
          options={RANKING_ENTITY_TYPES.map((entity) => option(entity, translateAdmin(language, `admin.ranking.entity.${entity}`)))}
          value={state.entityType}
          onChange={(value) => write(withEntityType(state, RANKING_ENTITY_TYPES.find((entity) => entity === value) ?? state.entityType))}
        />
        <AdminListToolbar
          language={language}
          filters={filters}
          {...(isDefaultRankingState(state) ? {} : { onReset: () => write(parseRankingState(new URLSearchParams())) })}
          {...(total === undefined ? {} : { trailing: translateAdmin(language, 'admin.ranking.count', { count: formatCount(total, language) }) })}
        />
        {scope === 'none' ? <AdminInlineNotice tone="info" text={translateAdmin(language, 'admin.ranking.periodNone')} /> : null}
        {scope === 'creation' ? <AdminInlineNotice tone="info" text={translateAdmin(language, 'admin.ranking.periodCreation')} /> : null}
        {query.data !== undefined && query.isError ? (
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
      </div>

      {body()}
    </div>
  );
}

export default function AdminRankingScreen() {
  const language = currentInterfaceLanguage();

  return (
    <AdminSectionScreen section="ranking" language={language} title={translateAdmin(language, 'admin.nav.ranking')}>
      {() => <AdminRankingPanel language={language} />}
    </AdminSectionScreen>
  );
}
