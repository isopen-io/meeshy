import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import {
  ADMIN_CONVERSATIONS_PAGE_SIZE,
  adminUserConversationsQueryKey,
  loadAdminUserConversations,
  type AdminConversation,
} from '@/lib/api/admin-user-conversations';
import {
  ADMIN_MEDIA_PAGE_SIZE,
  adminUserMediaQueryKey,
  loadAdminUserMedia,
  type AdminMedia,
} from '@/lib/api/admin-user-media';
import { apiDeps } from '@/lib/api/deps';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

import { AdminSkeleton } from './admin-parts';

/**
 * **CE QU'UN MEMBRE A CRÉÉ, ET OÙ IL PARLE** (#6819) — les deux dernières
 * surfaces du lot, toutes deux en LECTURE.
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
        {translate(language, 'admin.users.previous')}
      </button>
      <button type="button" disabled={!hasMore} onClick={() => onOffset(offset + taille)} className={bouton} style={fond}>
        {translate(language, 'admin.users.next')}
      </button>
    </div>
  );
}

export function AdminUserMediaSection({ userId, language }: { readonly userId: string; readonly language: InterfaceLanguage }) {
  const [offset, setOffset] = useState(0);
  const page = useQuery({
    queryKey: adminUserMediaQueryKey(userId, offset),
    queryFn: async ({ signal }) => {
      const resultat = await loadAdminUserMedia({ ...apiDeps, userId, offset, signal });
      if (!resultat.ok) throw new Error(resultat.error);
      return resultat.data;
    },
    retry: false,
  });

  return (
    <section className="grid gap-2" aria-labelledby="admin-media-title">
      <h2 id="admin-media-title" className="text-caption font-medium" style={{ color: INK2 }}>
        {translate(language, 'admin.media.title')}
      </h2>

      {page.isPending ? (
        <AdminSkeleton rows={3} />
      ) : (page.data?.medias ?? []).length === 0 ? (
        <p className="text-caption" style={{ color: INK2 }}>
          {translate(language, 'admin.media.empty')}
        </p>
      ) : (
        <>
          <ul className="grid gap-2">
            {(page.data?.medias ?? []).map((media) => (
              <MediaRow key={media.id} media={media} language={language} />
            ))}
          </ul>
          <Pagination
            language={language}
            offset={offset}
            hasMore={page.data?.hasMore ?? false}
            taille={ADMIN_MEDIA_PAGE_SIZE}
            onOffset={setOffset}
          />
        </>
      )}
    </section>
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
          {translate(language, media.source === 'message' ? 'admin.media.fromMessage' : 'admin.media.fromPost')}
          {media.mimeType === '' ? '' : ` · ${media.mimeType}`}
        </p>
      </div>
      {media.isProtected ? (
        <span className="shrink-0 text-caption" style={{ color: 'var(--color-danger)' }}>
          {translate(language, 'admin.media.protected')}
        </span>
      ) : null}
    </li>
  );
}

export function AdminUserConversationsSection({ userId, language }: { readonly userId: string; readonly language: InterfaceLanguage }) {
  const [offset, setOffset] = useState(0);
  const page = useQuery({
    queryKey: adminUserConversationsQueryKey(userId, offset, ''),
    queryFn: async ({ signal }) => {
      const resultat = await loadAdminUserConversations({ ...apiDeps, userId, offset, signal });
      if (!resultat.ok) throw new Error(resultat.error);
      return resultat.data;
    },
    retry: false,
  });

  return (
    <section className="grid gap-2" aria-labelledby="admin-conv-title">
      <h2 id="admin-conv-title" className="text-caption font-medium" style={{ color: INK2 }}>
        {translate(language, 'admin.conv.title')}
      </h2>

      {page.isPending ? (
        <AdminSkeleton rows={3} />
      ) : (page.data?.conversations ?? []).length === 0 ? (
        <p className="text-caption" style={{ color: INK2 }}>
          {translate(language, 'admin.conv.empty')}
        </p>
      ) : (
        <>
          <ul className="grid gap-2">
            {(page.data?.conversations ?? []).map((conversation) => (
              <ConversationRow key={conversation.id} conversation={conversation} language={language} />
            ))}
          </ul>
          <Pagination
            language={language}
            offset={offset}
            hasMore={page.data?.hasMore ?? false}
            taille={ADMIN_CONVERSATIONS_PAGE_SIZE}
            onOffset={setOffset}
          />
        </>
      )}
    </section>
  );
}

function ConversationRow({
  conversation,
  language,
}: {
  readonly conversation: AdminConversation;
  readonly language: InterfaceLanguage;
}) {
  return (
    <li data-admin-conversation={conversation.id} className="flex items-center gap-3 rounded-card px-4 py-3" style={CARTE}>
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
          {translate(language, 'admin.conv.members', { count: String(conversation.memberCount) })}
        </p>
      </div>
    </li>
  );
}
