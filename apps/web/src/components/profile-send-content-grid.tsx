import { memo, useCallback, useEffect, useRef, type CSSProperties, type ReactNode } from 'react';

import type { FeedPost } from '@/lib/api/feed-pages';
import { attachmentSrc } from '@/lib/api/media-url';
import { contentCardModelOf, type ContentCardMedia, type ContentCardModel, type ContentCardPage } from '@/lib/feed/content-card';
import { useIsActiveScene, type FeedAutoplayStoreApi } from '@/lib/feed/use-feed-autoplay';
import { translate } from '@/lib/i18n-catalog';
import { translateCircles } from '@/lib/i18n-circles-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { mediaImageCrossOrigin } from '@/lib/net/api-runtime-cache';
import { SEND_CONTENT_COLUMNS, inlineVideoOf, sendContentCardRatio, type SendContentKind } from '@/lib/profile/send-content';

import { FeedCarouselChrome } from './feed-carousel-chrome';
import { FeedSceneSurface } from './feed-scene-surface';
import { Glyph } from './glyph';
import { useSnapPager } from './use-snap-pager';

/**
 * **LA GRILLE DE « LUI ENVOYER UN CONTENU »** (#20245, référence `ProfileSendContentGrid.swift`) — trois
 * cartes larges par ligne, défilement vertical. Chaque carte peint ce que la carte d'un contenu élit
 * (`contentCardModelOf`, #20234) : l'image, la scène arrêtée, le son, ou le texte seul. Une vidéo seule
 * se joue sur place, MUETTE, et une seule à la fois : celle que l'élection du fil désigne (la plus
 * centrée, `useFeedAutoplayRoot`). Un diaporama se fait glisser ; chacune de ses pages choisit.
 *
 * Le lecteur vit dans la carte : quand la feuille se ferme, la carte se démonte et la vidéo s'arrête avec
 * elle — aucun moteur partagé à libérer.
 */

const SELECTED_RING = 'var(--color-ios-brand)';
const CARD_FILL = 'var(--color-ios-fill, rgba(127,127,127,.14))';
const ON_MEDIA = 'color-mix(in srgb, var(--color-media-backdrop) 55%, transparent)';

const cardStyle = (ratio: number, selected: boolean): CSSProperties => ({
  aspectRatio: String(ratio),
  backgroundColor: CARD_FILL,
  boxShadow: selected ? `0 0 0 3px ${SELECTED_RING}` : 'none',
});

const cardLabelOf = (model: ContentCardModel, fallback: string): string => {
  const text = model.text?.full ?? '';
  return text === '' ? fallback : text.length > 80 ? `${text.slice(0, 80)}…` : text;
};

function MediaFace({ media }: { readonly media: ContentCardMedia }) {
  return (
    <span
      className="absolute inset-0 block"
      style={media.placeholder === undefined ? undefined : { backgroundImage: `url("${media.placeholder}")`, backgroundSize: 'cover' }}
    >
      {media.src === undefined ? null : (
        <img src={media.src} alt="" loading="lazy" decoding="async" draggable={false} crossOrigin={mediaImageCrossOrigin(media.src)} className="absolute inset-0 size-full object-cover" />
      )}
      {media.kind === 'video' ? (
        <span data-send-content-play="" className="absolute inset-0 grid place-items-center">
          <span className="grid size-8 place-items-center rounded-full text-on-media" style={{ backgroundColor: ON_MEDIA }}>
            <Glyph name="fillPlay" size={14} />
          </span>
        </span>
      ) : null}
    </span>
  );
}

/** La vidéo seule : son image de garde, et la vidéo muette quand l'élection la désigne. */
function InlineVideo({ id, src, media, store }: { readonly id: string; readonly src: string; readonly media: ContentCardMedia; readonly store: FeedAutoplayStoreApi }) {
  const active = useIsActiveScene(id, store);
  const video = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const element = video.current;
    if (element === null) return undefined;
    if (active) void element.play?.()?.catch?.(() => undefined);
    return () => element.pause?.();
  }, [active]);
  return (
    <>
      <MediaFace media={media} />
      {active ? (
        <video
          ref={video}
          data-send-content-video=""
          src={src}
          muted
          playsInline
          loop
          autoPlay
          preload="metadata"
          aria-hidden="true"
          className="absolute inset-0 size-full object-cover"
        />
      ) : null}
    </>
  );
}

function TextFace({ model, kindLabel, soundLabel }: { readonly model: ContentCardModel; readonly kindLabel: string; readonly soundLabel: string }) {
  const sound = model.visual.kind === 'sound';
  return (
    <span className="absolute inset-0 flex flex-col justify-center gap-1 p-2 text-start">
      {sound ? (
        <span className="text-caption font-semibold" data-send-content-sound="">
          <span aria-hidden="true">🎵 </span>
          {soundLabel}
        </span>
      ) : null}
      <span className="line-clamp-5 text-caption" style={{ color: 'var(--color-ios-ink, inherit)' }}>
        {model.text?.full ?? (sound ? '' : kindLabel)}
      </span>
    </span>
  );
}

function Slideshow({
  pages,
  model,
  readerLanguages,
  language,
  select,
}: {
  readonly pages: readonly ContentCardPage[];
  readonly model: ContentCardModel;
  readonly readerLanguages: readonly string[];
  readonly language: InterfaceLanguage;
  readonly select: (face: ReactNode) => ReactNode;
}) {
  const { trackRef, current, scrollTo, trackHandlers } = useSnapPager(pages.length);
  return (
    <div data-send-content-slideshow="" className="absolute inset-0">
      <div
        ref={trackRef}
        role="group"
        aria-roledescription={translate(language, 'content.card.slideshow')}
        aria-label={translate(language, 'content.card.slideshow.page', { index: String(current + 1), count: String(pages.length) })}
        {...trackHandlers}
        className="scrollbar-none flex size-full overflow-x-auto overscroll-x-contain"
        style={{ scrollSnapType: 'x mandatory' }}
      >
        {pages.map((page, index) => (
          <div
            key={page.kind === 'scene' ? `scene-${page.index}` : page.media.id}
            className="relative size-full shrink-0"
            style={{ scrollSnapAlign: 'start' }}
            {...(index === current ? { 'aria-current': 'true' } : { inert: true })}
          >
            {select(
              page.kind === 'media' ? (
                <MediaFace media={page.media} />
              ) : model.scene === undefined ? null : (
                <SceneFace model={model} index={page.index} readerLanguages={readerLanguages} />
              ),
            )}
          </div>
        ))}
      </div>
      <FeedCarouselChrome
        page={current}
        count={pages.length}
        labels={{ previous: translate(language, 'feed.post.media.previous'), next: translate(language, 'feed.post.media.next') }}
        onPrevious={() => scrollTo(current - 1)}
        onNext={() => scrollTo(current + 1)}
      />
    </div>
  );
}

function SceneFace({ model, index, readerLanguages }: { readonly model: ContentCardModel; readonly index: number; readonly readerLanguages: readonly string[] }) {
  if (model.scene === undefined) return null;
  return (
    <span className="absolute inset-0 block">
      <FeedSceneSurface
        document={model.scene.document}
        sceneIndex={index}
        carrier={model.scene.carrier}
        preferredLanguages={readerLanguages}
        active={false}
        frame="page"
        showCaption={false}
        authorName={model.author.name}
      />
    </span>
  );
}

type CardProps = {
  readonly post: FeedPost;
  readonly kind: SendContentKind;
  readonly selected: boolean;
  readonly language: InterfaceLanguage;
  readonly readerLanguages: readonly string[];
  readonly now: Date;
  readonly store: FeedAutoplayStoreApi;
  readonly registerScene: (id: string, node: Element | null) => void;
  readonly onSelect: (id: string) => void;
};

const SendContentCard = memo(function SendContentCard({ post, kind, selected, language, readerLanguages, now, store, registerScene, onSelect }: CardProps) {
  const model = contentCardModelOf(post, { preferredLanguages: readerLanguages, now, linkType: null, language });
  const video = inlineVideoOf(post, model.visual);
  const register = useCallback((node: Element | null) => registerScene(post.id, node), [registerScene, post.id]);
  const kindLabel = translateCircles(language, `sendContent.kind.${kind}`);
  const label = `${translateCircles(language, 'sendContent.card')} : ${cardLabelOf(model, kindLabel)}`;
  const select = (face: ReactNode): ReactNode => (
    <button
      type="button"
      data-send-content-pick={post.id}
      aria-pressed={selected}
      aria-label={label}
      onClick={() => onSelect(post.id)}
      className="btn-press absolute inset-0 block size-full overflow-hidden focus-visible:outline-2 focus-visible:-outline-offset-2"
      style={{ outlineColor: SELECTED_RING }}
    >
      {face}
    </button>
  );
  const visual = model.visual;
  return (
    <li
      ref={video === null ? undefined : register}
      data-send-content-card={post.id}
      data-send-content-visual={visual.kind}
      className="relative overflow-hidden rounded-card"
      style={cardStyle(sendContentCardRatio(kind), selected)}
    >
      {visual.kind === 'slideshow' ? (
        <Slideshow pages={visual.pages} model={model} readerLanguages={readerLanguages} language={language} select={select} />
      ) : (
        select(
          video !== null && visual.kind === 'media' ? (
            <InlineVideo id={post.id} src={attachmentSrc(video.fileUrl)} media={visual.media} store={store} />
          ) : visual.kind === 'media' ? (
            <MediaFace media={visual.media} />
          ) : visual.kind === 'scene' ? (
            <SceneFace model={model} index={visual.index} readerLanguages={readerLanguages} />
          ) : (
            <TextFace model={model} kindLabel={kindLabel} soundLabel={translateCircles(language, 'sendContent.sound')} />
          ),
        )
      )}
    </li>
  );
});

export function ProfileSendContentGrid({
  posts,
  kind,
  selectedId,
  language,
  readerLanguages,
  now,
  store,
  registerScene,
  onSelect,
}: Omit<CardProps, 'post' | 'selected'> & { readonly posts: readonly FeedPost[]; readonly selectedId: string | null }) {
  return (
    <ul data-send-content-grid={kind} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${SEND_CONTENT_COLUMNS}, minmax(0, 1fr))` }}>
      {posts.map((post) => (
        <SendContentCard
          key={post.id}
          post={post}
          kind={kind}
          selected={post.id === selectedId}
          language={language}
          readerLanguages={readerLanguages}
          now={now}
          store={store}
          registerScene={registerScene}
          onSelect={onSelect}
        />
      ))}
    </ul>
  );
}
