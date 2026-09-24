import { useCallback, useId, useMemo, useRef } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';

import { Glyph, GlyphSvg } from '@/components/glyph';
import { STARRED_GLYPHS } from '@/components/glyphs-starred';
import { LensPaginationFooter } from '@/components/lens-pagination-footer';
import { apiDeps } from '@/lib/api/deps';
import type { StarredPage } from '@/lib/api/starred-messages-cache';
import { STARRED_LIST_PAGE_SIZE, starredListInfiniteOptions } from '@/lib/api/starred-messages-list';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { loadMoreRootMargin, paginationStateOf, showsAllLoadedHint } from '@/lib/lens/pagination';
import { useOnline } from '@/lib/net/online';
import { starredRowModel, type StarredExcerpt, type StarredRowModel } from '@/lib/view/starred-row';
import { useLiveAnnouncer } from '@/lib/view/use-live-announcer';
import { starMessageAction } from '@/lib/view/use-message-star';
import { useLoadMoreSentinel } from '@/lib/view/use-load-more-sentinel';
import { useReaderLanguages } from '@/lib/view/use-reader';
import { useScrollportMemory } from '@/lib/view/use-scrollport-memory';
import { Link } from '@/routes/route-table';

/**
 * **LES MESSAGES FAVORIS** (#7286, second lot) — `/me/starred-messages`,
 * miroir de `StarredMessagesView.swift`, lu sur le contrat de #7377.
 *
 * **LA PORTE EST CELLE D'iOS** : Réglages › Outils, en PREMIÈRE rangée — d'où
 * le retour vers `/settings`. Le favori se POSE depuis « Plus… » dans le fil
 * (#7378) ; cet écran le RELIT.
 *
 * **UNE LIGNE** : l'auteur, la date du message, l'extrait (quatre lignes au
 * plus) dans la langue du LECTEUR (`starred-row.ts`, le Prisme à la lecture),
 * le nom de la conversation, et la barre à son accent. Un message protégé
 * est un PLACEHOLDER servi par le serveur : l'écran dit « Message protégé »
 * et n'invente rien.
 *
 * **LE TAP OUVRE LA CONVERSATION**, pas encore SUR le message : le fil web ne
 * sait pas s'ouvrir sur un message précis (la fenêtre `?around=` de la
 * passerelle n'y est pas câblée) — #7420. iOS, lui, pose le message à mettre
 * en évidence (`router.pendingHighlightMessageId`).
 *
 * **LE RETRAIT EST LE MÊME GESTE QUE DANS LE FIL** (`starMessageAction`) :
 * optimiste, la ligne part sur-le-champ et l'étoile du fil s'éteint, un refus
 * rend la ligne À SA PLACE. iOS retire par un menu contextuel (appui long) ;
 * le web montre l'étoile PLEINE en bouton — toucher une étoile pleine la
 * retire, sans geste caché, au clavier comme à la souris.
 *
 * **CE QUI N'EST PAS REPRIS D'iOS, ASSUMÉ** : « Tout retirer » — le contrat
 * n'a pas de retrait en bloc, et le rejouer message par message ferait N
 * appels pour un geste que personne n'a encore demandé sur le web.
 */

const HEADER_HEIGHT = 64;
const STARRED_ROW_HEIGHT_ESTIMATE = 128;

export function StarredMessagesHeader() {
  const language = currentInterfaceLanguage();
  return (
    <header className="flex shrink-0 items-center gap-2 px-3" style={{ height: HEADER_HEIGHT }}>
      <Link
        to="settings"
        aria-label={translate(language, 'starred.messages.back')}
        className="grid size-11 shrink-0 place-items-center rounded-chip focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ color: 'var(--color-ios-brand)', outlineColor: 'var(--color-ios-brand)' }}
      >
        <Glyph name="caretLeft" size={20} />
      </Link>
      <h1 className="min-w-0 flex-1 truncate text-screen font-bold" style={{ color: 'var(--color-ios-ink)' }}>
        {translate(language, 'starred.messages.title')}
      </h1>
    </header>
  );
}

/**
 * **L'ÉTAT VIDE APPREND LE GESTE** — le texte d'iOS (`starred.messages.empty.*`),
 * puis la porte du geste : les conversations. Aucun `role="alert"` : une liste
 * vide n'est pas une panne. Le glyphe est décoratif.
 */
export function StarredMessagesEmpty() {
  const language = currentInterfaceLanguage();
  return (
    <li data-starred-empty className="grid flex-1 content-center justify-items-center gap-3 px-6 text-center">
      <span aria-hidden="true" style={{ color: 'var(--color-warning)', opacity: 0.6 }}>
        <GlyphSvg glyph={STARRED_GLYPHS.star} size={44} />
      </span>
      <p className="text-body font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
        {translate(language, 'starred.messages.empty.title')}
      </p>
      <p className="max-w-xs text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
        {translate(language, 'starred.messages.empty.subtitle')}
      </p>
      <Link
        to="list"
        className="grid place-items-center rounded-chip px-5 text-body font-semibold text-white"
        style={{ backgroundColor: 'var(--color-ios-brand)', minHeight: 44 }}
      >
        {translate(language, 'starred.messages.empty.cta')}
      </Link>
    </li>
  );
}

/** À CACHE VIDE seulement — le hors-ligne dit autre chose que la panne, et la reprise reste offerte. */
export function StarredMessagesError({ online, onRetry }: { readonly online: boolean; readonly onRetry: () => void }) {
  const language = currentInterfaceLanguage();
  return (
    <li role="alert" data-starred-error className="grid flex-1 content-center justify-items-center gap-3 px-6 text-center">
      <span style={{ color: 'var(--color-error)' }}>
        <Glyph name="warningCircle" size={28} />
      </span>
      <p className="text-body font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
        {translate(language, online ? 'starred.messages.error.title' : 'feed.offline.title')}
      </p>
      <p className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
        {translate(language, online ? 'starred.messages.error.body' : 'starred.messages.offline.body')}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="grid place-items-center rounded-chip px-5 text-body font-semibold text-white"
        style={{ backgroundColor: 'var(--color-ios-brand)', minHeight: 44 }}
      >
        {translate(language, 'feed.retry')}
      </button>
    </li>
  );
}

/** Le squelette d'une ligne — seulement à CACHE VIDE (cache d'abord). */
export function StarredSkeleton({ count }: { readonly count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          aria-hidden="true"
          className="block animate-pulse rounded-[12px]"
          style={{ height: 96, backgroundColor: 'color-mix(in srgb, var(--color-ios-ink-3) 12%, transparent)' }}
        />
      ))}
    </>
  );
}

const MEDIA_LABEL = {
  image: 'starred.messages.media.image',
  video: 'starred.messages.media.video',
  audio: 'starred.messages.media.audio',
  file: 'starred.messages.media.file',
} as const;

const MEDIA_GLYPH = { image: 'image', video: 'image', audio: 'microphone', file: 'file' } as const;

function Excerpt({ excerpt }: { readonly excerpt: StarredExcerpt }) {
  const language = currentInterfaceLanguage();
  if (excerpt.kind === 'text') {
    return (
      <span data-starred-excerpt="text" lang={excerpt.language} className="line-clamp-4 whitespace-pre-line break-words text-body">
        {excerpt.text}
      </span>
    );
  }
  if (excerpt.kind === 'protected') {
    return (
      <span data-starred-excerpt="protected" className="flex items-center gap-1.5 text-body italic" style={{ color: 'var(--color-ios-ink-2)' }}>
        <Glyph name="lock" size={14} />
        {translate(language, 'starred.messages.protected')}
      </span>
    );
  }
  if (excerpt.kind === 'media') {
    return (
      <span data-starred-excerpt="media" className="flex items-center gap-1.5 text-body" style={{ color: 'var(--color-ios-ink-2)' }}>
        <Glyph name={MEDIA_GLYPH[excerpt.media]} size={14} />
        {translate(language, MEDIA_LABEL[excerpt.media])}
        {excerpt.extra > 0 ? <span className="font-semibold">{`+${excerpt.extra}`}</span> : null}
      </span>
    );
  }
  return (
    <span data-starred-excerpt="empty" className="text-body italic" style={{ color: 'var(--color-ios-ink-2)' }}>
      {translate(language, 'starred.messages.noText')}
    </span>
  );
}

/**
 * **LA LIGNE** — un LIEN (ouvrir la conversation) et un BOUTON (retirer), frères,
 * jamais imbriqués : un bouton dans un lien n'est ni du HTML valide ni un
 * contrôle qu'un lecteur d'écran sait annoncer.
 */
export function StarredMessageRow({ model, onRemove }: { readonly model: StarredRowModel; readonly onRemove: (model: StarredRowModel) => void }) {
  const language = currentInterfaceLanguage();
  const hintId = useId();
  const author = model.author ?? translate(language, 'common.unknown_user');
  return (
    <li
      data-starred-row={model.messageId}
      className="flex items-stretch rounded-[12px]"
      style={{
        backgroundColor: 'var(--color-ios-card)',
        border: `0.5px solid color-mix(in srgb, ${model.accent} 20%, transparent)`,
      }}
    >
      <Link
        to="thread"
        params={{ conversation: model.conversationId }}
        data-starred-open
        aria-describedby={hintId}
        className="flex min-w-0 flex-1 gap-3 p-3 text-start focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ color: 'var(--color-ios-ink)', outlineColor: 'var(--color-ios-brand)' }}
      >
        <span aria-hidden="true" data-starred-accent className="w-[3px] shrink-0 self-stretch rounded-full" style={{ backgroundColor: model.accent }} />
        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="flex items-baseline gap-2">
            <span className="min-w-0 flex-1 truncate text-caption font-semibold">{author}</span>
            <time dateTime={model.sentAt} className="shrink-0 text-mini" style={{ color: 'var(--color-ios-ink-2)' }}>
              {model.dateLabel}
            </time>
          </span>
          <Excerpt excerpt={model.excerpt} />
          <span className="flex min-w-0 items-center gap-1 text-mini font-medium" style={{ color: 'var(--color-ios-ink-2)' }}>
            <span aria-hidden="true" style={{ color: model.accent }}>
              <GlyphSvg glyph={STARRED_GLYPHS.chatsCircle} size={12} />
            </span>
            <span data-starred-conversation className="truncate">
              {model.conversationName}
            </span>
          </span>
        </span>
      </Link>
      <span id={hintId} className="sr-only">
        {translate(language, 'starred.messages.row.hint')}
      </span>
      <button
        type="button"
        data-starred-remove
        aria-label={translate(language, 'starred.messages.remove.a11y', { author })}
        onClick={() => onRemove(model)}
        className="grid w-11 shrink-0 place-items-start justify-center pt-3 focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ minHeight: 44, color: 'var(--color-warning)', outlineColor: 'var(--color-ios-brand)' }}
      >
        <GlyphSvg glyph={STARRED_GLYPHS.starFill} size={18} />
      </button>
    </li>
  );
}

const itemsOf = (data: { readonly pages: readonly StarredPage[] } | undefined) => (data?.pages ?? []).flatMap((page) => page.items);

export default function StarredMessagesScreen() {
  const frame = useRef<HTMLUListElement | null>(null);
  useScrollportMemory(frame);
  const language = currentInterfaceLanguage();
  const online = useOnline();
  const { languages: readerLanguages, locale } = useReaderLanguages();
  const { text: announcement, announce } = useLiveAnnouncer();

  const corpus = useInfiniteQuery(starredListInfiniteOptions(apiDeps));
  const items = itemsOf(corpus.data);
  /** CACHE D'ABORD : le squelette n'existe que pour un cache VIDE ; un corpus servi, même périmé, se peint sur-le-champ. */
  const loading = corpus.data === undefined && !corpus.isError;
  const paginationState = paginationStateOf(corpus);

  const models = useMemo(
    () => items.map((item) => starredRowModel(item, { preferredLanguages: readerLanguages, locale })),
    [items, readerLanguages, locale],
  );

  const onRemove = useCallback(
    (model: StarredRowModel) => {
      void starMessageAction({ id: model.messageId, conversationId: model.conversationId }, false).then((result) => {
        if (result.message !== undefined) announce(translate(currentInterfaceLanguage(), result.message));
      });
    },
    [announce],
  );

  const { observe: observeTail } = useLoadMoreSentinel({
    root: frame,
    rootMargin: loadMoreRootMargin(STARRED_ROW_HEIGHT_ESTIMATE),
    enabled: paginationState === 'idle' && items.length > 0,
    onReach: () => void corpus.fetchNextPage(),
  });

  return (
    <div className="flex h-dvh flex-col overflow-hidden pt-safe">
      <StarredMessagesHeader />
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <ul
        ref={frame}
        id="contenu"
        className="scrollbar-none overscroll-contain flex flex-1 flex-col gap-2.5 overflow-y-auto px-4 pt-1 pb-safe"
        {...(loading ? { 'aria-busy': true, 'aria-label': translate(language, 'starred.messages.loading') } : {})}
      >
        {corpus.data === undefined && corpus.isError ? (
          <StarredMessagesError online={online} onRetry={() => void corpus.refetch()} />
        ) : loading ? (
          <li className="flex flex-col gap-2.5">
            <StarredSkeleton count={3} />
          </li>
        ) : items.length === 0 ? (
          <StarredMessagesEmpty />
        ) : (
          <>
            {models.map((model) => (
              <StarredMessageRow key={model.messageId} model={model} onRemove={onRemove} />
            ))}
            <LensPaginationFooter
              state={paginationState}
              showsAllLoadedHint={showsAllLoadedHint(items.length, STARRED_LIST_PAGE_SIZE)}
              exhaustedLabel={translate(language, 'starred.messages.allLoaded')}
              loadingMoreContent={<StarredSkeleton count={1} />}
              onRetry={() => void corpus.fetchNextPage()}
              sentinelRef={observeTail}
            />
          </>
        )}
      </ul>
    </div>
  );
}
