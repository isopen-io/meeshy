import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { AdminBadge, AdminInterpretedBadge, AdminRoleBadge } from '@/components/admin/badges';
import { AdminEntityIdentity } from '@/components/admin/entity-chip';
import { AdminEntityList, type AdminColumn } from '@/components/admin/entity-list';
import { AdminListToolbar, type AdminToolbarFilter } from '@/components/admin/list-toolbar';
import { AdminMomentText } from '@/components/admin/meta';
import { AdminPageHeader } from '@/components/admin/page-header';
import { AdminSectionScreen } from '@/components/admin/section-screen';
import { AdminOfflineNotice } from '@/components/admin/states';
import { accountStateOf, interpretPresence, interpretRole } from '@/lib/admin/interpret/enums';
import { formatCount } from '@/lib/admin/interpret/numbers';
import { adminMomentOf } from '@/lib/admin/interpret/time';
import { useAdminList } from '@/lib/admin/use-admin-list';
import { useAdminReach } from '@/lib/admin/use-admin-reach';
import { userEntityOf } from '@/lib/admin/user-entity';
import { ADMIN_ROLES, USER_LIST_SPEC, userListFiltersOf, type UserFilterKey, type UserSortKey } from '@/lib/admin/user-list';
import type { AdminDeps } from '@/lib/api/admin';
import { adminUserDetailQueryKey } from '@/lib/api/admin-user-detail';
import { adminUsersQueryKey, loadAdminUsersPage, type AdminUserRow } from '@/lib/api/admin-users';
import { apiDeps } from '@/lib/api/deps';
import { translateAdmin } from '@/lib/i18n-admin-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { useRoute } from '@/lib/router';
import { useLiveAnnouncer } from '@/lib/view/use-live-announcer';

import { SectionButton } from './admin-member-parts';
import { AdminAnnouncement } from './admin-parts';
import { AdminUserCreateSheet } from './admin-user-create-sheet';
import { href, navigate } from './route-table';

/**
 * **LES COMPTES** (#6432, #7873, #8876) — la section d'administration la plus
 * consultée, sur le kit : un membre se reconnaît à son VRAI nom, son `@pseudo`,
 * sa photo et sa pastille de présence (calculée par la règle partagée, jamais
 * peinte en dur) ; son rôle et son état se disent en mots ; sa sécurité
 * aussi (e-mail vérifié, téléphone vérifié, double authentification).
 *
 * Tout l'état vit dans l'adresse (`list-state.ts`) : un lien partagé, un retour
 * depuis une fiche ou un rechargement rendent la liste telle qu'on l'a laissée.
 *
 * ## `staleTime` de 5 minutes, et pourquoi
 *
 * Chaque lecture de cette liste écrit une trace d'audit (`VIEW_USER_LIST`) côté
 * passerelle : la relire à chaque retour depuis une fiche remplirait le journal
 * de lectures identiques. Le cache en mémoire fait le travail.
 */

const USERS_STALE_MS = 5 * 60_000;

const SECURITY_LABELS = {
  emailVerified: 'admin.people.security.emailVerified',
  emailUnverified: 'admin.people.security.emailUnverified',
  phoneVerified: 'admin.people.security.phoneVerified',
  twoFactor: 'admin.people.security.twoFactor',
} as const;

/** La sécurité d'un compte DITE EN MOTS — jamais une icône seule, jamais la couleur seule. */
function SecurityWords({ row, language }: { readonly row: AdminUserRow; readonly language: InterfaceLanguage }) {
  return (
    <span data-admin-security-words className="flex flex-wrap justify-end gap-1 md:justify-start">
      {row.emailVerified ? (
        <AdminBadge tone="success" glyph="checkCircle">
          {translateAdmin(language, SECURITY_LABELS.emailVerified)}
        </AdminBadge>
      ) : (
        <AdminBadge tone="neutral">{translateAdmin(language, SECURITY_LABELS.emailUnverified)}</AdminBadge>
      )}
      {row.phoneVerified ? (
        <AdminBadge tone="success" glyph="checkCircle">
          {translateAdmin(language, SECURITY_LABELS.phoneVerified)}
        </AdminBadge>
      ) : null}
      {row.twoFactorEnabled ? (
        <AdminBadge tone="info" glyph="shieldCheck">
          {translateAdmin(language, SECURITY_LABELS.twoFactor)}
        </AdminBadge>
      ) : null}
    </span>
  );
}

const SORT_LABELS = {
  createdAt: 'admin.people.sort.createdAt',
  lastActiveAt: 'admin.people.sort.lastActiveAt',
  username: 'admin.people.sort.username',
  email: 'admin.people.sort.email',
  firstName: 'admin.people.sort.firstName',
  lastName: 'admin.people.sort.lastName',
} as const satisfies Readonly<Record<UserSortKey, string>>;

/**
 * LE PANNEAU DES COMPTES — la liste, sa barre et ses états. Exporté avec ses
 * dépendances injectables (`deps`) et son horloge (`now`) : les témoins le montent
 * sans passerelle et sans dépendre de l'heure réelle.
 */
export function AdminUsersPanel({
  language,
  deps = apiDeps,
  now = () => new Date(),
}: {
  readonly language: InterfaceLanguage;
  readonly deps?: AdminDeps;
  readonly now?: () => Date;
}) {
  const reach = useAdminReach();
  const list = useAdminList<AdminUserRow, UserSortKey, UserFilterKey>({
    spec: USER_LIST_SPEC,
    queryKey: adminUsersQueryKey,
    enabled: reach.opens('users'),
    staleTime: USERS_STALE_MS,
    load: (state, signal) =>
      loadAdminUsersPage({
        ...deps,
        offset: state.offset,
        limit: state.limit,
        search: state.q,
        sortBy: state.sort,
        sortOrder: state.order,
        filters: userListFiltersOf(state.filters, now()),
        signal,
      }),
  });

  const { state } = list;
  const moment = now();
  const all = { value: '', label: translateAdmin(language, 'admin.list.all') };
  const yesNo = [
    all,
    { value: 'true', label: translateAdmin(language, 'admin.list.yes') },
    { value: 'false', label: translateAdmin(language, 'admin.list.no') },
  ];
  const filterOf = (key: UserFilterKey) => (value: string) => list.filter(key, value === '' ? null : value);

  const filters: readonly AdminToolbarFilter[] = [
    {
      id: 'role',
      label: translateAdmin(language, 'admin.col.role'),
      value: state.filters.role ?? '',
      options: [all, ...ADMIN_ROLES.map((role) => ({ value: role, label: interpretRole(role, language).label }))],
      onChange: filterOf('role'),
    },
    {
      id: 'isActive',
      label: translateAdmin(language, 'admin.col.status'),
      value: state.filters.isActive ?? '',
      options: [
        all,
        { value: 'true', label: translateAdmin(language, 'admin.filter.active') },
        { value: 'false', label: translateAdmin(language, 'admin.filter.inactive') },
      ],
      onChange: filterOf('isActive'),
    },
    { id: 'emailVerified', label: translateAdmin(language, 'admin.filter.emailVerified'), value: state.filters.emailVerified ?? '', options: yesNo, onChange: filterOf('emailVerified') },
    { id: 'phoneVerified', label: translateAdmin(language, 'admin.people.filter.phoneVerified'), value: state.filters.phoneVerified ?? '', options: yesNo, onChange: filterOf('phoneVerified') },
    { id: 'twoFactorEnabled', label: translateAdmin(language, 'admin.filter.twoFactor'), value: state.filters.twoFactorEnabled ?? '', options: yesNo, onChange: filterOf('twoFactorEnabled') },
    {
      id: 'period',
      label: translateAdmin(language, 'admin.people.filter.period'),
      value: state.filters.period ?? '',
      options: [
        all,
        { value: '24h', label: translateAdmin(language, 'admin.kit.period.24h') },
        { value: '7d', label: translateAdmin(language, 'admin.kit.period.7d') },
        { value: '30d', label: translateAdmin(language, 'admin.kit.period.30d') },
        { value: '90d', label: translateAdmin(language, 'admin.kit.period.90d') },
      ],
      onChange: filterOf('period'),
    },
    {
      /* Le tri des CARTES (< md), où il n'y a pas d'en-tête à cliquer — et le seul chemin vers
         « Prénom » et « Nom », que la passerelle trie mais qu'aucune colonne ne porte. */
      id: 'sort',
      label: translateAdmin(language, 'admin.people.sort.label'),
      value: state.sort,
      options: USER_LIST_SPEC.sortKeys
        .filter((key) => key !== 'lastActiveAt' || reach.hasAdminRank)
        .map((key) => ({ value: key, label: translateAdmin(language, SORT_LABELS[key]) })),
      onChange: (value) => {
        const key = USER_LIST_SPEC.sortKeys.find((candidate) => candidate === value);
        if (key !== undefined && key !== state.sort) list.sort(key);
      },
    },
  ];

  const total = list.query.data?.total;
  const hidden = interpretPresence('unknown', language);

  const columns: readonly AdminColumn<AdminUserRow>[] = [
    {
      id: 'member',
      header: translateAdmin(language, 'admin.col.member'),
      primary: true,
      sortKey: 'username',
      cell: (row) => <AdminEntityIdentity language={language} entity={userEntityOf(row, language, moment)} />,
    },
    {
      id: 'email',
      header: translateAdmin(language, 'admin.col.email'),
      sortKey: 'email',
      cell: (row) => (row.email === '' ? '—' : <span className="break-all">{row.email}</span>),
    },
    {
      id: 'role',
      header: translateAdmin(language, 'admin.col.role'),
      cell: (row) => <AdminRoleBadge language={language} role={row.role} />,
    },
    {
      id: 'state',
      header: translateAdmin(language, 'admin.col.status'),
      cell: (row) => <AdminInterpretedBadge value={accountStateOf(row, moment, language)} />,
    },
    {
      id: 'security',
      header: translateAdmin(language, 'admin.people.col.security'),
      cell: (row) => <SecurityWords row={row} language={language} />,
    },
    {
      id: 'created',
      header: translateAdmin(language, 'admin.col.created'),
      sortKey: 'createdAt',
      cell: (row) => <AdminMomentText moment={adminMomentOf(row.createdAt, moment, language)} />,
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
    <div className="grid gap-4" data-admin-users-panel>
      <AdminOfflineNotice language={language} />
      <AdminEntityList
        language={language}
        section="users"
        list={list}
        columns={columns}
        rowKey={(row) => row.id}
        rowTarget={(row) => ({ kind: 'entity', entity: 'user', id: row.id })}
        caption={translateAdmin(language, 'admin.people.list.caption')}
        toolbar={
          <AdminListToolbar
            language={language}
            search={{ label: translateAdmin(language, 'admin.users.search'), value: list.draft, onChange: list.setDraft }}
            filters={filters}
            onReset={list.reset}
            trailing={total === undefined ? undefined : translateAdmin(language, 'admin.users.count', { count: formatCount(total, language) })}
          />
        }
        empty={{ title: translateAdmin(language, 'admin.people.list.empty') }}
        filteredEmpty={{ title: translateAdmin(language, 'admin.people.list.emptyFiltered') }}
      />
    </div>
  );
}

export default function AdminUsersScreen() {
  const language = currentInterfaceLanguage();
  const { key } = useRoute();
  /** On reste dans l'espace d'où l'on vient (D-76). */
  const cible = key === 'admUsers' ? ('admUser' as const) : ('adminUser' as const);
  const [creation, setCreation] = useState(false);
  const announcer = useLiveAnnouncer();
  const client = useQueryClient();
  const title = translateAdmin(language, 'admin.nav.users');

  return (
    <AdminSectionScreen section="users" language={language} title={title}>
      {() => (
        <div className="grid gap-6">
          <AdminPageHeader
            language={language}
            title={title}
            subtitle={translateAdmin(language, 'admin.nav.users.hint')}
            crumbs={[{ label: translateAdmin(language, 'admin.group.people') }, { label: title }]}
            actions={
              /* CRÉER UN COMPTE (#8217) — en haut à droite de l'en-tête (#8289) ; le compte créé
                 s'ouvre aussitôt dans sa fiche. */
              <SectionButton tone="primary" data={{ 'data-admin-create-open': '' }} onClick={() => setCreation(true)}>
                {translateAdmin(language, 'admin.create.open')}
              </SectionButton>
            }
          />
          <AdminUsersPanel language={language} />
          {creation ? (
            <AdminUserCreateSheet
              language={language}
              onClose={() => setCreation(false)}
              onAnnounce={announcer.announce}
              onCreated={(membre) => {
                setCreation(false);
                client.setQueryData(adminUserDetailQueryKey(membre.id), membre);
                void client.invalidateQueries({ queryKey: ['admin', 'users'] });
                navigate(href(cible, { user: membre.id }));
              }}
            />
          ) : null}
          <AdminAnnouncement text={announcer.text} />
        </div>
      )}
    </AdminSectionScreen>
  );
}
