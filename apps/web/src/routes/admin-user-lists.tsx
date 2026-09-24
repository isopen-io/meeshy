import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { Avatar } from '@/components/avatar';
import { Sheet } from '@/components/sheet';
import { adminMoment } from '@/lib/admin/format';
import { adminConversationTypeLabel } from '@/lib/admin/enum-labels';
import {
  ADMIN_CONVERSATION_DEFAULT_CRITERIA,
  ADMIN_CONVERSATION_SORTS,
  ADMIN_CONVERSATIONS_PAGE_SIZE,
  ADMIN_MEMBER_ROLES,
  adminUserConversationsQueryKey,
  adminUserConversationsRootKey,
  loadAdminUserConversations,
  type AdminConversation,
  type AdminConversationCriteria,
  type AdminConversationSort,
  type AdminMemberRole,
} from '@/lib/api/admin-user-conversations';
import { ADMIN_MEDIA_PAGE_SIZE, adminUserMediaQueryOptions, type AdminMedia } from '@/lib/api/admin-user-media';
import type { AdminDeps } from '@/lib/api/admin';
import type { AdminUserDetail } from '@/lib/api/admin-user-detail';
import { adminUserStatsQueryKey } from '@/lib/api/admin-user-stats';
import { apiDeps } from '@/lib/api/deps';
import { attachmentSrc } from '@/lib/api/media-url';
import type { Viewer } from '@/lib/api/viewer';
import { usePrismeDuMembre } from '@/lib/view/use-prisme-membre';
import { translateAdmin, type AdminPlainCatalogKey } from '@/lib/i18n-admin-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { initialsOf } from '@/lib/view/conversation';

import { AdminAbsence, AdminPagination, AdminSkeleton } from './admin-parts';
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
 */

const INK = 'var(--color-ios-ink)';
const INK2 = 'var(--color-ios-ink-2)';

const CARTE = {
  backgroundColor: 'var(--color-ios-surface)',
  border: '1px solid var(--color-edge)',
} as const;

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
  const [offset, setOffset] = useState(0);
  // La MÊME fonction que le carrousel sous la même clé (`admin-user-media.ts`) :
  // la première page ouverte ici ne relit rien de ce que la fiche a déjà lu.
  const page = useQuery({ ...adminUserMediaQueryOptions(deps, userId, offset), placeholderData: keepPreviousData });

  return (
    <div className="grid gap-3" data-admin-section="media">
      {page.isPending ? (
        <AdminSkeleton rows={3} />
      ) : page.data === undefined ? (
        <AdminAbsence language={language} unavailable="admin.convList.unavailable" />
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
          <AdminPagination
            language={language}
            offset={offset}
            hasMore={page.data.hasMore}
            size={ADMIN_MEDIA_PAGE_SIZE}
            onOffset={setOffset}
          />
        </>
      )}
    </div>
  );
}

/**
 * UNE LIGNE DE MÉDIA porte sa VIGNETTE quand elle en a une. Un média protégé
 * n'en a pas — la passerelle a vidé ses URL — et sa case le DIT par une plaque
 * étiquetée, jamais par une image cassée ; un fichier qui n'est pas une image
 * montre son type.
 */
function MediaRow({ media, language }: { readonly media: AdminMedia; readonly language: InterfaceLanguage }) {
  const vignette = media.thumbnailUrl ?? (media.mimeType.startsWith('image/') ? media.fileUrl : null);
  const [absente, setAbsente] = useState(false);
  const plaque = media.isProtected ? '🔒' : (media.mimeType.split('/')[0] ?? '').slice(0, 5);

  return (
    <li data-admin-media={media.id} className="flex items-center gap-3 rounded-card px-3 py-2.5" style={CARTE}>
      <span
        className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-[10px] text-caption"
        style={{ backgroundColor: 'color-mix(in srgb, var(--color-ios-ink-3) 14%, transparent)', color: INK2 }}
        aria-hidden="true"
      >
        {vignette === null || absente || media.isProtected ? (
          plaque
        ) : (
          <img src={attachmentSrc(vignette)} alt="" loading="lazy" decoding="async" onError={() => setAbsente(true)} className="size-full object-cover" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-body" style={{ color: INK }}>
          {media.originalName === '' ? media.id : media.originalName}
        </p>
        <p className="truncate text-caption" style={{ color: INK2 }}>
          {translateAdmin(language, media.source === 'message' ? 'admin.media.fromMessage' : 'admin.media.fromPost')}
          {media.mimeType === '' ? '' : ` · ${media.mimeType}`}
          {media.createdAt === null ? '' : ` · ${adminMoment(media.createdAt, language)}`}
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


const TYPES_DE_CONVERSATION = ['direct', 'group', 'public', 'global', 'broadcast'] as const;

const LIBELLES_TRI: Readonly<Record<AdminConversationSort, AdminPlainCatalogKey>> = {
  lastMessageAt: 'admin.conv.sort.lastMessageAt',
  createdAt: 'admin.conv.sort.createdAt',
  title: 'admin.conv.sort.title',
  joinedAt: 'admin.conv.sort.joinedAt',
};

const LIBELLES_ROLE: Readonly<Record<AdminMemberRole, AdminPlainCatalogKey>> = {
  creator: 'admin.conv.role.creator',
  admin: 'admin.conv.role.admin',
  moderator: 'admin.conv.role.moderator',
  member: 'admin.conv.role.member',
};

const estTri = (v: string): v is AdminConversationSort => (ADMIN_CONVERSATION_SORTS as readonly string[]).includes(v);
const estRole = (v: string): v is AdminMemberRole => (ADMIN_MEMBER_ROLES as readonly string[]).includes(v);

/** Le délai avant qu'une RECHERCHE saisie ne parte : une requête par touche
 * mesurerait la vitesse de frappe de l'administrateur, pas ce qu'il cherche. */
export const ADMIN_CONVERSATION_SEARCH_DELAY_MS = 300;

const CONTROLE = {
  minHeight: 44,
  backgroundColor: 'var(--color-ios-surface)',
  border: '1px solid var(--color-edge)',
  color: INK,
} as const;

/**
 * **OÙ UN MEMBRE PARLE — TRIÉ, FILTRÉ, CONFIGURABLE** (#6819, #6862, #7845 D/E).
 *
 * ## Le tri est une LISTE BLANCHE
 *
 * Dernière activité, création, titre, arrivée du membre — les quatre tris que
 * la passerelle accepte (`ADMIN_CONVERSATION_SORTS`), et pas un de plus :
 * l'effectif et le nombre de messages se lisent sur une colonne morte ou une
 * ligne facultative, et trieraient des zéros.
 *
 * ## Changer de tri ne vide pas l'écran
 *
 * `keepPreviousData` : la page d'avant reste peinte le temps que la suivante
 * arrive (cache-first, dimension 2). Un squelette à chaque changement de tri
 * ferait clignoter une liste qui est déjà là. Tout changement de critère
 * ramène à la première page — une page 3 d'un autre tri ne veut rien dire.
 *
 * ## Deux gestes par ligne
 *
 * « Lire » ouvre la lecture souveraine AU PRISME DU MEMBRE ; « Configurer »
 * ouvre la feuille des écritures souveraines. Après une écriture, TOUTES les
 * pages de la liste sont invalidées (`adminUserConversationsRootKey`) : un
 * archivage change ce que chaque tri et chaque filtre rendent.
 */
export function AdminUserConversationsSection({
  membre,
  language,
  onAnnounce = () => undefined,
  deps = apiDeps,
}: {
  readonly membre: AdminUserDetail;
  readonly language: InterfaceLanguage;
  readonly onAnnounce?: (texte: string) => void;
  /** Le port, injectable — voir `AdminConversationReading`, même raison. */
  readonly deps?: AdminDeps;
}) {
  const client = useQueryClient();
  const [offset, setOffset] = useState(0);
  const [type, setType] = useState('');
  const [criteres, setCriteres] = useState<AdminConversationCriteria>(ADMIN_CONVERSATION_DEFAULT_CRITERIA);
  const [saisie, setSaisie] = useState('');
  /** La conversation OUVERTE, `null` au repos — jamais un booléen : la modale
   * doit savoir LAQUELLE elle lit, et la remonter à chaque ouverture remet le
   * motif à zéro, ce qui est voulu (un motif par lecture). */
  const [ouverte, setOuverte] = useState<AdminConversation | null>(null);
  const [configuree, setConfiguree] = useState<AdminConversation | null>(null);

  const changer = (partie: Partial<AdminConversationCriteria>) => {
    setCriteres((avant) => ({ ...avant, ...partie }));
    setOffset(0);
  };

  useEffect(() => {
    if (saisie.trim() === criteres.search) return;
    const minuteur = setTimeout(() => changer({ search: saisie.trim() }), ADMIN_CONVERSATION_SEARCH_DELAY_MS);
    return () => clearTimeout(minuteur);
  }, [saisie, criteres.search]);

  const page = useQuery({
    queryKey: adminUserConversationsQueryKey(membre.id, offset, type, criteres),
    queryFn: async ({ signal }) => {
      const resultat = await loadAdminUserConversations({
        ...deps,
        userId: membre.id,
        offset,
        type,
        sort: criteres.sort,
        order: criteres.order,
        search: criteres.search,
        role: criteres.role,
        signal,
      });
      if (!resultat.ok) throw new Error(resultat.error);
      return resultat.data;
    },
    placeholderData: keepPreviousData,
    retry: false,
  });

  const prisme = usePrismeDuMembre(membre);

  return (
    <>
      {/* Monté comme PANNEAU d'onglet, déjà nommé par son onglet : un
          repliable du même titre y répéterait l'onglet, et un clic le vidait
          tout entier. */}
      <div className="grid gap-3" data-admin-section="conversations">
        <form
          role="search"
          data-admin-conv-toolbar
          className="mb-1 grid gap-2 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            changer({ search: saisie.trim() });
          }}
        >
          <input
            type="search"
            data-admin-conv-search
            value={saisie}
            aria-label={translateAdmin(language, 'admin.conv.search')}
            placeholder={translateAdmin(language, 'admin.conv.search')}
            onInput={(event) => setSaisie(event.currentTarget.value)}
            className="rounded-chip px-4 text-body sm:col-span-2"
            style={CONTROLE}
          />
          <div className="flex gap-2">
            <select
              data-admin-conv-sort
              aria-label={translateAdmin(language, 'admin.conv.sort')}
              value={criteres.sort}
              onChange={(event) => {
                const valeur = event.currentTarget.value;
                if (estTri(valeur)) changer({ sort: valeur });
              }}
              className="min-w-0 flex-1 rounded-chip px-3 text-body"
              style={CONTROLE}
            >
              {ADMIN_CONVERSATION_SORTS.map((tri) => (
                <option key={tri} value={tri}>
                  {translateAdmin(language, LIBELLES_TRI[tri])}
                </option>
              ))}
            </select>
            <button
              type="button"
              data-admin-conv-order={criteres.order}
              aria-label={`${translateAdmin(language, 'admin.conv.sort')} — ${translateAdmin(language, criteres.order === 'asc' ? 'admin.conv.order.asc' : 'admin.conv.order.desc')}`}
              onClick={() => changer({ order: criteres.order === 'asc' ? 'desc' : 'asc' })}
              className="shrink-0 rounded-chip px-3 text-body font-semibold"
              style={{ ...CONTROLE, minWidth: 44 }}
            >
              <span aria-hidden="true">{criteres.order === 'asc' ? '↑' : '↓'}</span>
            </button>
          </div>
          <div className="flex gap-2">
            <select
              data-admin-conv-type
              aria-label={translateAdmin(language, 'admin.conv.filterType')}
              value={type}
              onChange={(event) => {
                setType(event.currentTarget.value);
                setOffset(0);
              }}
              className="min-w-0 flex-1 rounded-chip px-3 text-body"
              style={CONTROLE}
            >
              <option value="">{`${translateAdmin(language, 'admin.conv.filterType')} · ${translateAdmin(language, 'admin.conv.all')}`}</option>
              {TYPES_DE_CONVERSATION.map((t) => (
                <option key={t} value={t}>
                  {adminConversationTypeLabel(language, t)}
                </option>
              ))}
            </select>
            <select
              data-admin-conv-role
              aria-label={translateAdmin(language, 'admin.conv.filterRole')}
              value={criteres.role}
              onChange={(event) => {
                const valeur = event.currentTarget.value;
                changer({ role: estRole(valeur) ? valeur : '' });
              }}
              className="min-w-0 flex-1 rounded-chip px-3 text-body"
              style={CONTROLE}
            >
              <option value="">{`${translateAdmin(language, 'admin.conv.filterRole')} · ${translateAdmin(language, 'admin.conv.all')}`}</option>
              {ADMIN_MEMBER_ROLES.map((r) => (
                <option key={r} value={r}>
                  {translateAdmin(language, LIBELLES_ROLE[r])}
                </option>
              ))}
            </select>
          </div>
        </form>

        <div className="grid gap-3">
          {page.isPending ? (
            <AdminSkeleton rows={3} />
          ) : page.data === undefined ? (
            <AdminAbsence language={language} unavailable="admin.convList.unavailable" />
          ) : page.data.conversations.length === 0 ? (
            <p className="text-caption" style={{ color: INK2 }}>
              {translateAdmin(language, 'admin.conv.empty')}
            </p>
          ) : (
            <>
              <ul className="grid gap-2" aria-busy={page.isPlaceholderData}>
                {page.data.conversations.map((conversation) => (
                  <ConversationRow
                    key={conversation.id}
                    conversation={conversation}
                    language={language}
                    onOpen={() => setOuverte(conversation)}
                    onConfigure={() => setConfiguree(conversation)}
                  />
                ))}
              </ul>
              <AdminPagination
                language={language}
                offset={offset}
                hasMore={page.data.hasMore}
                size={ADMIN_CONVERSATIONS_PAGE_SIZE}
                onOffset={setOffset}
              />
            </>
          )}
        </div>
      </div>

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
            // Retirer le membre change son nombre de conversations.
            void client.invalidateQueries({ queryKey: adminUserStatsQueryKey(membre.id) });
          }}
        />
      )}
    </>
  );
}

function Puce({ texte, ton = 'neutre' }: { readonly texte: string; readonly ton?: 'neutre' | 'danger' }) {
  const couleur = ton === 'danger' ? 'var(--color-danger)' : 'var(--color-ios-brand)';
  return (
    <span
      className="rounded-chip px-2 py-0.5 text-[11px] font-semibold"
      style={{ color: couleur, backgroundColor: `color-mix(in srgb, ${couleur} 12%, transparent)` }}
    >
      {texte}
    </span>
  );
}

/**
 * LA LIGNE PORTE DEUX BOUTONS, pas un `<li>` cliquable : le clavier, le focus
 * et le rôle viennent avec, et le lecteur d'écran annonce qu'il y a quelque
 * chose à ouvrir. Un `onClick` posé sur le `<li>` aurait le même effet à la
 * souris et aucun au clavier — la moitié des lecteurs, silencieusement.
 */
function ConversationRow({
  conversation,
  language,
  onOpen,
  onConfigure,
}: {
  readonly conversation: AdminConversation;
  readonly language: InterfaceLanguage;
  readonly onOpen: () => void;
  readonly onConfigure: () => void;
}) {
  /* Un DIRECT n'a pas de titre propre (D-75) : il porte le nom de l'autre, que
     cette route ne sert pas. On montre alors son identifiant plutôt qu'une
     ligne vide. */
  const titre = conversation.title ?? conversation.identifier ?? conversation.id;
  const role = conversation.membership?.role ?? '';
  const details = [
    adminConversationTypeLabel(language, conversation.type),
    translateAdmin(language, 'admin.conv.members', { count: String(conversation.memberCount) }),
    conversation.messageCount === null ? null : translateAdmin(language, 'admin.conv.messages', { count: String(conversation.messageCount) }),
    conversation.lastMessageAt === null ? null : adminMoment(conversation.lastMessageAt, language),
  ].filter((d): d is string => d !== null);

  return (
    <li data-admin-conversation={conversation.id} className="flex flex-wrap items-center gap-x-3 gap-y-2.5 rounded-card px-4 py-3" style={CARTE}>
      <div className="flex min-w-0 flex-1 basis-64 items-center gap-3">
        <Avatar
          initials={initialsOf(titre)}
          color="var(--color-ios-brand)"
          size={40}
          name={titre}
          {...(conversation.avatar === null ? {} : { src: attachmentSrc(conversation.avatar) })}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-body font-semibold" style={{ color: INK }}>
            {titre}
          </p>
          <p className="truncate text-caption" style={{ color: INK2 }}>
            {details.join(' · ')}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 max-sm:w-full">
        {estRole(role) ? (
          <Puce texte={translateAdmin(language, 'admin.conv.memberRole', { role: translateAdmin(language, LIBELLES_ROLE[role]) })} />
        ) : null}
        {conversation.closedAt === null ? null : <Puce texte={translateAdmin(language, 'admin.conv.closed')} ton="danger" />}
        {conversation.isActive ? null : <Puce texte={translateAdmin(language, 'admin.conv.archived')} ton="danger" />}
        <span className="ms-auto flex gap-2">
          <button
            type="button"
            data-admin-conversation-open={conversation.id}
            aria-label={`${translateAdmin(language, 'admin.conv.read')} — ${titre}`}
            onClick={onOpen}
            className="rounded-chip px-4 text-caption font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ minHeight: 44, backgroundColor: 'var(--color-ios-brand)', outlineColor: 'var(--color-ios-brand)' }}
          >
            {translateAdmin(language, 'admin.conv.read')}
          </button>
          <button
            type="button"
            data-admin-conversation-configure={conversation.id}
            aria-label={`${translateAdmin(language, 'admin.conv.configure')} — ${titre}`}
            onClick={onConfigure}
            className="rounded-chip px-4 text-caption font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              minHeight: 44,
              color: 'var(--color-ios-brand)',
              outlineColor: 'var(--color-ios-brand)',
              backgroundColor: 'color-mix(in srgb, var(--color-ios-brand) 10%, transparent)',
            }}
          >
            {translateAdmin(language, 'admin.conv.configure')}
          </button>
        </span>
      </div>
    </li>
  );
}
