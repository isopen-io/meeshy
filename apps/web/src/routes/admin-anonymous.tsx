import { AdminInterpretedBadge } from '@/components/admin/badges';
import { AdminEntityChip, AdminEntityIdentity } from '@/components/admin/entity-chip';
import { AdminEntityList, type AdminColumn } from '@/components/admin/entity-list';
import { AdminListToolbar, type AdminToolbarFilter } from '@/components/admin/list-toolbar';
import { AdminMomentText } from '@/components/admin/meta';
import { AdminPageHeader } from '@/components/admin/page-header';
import { AdminSectionScreen } from '@/components/admin/section-screen';
import { AdminOfflineNotice } from '@/components/admin/states';
import { ANONYMOUS_LIST_SPEC, type AnonymousFilterKey, type AnonymousSortKey } from '@/lib/admin/anonymous-list';
import { languageName, sentenceCase } from '@/lib/admin/interpret/language';
import { formatCount } from '@/lib/admin/interpret/numbers';
import { adminMomentOf } from '@/lib/admin/interpret/time';
import { useAdminList } from '@/lib/admin/use-admin-list';
import { useAdminReach } from '@/lib/admin/use-admin-reach';
import { anonymousConversationRefOf, anonymousEntityOf, anonymousPresenceOf, anonymousStateOf } from '@/lib/admin/user-anonymous';
import type { AdminDeps } from '@/lib/api/admin';
import { adminAnonymousQueryKey, loadAdminAnonymousListPage, type AdminAnonymousRow } from '@/lib/api/admin-anonymous';
import { apiDeps } from '@/lib/api/deps';
import { translateAdmin } from '@/lib/i18n-admin-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';

/**
 * **LES ANONYMES** (#7873, #8876) — les personnes entrées par un lien de partage,
 * sans compte : qui (un NOM, jamais « — »), dans quelle conversation (une puce
 * nommée qui mène à sa fiche), dans quelle langue (NOMMÉE), depuis quand, combien
 * de messages, et si elle est là maintenant.
 *
 * Même tableau que les comptes — même geste pour trier, même place pour
 * filtrer — et la ligne ouvre la fiche. La présence est CALCULÉE par la règle
 * partagée (1/3/5 minutes) et peinte par l'avatar : aucune couleur écrite ici. Un
 * lecteur sans rang d'administration reçoit la présence masquée — elle se dit
 * « Non communiquée », et le tri par activité (que la passerelle ignorerait en
 * silence) n'est pas offert.
 *
 * Le seuil est celui des comptes (`canManageUsers`, section `anonymous`).
 */

const SORT_LABELS = {
  joinedAt: 'admin.col.joined',
  lastActiveAt: 'admin.col.lastActive',
  displayName: 'admin.col.name',
} as const satisfies Readonly<Record<AnonymousSortKey, 'admin.col.joined' | 'admin.col.lastActive' | 'admin.col.name'>>;

export function AdminAnonymousPanel({
  language,
  deps = apiDeps,
  now = () => new Date(),
}: {
  readonly language: InterfaceLanguage;
  readonly deps?: AdminDeps;
  readonly now?: () => Date;
}) {
  const reach = useAdminReach();
  const list = useAdminList<AdminAnonymousRow, AnonymousSortKey, AnonymousFilterKey>({
    spec: ANONYMOUS_LIST_SPEC,
    queryKey: adminAnonymousQueryKey,
    enabled: reach.opens('anonymous'),
    load: (state, signal) =>
      loadAdminAnonymousListPage({
        ...deps,
        offset: state.offset,
        limit: state.limit,
        search: state.q,
        sortBy: state.sort,
        sortOrder: state.order,
        filters: state.filters,
        signal,
      }),
  });

  const { state } = list;
  const moment = now();
  const all = { value: '', label: translateAdmin(language, 'admin.list.all') };

  const filters: readonly AdminToolbarFilter[] = [
    {
      id: 'status',
      label: translateAdmin(language, 'admin.col.status'),
      value: state.filters.status ?? '',
      options: [
        all,
        { value: 'active', label: translateAdmin(language, 'admin.filter.active') },
        { value: 'inactive', label: translateAdmin(language, 'admin.filter.inactive') },
      ],
      onChange: (value) => list.filter('status', value === '' ? null : value),
    },
    {
      /* Le tri des CARTES (< md), où il n'y a pas d'en-tête à cliquer. La présence ne se trie que pour qui la reçoit. */
      id: 'sort',
      label: translateAdmin(language, 'admin.people.sort.label'),
      value: state.sort,
      options: ANONYMOUS_LIST_SPEC.sortKeys
        .filter((key) => key !== 'lastActiveAt' || reach.hasAdminRank)
        .map((key) => ({ value: key, label: translateAdmin(language, SORT_LABELS[key]) })),
      onChange: (value) => {
        const key = ANONYMOUS_LIST_SPEC.sortKeys.find((candidate) => candidate === value);
        if (key !== undefined && key !== state.sort) list.sort(key);
      },
    },
  ];

  const total = list.query.data?.total;
  const hidden = anonymousPresenceOf({ isOnline: false, lastActiveAt: null }, moment, language);

  const columns: readonly AdminColumn<AdminAnonymousRow>[] = [
    {
      id: 'name',
      header: translateAdmin(language, 'admin.col.name'),
      primary: true,
      sortKey: 'displayName',
      cell: (row) => <AdminEntityIdentity language={language} entity={anonymousEntityOf(row, language, moment)} />,
    },
    {
      id: 'conversation',
      header: translateAdmin(language, 'admin.col.conversation'),
      cell: (row) =>
        row.conversation === null ? (
          '—'
        ) : (
          <AdminEntityChip language={language} size="sm" entity={anonymousConversationRefOf(row.conversation, language)} />
        ),
    },
    {
      id: 'language',
      header: translateAdmin(language, 'admin.col.language'),
      cell: (row) => sentenceCase(languageName(row.language === '' ? null : row.language, language), language),
    },
    {
      id: 'messages',
      header: translateAdmin(language, 'admin.col.messages'),
      align: 'end',
      cell: (row) => formatCount(row.messageCount, language),
    },
    {
      id: 'state',
      header: translateAdmin(language, 'admin.col.status'),
      cell: (row) => <AdminInterpretedBadge value={anonymousStateOf(row, language)} />,
    },
    {
      id: 'presence',
      header: translateAdmin(language, 'admin.people.anonymous.presence'),
      priority: 3,
      cell: (row) => {
        const presence = anonymousPresenceOf(row, moment, language);
        return <span title={presence.explain ?? undefined}>{presence.label}</span>;
      },
    },
    {
      id: 'joined',
      header: translateAdmin(language, 'admin.col.joined'),
      sortKey: 'joinedAt',
      cell: (row) => <AdminMomentText moment={adminMomentOf(row.joinedAt, moment, language)} />,
    },
    {
      id: 'lastActive',
      header: translateAdmin(language, 'admin.col.lastActive'),
      priority: 3,
      ...(reach.hasAdminRank ? { sortKey: 'lastActiveAt' } : {}),
      cell: (row) =>
        row.lastActiveAt === null ? (
          <span title={hidden.explain ?? undefined}>{hidden.label}</span>
        ) : (
          <AdminMomentText moment={adminMomentOf(row.lastActiveAt, moment, language)} />
        ),
    },
  ];

  return (
    <div className="grid gap-4" data-admin-anonymous-panel>
      <AdminOfflineNotice language={language} />
      <AdminEntityList
        language={language}
        section="anonymous"
        list={list}
        columns={columns}
        rowKey={(row) => row.id}
        rowTarget={(row) => ({ kind: 'entity', entity: 'anonymous', id: row.id })}
        caption={translateAdmin(language, 'admin.people.anonymous.list.caption')}
        toolbar={
          <AdminListToolbar
            language={language}
            search={{ label: translateAdmin(language, 'admin.anonymous.search'), value: list.draft, onChange: list.setDraft }}
            filters={filters}
            onReset={list.reset}
            trailing={total === undefined ? undefined : translateAdmin(language, 'admin.people.anonymous.count', { count: formatCount(total, language) })}
          />
        }
        empty={{ title: translateAdmin(language, 'admin.people.anonymous.list.empty') }}
        filteredEmpty={{ title: translateAdmin(language, 'admin.people.anonymous.list.emptyFiltered') }}
      />
    </div>
  );
}

export default function AdminAnonymousScreen() {
  const language = currentInterfaceLanguage();
  const title = translateAdmin(language, 'admin.nav.anonymous');

  return (
    <AdminSectionScreen section="anonymous" language={language} title={title}>
      {() => (
        <div className="grid gap-6">
          <AdminPageHeader
            language={language}
            title={title}
            subtitle={translateAdmin(language, 'admin.nav.anonymous.hint')}
            crumbs={[{ label: translateAdmin(language, 'admin.group.people') }, { label: title }]}
          />
          <AdminAnonymousPanel language={language} />
        </div>
      )}
    </AdminSectionScreen>
  );
}
