import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { AdminEntityChip } from '@/components/admin/entity-chip';
import { AdminFicheSection } from '@/components/admin/fiche';
import { AdminShareChart } from '@/components/admin/charts/share-chart';
import { AdminStatCard, AdminStatGrid } from '@/components/admin/stat-card';
import { AdminErrorState } from '@/components/admin/states';
import { INK2 } from '@/components/admin/tone';
import type { AdminTarget } from '@/lib/admin/admin-routes';
import { interpretPostType } from '@/lib/admin/interpret/enums';
import { personSecondary } from '@/lib/admin/interpret/labels';
import { formatCount, formatPercent } from '@/lib/admin/interpret/numbers';
import { periodOf, type PostPeriod } from '@/lib/admin/post-list';
import { personRef, postRef } from '@/lib/admin/post-entities';
import type { AdminDeps } from '@/lib/api/admin';
import { adminPostsStatsQueryKey, loadAdminPostsStats, type AdminPostsStats } from '@/lib/api/admin-posts';
import { unwrap } from '@/lib/api/client';
import { translateAdmin } from '@/lib/i18n-admin-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **LE BANDEAU DE CHIFFRES DES PUBLICATIONS** (#8876) — ce que la plateforme a
 * publié sur la période choisie : combien en ligne, combien retirées (et quelle
 * part de tout ce qui a été publié), la répartition par type, les auteurs les
 * plus actifs, les publications qui portent l'engagement.
 *
 * La période est celle du filtre de la liste (`?period=`) : un seul réglage pour
 * le bandeau et le tableau. Les AUTRES filtres (type, visibilité…) ne le changent
 * pas, et l'écran le dit. Les tendances ne montrent ni texte ni extrait : la
 * route les sert sans leur audience, donc rien ne dit si leur texte est celui
 * d'une audience restreinte.
 *
 * Son échec ne bloque pas la liste : il a son propre squelette, son erreur et son
 * « Réessayer ».
 */
const listTarget = (search: Readonly<Record<string, string>>): AdminTarget => ({
  kind: 'section',
  section: 'posts',
  ...(Object.keys(search).length === 0 ? {} : { search }),
});

function Charts({ language, stats }: { readonly language: InterfaceLanguage; readonly stats: AdminPostsStats }) {
  const parts = stats.byType.map(({ type, count }) => ({ key: type, label: interpretPostType(type, language).label, value: count }));
  const top = parts[0];
  const authors = stats.topAuthors.flatMap(({ author, postCount }) => {
    const ref = personRef(author, language);
    if (ref === null) return [];
    const count = translateAdmin(language, 'admin.posts.stats.authorPosts', { count: formatCount(postCount, language) });
    return [{ ...ref, secondary: [personSecondary(author.username), count].filter((part) => part !== null).join(' · ') }];
  });
  const trending = stats.trending.map((post) =>
    postRef(
      post,
      language,
      translateAdmin(language, 'admin.posts.stats.engagement', { likes: formatCount(post.likeCount, language), comments: formatCount(post.commentCount, language) }),
    ),
  );
  const none = (
    <p className="text-body" style={{ color: INK2 }}>
      {translateAdmin(language, 'admin.posts.stats.none')}
    </p>
  );

  return (
    <div className="grid gap-3 md:gap-4 lg:grid-cols-3">
      <AdminShareChart
        language={language}
        id="posts-by-type"
        title={translateAdmin(language, 'admin.posts.stats.byType')}
        data={parts}
        format={(value) => formatCount(value, language)}
        summary={top === undefined ? '' : translateAdmin(language, 'admin.posts.stats.byType.summary', { type: top.label, count: formatCount(top.value, language) })}
      />
      <AdminFicheSection id="posts-authors" title={translateAdmin(language, 'admin.posts.stats.authors')}>
        {authors.length === 0 ? (
          none
        ) : (
          <ul className="grid gap-2">
            {authors.map((entity) => (
              <li key={entity.id} data-admin-top-author={entity.id}>
                <AdminEntityChip language={language} entity={entity} />
              </li>
            ))}
          </ul>
        )}
      </AdminFicheSection>
      <AdminFicheSection id="posts-trending" title={translateAdmin(language, 'admin.posts.stats.trending')}>
        {trending.length === 0 ? (
          none
        ) : (
          <ul className="grid gap-2">
            {trending.map((entity) => (
              <li key={entity.id} data-admin-trending={entity.id}>
                <AdminEntityChip language={language} entity={entity} />
              </li>
            ))}
          </ul>
        )}
      </AdminFicheSection>
    </div>
  );
}

export function AdminPostsStatsBand({
  language,
  deps,
  period,
  enabled,
}: {
  readonly language: InterfaceLanguage;
  readonly deps: AdminDeps;
  readonly period: PostPeriod | undefined;
  readonly enabled: boolean;
}) {
  const query = useQuery({
    queryKey: adminPostsStatsQueryKey(period),
    queryFn: async ({ signal }) => unwrap(await loadAdminPostsStats({ ...deps, period, signal })),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const stats = query.data;
  const periodLabel = translateAdmin(language, `admin.posts.period.${periodOf(period)}`);
  const withPeriod = period === undefined ? {} : { period };
  const everPublished = stats === undefined ? 0 : stats.total + stats.deleted;

  return (
    <section
      aria-labelledby="posts-stats-title"
      aria-busy={query.isPlaceholderData}
      data-admin-posts-stats
      className="grid gap-3"
      style={{ opacity: query.isPlaceholderData ? 0.6 : 1 }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="posts-stats-title" className="text-title font-semibold">
          {translateAdmin(language, 'admin.posts.stats.title')} · {periodLabel}
        </h2>
        <p className="text-caption" style={{ color: INK2 }}>
          {translateAdmin(language, 'admin.posts.stats.scope')}
        </p>
      </div>
      {stats === undefined && !query.isPending ? (
        <AdminErrorState language={language} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <AdminStatGrid columns={2}>
            <AdminStatCard
              language={language}
              anchor="posts-total"
              label={translateAdmin(language, 'admin.posts.stats.total')}
              value={stats === undefined ? '' : formatCount(stats.total, language)}
              caption={periodLabel}
              target={listTarget(withPeriod)}
              state={stats === undefined ? 'loading' : 'ready'}
            />
            <AdminStatCard
              language={language}
              anchor="posts-deleted"
              label={translateAdmin(language, 'admin.posts.stats.deleted')}
              value={stats === undefined ? '' : formatCount(stats.deleted, language)}
              {...(everPublished === 0 || stats === undefined
                ? {}
                : { caption: translateAdmin(language, 'admin.posts.stats.deletedShare', { share: formatPercent(stats.deleted / everPublished, 'ratio', language, 1) }) })}
              target={listTarget({ isDeleted: 'true', ...withPeriod })}
              state={stats === undefined ? 'loading' : 'ready'}
            />
          </AdminStatGrid>
          {stats === undefined ? null : <Charts language={language} stats={stats} />}
        </>
      )}
    </section>
  );
}
