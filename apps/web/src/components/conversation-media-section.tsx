import { lazy, Suspense, useId, useRef, useState } from 'react';

import type { ConversationsDeps } from '@/lib/api/conversations';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { useMediaHubIndex } from '@/lib/view/use-media-hub-index';
import { useReaderLanguages } from '@/lib/view/use-reader';

import { MediaTile, TILE_MIN_SIDE } from './conversation-media-hub-items';
import { Glyph } from './glyph';
import { MediaHubViewerHost } from './media-hub-viewer-host';

/**
 * L'ÉCRAN « MÉDIAS, LIENS ET DOCUMENTS », À LA DEMANDE (#8103) — la feuille de
 * détails ne paie ni ses segments, ni ses rangées, ni sa recherche tant qu'on
 * ne touche pas « Tout voir » (`budgets.json › conversation_media_hub`).
 */
const ConversationMediaHub = lazy(() => import('./conversation-media-hub').then((m) => ({ default: m.ConversationMediaHub })));

/** Les vignettes de l'aperçu — une rangée, les plus récentes d'abord. */
export const PREVIEW_TILES = 4;

/**
 * LA SECTION « MÉDIAS » DE LA FEUILLE DE DÉTAILS (#7834, #8103) — miroir de
 * l'onglet Médias de `ConversationInfoSheet.swift` : les dernières photos et
 * vidéos de la conversation, lues sur l'index SERVEUR (la même clé de cache
 * que la grille de l'écran complet — l'ouvrir ensuite ne recharge rien), puis
 * l'entrée vers l'écran complet, qui porte les sept genres et la recherche.
 *
 * Toucher une vignette ouvre la visionneuse conversation-entière (#6303),
 * posée DANS le `<dialog>` de la feuille (couche supérieure).
 */
export function ConversationMediaSection({
  conversationId,
  viewerId,
  accent,
  deps,
  onJumpToMessage,
  canJumpTo,
}: {
  readonly conversationId: string;
  readonly viewerId: string;
  readonly accent: string;
  readonly deps: ConversationsDeps;
  readonly onJumpToMessage?: ((messageId: string) => void) | undefined;
  readonly canJumpTo?: ((messageId: string) => boolean) | undefined;
}) {
  const language = currentInterfaceLanguage();
  const { languages } = useReaderLanguages();
  const headingId = useId();
  const sectionRef = useRef<HTMLElement | null>(null);
  const { query, items } = useMediaHubIndex({ deps, conversationId, kind: 'visual', term: null });
  const [hubOpen, setHubOpen] = useState(false);
  const [openedKey, setOpenedKey] = useState<string | null>(null);
  const preview = (items ?? []).slice(0, PREVIEW_TILES);

  return (
    <section ref={sectionRef} aria-labelledby={headingId} className="pb-6" data-conversation-details-media>
      <h4 id={headingId} className="px-4 pb-2 text-caption font-semibold uppercase" style={{ color: 'var(--color-ios-ink-2)' }}>
        {translate(language, 'conversation.details.media.section')}
      </h4>

      {items === undefined && query.isPending ? (
        <div aria-busy className="grid px-4" style={{ gridTemplateColumns: `repeat(${PREVIEW_TILES}, minmax(0, 1fr))`, gap: 2 }} data-conversation-details-media-loading>
          <span className="offscreen">{translate(language, 'media_hub.loading')}</span>
          {Array.from({ length: PREVIEW_TILES }, (_, index) => (
            <span key={index} aria-hidden style={{ aspectRatio: '1 / 1', backgroundColor: 'var(--color-ios-card)' }} />
          ))}
        </div>
      ) : preview.length > 0 ? (
        <ul className="grid px-4" style={{ gridTemplateColumns: `repeat(${PREVIEW_TILES}, minmax(0, ${TILE_MIN_SIDE}px))`, gap: 2 }} data-conversation-details-media-strip>
          {preview.map((item) => (item.kind === 'visual' ? <MediaTile key={item.key} item={item} language={language} onOpen={setOpenedKey} /> : null))}
        </ul>
      ) : query.isError && items === undefined ? (
        <p role="alert" className="px-4 pb-2 text-caption" style={{ color: 'var(--color-ios-ink-2)' }} data-conversation-details-media-error>
          {translate(language, 'media_hub.error')}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => setHubOpen(true)}
        data-conversation-details-media-open
        className="mt-2 flex w-full items-center gap-3 px-4 text-left"
        style={{ minHeight: 44, color: 'var(--color-ios-ink)' }}
      >
        <Glyph name="image" size={20} style={{ color: 'var(--accent)' }} />
        <span className="flex-1 text-body font-medium">{translate(language, 'conversation.details.media.open')}</span>
        <span className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
          {translate(language, 'conversation.details.media.more')}
        </span>
        <Glyph name="caretDown" size={14} style={{ color: 'var(--color-ios-ink-3)', transform: 'rotate(-90deg)' }} />
      </button>

      {openedKey !== null && items !== undefined ? (
        <MediaHubViewerHost
          items={items}
          openedKey={openedKey}
          viewerId={viewerId}
          languages={languages}
          canExtend={query.hasNextPage === true && !query.isFetchingNextPage}
          onExtend={() => void query.fetchNextPage()}
          onClose={() => setOpenedKey(null)}
          deps={deps}
          container={sectionRef.current?.closest('dialog') ?? null}
        />
      ) : null}

      {hubOpen ? (
        <Suspense fallback={null}>
          <ConversationMediaHub
            conversationId={conversationId}
            viewerId={viewerId}
            accent={accent}
            deps={deps}
            onClose={() => setHubOpen(false)}
            {...(onJumpToMessage === undefined ? {} : { onJumpToMessage })}
            {...(canJumpTo === undefined ? {} : { canJumpTo })}
          />
        </Suspense>
      ) : null}
    </section>
  );
}
