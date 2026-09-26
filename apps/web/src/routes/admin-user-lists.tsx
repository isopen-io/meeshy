import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { CONVERSATION_TYPES } from '@/lib/admin/conversation-list';

import { CollapsibleSection } from '@/components/collapsible-section';
import { Sheet } from '@/components/sheet';
import {
  ADMIN_CONVERSATIONS_PAGE_SIZE,
  ADMIN_USER_CONVERSATION_SORTS,
  adminUserConversationsQueryKey,
  adminUserConversationsRootKey,
  type AdminUserConversationSort,
  loadAdminUserConversations,
  type AdminConversation,
} from '@/lib/api/admin-user-conversations';
import {
  ADMIN_MEDIA_PAGE_SIZE,
  adminUserMediaQueryKey,
  loadAdminUserMedia,
  type AdminMedia,
} from '@/lib/api/admin-user-media';
import type { AdminDeps } from '@/lib/api/admin';
import type { AdminUserDetail } from '@/lib/api/admin-user-detail';
import { apiDeps } from '@/lib/api/deps';
import type { Viewer } from '@/lib/api/viewer';
import { usePrismeDuMembre } from '@/lib/view/use-prisme-membre';
import { translateAdmin } from '@/lib/i18n-admin-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { useOnline } from '@/lib/net/online';

import { AdminSkeleton } from './admin-parts';
import { AdminFilterBar, AdminSelect } from './admin-table';
import { Link } from './route-table';
import { AdminConversationReading } from './admin-conversation-reading';
import { AdminConversationSettingsSheet } from './admin-conversation-settings-sheet';

/**
 * **CE QU'UN MEMBRE A CRÉÉ, ET OÙ IL PARLE** (#6819, étendu par #6862) — les
 * deux dernières surfaces de la fiche, toutes deux en LECTURE.
 *
 * ## Pagination par OFFSET, comme le reste de l'administration
 *
 * `LensPaginationFooter` et `paginationStateOf` supposent un
 * `useInfiniteQuery` (`hasNextPage`, `isFetchingNextPage`) : c'est la
 * mécanique du FIL, taillée pour un défilement sans fin. Ces deux listes-ci
 * sont courtes et paginées par offset, et `admin-users.tsx` a déjà tranché la
 * question — Précédents / Suivants. Emprunter la mécanique du fil aurait
 * introduit deux motifs de pagination dans une même section.
 *
 * ## Un média protégé se DIT, il ne disparaît pas
 *
 * La passerelle le laisse dans la liste et met ses URL à `null`. Une vignette
 * absente est donc un état LÉGITIME — « ce média existe et ne se montre pas »
 * — et jamais un échec de chargement. Le rendre comme une image cassée
 * mentirait sur ce qui s'est passé.
 *
 * ## UNE LIGNE DE CONVERSATION OUVRE LA VRAIE VUE (#6862, lot C)
 *
 * Elle était INERTE : un `<li>` qui affichait un titre et rien de plus.
 * C'est le défaut que `liste-ouvre-sa-fiche.test.ts` est né pour attraper, et
 * la loi 4 sous sa forme la plus discrète — non pas un contrôle sans effet,
 * mais un contrôle qui n'existe pas là où l'administrateur le cherche.
 *
 * Elle ouvre désormais une MODALE (`Sheet`, `<dialog>` natif : piège de focus,
 * Échap, retour matériel Android) qui monte `AdminConversationReading` — le
 * MÊME composant que `/adm/conversations/$id`, donc la même vue que le
 * produit, avec **le Prisme DU MEMBRE** : on lit ce que ce membre-là a lu, pas
 * la traduction que l'administrateur aurait vue.
 *
 * ## « CONFIGURER » OUVRE LES ÉCRITURES SOUVERAINES (#7845, #7999)
 *
 * Titre, description, images, droits d'écriture, archive, fermeture, et le
 * rang ou le retrait du membre — sans que l'administrateur soit membre de la
 * conversation (`AdminConversationSettingsSheet`). Le geste n'existe que pour
 * qui a la section Conversations (`gerer`, résolu par la fiche depuis
 * `GET /me/permissions`) : la passerelle garde ces écritures par
 * `canManageConversations` au rang ADMIN, et un bouton qui rend un 403 à qui le
 * touche est pire que son absence. Après une écriture, TOUTES les pages de la
 * liste sont invalidées (`adminUserConversationsRootKey`) : un archivage change
 * ce que chaque tri et chaque filtre rendent.
 */

const INK = 'var(--color-ios-ink)';
const INK2 = 'var(--color-ios-ink-2)';

const CARTE = {
  backgroundColor: 'var(--color-ios-surface)',
  border: '1px solid var(--color-edge)',
} as const;

function Pagination({
  language,
  offset,
  hasMore,
  taille,
  onOffset,
}: {
  readonly language: InterfaceLanguage;
  readonly offset: number;
  readonly hasMore: boolean;
  readonly taille: number;
  readonly onOffset: (valeur: number) => void;
}) {
  const bouton = 'rounded-chip px-4 text-body font-semibold disabled:opacity-40';
  const fond = { minHeight: 44, backgroundColor: 'color-mix(in srgb, var(--color-ios-ink-3) 16%, transparent)', color: INK };

  return (
    <div className="flex justify-between gap-2 pt-2">
      <button type="button" disabled={offset === 0} onClick={() => onOffset(Math.max(0, offset - taille))} className={bouton} style={fond}>
        {translateAdmin(language, 'admin.users.previous')}
      </button>
      <button type="button" disabled={!hasMore} onClick={() => onOffset(offset + taille)} className={bouton} style={fond}>
        {translateAdmin(language, 'admin.users.next')}
      </button>
    </div>
  );
}

/**
 * **UNE ABSENCE S'EXPLIQUE** (#6862, revue-correction) — un échec de requête
 * rendait « ce membre n'a rien publié », c'est-à-dire un FAIT au lieu d'une
 * panne. Un vide avalé ressemble trait pour trait à un vide légitime, et il se
 * lit comme une réponse : l'administrateur classe le dossier.
 *
 * Hors ligne, c'est la coupure qu'on nomme ; en ligne, c'est la passerelle qui
 * n'a pas répondu. Les confondre ferait chercher une panne là où il n'y a qu'un
 * tunnel. Mêmes clés que la section Agent, qui portait déjà cette distinction.
 */
function Absence({ language, online }: { readonly language: InterfaceLanguage; readonly online: boolean }) {
  return (
    <p className="text-caption" style={{ color: INK2 }} data-admin-absence>
      {translateAdmin(language, online ? 'admin.convList.unavailable' : 'admin.offline')}
    </p>
  );
}

export function AdminUserMediaSection({
  userId,
  language,
  deps = apiDeps,
}: {
  readonly userId: string;
  readonly language: InterfaceLanguage;
  /** Le port, injectable — MÊME porte que la section des conversations : une
   * asymétrie entre deux sections jumelles rend l'une mesurable et l'autre
   * non, ce qui décide en silence de ce qui sera gardé. */
  readonly deps?: AdminDeps;
}) {
  const online = useOnline();
  const [offset, setOffset] = useState(0);
  const page = useQuery({
    queryKey: adminUserMediaQueryKey(userId, offset),
    queryFn: async ({ signal }) => {
      const resultat = await loadAdminUserMedia({ ...deps, userId, offset, signal });
      if (!resultat.ok) throw new Error(resultat.error);
      return resultat.data;
    },
    retry: false,
  });

  return (
    <CollapsibleSection id="admin-media" title={translateAdmin(language, 'admin.media.title')} card={false}>
      {page.isPending ? (
        <AdminSkeleton rows={3} />
      ) : page.data === undefined ? (
        <Absence language={language} online={online} />
      ) : page.data.medias.length === 0 ? (
        <p className="text-caption" style={{ color: INK2 }}>
          {translateAdmin(language, 'admin.media.empty')}
        </p>
      ) : (
        <>
          <ul className="grid gap-2">
            {page.data.medias.map((media) => (
              <MediaRow key={media.id} media={media} language={language} />
            ))}
          </ul>
          <Pagination
            language={language}
            offset={offset}
            hasMore={page.data.hasMore}
            taille={ADMIN_MEDIA_PAGE_SIZE}
            onOffset={setOffset}
          />
        </>
      )}
    </CollapsibleSection>
  );
}

function MediaRow({ media, language }: { readonly media: AdminMedia; readonly language: InterfaceLanguage }) {
  return (
    <li data-admin-media={media.id} className="flex items-center gap-3 rounded-card px-4 py-3" style={CARTE}>
      <div className="min-w-0 flex-1">
        <p className="truncate text-body" style={{ color: INK }}>
          {media.originalName === '' ? media.id : media.originalName}
        </p>
        <p className="truncate text-caption" style={{ color: INK2 }}>
          {translateAdmin(language, media.source === 'message' ? 'admin.media.fromMessage' : 'admin.media.fromPost')}
          {media.mimeType === '' ? '' : ` · ${media.mimeType}`}
        </p>
      </div>
      {media.isProtected ? (
        <span className="shrink-0 text-caption" style={{ color: 'var(--color-danger)' }}>
          {translateAdmin(language, 'admin.media.protected')}
        </span>
      ) : null}
    </li>
  );
}

/**
 * LE VIEWER DE LA MODALE EST LE MEMBRE, pas l'administrateur.
 *
 * `isMineOf` compare `message.senderId` à l'identifiant du lecteur : servir
 * l'administrateur mettrait TOUTES les prises de parole du côté « reçu »,
 * y compris celles du membre — une conversation qu'il n'a jamais vue ainsi.
 * `isAnonymous: false` : on regarde un COMPTE, par définition.
 */
function viewerDuMembre(membre: AdminUserDetail): Viewer {
  return {
    id: membre.id,
    handle: membre.username,
    displayName: membre.displayName,
    isAnonymous: false,
    ...(membre.avatar === '' ? {} : { avatar: membre.avatar }),
  };
}

export function AdminUserConversationsSection({
  membre,
  language,
  onAnnounce = () => undefined,
  gerer = null,
  deps = apiDeps,
}: {
  readonly membre: AdminUserDetail;
  readonly language: InterfaceLanguage;
  /** Le verdict d'une configuration, dit au lecteur d'écran par la fiche. */
  readonly onAnnounce?: (texte: string) => void;
  /** La fiche d'administration d'une conversation, dans l'espace courant — `null` pour qui n'a pas la section des conversations. */
  readonly gerer?: 'adminConversation' | 'admConversation' | null;
  /** Le port, injectable — voir `AdminConversationReading`, même raison. */
  readonly deps?: AdminDeps;
}) {
  const online = useOnline();
  const [offset, setOffset] = useState(0);
  /** La conversation OUVERTE, `null` au repos — jamais un booléen : la modale
   * doit savoir LAQUELLE elle lit, et la remonter à chaque ouverture remet le
   * motif à zéro, ce qui est voulu (un motif par lecture). */
  const [ouverte, setOuverte] = useState<AdminConversation | null>(null);
  /** La conversation dont la feuille « Configurer » est ouverte — même raison. */
  const [configuree, setConfiguree] = useState<AdminConversation | null>(null);
  const client = useQueryClient();

  const [tri, setTri] = useState<AdminUserConversationSort>('lastMessageAt');
  const [ordre, setOrdre] = useState<'asc' | 'desc'>('desc');
  const [type, setType] = useState('');

  const page = useQuery({
    queryKey: adminUserConversationsQueryKey(membre.id, offset, type, tri, ordre),
    queryFn: async ({ signal }) => {
      const resultat = await loadAdminUserConversations({ ...deps, userId: membre.id, offset, type, sortBy: tri, sortOrder: ordre, signal });
      if (!resultat.ok) throw new Error(resultat.error);
      return resultat.data;
    },
    retry: false,
  });

  const prisme = usePrismeDuMembre(membre);

  return (
    <>
      <CollapsibleSection id="admin-conv" title={translateAdmin(language, 'admin.conv.title')} card={false}>
        <AdminFilterBar>
          <AdminSelect
            label={translateAdmin(language, 'admin.list.sort')}
            value={tri}
            options={ADMIN_USER_CONVERSATION_SORTS.map((valeur) => ({
              value: valeur,
              label: translateAdmin(language, valeur === 'lastMessageAt' ? 'admin.col.lastMessage' : 'admin.col.createdOn'),
            }))}
            onChange={(valeur) => {
              setTri(valeur === 'createdAt' ? 'createdAt' : 'lastMessageAt');
              setOffset(0);
            }}
            anchor="admin-user-conv-sort"
          />
          <AdminSelect
            label={translateAdmin(language, 'admin.list.order')}
            value={ordre}
            options={[
              { value: 'desc', label: translateAdmin(language, 'admin.list.newest') },
              { value: 'asc', label: translateAdmin(language, 'admin.list.oldest') },
            ]}
            onChange={(valeur) => {
              setOrdre(valeur === 'asc' ? 'asc' : 'desc');
              setOffset(0);
            }}
            anchor="admin-user-conv-order"
          />
          <AdminSelect
            label={translateAdmin(language, 'admin.col.type')}
            value={type}
            options={[{ value: '', label: translateAdmin(language, 'admin.list.all') }, ...CONVERSATION_TYPES.map((valeur) => ({ value: valeur, label: valeur }))]}
            onChange={(valeur) => {
              setType(valeur);
              setOffset(0);
            }}
            anchor="admin-user-conv-type"
          />
        </AdminFilterBar>
        {page.isPending ? (
          <AdminSkeleton rows={3} />
        ) : page.data === undefined ? (
          <Absence language={language} online={online} />
        ) : page.data.conversations.length === 0 ? (
          <p className="text-caption" style={{ color: INK2 }}>
            {translateAdmin(language, 'admin.conv.empty')}
          </p>
        ) : (
          <>
            <ul className="grid gap-2">
              {page.data.conversations.map((conversation) => (
                <ConversationRow
                  key={conversation.id}
                  conversation={conversation}
                  language={language}
                  onOpen={() => setOuverte(conversation)}
                  onConfigure={gerer === null ? null : () => setConfiguree(conversation)}
                  gerer={gerer}
                />
              ))}
            </ul>
            <Pagination
              language={language}
              offset={offset}
              hasMore={page.data.hasMore}
              taille={ADMIN_CONVERSATIONS_PAGE_SIZE}
              onOffset={setOffset}
            />
          </>
        )}
      </CollapsibleSection>

      {ouverte === null ? null : (
        <Sheet
          title={ouverte.title ?? ouverte.identifier ?? ouverte.id}
          bodyAs="div"
          onClose={() => setOuverte(null)}
        >
          <div className="flex min-h-0 flex-1 flex-col" data-admin-conversation-sheet={ouverte.id}>
            <AdminConversationReading
              conversationId={ouverte.id}
              language={language}
              prisme="membre"
              readerLanguages={prisme.languages}
              readerLocale={prisme.locale}
              viewer={viewerDuMembre(membre)}
              deps={deps}
            />
          </div>
        </Sheet>
      )}

      {configuree === null ? null : (
        <AdminConversationSettingsSheet
          conversation={configuree}
          userId={membre.id}
          language={language}
          deps={deps}
          onAnnounce={onAnnounce}
          onClose={() => setConfiguree(null)}
          onChanged={() => {
            void client.invalidateQueries({ queryKey: adminUserConversationsRootKey(membre.id) });
          }}
        />
      )}
    </>
  );
}

/**
 * LA LIGNE EST UN BOUTON, pas un `<li>` cliquable : le clavier, le focus et le
 * rôle viennent avec, et le lecteur d'écran annonce qu'il y a quelque chose à
 * ouvrir. Un `onClick` posé sur le `<li>` aurait le même effet à la souris et
 * aucun au clavier — la moitié des lecteurs, silencieusement.
 */
function ConversationRow({
  conversation,
  language,
  onOpen,
  onConfigure,
  gerer,
}: {
  readonly conversation: AdminConversation;
  readonly language: InterfaceLanguage;
  readonly onOpen: () => void;
  readonly onConfigure: (() => void) | null;
  readonly gerer: 'adminConversation' | 'admConversation' | null;
}) {
  return (
    <li data-admin-conversation={conversation.id} className="flex items-stretch gap-2">
      <button
        type="button"
        data-admin-conversation-open={conversation.id}
        onClick={onOpen}
        className="flex w-full items-center gap-3 rounded-card px-4 py-3 text-start"
        style={{ ...CARTE, minHeight: 44 }}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-body" style={{ color: INK }}>
            {/* Un DIRECT n'a pas de titre propre (D-75) : il porte le nom de
                l'autre, que cette route ne sert pas. On montre alors son
                identifiant plutôt qu'une ligne vide. */}
            {conversation.title ?? conversation.identifier ?? conversation.id}
          </p>
          <p className="truncate text-caption" style={{ color: INK2 }}>
            {conversation.type}
            {' · '}
            {translateAdmin(language, 'admin.conv.members', { count: String(conversation.memberCount) })}
          </p>
        </div>
      </button>
      {onConfigure === null ? null : (
        <button
          type="button"
          data-admin-conversation-configure={conversation.id}
          aria-label={`${translateAdmin(language, 'admin.conv.configure')} — ${conversation.title ?? conversation.identifier ?? conversation.id}`}
          onClick={onConfigure}
          className="grid shrink-0 place-items-center rounded-card px-3 text-caption font-semibold"
          style={{ ...CARTE, color: 'var(--color-ios-brand)', minHeight: 44 }}
        >
          {translateAdmin(language, 'admin.conv.configure')}
        </button>
      )}
      {gerer === null ? null : (
        <Link
          to={gerer}
          params={{ conversation: conversation.id }}
          data-admin-conversation-manage={conversation.id}
          className="grid shrink-0 place-items-center rounded-card px-3 text-caption font-semibold"
          style={{ ...CARTE, color: 'var(--color-ios-brand)', minHeight: 44 }}
        >
          {translateAdmin(language, 'admin.conv.manage')}
        </Link>
      )}
    </li>
  );
}
