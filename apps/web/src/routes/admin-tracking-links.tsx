import { AdminEntityIdentity } from '@/components/admin/entity-chip';
import { AdminEntityList, type AdminColumn } from '@/components/admin/entity-list';
import { AdminListToolbar, type AdminToolbarFilter } from '@/components/admin/list-toolbar';
import { AdminMomentText } from '@/components/admin/meta';
import { AdminPageHeader } from '@/components/admin/page-header';
import { AdminSectionScreen } from '@/components/admin/section-screen';
import { AdminInlineNotice, AdminOfflineNotice } from '@/components/admin/states';
import { interpretTrackingTarget } from '@/lib/admin/interpret/enums';
import { personLabel, trackingLinkLabel } from '@/lib/admin/interpret/labels';
import { formatCount } from '@/lib/admin/interpret/numbers';
import { adminMomentOf } from '@/lib/admin/interpret/time';
import {
  TRACKING_LINK_LIST_SPEC,
  TRACKING_TARGET_TYPES,
  trackingLinkListQuery,
  type TrackingFilterKey,
  type TrackingIdFilterKey,
  type TrackingSortKey,
} from '@/lib/admin/tracking-link-list';
import { useAdminList } from '@/lib/admin/use-admin-list';
import type { AdminDeps } from '@/lib/api/admin';
import { adminTrackingLinksListKey, loadAdminTrackingLinks, type AdminTrackingLinkRow } from '@/lib/api/admin-tracking-links';
import { apiDeps } from '@/lib/api/deps';
import { currentAdminLanguage, suspendForAdminInterfaceCatalog, translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';
import type { AdminOption } from '@/routes/admin-table';

import { LinkPerson } from './admin-share-link-parts';
import { TrackingStateBadge, TrackingTarget, TrackingUtm } from './admin-tracking-link-parts';

/**
 * **LES LIENS DE SUIVI** (#8876, #6729) — les campagnes : chaque lien NOMMÉ (son nom,
 * sinon sa campagne), son adresse courte, ce qu'il vise (la publication, la
 * conversation ou le profil NOMMÉS), qui l'a posé, ce qu'il a rapporté (clics, visiteurs
 * uniques, dernier clic) et son état. Chaque rangée ouvre sa fiche.
 *
 * Tri sur ce que la passerelle sait trier (création, clics, visiteurs uniques, dernier
 * clic) ; filtres sur l'état et le genre de cible ; recherche sur le nom, la campagne et
 * l'adresse ; « tous les liens de CE membre » depuis une fiche. Seuil de la section :
 * `canViewAnalytics`.
 */
const defaultNow = (): Date => new Date();

const option = (value: string, label: string): AdminOption => ({ value, label });

type TrackingLinksPanelProps = {
  readonly language: AdminLanguage;
  readonly deps?: AdminDeps;
  readonly now?: () => Date;
};

export function AdminTrackingLinksPanel({ language, deps = apiDeps, now = defaultNow }: TrackingLinksPanelProps) {
  const list = useAdminList<AdminTrackingLinkRow, TrackingSortKey, TrackingFilterKey, TrackingIdFilterKey>({
    spec: TRACKING_LINK_LIST_SPEC,
    queryKey: adminTrackingLinksListKey,
    enabled: true,
    staleTime: 30_000,
    load: async (state, signal) => loadAdminTrackingLinks({ ...deps, query: trackingLinkListQuery(state), signal }),
  });

  const filters: readonly AdminToolbarFilter[] = [
    {
      id: 'isActive',
      label: translateAdmin(language, 'admin.tracking.filter.state'),
      value: list.state.filters.isActive ?? '',
      options: [
        option('', translateAdmin(language, 'admin.list.all')),
        option('true', translateAdmin(language, 'admin.tracking.filter.active')),
        option('false', translateAdmin(language, 'admin.tracking.filter.inactive')),
      ],
      onChange: (value) => list.filter('isActive', value === '' ? null : value),
    },
    {
      id: 'targetType',
      label: translateAdmin(language, 'admin.tracking.filter.target'),
      value: list.state.filters.targetType ?? '',
      options: [
        option('', translateAdmin(language, 'admin.list.all')),
        ...TRACKING_TARGET_TYPES.map((type) => option(type, interpretTrackingTarget(type, language).label)),
      ],
      onChange: (value) => list.filter('targetType', value === '' ? null : value),
    },
  ];

  const clock = now();
  const moment = (iso: string | null) => <AdminMomentText moment={adminMomentOf(iso, clock, language)} />;

  const columns: readonly AdminColumn<AdminTrackingLinkRow>[] = [
    {
      id: 'link',
      header: translateAdmin(language, 'admin.tracking.col.link'),
      primary: true,
      cell: (row) => (
        <AdminEntityIdentity
          language={language}
          entity={{ kind: 'trackingLink', id: row.id, label: trackingLinkLabel(row, language), secondary: row.shortUrl === '' ? null : row.shortUrl }}
        />
      ),
    },
    { id: 'campaign', header: translateAdmin(language, 'admin.tracking.col.campaign'), cell: (row) => <TrackingUtm language={language} link={row} /> },
    { id: 'target', header: translateAdmin(language, 'admin.tracking.col.target'), cell: (row) => <TrackingTarget language={language} link={row} /> },
    { id: 'creator', header: translateAdmin(language, 'admin.tracking.col.creator'), priority: 3, cell: (row) => <LinkPerson language={language} person={row.creator} /> },
    { id: 'clicks', header: translateAdmin(language, 'admin.tracking.col.clicks'), sortKey: 'totalClicks', align: 'end', cell: (row) => formatCount(row.totalClicks, language) },
    { id: 'unique', header: translateAdmin(language, 'admin.tracking.col.unique'), sortKey: 'uniqueClicks', align: 'end', priority: 3, cell: (row) => formatCount(row.uniqueClicks, language) },
    {
      id: 'lastClick',
      header: translateAdmin(language, 'admin.tracking.col.lastClick'),
      sortKey: 'lastClickedAt',
      priority: 3,
      cell: (row) => (row.lastClickedAt === null ? translateAdmin(language, 'admin.tracking.lastClick.never') : moment(row.lastClickedAt)),
    },
    { id: 'state', header: translateAdmin(language, 'admin.tracking.col.state'), cell: (row) => <TrackingStateBadge language={language} link={row} now={clock} /> },
    { id: 'created', header: translateAdmin(language, 'admin.tracking.col.created'), sortKey: 'createdAt', priority: 3, cell: (row) => moment(row.createdAt) },
  ];

  const total = list.query.data?.total;
  const creatorId = list.state.ids.createdBy;
  const named = list.query.data?.rows.find((row) => row.creator?.id === creatorId)?.creator ?? null;

  return (
    <div className="grid gap-6" data-admin-tracking-links>
      <AdminPageHeader
        language={language}
        title={translateAdmin(language, 'admin.nav.trackingLinks')}
        subtitle={translateAdmin(language, 'admin.tracking.subtitle')}
        crumbs={[{ label: translateAdmin(language, 'admin.group.growth') }, { label: translateAdmin(language, 'admin.nav.trackingLinks') }]}
      />
      <AdminOfflineNotice language={language} />
      {creatorId === undefined ? null : (
        <AdminInlineNotice
          tone="info"
          text={
            named === null
              ? translateAdmin(language, 'admin.tracking.list.onCreatorGeneric')
              : translateAdmin(language, 'admin.tracking.list.onCreator', { name: personLabel(named, language) })
          }
          action={
            <button
              type="button"
              data-admin-list-reset
              onClick={list.reset}
              className="rounded-chip px-3 text-caption font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{ minHeight: 44, color: 'var(--color-ios-brand)', outlineColor: 'var(--color-ios-brand)' }}
            >
              {translateAdmin(language, 'admin.tracking.list.onCreatorReset')}
            </button>
          }
        />
      )}
      <AdminEntityList
        language={language}
        section="trackingLinks"
        list={list}
        columns={columns}
        rowKey={(row) => row.id}
        rowTarget={(row) => ({ kind: 'entity', entity: 'trackingLink', id: row.id })}
        caption={translateAdmin(language, 'admin.tracking.list.caption')}
        toolbar={
          <AdminListToolbar
            language={language}
            search={{ label: translateAdmin(language, 'admin.tracking.search.label'), value: list.draft, onChange: list.setDraft }}
            filters={filters}
            onReset={list.reset}
            {...(total === undefined ? {} : { trailing: translateAdmin(language, 'admin.tracking.list.count', { count: formatCount(total, language) }) })}
          />
        }
        empty={{ title: translateAdmin(language, 'admin.tracking.list.empty'), hint: translateAdmin(language, 'admin.tracking.list.emptyHint') }}
        filteredEmpty={{ title: translateAdmin(language, 'admin.tracking.list.filteredEmpty') }}
      />
    </div>
  );
}

export default function AdminTrackingLinksScreen() {
  const language = currentAdminLanguage();
  suspendForAdminInterfaceCatalog(language);

  return (
    <AdminSectionScreen section="trackingLinks" language={language} title={translateAdmin(language, 'admin.nav.trackingLinks')}>
      {() => <AdminTrackingLinksPanel language={language} />}
    </AdminSectionScreen>
  );
}
