import { useInfiniteQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useRef, useState } from 'react';

import { MediaHubRow, MediaTile, ROW_MIN_HEIGHT, TILE_MIN_SIDE, type ItemHosts } from '@/components/conversation-media-hub-items';
import { BRAND, INK, INK2 } from '@/components/admin/tone';
import type { AdminDeps } from '@/lib/api/admin';
import {
  ADMIN_MEDIA_KINDS,
  adminConversationMediaQueryKey,
  loadAdminSovereignMedia,
  nextAdminMediaCursor,
  type AdminMediaKind,
} from '@/lib/api/admin-conversations';
import { unwrap } from '@/lib/api/client';
import { translateAdmin, type AdminLanguage, type AdminPlainCatalogKey } from '@/lib/i18n-admin-catalog';
import { paginationStateOf, type ListPaginationState } from '@/lib/lens/pagination';
import type { MediaHubAttachmentItem } from '@/lib/view/media-hub';
import { useLoadMoreSentinel } from '@/lib/view/use-load-more-sentinel';

/**
 * **LES MÉDIAS TRANSMIS, DANS LA LECTURE SOUVERAINE** (#11457, puis #11510).
 *
 * ## Une route DÉDIÉE, plus les pages du fil
 *
 * La première forme de cet onglet tirait ses pièces des pages de messages déjà lues
 * et remontait le fil pour trouver les plus anciennes : sur une conversation de
 * milliers de messages pauvre en médias, beaucoup de pages — chacune une lecture
 * journalisée — pour quelques vignettes. Il lit désormais
 * `GET /admin/conversations/:id/attachments` (#11510) : les pièces seules, au
 * curseur, filtrées par genre, sous LA MÊME projection de protection que le fil
 * (`sovereign-message-projection.ts`, prédicats appelés et non recopiés) et sous le
 * même motif consigné — une ligne d'audit par page de pièces.
 *
 * ## Ce qui s'y peint, et ce qui n'y entre pas
 *
 * Une pièce MASQUÉE (vue unique, floutée, à effets) garde son voile : `MediaTile` et
 * `Attachments` lisent `maskedAttachment`, la loi partagée — et le décodeur a déjà
 * retiré tout ce que la charge pouvait porter en trop. Une pièce RETENUE par son
 * message (chiffré, à vue unique, expiré) n'entre pas : le fil en dit le constat.
 *
 * ## Le genre est une REQUÊTE, pas un tri local
 *
 * Les puces de genre interrogent la route avec `kind=` : filtrer les fichiers d'une
 * conversation qui a surtout des photos ne doit pas coûter de parcourir les photos.
 *
 * ## Un geste par élément, et il mène au FIL
 *
 * Toucher une vignette ramène au message qui la porte — l'hôte remonte le fil
 * jusqu'à lui s'il n'est pas encore chargé. Un vocal se joue et un fichier s'ouvre
 * sur place, par les lecteurs du fil.
 */
type Group = { readonly kind: AdminMediaKind; readonly title: AdminPlainCatalogKey };

const GROUPS: readonly Group[] = [
  { kind: 'visual', title: 'admin.conversation.reading.media.visual' },
  { kind: 'audio', title: 'admin.conversation.reading.media.audio' },
  { kind: 'document', title: 'admin.conversation.reading.media.document' },
  { kind: 'contact', title: 'admin.conversation.reading.media.contact' },
];

const KIND_LABEL: Readonly<Record<AdminMediaKind, AdminPlainCatalogKey>> = {
  visual: 'admin.conversation.reading.media.visual',
  audio: 'admin.conversation.reading.media.audio',
  document: 'admin.conversation.reading.media.document',
  contact: 'admin.conversation.reading.media.contact',
};

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2';
const EMPTY_ITEMS: readonly MediaHubAttachmentItem[] = [];

/**
 * LA PELLICULE D'UNE CONVERSATION, PAGE PAR PAGE. `gcTime: 0` et une clé sous le
 * préfixe souverain : rien n'en persiste sur le poste (voir `admin-conversations.ts`).
 * Avant la première page, l'état est « en lecture » ; un échec de la première page
 * se réessaie en la relisant, un échec de page suivante en la redemandant.
 */
export function useAdminSovereignMedia({
  conversationId,
  kind,
  reason,
  deps,
  enabled,
}: {
  readonly conversationId: string;
  readonly kind: AdminMediaKind | null;
  readonly reason: string | null;
  readonly deps: AdminDeps;
  readonly enabled: boolean;
}) {
  const query = useInfiniteQuery({
    queryKey: adminConversationMediaQueryKey(conversationId, kind),
    queryFn: async ({ pageParam, signal }) =>
      unwrap(await loadAdminSovereignMedia({ ...deps, conversationId, cursor: pageParam, kind, reason, signal })),
    initialPageParam: null as string | null,
    getNextPageParam: nextAdminMediaCursor,
    enabled,
    retry: false,
    gcTime: 0,
  });

  const items = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? EMPTY_ITEMS, [query.data]);
  const state: ListPaginationState =
    query.data === undefined
      ? query.isError
        ? 'error'
        : 'loading-more'
      : paginationStateOf({
          hasNextPage: query.hasNextPage,
          isFetchingNextPage: query.isFetchingNextPage,
          isFetchNextPageError: query.isFetchNextPageError,
        });

  const { fetchNextPage, refetch, data } = query;
  const loadMore = useCallback(() => {
    if (data === undefined) void refetch();
    else void fetchNextPage({ cancelRefetch: false });
  }, [data, fetchNextPage, refetch]);

  return { items, state, loadMore };
}

export function AdminConversationReadingMedia({
  conversationId,
  reason,
  deps,
  enabled,
  language,
  readerLanguages,
  viewerId,
  onShowInThread,
}: {
  readonly conversationId: string;
  /** Le motif VALIDÉ, figé — `null` pour le rang souverain, qui lit sans motif. */
  readonly reason: string | null;
  readonly deps: AdminDeps;
  readonly enabled: boolean;
  readonly language: AdminLanguage;
  readonly readerLanguages: readonly string[];
  readonly viewerId: string;
  readonly onShowInThread: (messageId: string) => void;
}) {
  const scroller = useRef<HTMLDivElement | null>(null);
  const [kind, setKind] = useState<AdminMediaKind | null>(null);
  const { items, state, loadMore } = useAdminSovereignMedia({ conversationId, kind, reason, deps, enabled });

  const groups = useMemo(
    () => GROUPS.map((group) => ({ ...group, items: items.filter((item) => item.kind === group.kind) })).filter((group) => group.items.length > 0),
    [items],
  );
  const sentinel = useLoadMoreSentinel({
    root: scroller,
    rootMargin: '0px 0px 480px 0px',
    enabled: state === 'idle',
    onReach: loadMore,
  });

  const hosts: ItemHosts = { language, languages: readerLanguages, viewerId, accent: BRAND, onJumpToMessage: onShowInThread };
  const messageOf = (candidates: readonly MediaHubAttachmentItem[], key: string): string | undefined =>
    candidates.find((item) => item.key === key)?.messageId;

  const chip = (selected: boolean) => ({
    minHeight: 36,
    outlineColor: BRAND,
    color: selected ? 'var(--color-ios-on-brand)' : INK,
    backgroundColor: selected ? BRAND : 'var(--color-ios-surface)',
    border: selected ? '1px solid transparent' : '1px solid var(--color-edge)',
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-admin-reading-media style={{ ['--accent' as string]: BRAND }}>
      <div role="group" aria-label={translateAdmin(language, 'admin.conversation.reading.media.kinds')} className="flex shrink-0 flex-wrap gap-2 pb-2">
        <button
          type="button"
          aria-pressed={kind === null}
          data-admin-reading-media-kind="all"
          onClick={() => setKind(null)}
          className={`rounded-chip px-3 text-caption font-semibold ${FOCUS}`}
          style={chip(kind === null)}
        >
          {translateAdmin(language, 'admin.conversation.reading.media.kind.all')}
        </button>
        {ADMIN_MEDIA_KINDS.map((candidate) => (
          <button
            key={candidate}
            type="button"
            aria-pressed={kind === candidate}
            data-admin-reading-media-kind={candidate}
            onClick={() => setKind(candidate)}
            className={`rounded-chip px-3 text-caption font-semibold ${FOCUS}`}
            style={chip(kind === candidate)}
          >
            {translateAdmin(language, KIND_LABEL[candidate])}
          </button>
        ))}
      </div>

      <div ref={scroller} className="flex min-h-0 flex-1 flex-col overflow-y-auto" data-admin-reading-media-scroller>
        {groups.map((group) => (
          <section key={group.kind} className="grid gap-2 pb-4" data-admin-reading-media-group={group.kind}>
            <h3 className="text-caption font-semibold" style={{ color: INK2 }}>
              {translateAdmin(language, group.title)} · {group.items.length}
            </h3>
            {group.kind === 'visual' ? (
              <ul className="grid px-0.5" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${TILE_MIN_SIDE}px, 1fr))`, gap: 2 }}>
                {group.items.map((item) => (
                  <MediaTile
                    key={item.key}
                    item={item}
                    language={language}
                    onOpen={(key) => {
                      const messageId = messageOf(group.items, key);
                      if (messageId !== undefined) onShowInThread(messageId);
                    }}
                  />
                ))}
              </ul>
            ) : (
              <ul>
                {group.items.map((item) => (
                  <MediaHubRow key={item.key} item={item} hosts={hosts} />
                ))}
              </ul>
            )}
          </section>
        ))}

        {groups.length === 0 && state === 'exhausted' ? (
          <p className="px-4 py-8 text-center text-body" style={{ color: INK2 }} data-admin-reading-media-empty>
            {translateAdmin(language, 'admin.conversation.reading.media.empty')}
          </p>
        ) : null}

        {state === 'error' ? (
          <div className="flex justify-center px-4 py-4" role="alert">
            <button
              type="button"
              onClick={loadMore}
              data-admin-reading-media-retry
              className={`rounded-chip px-4 text-body font-semibold ${FOCUS}`}
              style={{ minHeight: 44, color: INK, backgroundColor: 'var(--color-ios-surface)', border: '1px solid var(--color-edge)', outlineColor: BRAND }}
            >
              {translateAdmin(language, 'admin.conversation.reading.media.retry')}
            </button>
          </div>
        ) : state === 'exhausted' ? null : (
          <div ref={sentinel.observe} className="flex justify-center py-4" style={{ minHeight: ROW_MIN_HEIGHT }} data-admin-reading-media-more={state}>
            {state === 'loading-more' ? (
              <span role="status" className="text-caption" style={{ color: INK2 }}>
                {translateAdmin(language, 'admin.conversation.reading.media.loading')}
              </span>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
