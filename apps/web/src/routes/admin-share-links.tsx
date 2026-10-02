import { AdminEntityIdentity } from '@/components/admin/entity-chip';
import { AdminEntityList, type AdminColumn } from '@/components/admin/entity-list';
import { AdminListToolbar, type AdminToolbarFilter } from '@/components/admin/list-toolbar';
import { AdminMomentText } from '@/components/admin/meta';
import { AdminPageHeader } from '@/components/admin/page-header';
import { AdminSectionScreen } from '@/components/admin/section-screen';
import { AdminOfflineNotice } from '@/components/admin/states';
import { excerptOf, shareLinkLabel } from '@/lib/admin/interpret/labels';
import { formatCount } from '@/lib/admin/interpret/numbers';
import { adminMomentOf } from '@/lib/admin/interpret/time';
import {
  SHARE_LINK_LIST_SPEC,
  shareLinkListQuery,
  type ShareLinkFilterKey,
  type ShareLinkSortKey,
} from '@/lib/admin/share-link-list';
import { shareLinkUsage } from '@/lib/admin/share-link-model';
import { useAdminList } from '@/lib/admin/use-admin-list';
import type { AdminDeps } from '@/lib/api/admin';
import { adminShareLinksListKey, loadAdminShareLinks, type AdminShareLinkRow } from '@/lib/api/admin-share-links';
import { apiDeps } from '@/lib/api/deps';
import { currentAdminLanguage, suspendForAdminInterfaceCatalog, translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';
import type { AdminOption } from '@/routes/admin-table';

import { LinkConversation, LinkPerson, ShareLinkStateBadge } from './admin-share-link-parts';

/**
 * **LES LIENS DE PARTAGE** (#8876, #6729) — les liens qui ouvrent une
 * conversation à des invités : chacun NOMMÉ (jamais par sa clé de jointure, que la
 * passerelle ne sert pas), avec la conversation qu'il ouvre, celui qui l'a créé, son
 * usage (« 12 sur 50 »), les invités arrivés, son état (ouvert, fermé, expiré,
 * quota atteint) et sa date d'expiration. Chaque rangée ouvre sa fiche.
 *
 * La recherche ne porte que sur le nom (jamais sur le secret, #4693) ; aucun tri
 * n'est servi, donc aucune colonne n'est triable. Le seuil de la section est
 * `canManageConversations`, celui de la route.
 */
const defaultNow = (): Date => new Date();

const option = (value: string, label: string): AdminOption => ({ value, label });

type ShareLinksPanelProps = {
  readonly language: AdminLanguage;
  readonly deps?: AdminDeps;
  readonly now?: () => Date;
};

export function AdminShareLinksPanel({ language, deps = apiDeps, now = defaultNow }: ShareLinksPanelProps) {
  const list = useAdminList<AdminShareLinkRow, ShareLinkSortKey, ShareLinkFilterKey>({
    spec: SHARE_LINK_LIST_SPEC,
    queryKey: adminShareLinksListKey,
    enabled: true,
    staleTime: 30_000,
    load: async (state, signal) => loadAdminShareLinks({ ...deps, query: shareLinkListQuery(state), signal }),
  });

  const filters: readonly AdminToolbarFilter[] = [
    {
      id: 'isActive',
      label: translateAdmin(language, 'admin.shareLink.filter.openness'),
      value: list.state.filters.isActive ?? '',
      options: [
        option('', translateAdmin(language, 'admin.list.all')),
        option('true', translateAdmin(language, 'admin.shareLink.filter.open')),
        option('false', translateAdmin(language, 'admin.shareLink.filter.closed')),
      ],
      onChange: (value) => list.filter('isActive', value === '' ? null : value),
    },
  ];

  const clock = now();
  const moment = (iso: string | null) => <AdminMomentText moment={adminMomentOf(iso, clock, language)} />;

  const columns: readonly AdminColumn<AdminShareLinkRow>[] = [
    {
      id: 'link',
      header: translateAdmin(language, 'admin.shareLink.col.link'),
      primary: true,
      cell: (row) => (
        <AdminEntityIdentity
          language={language}
          entity={{ kind: 'shareLink', id: row.id, label: shareLinkLabel(row, language), secondary: excerptOf(row.description, 60) }}
        />
      ),
    },
    { id: 'conversation', header: translateAdmin(language, 'admin.shareLink.col.conversation'), cell: (row) => <LinkConversation language={language} conversation={row.conversation} /> },
    { id: 'creator', header: translateAdmin(language, 'admin.shareLink.col.creator'), priority: 3, cell: (row) => <LinkPerson language={language} person={row.creator} /> },
    { id: 'usage', header: translateAdmin(language, 'admin.shareLink.col.usage'), cell: (row) => shareLinkUsage(row.currentUses, row.maxUses, language) },
    { id: 'guests', header: translateAdmin(language, 'admin.shareLink.col.guests'), priority: 3, align: 'end', cell: (row) => formatCount(row.guestCount, language) },
    { id: 'state', header: translateAdmin(language, 'admin.shareLink.col.state'), cell: (row) => <ShareLinkStateBadge language={language} link={row} now={clock} /> },
    {
      id: 'expires',
      header: translateAdmin(language, 'admin.shareLink.col.expires'),
      priority: 3,
      cell: (row) => (row.expiresAt === null ? translateAdmin(language, 'admin.shareLink.expires.never') : moment(row.expiresAt)),
    },
    { id: 'created', header: translateAdmin(language, 'admin.shareLink.col.created'), priority: 3, cell: (row) => moment(row.createdAt) },
  ];

  const total = list.query.data?.total;

  return (
    <div className="grid gap-6" data-admin-share-links>
      <AdminPageHeader
        language={language}
        title={translateAdmin(language, 'admin.nav.shareLinks')}
        subtitle={translateAdmin(language, 'admin.shareLink.subtitle')}
        crumbs={[{ label: translateAdmin(language, 'admin.group.exchanges') }, { label: translateAdmin(language, 'admin.nav.shareLinks') }]}
      />
      <AdminOfflineNotice language={language} />
      <AdminEntityList
        language={language}
        section="shareLinks"
        list={list}
        columns={columns}
        rowKey={(row) => row.id}
        rowTarget={(row) => ({ kind: 'entity', entity: 'shareLink', id: row.id })}
        caption={translateAdmin(language, 'admin.shareLink.list.caption')}
        toolbar={
          <AdminListToolbar
            language={language}
            search={{ label: translateAdmin(language, 'admin.shareLink.search.label'), value: list.draft, onChange: list.setDraft }}
            filters={filters}
            onReset={list.reset}
            {...(total === undefined ? {} : { trailing: translateAdmin(language, 'admin.shareLink.list.count', { count: formatCount(total, language) }) })}
          />
        }
        empty={{ title: translateAdmin(language, 'admin.shareLink.list.empty'), hint: translateAdmin(language, 'admin.shareLink.list.emptyHint') }}
        filteredEmpty={{ title: translateAdmin(language, 'admin.shareLink.list.filteredEmpty') }}
      />
    </div>
  );
}

export default function AdminShareLinksScreen() {
  const language = currentAdminLanguage();
  suspendForAdminInterfaceCatalog(language);

  return (
    <AdminSectionScreen section="shareLinks" language={language} title={translateAdmin(language, 'admin.nav.shareLinks')}>
      {() => <AdminShareLinksPanel language={language} />}
    </AdminSectionScreen>
  );
}
