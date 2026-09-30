import { AdminSectionScreen } from '@/components/admin/section-screen';
import { AdminInterpretedBadge } from '@/components/admin/badges';
import { AdminEntityChip, AdminEntityIdentity } from '@/components/admin/entity-chip';
import { AdminEntityList, type AdminColumn } from '@/components/admin/entity-list';
import { AdminMomentText } from '@/components/admin/meta';
import { AdminPageHeader } from '@/components/admin/page-header';
import { AdminListToolbar } from '@/components/admin/list-toolbar';
import { adminGroupOf } from '@/lib/admin/admin-routes';
import { COMMUNITY_LIST_SPEC } from '@/lib/admin/community-list';
import { communityStateOf, communityVisibilityOf } from '@/lib/admin/community-state';
import { formatCount } from '@/lib/admin/interpret/numbers';
import { adminMomentOf } from '@/lib/admin/interpret/time';
import { communityRef, personRef } from '@/lib/admin/post-entities';
import { useAdminList } from '@/lib/admin/use-admin-list';
import { useAdminReach } from '@/lib/admin/use-admin-reach';
import type { AdminDeps } from '@/lib/api/admin';
import { adminCommunitiesQueryKey, loadAdminCommunities, type AdminCommunityRow } from '@/lib/api/admin-communities';
import { apiDeps } from '@/lib/api/deps';
import { translateAdmin } from '@/lib/i18n-admin-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';

/**
 * **LES COMMUNAUTÉS** (#8876) — `/admin/communities` · `/adm/communities`.
 *
 * Qui dirige quoi : le nom, l'identifiant public, la visibilité, combien de
 * membres sont ENCORE là (les départs ne comptent pas), combien de
 * conversations, qui l'a créée, et si elle est désactivée. Recherche dans le nom,
 * l'identifiant et la description ; tri par création ou par nom ; filtres de
 * visibilité et d'état — tous lus dans l'adresse, donc partageables. Chaque ligne
 * ouvre la fiche, où se trouvent les gestes.
 *
 * Gardée par `canManageGroups`. Le panneau reçoit ses `deps` (un témoin les
 * injecte) et l'instant courant (un témoin le fige).
 */
type SortKey = (typeof COMMUNITY_LIST_SPEC.sortKeys)[number];
type FilterKey = keyof typeof COMMUNITY_LIST_SPEC.filters;

export function AdminCommunitiesPanel({
  language,
  deps = apiDeps,
  now = new Date(),
}: {
  readonly language: InterfaceLanguage;
  readonly deps?: AdminDeps;
  readonly now?: Date;
}) {
  const reach = useAdminReach();
  const list = useAdminList<AdminCommunityRow, SortKey, FilterKey>({
    spec: COMMUNITY_LIST_SPEC,
    queryKey: adminCommunitiesQueryKey,
    load: (state, signal) => loadAdminCommunities({ ...deps, state, signal }),
    enabled: reach.opens('communities'),
  });

  const all = { value: '', label: translateAdmin(language, 'admin.list.all') };
  const total = list.query.data?.total;

  const columns: readonly AdminColumn<AdminCommunityRow>[] = [
    {
      id: 'community',
      header: translateAdmin(language, 'admin.community.col.community'),
      primary: true,
      sortKey: 'name',
      cell: (row) => <AdminEntityIdentity language={language} entity={communityRef(row, language)} />,
    },
    {
      id: 'visibility',
      header: translateAdmin(language, 'admin.community.col.visibility'),
      cell: (row) => <AdminInterpretedBadge value={communityVisibilityOf(row.isPrivate, language)} />,
    },
    {
      id: 'members',
      header: translateAdmin(language, 'admin.community.col.members'),
      align: 'end',
      cell: (row) => formatCount(row.activeMemberCount, language),
    },
    {
      id: 'conversations',
      header: translateAdmin(language, 'admin.community.col.conversations'),
      align: 'end',
      priority: 3,
      cell: (row) => formatCount(row.conversationCount, language),
    },
    {
      id: 'creator',
      header: translateAdmin(language, 'admin.community.col.creator'),
      cell: (row) => {
        const creator = personRef(row.creator, language);
        return creator === null ? '—' : <AdminEntityChip language={language} entity={creator} size="sm" />;
      },
    },
    {
      id: 'state',
      header: translateAdmin(language, 'admin.community.col.state'),
      cell: (row) => <AdminInterpretedBadge value={communityStateOf(row.isActive, language)} />,
    },
    {
      id: 'created',
      header: translateAdmin(language, 'admin.community.col.created'),
      sortKey: 'createdAt',
      cell: (row) => <AdminMomentText moment={adminMomentOf(row.createdAt, now, language)} />,
    },
  ];

  return (
    <div className="grid gap-6" data-admin-screen="communities">
      <AdminPageHeader
        language={language}
        title={translateAdmin(language, 'admin.nav.communities')}
        subtitle={translateAdmin(language, 'admin.community.subtitle')}
        crumbs={[
          { label: translateAdmin(language, `admin.group.${adminGroupOf('communities')}`) },
          { label: translateAdmin(language, 'admin.nav.communities') },
        ]}
      />
      <AdminEntityList
        language={language}
        section="communities"
        list={list}
        columns={columns}
        rowKey={(row) => row.id}
        rowTarget={(row) => ({ kind: 'entity', entity: 'community', id: row.id })}
        caption={translateAdmin(language, 'admin.community.caption')}
        empty={{ title: translateAdmin(language, 'admin.community.empty'), hint: translateAdmin(language, 'admin.community.empty.hint') }}
        filteredEmpty={{ title: translateAdmin(language, 'admin.community.filtered') }}
        toolbar={
          <AdminListToolbar
            language={language}
            search={{ label: translateAdmin(language, 'admin.community.search'), value: list.draft, onChange: list.setDraft }}
            filters={[
              {
                id: 'isPrivate',
                label: translateAdmin(language, 'admin.community.filter.visibility'),
                value: list.state.filters.isPrivate ?? '',
                options: [
                  all,
                  { value: 'true', label: translateAdmin(language, 'admin.community.filter.visibility.private') },
                  { value: 'false', label: translateAdmin(language, 'admin.community.filter.visibility.public') },
                ],
                onChange: (value) => list.filter('isPrivate', value),
              },
              {
                id: 'isActive',
                label: translateAdmin(language, 'admin.community.filter.state'),
                value: list.state.filters.isActive ?? '',
                options: [
                  all,
                  { value: 'true', label: translateAdmin(language, 'admin.community.filter.state.active') },
                  { value: 'false', label: translateAdmin(language, 'admin.community.filter.state.inactive') },
                ],
                onChange: (value) => list.filter('isActive', value),
              },
            ]}
            onReset={list.reset}
            {...(total === undefined ? {} : { trailing: translateAdmin(language, 'admin.community.count', { count: formatCount(total, language) }) })}
          />
        }
      />
    </div>
  );
}

export default function AdminCommunitiesScreen() {
  const language = currentInterfaceLanguage();
  return (
    <AdminSectionScreen section="communities" language={language} title={translateAdmin(language, 'admin.nav.communities')}>
      {() => <AdminCommunitiesPanel language={language} />}
    </AdminSectionScreen>
  );
}
