import { useQuery } from '@tanstack/react-query';

import { Avatar } from '@/components/avatar';
import { adminIdentityQueryOptions } from '@/lib/api/admin';
import {
  adminConversationsQueryKey,
  loadAdminInstanceConversations,
  type AdminInstanceConversation,
} from '@/lib/api/admin-conversations';
import { apiDeps } from '@/lib/api/deps';
import { CONVERSATION_LIST_SPEC, CONVERSATION_TYPES } from '@/lib/admin/conversation-list';
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
/** `Link` vient de la TABLE, pas du module générique : `to` n'accepte qu'une clé réelle. */
import { Link } from '@/routes/route-table';

/**
 * **L'INVENTAIRE DES CONVERSATIONS** (#6862, #7873) — en tableau, trié par
 * dernier message ou par création, dans les deux ordres, filtré par type et
 * par état ; l'état de la liste vit dans l'adresse (`list-state.ts`). C'est la première moitié de la lecture
 * souveraine : on part d'une conversation, au lieu de devoir deviner un membre
 * qui y participe.
 *
 * ## Ce que cet écran NE montre pas
 *
 * Aucun contenu de message, aucun aperçu. `GET /admin/conversations` (#6861)
 * sert des métadonnées, et c'est la frontière que l'écran tient : un titre de
 * conversation n'est pas un message. Le contenu vit derrière la route voisine,
 * son motif écrit et sa trace.
 *
 * ## La garde est LUE, pas héritée
 *
 * `visibleAdminSections(permissions, role)` décide, avec le rôle **servi** par
 * `GET /me/permissions`. On entre sur cette adresse par un lien profond aussi
 * bien que par le hub, et une garde posée seulement à l'étage du dessus ne
 * garde que l'escalier.
 *
 * Le refus a DEUX visages distincts, et les confondre serait mentir :
 * `AdminDenied` pour qui n'a rien à faire ici, et un message propre au rang
 * pour un MODERATOR — qui porte bien `canManageConversations` (matrice
 * centrale) mais n'a pas le rang d'administration. Celui-là n'a pas « pas le
 * droit d'être là », il a « le droit d'être là sans le droit de lire ceci ».
 *
 * Directive porteur du 2026-09-16 : les ADMIN accèdent à ces informations,
 * pour le moment — le seuil est donc BIGBOSS ou ADMIN, jamais MODERATOR.
 *
 * ## Rien de ce qui est lu ici ne touche le disque
 *
 * Les clés de requête descendent d'`ADMIN_SOUVERAIN_PREFIXE`, qu'exclut le
 * filtre de déshydratation de `query-client.ts` (#6862). Ne jamais composer
 * une clé de ce domaine à la main.
 */

const INK2 = 'var(--color-ios-ink-2)';

type ConversationListState = ListState<
  (typeof CONVERSATION_LIST_SPEC.sortKeys)[number],
  keyof typeof CONVERSATION_LIST_SPEC.filters
>;

/**
 * **LA LIGNE OUVRE LA CONVERSATION** — sans ce lien, l'écran de lecture est
 * INATTEIGNABLE autrement qu'en tapant son adresse à la main (#6862). `cible`
 * vaut `admConversation` ou `adminConversation` selon l'espace d'où l'on
 * parcourt la liste (D-76).
 */
function ConversationRow({
  conversation,
  language,
  cible,
}: {
  readonly conversation: AdminInstanceConversation;
  readonly language: InterfaceLanguage;
  readonly cible: 'adminConversation' | 'admConversation';
}) {
  /* Un DIRECT n'a pas de titre propre (D-75) : il porte le nom de l'autre,
     que cette route ne sert pas. On montre son identifiant plutôt qu'une
     ligne vide. */
  const nom = conversation.title ?? conversation.identifier ?? conversation.id;
  return (
    <tr data-admin-conversation={conversation.id}>
      <Td>
        <Link to={cible} params={{ conversation: conversation.id }} className="flex min-w-0 items-center" style={{ minHeight: 44 }}>
          <span className="min-w-0">
            <span className="block truncate font-medium">{nom}</span>
            {conversation.identifier === null || conversation.identifier === nom ? null : (
              <span className="block truncate text-caption" style={{ color: INK2 }}>
                {conversation.identifier}
              </span>
            )}
          </span>
        </Link>
      </Td>
      <Td className="text-caption">{conversation.type}</Td>
      <Td>
        <span className="flex items-center gap-2">
          <span className="flex -space-x-2" aria-hidden="true">
            {conversation.participants.slice(0, 4).map((participant) => (
              <Avatar
                key={participant.userId}
                initials={initialsOf(participant.displayName)}
                color="var(--color-ios-brand)"
                size={24}
                name={participant.displayName}
                {...(participant.avatar === null ? {} : { src: participant.avatar })}
              />
            ))}
          </span>
          <span className="text-caption tabular-nums" style={{ color: INK2 }}>
            {translateAdmin(language, 'admin.convList.members', { count: String(conversation.memberCount) })}
          </span>
        </span>
      </Td>
      <Td className="text-caption">
        {conversation.isActive ? (
          <span style={{ color: 'var(--color-success, #34D399)' }}>{translateAdmin(language, 'admin.filter.active')}</span>
        ) : (
          <span style={{ color: 'var(--color-danger)' }}>{translateAdmin(language, 'admin.users.inactive')}</span>
        )}
      </Td>
      <Td className="whitespace-nowrap text-caption tabular-nums">{adminMoment(conversation.createdAt, language)}</Td>
      <Td className="whitespace-nowrap text-caption tabular-nums">{adminMoment(conversation.lastMessageAt, language)}</Td>
    </tr>
  );
}

export default function AdminConversationsScreen() {
  const language = currentInterfaceLanguage();
  const { key } = useRoute();
  /** On reste dans l'espace d'où l'on vient (D-76). */
  const cible = key === 'admConversations' ? ('admConversation' as const) : ('adminConversation' as const);
  const { state, write, draft, setDraft, address } = useAdminListState(CONVERSATION_LIST_SPEC);

  const identite = useQuery(adminIdentityQueryOptions(apiDeps));

  // Le droit d'ENTRER dans la section, rôle compris.
  const autorise = visibleAdminSections(identite.data?.permissions ?? null, identite.data?.role).some(
    (section) => section.id === 'conversations',
  );
  // Le droit d'être dans l'ESPACE, sans le rang — le second visage du refus.
  const dansLEspace = visibleAdminSections(identite.data?.permissions ?? null).length > 0;

  const liste = useQuery({
    queryKey: adminConversationsQueryKey(address),
    queryFn: async ({ signal }) => {
      const resultat = await loadAdminInstanceConversations({
        ...apiDeps,
        offset: state.offset,
        limit: state.limit,
        search: state.q,
        sort: state.sort,
        order: state.order,
        filters: state.filters,
        signal,
      });
      if (!resultat.ok) throw new Error(resultat.error);
      return resultat.data;
    },
    enabled: autorise,
    retry: false,
    placeholderData: (precedent) => precedent,
    // Rien de souverain ne se garde : ni sur le disque (le filtre de
    // déshydratation l'exclut), ni en mémoire au-delà de l'écran.
    gcTime: 0,
  });

  const titre = translateAdmin(language, 'admin.nav.conversations');

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
        {dansLEspace ? (
          <p className="text-caption" style={{ color: INK2 }} data-admin-sovereign-denied>
            {translateAdmin(language, 'admin.convList.sovereign')}
          </p>
        ) : (
          <AdminDenied language={language} />
        )}
      </AdminScreenFrame>
    );
  }

  const page = liste.data;
  const tous = { value: '', label: translateAdmin(language, 'admin.list.all') };
  const entete = (colonne: ConversationListState['sort'], libelle: string) => (
    <SortableTh
      language={language}
      label={libelle}
      column={colonne}
      sort={state.sort}
      order={state.order}
      onSort={() => write(toggleSort(state, colonne, CONVERSATION_LIST_SPEC))}
    />
  );

  return (
    <AdminScreenFrame language={language} title={titre} back="admin">
      <AdminFilterBar>
        <AdminSearchField
          label={translateAdmin(language, 'admin.convList.search')}
          value={draft}
          onChange={setDraft}
          anchor="admin-conversations-search"
        />
        <AdminSelect
          label={translateAdmin(language, 'admin.col.type')}
          value={state.filters.type ?? ''}
          options={[tous, ...CONVERSATION_TYPES.map((type) => ({ value: type, label: type }))]}
          onChange={(valeur) => write(withFilter(state, 'type', valeur, CONVERSATION_LIST_SPEC))}
          anchor="admin-filter-type"
        />
        <AdminSelect
          label={translateAdmin(language, 'admin.col.status')}
          value={state.filters.isActive ?? ''}
          options={[
            tous,
            { value: 'true', label: translateAdmin(language, 'admin.filter.active') },
            { value: 'false', label: translateAdmin(language, 'admin.filter.inactive') },
          ]}
          onChange={(valeur) => write(withFilter(state, 'isActive', valeur, CONVERSATION_LIST_SPEC))}
          anchor="admin-filter-active"
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
          {translateAdmin(language, 'admin.convList.unavailable')}
        </p>
      ) : page.conversations.length === 0 ? (
        <p className="text-caption" style={{ color: INK2 }}>
          {translateAdmin(language, 'admin.convList.empty')}
        </p>
      ) : (
        <>
          <AdminTable>
            <thead>
              <tr>
                <PlainTh>{translateAdmin(language, 'admin.col.conversation')}</PlainTh>
                <PlainTh>{translateAdmin(language, 'admin.col.type')}</PlainTh>
                <PlainTh>{translateAdmin(language, 'admin.col.members')}</PlainTh>
                <PlainTh>{translateAdmin(language, 'admin.col.status')}</PlainTh>
                {entete('createdAt', translateAdmin(language, 'admin.col.createdOn'))}
                {entete('lastMessageAt', translateAdmin(language, 'admin.col.lastMessage'))}
              </tr>
            </thead>
            <tbody style={{ opacity: liste.isPlaceholderData ? 0.6 : 1 }}>
              {page.conversations.map((conversation) => (
                <ConversationRow key={conversation.id} conversation={conversation} language={language} cible={cible} />
              ))}
            </tbody>
          </AdminTable>
          <AdminPager
            language={language}
            offset={state.offset}
            limit={state.limit}
            count={page.conversations.length}
            total={page.total}
            hasMore={page.hasMore}
            pageSizes={CONVERSATION_LIST_SPEC.pageSizes}
            onPage={(demande) => write(withPage(state, demande, CONVERSATION_LIST_SPEC))}
          />
        </>
      )}
    </AdminScreenFrame>
  );
}
