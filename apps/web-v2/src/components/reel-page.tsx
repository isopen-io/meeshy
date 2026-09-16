import { useState } from 'react';
import type { UIEvent } from 'react';

import { Avatar } from './avatar';
import { Glyph, GlyphSvg } from './glyph';
import { FEED_GLYPHS } from './glyphs-feed';
import { MEDIA_TRANSPORT_GLYPHS } from './glyphs-media-transport';
import type { FeedCardMedia, FeedCardModel } from '@/lib/feed/card-model';
import type { PostToggleKind } from '@/lib/feed/interactions';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { reelDisplayOf, type ReelPageMode } from '@/lib/reels/thread';
import { useReelPlayback } from '@/lib/view/use-reel-playback';

/**
 * UNE PAGE DU LECTEUR DES RÉELS (#6457) — miroir de `ReelPageView`
 * (`ReelsPlayerView.swift`) : le média plein cadre sur fond noir, un voile bas,
 * l'auteur et la légende (Prisme, `resolveFeedCardModel`) en bas à gauche, le
 * rail d'actions à droite.
 *
 * - **Le mode décide du lecteur** (`pageModeOf`, `lib/reels/thread.ts`) : le
 *   réel visible monte et JOUE son `<video>`, ses deux voisins le montent en
 *   attente (le balayage suivant n'attend pas le réseau), les autres ne portent
 *   que leur affiche — aucun élément de lecture hors de la fenêtre.
 * - **La vidéo n'est pas recadrée** : `.resizeAspect` côté iOS
 *   (`ReelsPlayerView+Video.swift`), `object-contain` ici.
 * - **Le rail n'offre que ce qui a un effet** (loi 4) : aimer et enregistrer
 *   (bascules optimistes, `usePostGesture`), partager, et le son quand le réel
 *   se lit. Commenter et repartager n'ont pas encore d'effet sur le web.
 */
type GestureHandler = (postId: string, kind: PostToggleKind) => void;

export type ReelPageProps = {
  readonly model: FeedCardModel;
  readonly index: number;
  readonly count: number;
  readonly mode: ReelPageMode;
  readonly soundOn: boolean;
  readonly language: InterfaceLanguage;
  readonly onToggleSound: () => void;
  readonly onGesture: GestureHandler;
  readonly onShare: (postId: string) => void;
};

/** Le disque sombre sous chaque glyphe du rail — `adaptiveGlass(tint: .black.opacity(0.35))`. */
const RAIL_DISC = 'rgba(0,0,0,0.38)';
const TEXT_SHADOW = '0 1px 2px rgba(0,0,0,0.7)';

function ReelPoster({ src }: { readonly src: string | undefined }) {
  return (
    <div
      data-reel-poster
      aria-hidden="true"
      className="absolute inset-0"
      style={src !== undefined ? { backgroundImage: `url("${src}")`, backgroundSize: 'contain', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' } : {}}
    />
  );
}

function ReelPlayable({
  media,
  tag,
  active,
  soundOn,
  accent,
  language,
}: {
  readonly media: FeedCardMedia;
  readonly tag: 'video' | 'audio';
  readonly active: boolean;
  readonly soundOn: boolean;
  readonly accent: string;
  readonly language: InterfaceLanguage;
}) {
  const { status, progress, toggle, bind } = useReelPlayback({ mediaId: media.id, active, soundOn });
  const poster = media.thumbnailSrc ?? media.placeholder;
  const preload = active ? 'auto' : 'metadata';

  return (
    <>
      {tag === 'video' ? (
        /* `key` — une source qui change REMONTE l'élément (motif `VideoTile`). */
        <video
          key={media.src}
          ref={bind}
          src={media.src}
          {...(poster !== undefined ? { poster } : {})}
          preload={preload}
          playsInline
          loop
          muted={!soundOn}
          data-reel-media="video"
          className="absolute inset-0 size-full object-contain"
        />
      ) : (
        <>
          <div aria-hidden="true" className="absolute inset-0 grid place-items-center" style={{ background: `radial-gradient(circle at 50% 42%, ${accent}, black 72%)` }}>
            <GlyphSvg glyph={FEED_GLYPHS.waveform} size={112} style={{ color: 'rgba(255,255,255,0.72)' }} />
          </div>
          <audio key={media.src} ref={bind} src={media.src} preload={preload} loop muted={!soundOn} data-reel-media="audio" />
        </>
      )}
      <button
        type="button"
        data-reel-surface
        aria-label={translate(language, status === 'playing' ? 'reels.pause' : 'reels.play')}
        onClick={toggle}
        className="absolute inset-0 grid place-items-center focus-visible:outline-2 focus-visible:-outline-offset-4"
        style={{ outlineColor: 'white', WebkitTapHighlightColor: 'transparent' }}
      >
        {status === 'paused' ? (
          <span aria-hidden="true" className="grid size-18 place-items-center rounded-full" style={{ backgroundColor: RAIL_DISC }}>
            <Glyph name="fillPlay" size={34} className="text-white" />
          </span>
        ) : null}
      </button>
      {/* La progression est ÉCRITE, jamais animée : une transition sur la
          transformation amortirait le suivi de la lecture. */}
      <span
        aria-hidden="true"
        data-reel-progress
        className="pointer-events-none absolute inset-x-0 bottom-0 block h-[3px] origin-left"
        style={{ backgroundColor: 'rgba(255,255,255,0.85)', transform: `scaleX(${progress})` }}
      />
      {status === 'error' ? (
        <div data-reel-media-error className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-center px-6">
          <button
            type="button"
            onClick={toggle}
            className="rounded-chip px-4 text-check font-semibold text-white"
            style={{ minHeight: 44, backgroundColor: 'rgba(0,0,0,0.72)' }}
          >
            {translate(language, 'reels.media.error')}
          </button>
        </div>
      ) : null}
    </>
  );
}

/** Les images d'un réel se parcourent d'un balayage HORIZONTAL — le vertical
 * reste au fil. Les points disent la page lue, jamais une page supposée. */
function ReelImages({ images, language }: { readonly images: readonly FeedCardMedia[]; readonly language: InterfaceLanguage }) {
  const [page, setPage] = useState(0);
  const onScroll = (event: UIEvent<HTMLDivElement>) => {
    const el = event.currentTarget;
    if (el.clientWidth > 0) setPage(Math.round(Math.abs(el.scrollLeft) / el.clientWidth));
  };

  return (
    <>
      <div data-reel-images onScroll={onScroll} className="scrollbar-none absolute inset-0 flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain">
        {images.map((image, i) => (
          <img
            key={image.id}
            src={image.src}
            alt={image.altText ?? translate(language, 'reels.image', { index: String(i + 1), count: String(images.length) })}
            draggable={false}
            decoding="async"
            className="h-full w-full shrink-0 snap-start object-contain"
          />
        ))}
      </div>
      {images.length > 1 ? (
        <div aria-hidden="true" data-reel-image-dots className="pointer-events-none absolute inset-x-0 flex justify-center gap-1.5" style={{ top: 'calc(env(safe-area-inset-top, 0px) + 28px)' }}>
          {images.map((image, i) => (
            <span key={image.id} className="rounded-full" style={{ width: 6, height: 6, backgroundColor: i === page ? 'white' : 'rgba(255,255,255,0.45)' }} />
          ))}
        </div>
      ) : null}
    </>
  );
}

function ReelStage({ model, mode, soundOn, language }: Pick<ReelPageProps, 'model' | 'mode' | 'soundOn' | 'language'>) {
  const display = reelDisplayOf(model.media);
  const accent = model.author.accentColor;
  if (display.kind === 'video' || display.kind === 'audio') {
    return mode === 'far' ? (
      <ReelPoster src={display.media.thumbnailSrc ?? display.media.placeholder} />
    ) : (
      <ReelPlayable media={display.media} tag={display.kind} active={mode === 'active'} soundOn={soundOn} accent={accent} language={language} />
    );
  }
  if (display.kind === 'images') {
    const first = display.images[0];
    return mode === 'far' ? <ReelPoster src={first?.thumbnailSrc ?? first?.src} /> : <ReelImages images={display.images} language={language} />;
  }
  return <div aria-hidden="true" className="absolute inset-0" style={{ background: `linear-gradient(160deg, ${accent}, black 75%)` }} />;
}

function RailButton({
  gesture,
  pressed,
  label,
  glyph,
  count,
  ink,
  onPress,
}: {
  readonly gesture: string;
  readonly pressed?: boolean;
  readonly label: string;
  readonly glyph: keyof typeof FEED_GLYPHS | keyof typeof MEDIA_TRANSPORT_GLYPHS;
  readonly count?: number;
  readonly ink: string;
  readonly onPress: () => void;
}) {
  const shape = glyph in FEED_GLYPHS ? FEED_GLYPHS[glyph as keyof typeof FEED_GLYPHS] : MEDIA_TRANSPORT_GLYPHS[glyph as keyof typeof MEDIA_TRANSPORT_GLYPHS];
  return (
    <button
      type="button"
      data-reel-gesture={gesture}
      {...(pressed !== undefined ? { 'aria-pressed': pressed } : {})}
      {...(count === undefined ? { 'aria-label': label } : {})}
      onClick={onPress}
      className="flex min-w-11 flex-col items-center gap-1 rounded-chip focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{ color: ink, outlineColor: 'white' }}
    >
      <span className="grid size-11 place-items-center rounded-full" style={{ backgroundColor: RAIL_DISC }}>
        <GlyphSvg glyph={shape} size={24} {...(count !== undefined ? { title: label } : {})} />
      </span>
      {count !== undefined ? (
        <span className="text-check font-semibold text-white tabular-nums" style={{ textShadow: TEXT_SHADOW }}>
          {count}
        </span>
      ) : null}
    </button>
  );
}

function ReelRail({
  model,
  playable,
  soundOn,
  language,
  onToggleSound,
  onGesture,
  onShare,
}: Pick<ReelPageProps, 'model' | 'soundOn' | 'language' | 'onToggleSound' | 'onGesture' | 'onShare'> & { readonly playable: boolean }) {
  const { liked, bookmarked } = model.viewer;
  return (
    <div data-reel-rail className="pointer-events-auto flex shrink-0 flex-col items-center gap-3">
      <RailButton
        gesture="like"
        pressed={liked}
        label={translate(language, 'reels.action.like')}
        glyph={liked ? 'heartFill' : 'heart'}
        count={model.stats.likeCount}
        ink={liked ? 'var(--color-error)' : 'white'}
        onPress={() => onGesture(model.id, 'like')}
      />
      <RailButton
        gesture="bookmark"
        pressed={bookmarked}
        label={translate(language, 'reels.action.bookmark')}
        glyph={bookmarked ? 'bookmarkFill' : 'bookmark'}
        count={model.stats.bookmarkCount}
        ink="white"
        onPress={() => onGesture(model.id, 'bookmark')}
      />
      <RailButton
        gesture="share"
        label={translate(language, 'reels.action.share')}
        glyph="shareNetwork"
        count={model.stats.shareCount}
        ink="white"
        onPress={() => onShare(model.id)}
      />
      {playable ? (
        <RailButton
          gesture="sound"
          label={translate(language, soundOn ? 'reels.sound.off' : 'reels.sound.on')}
          glyph={soundOn ? 'speakerHigh' : 'speakerSlash'}
          ink="white"
          onPress={onToggleSound}
        />
      ) : null}
    </div>
  );
}

export function ReelPage(props: ReelPageProps) {
  const { model, index, count, mode, language } = props;
  const display = reelDisplayOf(model.media);
  const playable = display.kind === 'video' || display.kind === 'audio';

  return (
    <article
      data-reel={model.id}
      data-reel-index={index}
      data-reel-mode={mode}
      tabIndex={-1}
      aria-label={translate(language, 'reels.item', { author: model.author.name, index: String(index + 1), count: String(count) })}
      className="relative w-full snap-start snap-always overflow-hidden bg-black outline-none"
      style={{ height: '100%' }}
    >
      <ReelStage model={model} mode={mode} soundOn={props.soundOn} language={language} />
      {/* LE VOILE BAS tient le blanc de l'auteur, de la légende et des compteurs
          au-dessus de AA sur la PIRE image (une mire blanche) : mesuré au pixel
          par `scripts/check-reels.mjs`, jamais déduit d'une couleur calculée. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0"
        style={{ height: '65%', background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.66) 40%, rgba(0,0,0,0) 100%)' }}
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end gap-3 ps-4 pe-3" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)' }}>
        <div className="flex min-w-0 flex-1 flex-col gap-2 pb-1">
          <div className="flex min-w-0 items-center gap-2">
            <Avatar initials={model.author.initials} color={model.author.accentColor} size={36} {...(model.author.avatarSrc !== undefined ? { src: model.author.avatarSrc } : {})} />
            <span data-reel-author className="truncate text-body font-semibold text-white" style={{ textShadow: TEXT_SHADOW }}>
              {model.author.name}
            </span>
            <span className="shrink-0 text-check text-white" style={{ textShadow: TEXT_SHADOW }}>
              {model.relativeTime}
            </span>
          </div>
          {model.text !== undefined ? (
            <p
              data-reel-caption
              {...(model.text.language !== '' ? { lang: model.text.language } : {})}
              className="text-check text-white"
              style={{ textShadow: TEXT_SHADOW, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
            >
              {model.text.full}
            </p>
          ) : null}
        </div>
        <ReelRail
          model={model}
          playable={playable}
          soundOn={props.soundOn}
          language={language}
          onToggleSound={props.onToggleSound}
          onGesture={props.onGesture}
          onShare={props.onShare}
        />
      </div>
    </article>
  );
}
