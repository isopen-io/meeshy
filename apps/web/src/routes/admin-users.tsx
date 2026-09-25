import { useQuery } from '@tanstack/react-query';

import { Avatar } from '@/components/avatar';
import { adminIdentityQueryOptions, adminUsersQueryKey, loadAdminUsers, type AdminUserRow } from '@/lib/api/admin';
import { apiDeps } from '@/lib/api/deps';
import { adminMoment } from '@/lib/admin/format';
import { toggleSort, withFilter, withPage, type ListState } from '@/lib/admin/list-state';
import { visibleAdminSections } from '@/lib/admin/sections';
import { useAdminListState } from '@/lib/admin/use-list-state';
import { ADMIN_ROLES, USER_LIST_SPEC } from '@/lib/admin/user-list';
import { translateAdmin } from '@/lib/i18n-admin-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { useRoute } from '@/lib/router';
import { initialsOf, participantAvatarOf } from '@/lib/view/conversation';
import { AdminDenied, AdminScreenFrame, AdminSkeleton } from '@/routes/admin-parts';
import {
  AdminFilterBar,
  AdminPager,
  AdminResetButton,
  AdminSearchField,
  AdminSelect,
  AdminTable,
  PlainTh,
  SortableTh,
  Td,
} from '@/routes/admin-table';
/** `Link` vient de la TABLE, pas du module générique : `to` n'accepte qu'une clé réelle. */
import { Link } from '@/routes/route-table';

/**
 * **LES COMPTES** (#6432, #7873) — la section d'administration la plus
 * consultée, en TABLEAU : tri par colonne, filtres par rôle, état,
 * vérification et double authentification, taille de page. Tout l'état vit
 * dans l'adresse (`list-state.ts`) : un lien partagé, un retour depuis une
 * fiche ou un rechargement rendent la liste telle qu'on l'a laissée.
 *
 * ## La garde est la MÊME que celle du hub
 *
 * `canManageUsers` est relue ici, pas héritée d'une navigation : on entre sur
 * cette adresse par un lien profond aussi bien que par le menu, et une garde
 * posée seulement à l'étage du dessus ne garde que l'escalier.
 */

const INK2 = 'var(--color-ios-ink-2)';

type UserListState = ListState<(typeof USER_LIST_SPEC.sortKeys)[number], keyof typeof USER_LIST_SPEC.filters>;

/**
 * LA LIGNE OUVRE LA FICHE (#6819) — `cible` vaut `admUser` ou `adminUser`
 * selon l'espace d'où l'on parcourt la liste (D-76). Le lien porte le nom,
 * cible tactile réelle, et non la rangée entière : une rangée cliquable n'est
 * ni un lien pour le lecteur d'écran, ni un élément qu'on atteint au clavier.
 */
function UserRow({
  compte,
  language,
  cible,
}: {
  readonly compte: AdminUserRow;
  readonly language: InterfaceLanguage;
  readonly cible: 'adminUser' | 'admUser';
}) {
  const photo = participantAvatarOf({ avatar: compte.avatar });
  return (
    <tr data-admin-user={compte.id}>
      <Td>
        <Link to={cible} params={{ user: compte.id }} className="flex min-w-0 items-center gap-3" style={{ minHeight: 44 }}>
          <span className="relative shrink-0">
            <Avatar
              initials={initialsOf(compte.displayName)}
              color="var(--color-ios-brand)"
              size={36}
              name={compte.displayName}
              {...(photo === undefined ? {} : { src: photo })}
            />
            {compte.isOnline ? (
              <span
                aria-hidden="true"
                className="absolute -right-0.5 -bottom-0.5 size-3 rounded-full"
                style={{ backgroundColor: '#34D399', border: '2px solid var(--color-ios-surface)' }}
              />
            ) : null}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-medium">{compte.displayName}</span>
            <span className="block truncate text-caption" style={{ color: INK2 }}>
              @{compte.username}
            </span>
          </span>
        </Link>
      </Td>
      <Td className="max-w-[16rem] truncate">{compte.email}</Td>
      <Td>
        <span
          className="rounded-chip px-2 py-0.5 text-caption"
          style={{ backgroundColor: 'color-mix(in srgb, var(--color-ios-ink-3) 14%, transparent)', color: INK2 }}
        >
          {compte.role}
        </span>
      </Td>
      <Td className="text-caption">
        {compte.isActive ? (
          <span style={{ color: 'var(--color-success, #34D399)' }}>{translateAdmin(language, 'admin.filter.active')}</span>
        ) : (
          <span style={{ color: 'var(--color-danger)' }}>{translateAdmin(language, 'admin.users.inactive')}</span>
        )}
        {compte.twoFactorEnabled ? <span className="ms-2" title={translateAdmin(language, 'admin.filter.twoFactor')}>🔐</span> : null}
      </Td>
      <Td className="whitespace-nowrap text-caption tabular-nums">{adminMoment(compte.createdAt, language)}</Td>
      <Td className="whitespace-nowrap text-caption tabular-nums">{adminMoment(compte.lastActiveAt, language)}</Td>
    </tr>
  );
}

function Filtres({
  language,
  state,
  write,
  draft,
  setDraft,
}: {
  readonly language: InterfaceLanguage;
  readonly state: UserListState;
  readonly write: (state: UserListState) => void;
  readonly draft: string;
  readonly setDraft: (value: string) => void;
}) {
  const tous = { value: '', label: translateAdmin(language, 'admin.list.all') };
  const ouiNon = [tous, { value: 'true', label: translateAdmin(language, 'admin.list.yes') }, { value: 'false', label: translateAdmin(language, 'admin.list.no') }];
  const filtre = (cle: keyof typeof USER_LIST_SPEC.filters) => (valeur: string) => write(withFilter(state, cle, valeur, USER_LIST_SPEC));
  const actif = Object.keys(state.filters).length > 0 || state.q !== '';

  return (
    <AdminFilterBar>
      <AdminSearchField label={translateAdmin(language, 'admin.users.search')} value={draft} onChange={setDraft} anchor="admin-users-search" />
      <AdminSelect
        label={translateAdmin(language, 'admin.col.role')}
        value={state.filters.role ?? ''}
        options={[tous, ...ADMIN_ROLES.map((role) => ({ value: role, label: role }))]}
        onChange={filtre('role')}
        anchor="admin-filter-role"
      />
      <AdminSelect
        label={translateAdmin(language, 'admin.col.status')}
        value={state.filters.isActive ?? ''}
        options={[
          tous,
          { value: 'true', label: translateAdmin(language, 'admin.filter.active') },
          { value: 'false', label: translateAdmin(language, 'admin.filter.inactive') },
        ]}
        onChange={filtre('isActive')}
        anchor="admin-filter-active"
      />
      <AdminSelect
        label={translateAdmin(language, 'admin.filter.emailVerified')}
        value={state.filters.emailVerified ?? ''}
        options={ouiNon}
        onChange={filtre('emailVerified')}
        anchor="admin-filter-email"
      />
      <AdminSelect
        label={translateAdmin(language, 'admin.filter.twoFactor')}
        value={state.filters.twoFactorEnabled ?? ''}
        options={ouiNon}
        onChange={filtre('twoFactorEnabled')}
        anchor="admin-filter-2fa"
      />
      {actif ? (
        <AdminResetButton
          language={language}
          onReset={() => {
            setDraft('');
            write({ ...state, filters: {}, q: '', offset: 0 });
          }}
        />
      ) : null}
    </AdminFilterBar>
  );
}

export default function AdminUsersScreen() {
  const language = currentInterfaceLanguage();
  const { state, write, draft, setDraft, address } = useAdminListState(USER_LIST_SPEC);

  const { key } = useRoute();
  /** On reste dans l'espace d'où l'on vient (D-76). */
  const cible = key === 'admUsers' ? ('admUser' as const) : ('adminUser' as const);

  const identite = useQuery(adminIdentityQueryOptions(apiDeps));
  const autorise = visibleAdminSections(identite.data?.permissions ?? null).some((s) => s.id === 'users');

  const liste = useQuery({
    queryKey: adminUsersQueryKey(address),
    queryFn: async ({ signal }) => {
      const resultat = await loadAdminUsers({
        ...apiDeps,
        offset: state.offset,
        limit: state.limit,
        search: state.q,
        sortBy: state.sort,
        sortOrder: state.order,
        filters: state.filters,
        signal,
      });
      if (!resultat.ok) throw new Error(resultat.error);
      return resultat.data;
    },
    enabled: autorise,
    placeholderData: (precedent) => precedent,
    retry: false,
  });

  const titre = translateAdmin(language, 'admin.nav.users');

  if (identite.isPending) {
    return (
      <AdminScreenFrame language={language} title={titre} back="admin">
        <AdminSkeleton rows={5} />
      </AdminScreenFrame>
    );
  }

  if (!autorise) {
    return (
      <AdminScreenFrame language={language} title={titre} back="admin">
        <AdminDenied language={language} />
      </AdminScreenFrame>
    );
  }

  const page = liste.data;
  const trier = (colonne: UserListState['sort']) => () => write(toggleSort(state, colonne, USER_LIST_SPEC));
  const entete = (colonne: UserListState['sort'], libelle: string) => (
    <SortableTh language={language} label={libelle} column={colonne} sort={state.sort} order={state.order} onSort={trier(colonne)} />
  );

  return (
    <AdminScreenFrame language={language} title={titre} back="admin">
      <Filtres language={language} state={state} write={write} draft={draft} setDraft={setDraft} />

      {liste.isPending ? (
        <AdminSkeleton rows={6} />
      ) : page === undefined ? (
        <p className="text-caption" style={{ color: INK2 }}>
          {translateAdmin(language, 'admin.users.unavailable')}
        </p>
      ) : page.users.length === 0 ? (
        <p className="text-caption" style={{ color: INK2 }}>
          {translateAdmin(language, 'admin.users.empty')}
        </p>
      ) : (
        <>
          <AdminTable>
            <thead>
              <tr>
                {entete('username', translateAdmin(language, 'admin.col.member'))}
                {entete('email', translateAdmin(language, 'admin.col.email'))}
                <PlainTh>{translateAdmin(language, 'admin.col.role')}</PlainTh>
                <PlainTh>{translateAdmin(language, 'admin.col.status')}</PlainTh>
                {entete('createdAt', translateAdmin(language, 'admin.col.created'))}
                {entete('lastActiveAt', translateAdmin(language, 'admin.col.lastActive'))}
              </tr>
            </thead>
            <tbody style={{ opacity: liste.isPlaceholderData ? 0.6 : 1 }}>
              {page.users.map((compte) => (
                <UserRow key={compte.id} compte={compte} language={language} cible={cible} />
              ))}
            </tbody>
          </AdminTable>
          <AdminPager
            language={language}
            offset={state.offset}
            limit={state.limit}
            count={page.users.length}
            total={page.total}
            hasMore={page.hasMore}
            pageSizes={USER_LIST_SPEC.pageSizes}
            onPage={(demande) => write(withPage(state, demande, USER_LIST_SPEC))}
          />
        </>
      )}
    </AdminScreenFrame>
  );
}
