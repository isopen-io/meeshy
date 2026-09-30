import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { AdminGlyph } from '@/components/admin/admin-glyph';
import { AdminInterpretedBadge } from '@/components/admin/badges';
import { AdminEntityIdentity } from '@/components/admin/entity-chip';
import { AdminEntityList, type AdminColumn } from '@/components/admin/entity-list';
import { AdminListToolbar } from '@/components/admin/list-toolbar';
import { AdminMomentText } from '@/components/admin/meta';
import { AdminPageHeader } from '@/components/admin/page-header';
import { AdminSectionScreen } from '@/components/admin/section-screen';
import { AdminOfflineNotice } from '@/components/admin/states';
import { BRAND } from '@/components/admin/tone';
import { defaultSourceLanguage, newBroadcastForm } from '@/lib/admin/broadcast-form';
import { broadcastLabel } from '@/lib/admin/broadcast-labels';
import { BROADCAST_LIST_SPEC, BROADCAST_STATUSES, broadcastListQuery, type BroadcastFilterKey, type BroadcastSortKey } from '@/lib/admin/broadcast-list';
import { interpretBroadcastStatus } from '@/lib/admin/interpret/enums';
import { formatCount } from '@/lib/admin/interpret/numbers';
import { adminMomentOf } from '@/lib/admin/interpret/time';
import { useAdminAction } from '@/lib/admin/use-admin-action';
import { useAdminList } from '@/lib/admin/use-admin-list';
import { useAdminReach } from '@/lib/admin/use-admin-reach';
import type { AdminDeps } from '@/lib/api/admin';
import {
  ADMIN_BROADCASTS_LISTS_KEY,
  adminBroadcastsListKey,
  createAdminBroadcast,
  loadAdminBroadcasts,
  type AdminBroadcastBody,
  type AdminBroadcastRow,
} from '@/lib/api/admin-broadcasts';
import { apiDeps } from '@/lib/api/deps';
import { translateAdmin } from '@/lib/i18n-admin-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { useOnline } from '@/lib/net/online';
import { useLiveAnnouncer } from '@/lib/view/use-live-announcer';
import type { AdminOption } from '@/routes/admin-table';
import { AdminAnnouncement } from '@/routes/admin-parts';
import { href, navigate } from '@/routes/route-table';

import { BroadcastComposerSheet } from './admin-broadcast-compose';

/**
 * **LES DIFFUSIONS** (#8876, #6731) — les messages que l'administration écrit à
 * tous les comptes, ou à une partie d'entre eux : par e-mail, dans l'application,
 * ou les deux. La liste dit où en est chacun (statut, destinataires, envoyés,
 * échecs, publication dans l'application) ; « Nouvelle diffusion » ouvre la
 * feuille de composition ; chaque rangée ouvre sa fiche.
 *
 * Le seuil de la section est celui de ses routes, `canManageNotifications` :
 * sans lui, ni tuile ni écran (`AdminSectionScreen`). La liste ne propose que ce
 * que la passerelle sert — un filtre de statut, une recherche sur le nom et
 * l'objet, une pagination ; **aucun tri**, la route range par création.
 */
const defaultNow = (): Date => new Date();

const STARTED = ['SENDING', 'SENT', 'FAILED'];

type BroadcastsPanelProps = {
  readonly language: InterfaceLanguage;
  readonly deps?: AdminDeps;
  readonly now?: () => Date;
};

export function AdminBroadcastsPanel({ language, deps = apiDeps, now = defaultNow }: BroadcastsPanelProps) {
  const reach = useAdminReach();
  const online = useOnline();
  const announcer = useLiveAnnouncer();
  const queryClient = useQueryClient();
  const [composing, setComposing] = useState(false);
  const action = useAdminAction<{ readonly id: string }>({ language, onAnnounce: announcer.announce });
  const blank = useMemo(() => newBroadcastForm(defaultSourceLanguage(language)), [language]);

  const list = useAdminList<AdminBroadcastRow, BroadcastSortKey, BroadcastFilterKey>({
    spec: BROADCAST_LIST_SPEC,
    queryKey: adminBroadcastsListKey,
    enabled: true,
    staleTime: 30_000,
    load: async (state, signal) => loadAdminBroadcasts({ ...deps, query: broadcastListQuery(state), signal }),
  });

  const compose = () => {
    action.reset();
    setComposing(true);
  };

  const create = async (body: AdminBroadcastBody) => {
    const created = await action.run({ call: () => createAdminBroadcast({ ...deps, body }), success: 'admin.broadcast.done.created' });
    if (created === null) return;
    void queryClient.invalidateQueries({ queryKey: ADMIN_BROADCASTS_LISTS_KEY });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'dash'] });
    setComposing(false);
    navigate(href(reach.space === 'adm' ? 'admBroadcast' : 'adminBroadcast', { broadcast: created.id }));
  };

  const all = translateAdmin(language, 'admin.list.all');
  const statusOptions: readonly AdminOption[] = [
    { value: '', label: all },
    ...BROADCAST_STATUSES.map((status) => ({ value: status, label: interpretBroadcastStatus(status, language).label })),
  ];

  const moment = (iso: string | null) => <AdminMomentText moment={adminMomentOf(iso, now(), language)} />;
  const counted = (row: AdminBroadcastRow, value: number) => (STARTED.includes(row.status) ? formatCount(value, language) : '—');

  const columns: readonly AdminColumn<AdminBroadcastRow>[] = [
    {
      id: 'name',
      header: translateAdmin(language, 'admin.broadcast.col.name'),
      primary: true,
      cell: (row) => <AdminEntityIdentity language={language} entity={{ kind: 'broadcast', id: row.id, label: broadcastLabel(row, language) }} />,
    },
    {
      id: 'subject',
      header: translateAdmin(language, 'admin.broadcast.col.subject'),
      cell: (row) => <span className="block max-w-[22rem] truncate">{row.subject}</span>,
    },
    {
      id: 'status',
      header: translateAdmin(language, 'admin.broadcast.col.status'),
      cell: (row) => <AdminInterpretedBadge value={interpretBroadcastStatus(row.status, language)} />,
    },
    {
      id: 'recipients',
      header: translateAdmin(language, 'admin.broadcast.col.recipients'),
      align: 'end',
      cell: (row) => (row.status === 'DRAFT' ? '—' : formatCount(row.totalRecipients, language)),
    },
    { id: 'sent', header: translateAdmin(language, 'admin.broadcast.col.sent'), align: 'end', cell: (row) => counted(row, row.sentCount) },
    { id: 'failed', header: translateAdmin(language, 'admin.broadcast.col.failed'), align: 'end', cell: (row) => counted(row, row.failedCount) },
    {
      id: 'inApp',
      header: translateAdmin(language, 'admin.broadcast.col.inApp'),
      align: 'end',
      cell: (row) => (row.inAppSentAt === null ? translateAdmin(language, 'admin.broadcast.inApp.never') : formatCount(row.inAppSentCount, language)),
    },
    { id: 'created', header: translateAdmin(language, 'admin.broadcast.col.created'), priority: 3, cell: (row) => moment(row.createdAt) },
    {
      id: 'sentAt',
      header: translateAdmin(language, 'admin.broadcast.col.sentAt'),
      priority: 3,
      cell: (row) => (row.sentAt === null ? translateAdmin(language, 'admin.broadcast.notYet') : moment(row.sentAt)),
    },
  ];

  const total = list.query.data?.total;
  const count =
    total === undefined ? undefined : total === 1 ? translateAdmin(language, 'admin.broadcast.list.countOne') : translateAdmin(language, 'admin.broadcast.list.count', { count: formatCount(total, language) });

  return (
    <div className="grid gap-6" data-admin-broadcasts>
      <AdminPageHeader
        language={language}
        title={translateAdmin(language, 'admin.nav.broadcasts')}
        subtitle={translateAdmin(language, 'admin.broadcast.list.subtitle')}
        crumbs={[{ label: translateAdmin(language, 'admin.group.growth') }, { label: translateAdmin(language, 'admin.nav.broadcasts') }]}
        actions={
          <button
            type="button"
            data-admin-action="new"
            disabled={!online}
            onClick={compose}
            className="inline-flex items-center gap-2 rounded-chip px-5 text-body font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-40"
            style={{ minHeight: 44, backgroundColor: BRAND, outlineColor: BRAND }}
          >
            <AdminGlyph name="plus" size={16} />
            {translateAdmin(language, 'admin.broadcast.new')}
          </button>
        }
      />
      <AdminOfflineNotice language={language} />
      <AdminEntityList
        language={language}
        section="broadcasts"
        list={list}
        columns={columns}
        rowKey={(row) => row.id}
        rowTarget={(row) => ({ kind: 'entity', entity: 'broadcast', id: row.id })}
        caption={translateAdmin(language, 'admin.broadcast.list.caption')}
        toolbar={
          <AdminListToolbar
            language={language}
            search={{ label: translateAdmin(language, 'admin.broadcast.list.search'), value: list.draft, onChange: list.setDraft }}
            filters={[
              {
                id: 'status',
                label: translateAdmin(language, 'admin.broadcast.filter.status'),
                value: list.state.filters.status ?? '',
                options: statusOptions,
                onChange: (value) => list.filter('status', value === '' ? null : value),
              },
            ]}
            onReset={list.reset}
            {...(count === undefined ? {} : { trailing: count })}
          />
        }
        empty={{ title: translateAdmin(language, 'admin.broadcast.list.empty'), hint: translateAdmin(language, 'admin.broadcast.list.emptyHint') }}
        filteredEmpty={{ title: translateAdmin(language, 'admin.broadcast.list.filteredEmpty') }}
      />
      {composing ? (
        <BroadcastComposerSheet
          language={language}
          mode="create"
          initial={blank}
          busy={action.state.phase === 'running'}
          error={action.state.phase === 'error' ? action.state.message : null}
          onSubmit={(body) => void create(body)}
          onCancel={() => setComposing(false)}
        />
      ) : null}
      <AdminAnnouncement text={announcer.text} />
    </div>
  );
}

export default function AdminBroadcastsScreen() {
  const language = currentInterfaceLanguage();

  return (
    <AdminSectionScreen section="broadcasts" language={language} title={translateAdmin(language, 'admin.nav.broadcasts')}>
      {() => <AdminBroadcastsPanel language={language} />}
    </AdminSectionScreen>
  );
}
