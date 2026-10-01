import { useQuery, type QueryKey, type UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { AdminStatCard } from '@/components/admin/stat-card';
import { AdminDeniedInline, AdminErrorState, AdminInlineNotice } from '@/components/admin/states';
import { INK, INK2 } from '@/components/admin/tone';
import { ApiError, unwrap } from '@/lib/api/client';
import type { ApiResult } from '@/lib/api/http';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';
import { useSearch } from '@/lib/router';

/**
 * **LES PIÈCES COMMUNES DES ÉCRANS DE STATISTIQUES** (#8876, #6728) — la requête
 * en cache-first, le bloc qui porte ses trois états, la carte de chiffre qui les
 * relaie, la section titrée, la période dans l'adresse.
 *
 * ## Cache-first, jamais de spinner sur des données en cache
 *
 * `staleTime` de cinq minutes (la passerelle met ces agrégats en cache cinq à dix
 * minutes) ; `refetchOnWindowFocus: false` ; un rafraîchissement qui ÉCHOUE alors
 * que des données sont à l'écran les garde et le dit (`StaleDataNotice`) — il ne
 * les remplace pas par une erreur. Un bloc n'est « en chargement » que sans
 * aucune donnée.
 *
 * ## Un bloc refusé (403) reste UN bloc
 *
 * Une capacité que la route exige en plus de celle de l'écran se rend comme un
 * refus en place (`AdminDeniedInline`), jamais comme une panne : le reste de
 * l'écran continue de servir.
 */
export const STATS_STALE_MS = 5 * 60_000;

export type BlockState = 'ready' | 'loading' | 'error';

export type Block<T> = {
  readonly state: BlockState;
  readonly data: T | undefined;
  readonly retry: () => void;
};

export function useStatsQuery<T>(
  key: QueryKey,
  load: (signal: AbortSignal) => Promise<ApiResult<T>>,
  options: { readonly staleTime?: number; readonly refetchInterval?: number } = {},
): UseQueryResult<T> {
  return useQuery<T>({
    queryKey: key,
    queryFn: async ({ signal }) => unwrap(await load(signal)),
    staleTime: options.staleTime ?? STATS_STALE_MS,
    ...(options.refetchInterval === undefined ? {} : { refetchInterval: options.refetchInterval }),
    retry: false,
    refetchOnWindowFocus: false,
  });
}

const isDenied = (query: UseQueryResult<unknown>): boolean =>
  query.data === undefined && query.error instanceof ApiError && query.error.status === 403;

function blockOf<T>(query: UseQueryResult<T>): Block<T> {
  return {
    state: query.data !== undefined ? 'ready' : query.isError ? 'error' : 'loading',
    data: query.data,
    retry: () => void query.refetch(),
  };
}

/**
 * `groupError` : un bloc qui nourrit PLUSIEURS cartes et graphiques ne dessine pas
 * vingt fois la même erreur — il en rend UNE, avec un seul « Réessayer ». Un bloc qui
 * ne nourrit qu'un graphique laisse celui-ci porter son erreur, sous son titre.
 */
export function StatsBlock<T>({
  language,
  query,
  groupError = false,
  children,
}: {
  readonly language: AdminLanguage;
  readonly query: UseQueryResult<T>;
  readonly groupError?: boolean;
  readonly children: (block: Block<T>) => ReactNode;
}) {
  if (isDenied(query)) return <AdminDeniedInline language={language} />;
  const block = blockOf(query);
  if (groupError && block.state === 'error') return <AdminErrorState language={language} onRetry={block.retry} />;
  return <>{children(block)}</>;
}

/** Un rafraîchissement a échoué alors que des données sont à l'écran : on les garde, et on le dit. */
export function StaleDataNotice({ language, queries }: { readonly language: AdminLanguage; readonly queries: readonly UseQueryResult<unknown>[] }) {
  const stale = queries.some((query) => query.isError && query.data !== undefined);
  return stale ? <AdminInlineNotice tone="warning" text={translateAdmin(language, 'admin.kit.cached')} /> : null;
}

/** Une carte de chiffre dont les trois états viennent du bloc ; `value` et `caption` ne se calculent que sur des données. */
export function Metric<T>({
  language,
  block,
  anchor,
  label,
  value,
  caption,
}: {
  readonly language: AdminLanguage;
  readonly block: Block<T>;
  readonly anchor: string;
  readonly label: string;
  readonly value: (data: T) => string;
  readonly caption?: (data: T) => string;
}) {
  const data = block.data;
  return (
    <AdminStatCard
      language={language}
      anchor={anchor}
      label={label}
      state={block.state}
      onRetry={block.retry}
      value={data === undefined ? '—' : value(data)}
      {...(data === undefined || caption === undefined ? {} : { caption: caption(data) })}
    />
  );
}

/** Une section titrée d'un écran de statistiques — les cartes et les graphiques posent eux-mêmes leur bord. */
export function StatsSection({
  id,
  title,
  note,
  children,
}: {
  readonly id: string;
  readonly title: string;
  readonly note?: string;
  readonly children: ReactNode;
}) {
  return (
    <section aria-labelledby={`${id}-title`} data-admin-stats-section={id} className="grid gap-3">
      <div className="grid gap-1">
        <h2 id={`${id}-title`} className="text-title font-semibold" style={{ color: INK }}>
          {title}
        </h2>
        {note === undefined ? null : (
          <p className="text-caption" style={{ color: INK2 }}>
            {note}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

export type WindowPeriod = '24h' | '7d' | '30d' | '90d';

/** Le libellé d'une puce de période : celui du kit (`admin.kit.period.*`), partagé par tous les écrans. */
export function periodLabel(language: AdminLanguage, period: WindowPeriod): string {
  switch (period) {
    case '24h':
      return translateAdmin(language, 'admin.kit.period.24h');
    case '7d':
      return translateAdmin(language, 'admin.kit.period.7d');
    case '30d':
      return translateAdmin(language, 'admin.kit.period.30d');
    case '90d':
      return translateAdmin(language, 'admin.kit.period.90d');
  }
}

/** « Période : 7 derniers jours » — la fenêtre RÉELLEMENT servie par le bloc. */
export function windowNote(language: AdminLanguage, period: WindowPeriod): string {
  return translateAdmin(language, 'admin.analytics.window.note', { window: translateAdmin(language, `admin.analytics.window.${period}`) });
}

/**
 * LA PÉRIODE, DANS L'ADRESSE (`?period=`) — lue avec une liste blanche (une période
 * inconnue retombe sur `fallback`), réécrite EN PLACE : changer de période dix fois
 * ne coûte pas dix retours arrière, et un lien partagé rouvre la même fenêtre. La
 * période par défaut n'est pas écrite.
 */
export function usePeriodParam<T extends string>(allowed: readonly T[], fallback: T): readonly [T, (period: T) => void] {
  const [search, setSearch] = useSearch();
  const requested = search.get('period') ?? '';
  const active = allowed.find((period) => period === requested) ?? fallback;

  const change = (period: T) => {
    const next = new URLSearchParams(search);
    if (period === fallback) next.delete('period');
    else next.set('period', period);
    setSearch(next, true);
  };
  return [active, change];
}
