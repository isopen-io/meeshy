import { useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';

import { mediaHubSearchTerm } from '@/lib/api/conversation-media-hub';
import type { ConversationsDeps } from '@/lib/api/conversations';
import { translate, type InterfaceCatalogKey } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { useOnline } from '@/lib/net/online';
import { MEDIA_HUB_KINDS, itemsOfKind, type MediaHubKind } from '@/lib/view/media-hub';
import { useLoadMoreSentinel } from '@/lib/view/use-load-more-sentinel';
import { useDebouncedValue, useMediaHubIndex } from '@/lib/view/use-media-hub-index';
import { useReaderLanguages } from '@/lib/view/use-reader';

import { MediaHubRow, MediaTile, ROW_MIN_HEIGHT, TILE_MIN_SIDE, type ItemHosts } from './conversation-media-hub-items';
import { MediaHubViewerHost } from './media-hub-viewer-host';
import { Sheet } from './sheet';

/**
 * **L'ÉCRAN « MÉDIAS, LIENS ET DOCUMENTS » D'UNE CONVERSATION (#8103)** —
 * miroir de l'onglet Médias de `ConversationInfoSheet.swift`, étendu aux sept
 * genres de l'index serveur (#8098) : Médias (grille) · Audio · Documents ·
 * Liens · Contacts · Conversations · Lieux.
 *
 * - L'index vient de la PASSERELLE, jamais des seuls messages en mémoire : un
 *   historique jamais chargé dans le fil s'y feuillette quand même
 *   (`conversation-media-hub.ts`, paginé par `before`).
 * - CACHE D'ABORD : un segment déjà vu se peint depuis le cache, sans
 *   squelette, et se revalide en fond ; le squelette ne vient que sur un
 *   segment jamais chargé. Hors ligne, ce qui a été vu reste affiché.
 * - La RECHERCHE porte sur le segment courant (contenu, nom de fichier),
 *   attend que la frappe se pose (`SEARCH_DEBOUNCE_MS`), et la requête du
 *   terme abandonné est annulée ; pendant la frappe, les résultats du terme
 *   précédent restent à l'écran plutôt qu'un squelette.
 * - Défilement infini PARESSEUX : une sentinelle en bas de liste demande la
 *   page suivante ; toucher une vignette ouvre la visionneuse sur l'index
 *   visuel ENTIER (#6303), qui s'étend quand on approche du bout.
 */
export const SEARCH_DEBOUNCE_MS = 300;

type KindKey = Extract<InterfaceCatalogKey, `media_hub.kind.${string}`>;

const KIND_KEYS: Readonly<Record<MediaHubKind, KindKey>> = {
  visual: 'media_hub.kind.visual',
  audio: 'media_hub.kind.audio',
  document: 'media_hub.kind.document',
  link: 'media_hub.kind.link',
  contact: 'media_hub.kind.contact',
  conversation: 'media_hub.kind.conversation',
  location: 'media_hub.kind.location',
};

export function ConversationMediaHub({
  conversationId,
  viewerId,
  accent,
  deps,
  onClose,
  onJumpToMessage,
  canJumpTo,
}: {
  readonly conversationId: string;
  readonly viewerId: string;
  readonly accent: string;
  readonly deps: ConversationsDeps;
  readonly onClose: () => void;
  readonly onJumpToMessage?: ((messageId: string) => void) | undefined;
  readonly canJumpTo?: ((messageId: string) => boolean) | undefined;
}) {
  const language = currentInterfaceLanguage();
  const { languages } = useReaderLanguages();
  const online = useOnline();
  const [kind, setKind] = useState<MediaHubKind>('visual');
  const [search, setSearch] = useState('');
  const settled = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);
  const term = mediaHubSearchTerm(settled);
  const { query, items } = useMediaHubIndex({ deps, conversationId, kind, term });
  const [openedKey, setOpenedKey] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const canLoadMore = query.hasNextPage === true && !query.isFetchingNextPage && !query.isFetchNextPageError && online;
  const sentinel = useLoadMoreSentinel({
    root: scrollRef,
    rootMargin: '0px 0px 480px 0px',
    enabled: canLoadMore,
    onReach: () => void query.fetchNextPage(),
  });

  const segmentLabel = translate(language, KIND_KEYS[kind]);
  const hosts: ItemHosts = {
    language,
    languages,
    viewerId,
    accent,
    deps,
    canJumpTo,
    onJumpToMessage:
      onJumpToMessage === undefined
        ? undefined
        : (messageId) => {
            onClose();
            onJumpToMessage(messageId);
          },
  };

  return (
    <Sheet
      title={translate(language, 'media_hub.title')}
      bodyAs="div"
      onClose={onClose}
      search={search}
      onSearchChange={setSearch}
      searchLabel={translate(language, 'media_hub.search.label', { segment: segmentLabel })}
      searchPlaceholder={translate(language, 'media_hub.search.placeholder')}
    >
      <SegmentBar kind={kind} onSelect={setKind} language={language} />
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto" data-media-hub={kind} aria-busy={query.isFetching}>
        {!online && items !== undefined ? (
          <p role="status" className="px-4 py-2 text-caption" style={{ color: 'var(--color-ios-ink-2)' }} data-media-hub-offline>
            {translate(language, 'media_hub.offline')}
          </p>
        ) : null}
        <HubBody
          kind={kind}
          items={items}
          term={term}
          online={online}
          failed={query.isError && items === undefined}
          onRetry={() => void query.refetch()}
          segmentLabel={segmentLabel}
          hosts={hosts}
          onOpen={setOpenedKey}
        />
        {query.isFetchNextPageError ? (
          <div role="alert" className="flex flex-col items-center gap-2 px-4 py-4 text-center" data-media-hub-more-error>
            <p className="text-body" style={{ color: 'var(--color-ios-ink-2)' }}>
              {translate(language, 'media_hub.more_error')}
            </p>
            <button type="button" onClick={() => void query.fetchNextPage()} className="rounded-chip px-4 font-semibold" style={{ minHeight: 44, color: 'var(--accent)' }}>
              {translate(language, 'media_hub.retry')}
            </button>
          </div>
        ) : null}
        {query.hasNextPage === true && items !== undefined ? (
          <div ref={sentinel.observe} data-media-hub-sentinel className="flex justify-center py-4" style={{ minHeight: ROW_MIN_HEIGHT }}>
            {query.isFetchingNextPage ? (
              <span className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
                {translate(language, 'media_hub.loading')}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
      {openedKey !== null && items !== undefined ? (
        <MediaHubViewerHost
          items={items}
          openedKey={openedKey}
          viewerId={viewerId}
          languages={languages}
          canExtend={canLoadMore}
          onExtend={() => void query.fetchNextPage()}
          onClose={() => setOpenedKey(null)}
          deps={deps}
          container={scrollRef.current?.closest('dialog') ?? null}
        />
      ) : null}
    </Sheet>
  );
}

/**
 * LE CHOIX DU GENRE — une liste d'onglets (`role="tablist"`), flèches pour
 * passer d'un onglet à l'autre, un seul arrêt de tabulation (`tabIndex`
 * itinérant), cibles de 44 px.
 */
function SegmentBar({
  kind,
  onSelect,
  language,
}: {
  readonly kind: MediaHubKind;
  readonly onSelect: (kind: MediaHubKind) => void;
  readonly language: ReturnType<typeof currentInterfaceLanguage>;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    const current = MEDIA_HUB_KINDS.indexOf(kind);
    const rtl = document.documentElement.dir === 'rtl';
    const step = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1, Home: -current, End: MEDIA_HUB_KINDS.length - 1 - current }[event.key];
    if (step === undefined) return;
    event.preventDefault();
    const next = (current + step + MEDIA_HUB_KINDS.length) % MEDIA_HUB_KINDS.length;
    const target = MEDIA_HUB_KINDS[next];
    if (target === undefined) return;
    onSelect(target);
    refs.current[next]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={translate(language, 'media_hub.segments.label')}
      onKeyDown={onKeyDown}
      className="flex shrink-0 gap-2 overflow-x-auto px-4 pb-2"
      data-media-hub-segments
    >
      {MEDIA_HUB_KINDS.map((candidate, index) => {
        const selected = candidate === kind;
        return (
          <button
            key={candidate}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            data-media-hub-segment={candidate}
            onClick={() => onSelect(candidate)}
            className="shrink-0 rounded-chip px-4 text-body font-semibold"
            style={{
              minHeight: 44,
              color: selected ? 'white' : 'var(--color-ios-ink)',
              backgroundColor: selected ? 'var(--accent)' : 'var(--color-ios-card)',
            }}
          >
            {translate(language, KIND_KEYS[candidate])}
          </button>
        );
      })}
    </div>
  );
}

function HubBody({
  kind,
  items,
  term,
  online,
  failed,
  onRetry,
  segmentLabel,
  hosts,
  onOpen,
}: {
  readonly kind: MediaHubKind;
  readonly items: ReturnType<typeof itemsOfKind> | undefined;
  readonly term: string | null;
  readonly online: boolean;
  readonly failed: boolean;
  readonly onRetry: () => void;
  readonly segmentLabel: string;
  readonly hosts: ItemHosts;
  readonly onOpen: (key: string) => void;
}) {
  const { language } = hosts;
  const note = (text: string, marker: string, role?: 'status' | 'alert') => (
    <p {...(role === undefined ? {} : { role })} className="px-4 py-8 text-center text-body" style={{ color: 'var(--color-ios-ink-2)' }} {...{ [marker]: '' }}>
      {text}
    </p>
  );

  if (items === undefined && failed) {
    return (
      <div role="alert" className="flex flex-col items-center gap-2 px-4 py-8 text-center" data-media-hub-error>
        <p className="text-body" style={{ color: 'var(--color-ios-ink-2)' }}>
          {translate(language, 'media_hub.error')}
        </p>
        <button type="button" onClick={onRetry} className="rounded-chip px-4 font-semibold" style={{ minHeight: 44, color: 'var(--accent)' }}>
          {translate(language, 'media_hub.retry')}
        </button>
      </div>
    );
  }
  if (items === undefined && !online) return note(translate(language, 'media_hub.offline_empty'), 'data-media-hub-offline-empty', 'status');
  if (items === undefined) return <HubSkeleton kind={kind} label={translate(language, 'media_hub.loading')} />;
  if (items.length === 0) {
    return term === null
      ? note(translate(language, 'media_hub.empty', { segment: segmentLabel }), 'data-media-hub-empty')
      : note(translate(language, 'media_hub.empty_search', { query: term }), 'data-media-hub-empty');
  }
  if (kind === 'visual') {
    return (
      <ul
        className="grid px-0.5"
        style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${TILE_MIN_SIDE}px, 1fr))`, gap: 2 }}
        data-media-hub-grid
      >
        {items.map((item) =>
          item.kind === 'visual' ? <MediaTile key={item.key} item={item} language={language} onOpen={onOpen} /> : null,
        )}
      </ul>
    );
  }
  return (
    <ul data-media-hub-list>
      {items.map((item) => (
        <MediaHubRow key={item.key} item={item} hosts={hosts} />
      ))}
    </ul>
  );
}

function HubSkeleton({ kind, label }: { readonly kind: MediaHubKind; readonly label: string }) {
  return (
    <div aria-busy data-media-hub-loading>
      <p className="offscreen">{label}</p>
      {kind === 'visual' ? (
        <div aria-hidden className="grid px-0.5" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${TILE_MIN_SIDE}px, 1fr))`, gap: 2 }}>
          {Array.from({ length: 12 }, (_, index) => (
            <span key={index} style={{ aspectRatio: '1 / 1', backgroundColor: 'var(--color-ios-card)' }} />
          ))}
        </div>
      ) : (
        <div aria-hidden>
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="flex items-center gap-3 px-4" style={{ minHeight: ROW_MIN_HEIGHT }}>
              <span className="shrink-0 rounded-field" style={{ width: 40, height: 40, backgroundColor: 'var(--color-ios-card)' }} />
              <span className="rounded-field" style={{ width: '55%', height: 14, backgroundColor: 'var(--color-ios-card)' }} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
