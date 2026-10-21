import { useMemo, useRef } from 'react';

import { MediaHubRow, MediaTile, ROW_MIN_HEIGHT, TILE_MIN_SIDE, type ItemHosts } from '@/components/conversation-media-hub-items';
import { BRAND, INK, INK2 } from '@/components/admin/tone';
import type { Message } from '@/lib/api/types';
import { translateAdmin, type AdminLanguage, type AdminPlainCatalogKey } from '@/lib/i18n-admin-catalog';
import type { ListPaginationState } from '@/lib/lens/pagination';
import { itemsOfKind, type MediaHubItem } from '@/lib/view/media-hub';
import { useLoadMoreSentinel } from '@/lib/view/use-load-more-sentinel';

/**
 * **LES MÉDIAS TRANSMIS, DANS LA LECTURE SOUVERAINE** (#11457, demande porteur
 * 2026-10-21 : « afficher les médias transmis »).
 *
 * ## Les pages DÉJÀ LUES, jamais une seconde porte
 *
 * L'index de médias du produit (`conversation-media-hub.ts`) est une route de MEMBRE,
 * mise en cache sur le disque : l'administration n'y a ni accès ni droit. Les médias
 * se tirent donc des pages que la lecture souveraine a servies — la MÊME requête,
 * sous le MÊME motif consigné, déjà passée par la projection de protection de la
 * passerelle (`sovereign-message-projection.ts`). Aucune surface serveur de plus,
 * aucune trace de plus à tenir.
 *
 * ## Ce qui n'y entre pas
 *
 * - un message dont la passerelle a RETENU le contenu (`protectedIds`) : le fil en
 *   dit le constat, la pellicule ne le contourne pas ;
 * - ce que `itemsOfKind` écarte déjà pour le produit — la vue unique, l'autocollant.
 *
 * Une pièce MASQUÉE (floutée, à effets) garde son voile : `MediaTile` et `Attachments`
 * lisent `maskedAttachment`, la loi partagée.
 *
 * ## Un geste par élément, et il mène au FIL
 *
 * Toucher une vignette ramène au message qui la porte : la visionneuse du produit
 * offre réagir, répondre et partager — des gestes qu'on ne fait pas au nom d'un
 * membre. Un vocal se joue et un fichier s'ouvre sur place, par les lecteurs du fil.
 *
 * ## Elle remonte le temps comme le fil
 *
 * La pellicule va du plus récent au plus ancien ; une prise posée au PIED demande la
 * page de messages plus ancienne quand elle entre dans la vue — la même requête
 * infinie que le fil, donc la même pagination, sans double chargement.
 */
type Group = { readonly kind: 'visual' | 'audio' | 'document'; readonly title: AdminPlainCatalogKey };

const GROUPS: readonly Group[] = [
  { kind: 'visual', title: 'admin.conversation.reading.media.visual' },
  { kind: 'audio', title: 'admin.conversation.reading.media.audio' },
  { kind: 'document', title: 'admin.conversation.reading.media.document' },
];

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2';

export function AdminConversationReadingMedia({
  messages,
  protectedIds,
  language,
  readerLanguages,
  viewerId,
  state,
  onLoadOlder,
  onShowInThread,
}: {
  /** Le fil recousu, ASCENDANT (l'ordre du fil). */
  readonly messages: readonly Message[];
  readonly protectedIds: ReadonlySet<string>;
  readonly language: AdminLanguage;
  readonly readerLanguages: readonly string[];
  readonly viewerId: string;
  readonly state: ListPaginationState;
  readonly onLoadOlder: () => void;
  readonly onShowInThread: (messageId: string) => void;
}) {
  const scroller = useRef<HTMLDivElement | null>(null);
  const served = useMemo(() => [...messages].reverse().filter((message) => !protectedIds.has(message.id)), [messages, protectedIds]);
  const groups = useMemo(
    () => GROUPS.map((group) => ({ ...group, items: itemsOfKind(served, group.kind) })).filter((group) => group.items.length > 0),
    [served],
  );
  const sentinel = useLoadMoreSentinel({
    root: scroller,
    rootMargin: '0px 0px 480px 0px',
    enabled: state === 'idle',
    onReach: onLoadOlder,
  });

  const hosts: ItemHosts = { language, languages: readerLanguages, viewerId, accent: BRAND, onJumpToMessage: onShowInThread };
  const messageOf = (items: readonly MediaHubItem[], key: string): string | undefined => items.find((item) => item.key === key)?.messageId;

  return (
    <div
      ref={scroller}
      className="flex min-h-0 flex-1 flex-col overflow-y-auto"
      data-admin-reading-media
      style={{ ['--accent' as string]: BRAND }}
    >
      {groups.map((group) => (
        <section key={group.kind} className="grid gap-2 pb-4" data-admin-reading-media-group={group.kind}>
          <h3 className="text-caption font-semibold" style={{ color: INK2 }}>
            {translateAdmin(language, group.title)} · {group.items.length}
          </h3>
          {group.kind === 'visual' ? (
            <ul className="grid px-0.5" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${TILE_MIN_SIDE}px, 1fr))`, gap: 2 }}>
              {group.items.map((item) =>
                item.kind === 'visual' ? (
                  <MediaTile
                    key={item.key}
                    item={item}
                    language={language}
                    onOpen={(key) => {
                      const messageId = messageOf(group.items, key);
                      if (messageId !== undefined) onShowInThread(messageId);
                    }}
                  />
                ) : null,
              )}
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
            onClick={onLoadOlder}
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
  );
}
