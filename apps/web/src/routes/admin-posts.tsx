import { AdminBadge, AdminInterpretedBadge } from '@/components/admin/badges';
import { AdminEntityIdentity } from '@/components/admin/entity-chip';
import { AdminEntityList, type AdminColumn } from '@/components/admin/entity-list';
import { AdminListToolbar } from '@/components/admin/list-toolbar';
import { AdminMomentText } from '@/components/admin/meta';
import { AdminPageHeader } from '@/components/admin/page-header';
import { AdminSectionScreen } from '@/components/admin/section-screen';
import { AdminInlineNotice } from '@/components/admin/states';
import { AdminTabs } from '@/components/admin/tabs';
import { BRAND, INK2 } from '@/components/admin/tone';
import { adminGroupOf } from '@/lib/admin/admin-routes';
import { interpretPostState, interpretPostType, interpretPostVisibility } from '@/lib/admin/interpret/enums';
import { personLabel } from '@/lib/admin/interpret/labels';
import { formatCount } from '@/lib/admin/interpret/numbers';
import { adminMomentOf } from '@/lib/admin/interpret/time';
import { personRef } from '@/lib/admin/post-entities';
import { periodOf, POST_LIST_SPEC, POST_PERIODS, POST_TABS, POST_VISIBILITIES, postTabOf, postTypeOfTab } from '@/lib/admin/post-list';
import { postExcerptOf } from '@/lib/admin/post-phrases';
import { postStateOf } from '@/lib/admin/post-state';
import { useAdminList } from '@/lib/admin/use-admin-list';
import { useAdminReach } from '@/lib/admin/use-admin-reach';
import type { AdminDeps } from '@/lib/api/admin';
import { adminPostsQueryKey, loadAdminPosts, type AdminPostRow } from '@/lib/api/admin-posts';
import { apiDeps } from '@/lib/api/deps';
import { translateAdmin } from '@/lib/i18n-admin-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { useSearch } from '@/lib/router';

import { AdminPostsStatsBand } from './admin-posts-stats';

/**
 * **LES PUBLICATIONS** (#8876) — `/admin/posts` · `/adm/posts` : publications,
 * stories, reels et statuts d'un seul tenant.
 *
 * Un bandeau de chiffres (période, retirées, répartition par type, auteurs les
 * plus actifs, tendances), des onglets de type, puis la liste : auteur nommé,
 * extrait, type, visibilité, réactions, commentaires, vues, état (publiée,
 * retirée, expirée), date. Recherche dans le texte, filtres de visibilité, de
 * retrait, d'épinglage et de période, filtre par auteur (depuis la fiche d'une
 * publication) — tout est dans l'adresse. Aucun tri : la passerelle n'en sert pas.
 *
 * **Une audience restreinte (`PRIVATE`, `ONLY`, `EXCEPT`) ne se lit pas ici** : la
 * liste dit « Contenu à audience restreinte » ; le texte n'est lisible que dans
 * la fiche, pour qui modère.
 *
 * Gardée par `canModerateContent`.
 */
type SortKey = (typeof POST_LIST_SPEC.sortKeys)[number];
type FilterKey = keyof typeof POST_LIST_SPEC.filters;

function ExcerptCell({ row, language }: { readonly row: AdminPostRow; readonly language: InterfaceLanguage }) {
  const excerpt = postExcerptOf(row, language);
  return (
    <span className="grid max-w-md gap-1">
      <span className={`break-words${excerpt.kind === 'restricted' || excerpt.kind === 'none' ? ' italic' : ''}`} style={excerpt.kind === 'text' ? undefined : { color: INK2 }}>
        {excerpt.text}
      </span>
      {row.isPinned ? (
        <span>
          <AdminBadge tone="brand">{translateAdmin(language, 'admin.posts.pinned')}</AdminBadge>
        </span>
      ) : null}
    </span>
  );
}

export function AdminPostsPanel({
  language,
  deps = apiDeps,
  now = new Date(),
}: {
  readonly language: InterfaceLanguage;
  readonly deps?: AdminDeps;
  readonly now?: Date;
}) {
  const reach = useAdminReach();
  const [search, setSearch] = useSearch();
  const list = useAdminList<AdminPostRow, SortKey, FilterKey, 'authorId'>({
    spec: POST_LIST_SPEC,
    queryKey: adminPostsQueryKey,
    load: (state, signal) => loadAdminPosts({ ...deps, state, signal }),
    enabled: reach.opens('posts'),
  });

  const all = { value: '', label: translateAdmin(language, 'admin.list.all') };
  const total = list.query.data?.total;
  const periodFilter = periodOf(list.state.filters.period);
  const authorId = list.state.ids.authorId;
  const authorRow = authorId === undefined ? undefined : list.query.data?.rows.find((row) => row.author?.id === authorId);
  const authorName = authorRow?.author === undefined || authorRow.author === null ? null : personLabel(authorRow.author, language);

  const clearAuthor = () => {
    const next = new URLSearchParams(search);
    next.delete('authorId');
    next.delete('offset');
    setSearch(next, true);
  };

  const columns: readonly AdminColumn<AdminPostRow>[] = [
    {
      id: 'author',
      header: translateAdmin(language, 'admin.posts.col.author'),
      primary: true,
      cell: (row) => {
        const author = personRef(row.author, language);
        return author === null ? <span style={{ color: INK2 }}>{personLabel(null, language)}</span> : <AdminEntityIdentity language={language} entity={author} />;
      },
    },
    { id: 'excerpt', header: translateAdmin(language, 'admin.posts.col.excerpt'), cell: (row) => <ExcerptCell row={row} language={language} /> },
    { id: 'type', header: translateAdmin(language, 'admin.posts.col.type'), cell: (row) => <AdminInterpretedBadge value={interpretPostType(row.type, language)} /> },
    { id: 'visibility', header: translateAdmin(language, 'admin.posts.col.visibility'), cell: (row) => <AdminInterpretedBadge value={interpretPostVisibility(row.visibility, language)} /> },
    { id: 'likes', header: translateAdmin(language, 'admin.posts.col.likes'), align: 'end', cell: (row) => formatCount(row.likeCount, language) },
    { id: 'comments', header: translateAdmin(language, 'admin.posts.col.comments'), align: 'end', priority: 3, cell: (row) => formatCount(row.commentCount, language) },
    { id: 'views', header: translateAdmin(language, 'admin.posts.col.views'), align: 'end', priority: 3, cell: (row) => formatCount(row.viewCount, language) },
    {
      id: 'state',
      header: translateAdmin(language, 'admin.posts.col.state'),
      cell: (row) => <AdminInterpretedBadge value={interpretPostState(postStateOf(row, now), language)} />,
    },
    {
      id: 'published',
      header: translateAdmin(language, 'admin.posts.col.published'),
      cell: (row) => <AdminMomentText moment={adminMomentOf(row.createdAt, now, language)} />,
    },
  ];

  const tabs = POST_TABS.map((tab) => ({ id: tab, label: translateAdmin(language, `admin.posts.tab.${tab}`) }));

  return (
    <div className="grid gap-6" data-admin-screen="posts">
      <AdminPageHeader
        language={language}
        title={translateAdmin(language, 'admin.nav.posts')}
        subtitle={translateAdmin(language, 'admin.posts.subtitle')}
        crumbs={[{ label: translateAdmin(language, `admin.group.${adminGroupOf('posts')}`) }, { label: translateAdmin(language, 'admin.nav.posts') }]}
      />
      <AdminPostsStatsBand language={language} deps={deps} period={periodFilter === 'all' ? undefined : periodFilter} enabled={reach.opens('posts')} />
      <div className="grid gap-4">
        <AdminTabs label={translateAdmin(language, 'admin.posts.tabs.label')} tabs={tabs} active={postTabOf(list.state.filters)} onChange={(tab) => list.filter('type', postTypeOfTab(tab))} />
        {authorId === undefined ? null : (
          <AdminInlineNotice
            tone="info"
            text={authorName === null ? translateAdmin(language, 'admin.posts.filter.authorUnknown') : translateAdmin(language, 'admin.posts.filter.author', { name: authorName })}
            action={
              <button
                type="button"
                data-admin-author-clear
                onClick={clearAuthor}
                className="rounded-chip px-3 text-caption font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
                style={{ minHeight: 44, color: BRAND, outlineColor: BRAND }}
              >
                {translateAdmin(language, 'admin.posts.filter.authorClear')}
              </button>
            }
          />
        )}
        <AdminEntityList
          language={language}
          section="posts"
          list={list}
          columns={columns}
          rowKey={(row) => row.id}
          rowTarget={(row) => ({ kind: 'entity', entity: 'post', id: row.id })}
          caption={translateAdmin(language, 'admin.posts.caption')}
          empty={{ title: translateAdmin(language, 'admin.posts.empty'), hint: translateAdmin(language, 'admin.posts.empty.hint') }}
          filteredEmpty={{ title: translateAdmin(language, 'admin.posts.filtered') }}
          toolbar={
            <AdminListToolbar
              language={language}
              search={{ label: translateAdmin(language, 'admin.posts.search'), value: list.draft, onChange: list.setDraft }}
              filters={[
                {
                  id: 'visibility',
                  label: translateAdmin(language, 'admin.posts.filter.visibility'),
                  value: list.state.filters.visibility ?? '',
                  options: [all, ...POST_VISIBILITIES.map((visibility) => ({ value: visibility, label: interpretPostVisibility(visibility, language).label }))],
                  onChange: (value) => list.filter('visibility', value),
                },
                {
                  id: 'isDeleted',
                  label: translateAdmin(language, 'admin.posts.filter.deleted'),
                  value: list.state.filters.isDeleted === 'true' ? 'true' : '',
                  options: [
                    { value: '', label: translateAdmin(language, 'admin.posts.filter.deleted.no') },
                    { value: 'true', label: translateAdmin(language, 'admin.posts.filter.deleted.yes') },
                  ],
                  onChange: (value) => list.filter('isDeleted', value),
                },
                {
                  id: 'isPinned',
                  label: translateAdmin(language, 'admin.posts.filter.pinned'),
                  value: list.state.filters.isPinned ?? '',
                  options: [
                    all,
                    { value: 'true', label: translateAdmin(language, 'admin.posts.filter.pinned.yes') },
                    { value: 'false', label: translateAdmin(language, 'admin.posts.filter.pinned.no') },
                  ],
                  onChange: (value) => list.filter('isPinned', value),
                },
                {
                  id: 'period',
                  label: translateAdmin(language, 'admin.posts.filter.period'),
                  value: list.state.filters.period ?? '',
                  options: [
                    { value: '', label: translateAdmin(language, 'admin.posts.period.all') },
                    ...POST_PERIODS.map((period) => ({ value: period, label: translateAdmin(language, `admin.posts.period.${period}`) })),
                  ],
                  onChange: (value) => list.filter('period', value),
                },
              ]}
              onReset={list.reset}
              {...(total === undefined ? {} : { trailing: translateAdmin(language, 'admin.posts.count', { count: formatCount(total, language) }) })}
            />
          }
        />
      </div>
    </div>
  );
}

export default function AdminPostsScreen() {
  const language = currentInterfaceLanguage();
  return (
    <AdminSectionScreen section="posts" language={language} title={translateAdmin(language, 'admin.nav.posts')}>
      {() => <AdminPostsPanel language={language} />}
    </AdminSectionScreen>
  );
}
