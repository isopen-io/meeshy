import { useQuery } from '@tanstack/react-query';

import { Avatar } from '@/components/avatar';
import { adminIdentityQueryOptions } from '@/lib/api/admin';
import { adminAnonymousQueryKey, loadAdminAnonymous, type AdminAnonymousRow } from '@/lib/api/admin-anonymous';
import { apiDeps } from '@/lib/api/deps';
import { ANONYMOUS_LIST_SPEC } from '@/lib/admin/anonymous-list';
import { adminMoment } from '@/lib/admin/format';
import { toggleSort, withFilter, withPage, type ListState } from '@/lib/admin/list-state';
import { visibleAdminSections } from '@/lib/admin/sections';
import { useAdminListState } from '@/lib/admin/use-list-state';
import { translateAdmin } from '@/lib/i18n-admin-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { useRoute } from '@/lib/router';
import { initialsOf } from '@/lib/view/conversation';
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
import { Link } from '@/routes/route-table';

/**
 * **LES ANONYMES** (#7873) — les personnes entrées par un lien de partage,
 * sans compte : qui, dans quelle conversation, depuis quand, combien de
 * messages. Même tableau que les comptes — même geste pour trier, même place
 * pour filtrer — et la ligne ouvre la fiche.
 *
 * Le seuil est celui des comptes (`canManageUsers`, section `anonymous`) :
 * ce sont des personnes, et la fiche mène à la conversation qu'elles ont
 * rejointe.
 */

const INK2 = 'var(--color-ios-ink-2)';

type AnonymousListState = ListState<(typeof ANONYMOUS_LIST_SPEC.sortKeys)[number], keyof typeof ANONYMOUS_LIST_SPEC.filters>;

function AnonymousRow({
  ligne,
  language,
  cible,
}: {
  readonly ligne: AdminAnonymousRow;
  readonly language: InterfaceLanguage;
  readonly cible: 'adminAnonymousOne' | 'admAnonymousOne';
}) {
  return (
    <tr data-admin-anonymous={ligne.id}>
      <Td>
        <Link to={cible} params={{ participant: ligne.id }} className="flex min-w-0 items-center gap-3" style={{ minHeight: 44 }}>
          <span className="relative shrink-0">
            <Avatar
              initials={initialsOf(ligne.displayName)}
              color="var(--color-ios-ink-3)"
              size={36}
              name={ligne.displayName}
              {...(ligne.avatar === '' ? {} : { src: ligne.avatar })}
            />
            {ligne.isOnline ? (
              <span
                aria-hidden="true"
                className="absolute -right-0.5 -bottom-0.5 size-3 rounded-full"
                style={{ backgroundColor: '#34D399', border: '2px solid var(--color-ios-surface)' }}
              />
            ) : null}
          </span>
          <span className="min-w-0 truncate font-medium">{ligne.displayName}</span>
        </Link>
      </Td>
      <Td className="max-w-[16rem] truncate">{ligne.conversation?.title || ligne.conversation?.identifier || '—'}</Td>
      <Td className="text-caption uppercase">{ligne.language || '—'}</Td>
      <Td className="text-caption tabular-nums">{ligne.messageCount}</Td>
      <Td className="text-caption">
        {ligne.leftAt !== null ? (
          <span style={{ color: INK2 }}>{translateAdmin(language, 'admin.anonymous.left')}</span>
        ) : ligne.isActive ? (
          <span style={{ color: 'var(--color-success, #34D399)' }}>{translateAdmin(language, 'admin.filter.active')}</span>
        ) : (
          <span style={{ color: 'var(--color-danger)' }}>{translateAdmin(language, 'admin.users.inactive')}</span>
        )}
      </Td>
      <Td className="whitespace-nowrap text-caption tabular-nums">{adminMoment(ligne.joinedAt, language)}</Td>
      <Td className="whitespace-nowrap text-caption tabular-nums">{adminMoment(ligne.lastActiveAt, language)}</Td>
    </tr>
  );
}

export default function AdminAnonymousScreen() {
  const language = currentInterfaceLanguage();
  const { state, write, draft, setDraft, address } = useAdminListState(ANONYMOUS_LIST_SPEC);
  const { key } = useRoute();
  const cible = key === 'admAnonymous' ? ('admAnonymousOne' as const) : ('adminAnonymousOne' as const);

  const identite = useQuery(adminIdentityQueryOptions(apiDeps));
  const autorise = visibleAdminSections(identite.data?.permissions ?? null).some((s) => s.id === 'anonymous');

  const liste = useQuery({
    queryKey: adminAnonymousQueryKey(address),
    queryFn: async ({ signal }) => {
      const resultat = await loadAdminAnonymous({
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

  const titre = translateAdmin(language, 'admin.nav.anonymous');

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
  const entete = (colonne: AnonymousListState['sort'], libelle: string) => (
    <SortableTh
      language={language}
      label={libelle}
      column={colonne}
      sort={state.sort}
      order={state.order}
      onSort={() => write(toggleSort(state, colonne, ANONYMOUS_LIST_SPEC))}
    />
  );
  const tous = { value: '', label: translateAdmin(language, 'admin.list.all') };

  return (
    <AdminScreenFrame language={language} title={titre} back="admin">
      <AdminFilterBar>
        <AdminSearchField label={translateAdmin(language, 'admin.anonymous.search')} value={draft} onChange={setDraft} anchor="admin-anonymous-search" />
        <AdminSelect
          label={translateAdmin(language, 'admin.col.status')}
          value={state.filters.status ?? ''}
          options={[
            tous,
            { value: 'active', label: translateAdmin(language, 'admin.filter.active') },
            { value: 'inactive', label: translateAdmin(language, 'admin.filter.inactive') },
          ]}
          onChange={(valeur) => write(withFilter(state, 'status', valeur, ANONYMOUS_LIST_SPEC))}
          anchor="admin-filter-status"
        />
        {Object.keys(state.filters).length > 0 || state.q !== '' ? (
          <AdminResetButton
            language={language}
            onReset={() => {
              setDraft('');
              write({ ...state, filters: {}, q: '', offset: 0 });
            }}
          />
        ) : null}
      </AdminFilterBar>

      {liste.isPending ? (
        <AdminSkeleton rows={6} />
      ) : page === undefined ? (
        <p className="text-caption" style={{ color: INK2 }}>
          {translateAdmin(language, 'admin.anonymous.unavailable')}
        </p>
      ) : page.rows.length === 0 ? (
        <p className="text-caption" style={{ color: INK2 }} data-admin-anonymous-empty>
          {translateAdmin(language, 'admin.anonymous.empty')}
        </p>
      ) : (
        <>
          <AdminTable>
            <thead>
              <tr>
                {entete('displayName', translateAdmin(language, 'admin.col.name'))}
                <PlainTh>{translateAdmin(language, 'admin.col.conversation')}</PlainTh>
                <PlainTh>{translateAdmin(language, 'admin.col.language')}</PlainTh>
                <PlainTh>{translateAdmin(language, 'admin.col.messages')}</PlainTh>
                <PlainTh>{translateAdmin(language, 'admin.col.status')}</PlainTh>
                {entete('joinedAt', translateAdmin(language, 'admin.col.joined'))}
                {entete('lastActiveAt', translateAdmin(language, 'admin.col.lastActive'))}
              </tr>
            </thead>
            <tbody style={{ opacity: liste.isPlaceholderData ? 0.6 : 1 }}>
              {page.rows.map((ligne) => (
                <AnonymousRow key={ligne.id} ligne={ligne} language={language} cible={cible} />
              ))}
            </tbody>
          </AdminTable>
          <AdminPager
            language={language}
            offset={state.offset}
            limit={state.limit}
            count={page.rows.length}
            total={page.total}
            hasMore={page.hasMore}
            pageSizes={ANONYMOUS_LIST_SPEC.pageSizes}
            onPage={(demande) => write(withPage(state, demande, ANONYMOUS_LIST_SPEC))}
          />
        </>
      )}
    </AdminScreenFrame>
  );
}
