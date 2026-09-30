import { AdminGlyph } from '@/components/admin/admin-glyph';
import { AdminEntityIdentity } from '@/components/admin/entity-chip';
import { AdminEntityList, type AdminColumn } from '@/components/admin/entity-list';
import { AdminListToolbar, type AdminToolbarFilter } from '@/components/admin/list-toolbar';
import { AdminMomentText } from '@/components/admin/meta';
import { AdminPageHeader } from '@/components/admin/page-header';
import { AdminSectionScreen } from '@/components/admin/section-screen';
import { AdminInlineNotice, AdminOfflineNotice } from '@/components/admin/states';
import { interpretInvitationStatus } from '@/lib/admin/interpret/enums';
import { personLabel } from '@/lib/admin/interpret/labels';
import { formatCount } from '@/lib/admin/interpret/numbers';
import { adminMomentOf } from '@/lib/admin/interpret/time';
import {
  INVITATION_LIST_SPEC,
  INVITATION_STATUSES,
  invitationListQuery,
  type InvitationFilterKey,
  type InvitationIdFilterKey,
  type InvitationSortKey,
} from '@/lib/admin/invitation-list';
import { userRefOf } from '@/lib/admin/share-link-refs';
import { useAdminList } from '@/lib/admin/use-admin-list';
import type { AdminDeps } from '@/lib/api/admin';
import { adminInvitationsListKey, loadAdminInvitations, type AdminInvitationRow } from '@/lib/api/admin-invitations';
import { apiDeps } from '@/lib/api/deps';
import { translateAdmin } from '@/lib/i18n-admin-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import type { AdminOption } from '@/routes/admin-table';

import { InvitationStatusBadge } from './admin-invitation-parts';
import { InvitationsOverview } from './admin-invitations-overview';
import { LinkPerson } from './admin-share-link-parts';

/**
 * **LES DEMANDES DE CONTACT** (#8876, #6729) — les demandes d'AMI que les membres
 * s'envoient : qui a demandé à qui, où en est la demande, depuis quand. Le bandeau
 * dit le volume et le taux d'acceptation, la courbe les sept derniers jours ; la
 * liste filtre par statut (et, depuis une fiche, par expéditeur) et chaque
 * rangée ouvre sa fiche.
 *
 * La route n'a ni recherche ni tri : aucun champ de recherche n'est dessiné, aucune
 * colonne n'est triable. Son seuil est celui de la section — `canManageUsers`.
 */
const defaultNow = (): Date => new Date();

const option = (value: string, label: string): AdminOption => ({ value, label });

type InvitationsPanelProps = {
  readonly language: InterfaceLanguage;
  readonly deps?: AdminDeps;
  readonly now?: () => Date;
};

export function AdminInvitationsPanel({ language, deps = apiDeps, now = defaultNow }: InvitationsPanelProps) {
  const list = useAdminList<AdminInvitationRow, InvitationSortKey, InvitationFilterKey, InvitationIdFilterKey>({
    spec: INVITATION_LIST_SPEC,
    queryKey: adminInvitationsListKey,
    enabled: true,
    staleTime: 30_000,
    load: async (state, signal) => loadAdminInvitations({ ...deps, query: invitationListQuery(state), signal }),
  });

  const filters: readonly AdminToolbarFilter[] = [
    {
      id: 'status',
      label: translateAdmin(language, 'admin.invitation.filter.status'),
      value: list.state.filters.status ?? '',
      options: [
        option('', translateAdmin(language, 'admin.list.all')),
        ...INVITATION_STATUSES.map((status) => option(status, interpretInvitationStatus(status, language).label)),
      ],
      onChange: (value) => list.filter('status', value === '' ? null : value),
    },
  ];

  const moment = (iso: string | null) => <AdminMomentText moment={adminMomentOf(iso, now(), language)} />;

  const columns: readonly AdminColumn<AdminInvitationRow>[] = [
    {
      id: 'sender',
      header: translateAdmin(language, 'admin.invitation.col.sender'),
      primary: true,
      cell: (row) => {
        const ref = userRefOf(row.sender, language);
        return ref === null ? <span>{personLabel(null, language)}</span> : <AdminEntityIdentity language={language} entity={ref} />;
      },
    },
    { id: 'receiver', header: translateAdmin(language, 'admin.invitation.col.receiver'), cell: (row) => <LinkPerson language={language} person={row.receiver} /> },
    { id: 'status', header: translateAdmin(language, 'admin.invitation.col.status'), cell: (row) => <InvitationStatusBadge language={language} status={row.status} /> },
    {
      id: 'message',
      header: translateAdmin(language, 'admin.invitation.col.message'),
      priority: 3,
      cell: (row) => (
        <span className="inline-flex items-center gap-1">
          <AdminGlyph name={row.hasMessage ? 'check' : 'minus'} size={14} />
          {translateAdmin(language, row.hasMessage ? 'admin.invitation.message.yes' : 'admin.invitation.message.no')}
        </span>
      ),
    },
    { id: 'sent', header: translateAdmin(language, 'admin.invitation.col.sent'), cell: (row) => moment(row.createdAt) },
    { id: 'updated', header: translateAdmin(language, 'admin.invitation.col.updated'), priority: 3, cell: (row) => moment(row.updatedAt) },
  ];

  const total = list.query.data?.total;
  const senderId = list.state.ids.senderId;
  const named = list.query.data?.rows.find((row) => row.sender?.id === senderId)?.sender ?? null;

  return (
    <div className="grid gap-6" data-admin-invitations>
      <AdminPageHeader
        language={language}
        title={translateAdmin(language, 'admin.nav.invitations')}
        subtitle={translateAdmin(language, 'admin.invitation.subtitle')}
        crumbs={[{ label: translateAdmin(language, 'admin.group.people') }, { label: translateAdmin(language, 'admin.nav.invitations') }]}
      />
      <AdminOfflineNotice language={language} />
      <InvitationsOverview language={language} deps={deps} />
      {senderId === undefined ? null : (
        <AdminInlineNotice
          tone="info"
          text={
            named === null
              ? translateAdmin(language, 'admin.invitation.list.onSenderGeneric')
              : translateAdmin(language, 'admin.invitation.list.onSender', { name: personLabel(named, language) })
          }
          action={
            <button
              type="button"
              data-admin-list-reset
              onClick={list.reset}
              className="rounded-chip px-3 text-caption font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{ minHeight: 44, color: 'var(--color-ios-brand)', outlineColor: 'var(--color-ios-brand)' }}
            >
              {translateAdmin(language, 'admin.invitation.list.onSenderReset')}
            </button>
          }
        />
      )}
      <AdminEntityList
        language={language}
        section="invitations"
        list={list}
        columns={columns}
        rowKey={(row) => row.id}
        rowTarget={(row) => ({ kind: 'entity', entity: 'invitation', id: row.id })}
        caption={translateAdmin(language, 'admin.invitation.list.caption')}
        toolbar={
          <AdminListToolbar
            language={language}
            filters={filters}
            onReset={list.reset}
            {...(total === undefined ? {} : { trailing: translateAdmin(language, 'admin.invitation.list.count', { count: formatCount(total, language) }) })}
          />
        }
        empty={{ title: translateAdmin(language, 'admin.invitation.list.empty'), hint: translateAdmin(language, 'admin.invitation.list.emptyHint') }}
        filteredEmpty={{ title: translateAdmin(language, 'admin.invitation.list.filteredEmpty') }}
      />
    </div>
  );
}

export default function AdminInvitationsScreen() {
  const language = currentInterfaceLanguage();

  return (
    <AdminSectionScreen section="invitations" language={language} title={translateAdmin(language, 'admin.nav.invitations')}>
      {() => <AdminInvitationsPanel language={language} />}
    </AdminSectionScreen>
  );
}
