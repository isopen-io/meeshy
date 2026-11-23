import { useState, type CSSProperties, type ReactNode } from 'react';

import { isMediaAbsent, noteMediaAbsent } from '@/lib/api/media-absent';
import {
  CONTENT_CARD_PORTRAIT_MAX_HEIGHT,
  type ContentCardMedia,
  type ContentCardPage,
  type ContentCardScene,
  type ContentCardSound,
} from '@/lib/feed/content-card';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { mediaImageCrossOrigin } from '@/lib/net/api-runtime-cache';
import { DURATION_BADGE_OPACITY, videoDurationLabel } from '@/lib/view/media-grid-layout';

import { FeedCarouselChrome } from './feed-carousel-chrome';
import { FeedSceneSurface } from './feed-scene-surface';
import { Glyph } from './glyph';
import { BannerAudioPlayer } from './notification-banner-audio';
import { useSnapPager } from './use-snap-pager';

/**
 * **LE BLOC VISUEL DE LA CARTE D'UN CONTENU PARTAGÉ** (#20234, jumelle web de
 * #20211) — ce que `ContentCardVisual` (`lib/feed/content-card.ts`) a élu,
 * peint avec les pièces de l'application : la vignette (image de garde et
 * signe lecture d'une vidéo), le diaporama sur la piste `scroll-snap` du fil
 * (`useSnapPager`, le chrome `FeedCarouselChrome`), la scène ARRÊTÉE du fil
 * (`FeedSceneSurface`, `active={false}`) et le lecteur du vocal de la bannière
 * (`BannerAudioPlayer`).
 *
 * Le diaporama et le son portent des contrôles : ils vivent HORS du lien de la
 * carte (un contrôle dans un lien est invalide). Une page du diaporama est
 * elle-même une porte du contenu (`renderOpen`) — un glissement fait défiler
 * la piste sans produire de clic, il n'ouvre donc rien.
 */

const PLAY_DIAMETER = 40;
const SCENE_RATIO = 9 / 16;

export const ON_MEDIA_BACKDROP = `color-mix(in srgb, var(--color-media-backdrop) ${Math.round(DURATION_BADGE_OPACITY * 100)}%, transparent)`;

/** Le bloc : toute la largeur, son rapport, plafonné en hauteur ; l'accent de l'auteur tant que rien n'est peint. */
const boxStyle = (aspectRatio: number, maxHeight: number, accent: string): CSSProperties => ({
  width: '100%',
  aspectRatio: String(aspectRatio),
  maxHeight,
  backgroundColor: `color-mix(in srgb, ${accent} 35%, var(--color-ios-card))`,
});

export type TypeChipRender = (onMedia: boolean) => ReactNode;

/**
 * LA FACE D'UN MÉDIA — la vignette recadrée en remplissage, sur l'aplat du
 * ThumbHash ; une vignette morte est retenue par le registre de session
 * (`noteMediaAbsent`) : un fil qui remonte la carte ne la redemande pas. Une
 * vidéo porte le signe lecture et sa durée.
 */
function MediaFace({ media }: { readonly media: ContentCardMedia }) {
  const [, setFailures] = useState(0);
  const src = media.src !== undefined && !isMediaAbsent(media.src) ? media.src : undefined;
  return (
    <span
      className="absolute inset-0 block"
      style={media.placeholder === undefined ? undefined : { backgroundImage: `url("${media.placeholder}")`, backgroundSize: 'cover' }}
    >
      {src === undefined ? null : (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          crossOrigin={mediaImageCrossOrigin(src)}
          onError={() => {
            noteMediaAbsent(src);
            setFailures((count) => count + 1);
          }}
          className="absolute inset-0 size-full object-cover"
        />
      )}
      {media.kind === 'video' ? (
        <span data-content-card-play className="absolute inset-0 grid place-items-center">
          <span className="grid place-items-center rounded-full text-on-media" style={{ width: PLAY_DIAMETER, height: PLAY_DIAMETER, backgroundColor: ON_MEDIA_BACKDROP }}>
            <Glyph name="fillPlay" size={18} />
          </span>
        </span>
      ) : null}
      {media.kind === 'video' && media.durationMs !== undefined ? (
        <span
          data-content-card-duration
          className="absolute bottom-2 end-2 rounded-full px-1.5 py-0.5 text-mini font-medium text-on-media tabular-nums"
          style={{ backgroundColor: ON_MEDIA_BACKDROP }}
        >
          {videoDurationLabel(media.durationMs)}
        </span>
      ) : null}
    </span>
  );
}

/** Une scène de la carte, ARRÊTÉE : le fond et les objets posés, sans légende (le texte est sous le bloc). */
function SceneFace({ scene, index, readerLanguages, authorName }: { readonly scene: ContentCardScene; readonly index: number; readonly readerLanguages: readonly string[]; readonly authorName: string }) {
  return (
    <span className="absolute inset-0 block">
      <FeedSceneSurface
        document={scene.document}
        sceneIndex={index}
        carrier={scene.carrier}
        preferredLanguages={readerLanguages}
        active={false}
        frame="page"
        showCaption={false}
        authorName={authorName}
      />
    </span>
  );
}

/** Une image, ou l'image de garde d'une vidéo — dans le lien de la carte. */
export function ContentCardMediaBlock({ media, accent, chip }: { readonly media: ContentCardMedia; readonly accent: string; readonly chip: TypeChipRender }) {
  return (
    <span data-content-card-media={media.kind} className="relative block overflow-hidden" style={boxStyle(media.aspectRatio, media.maxHeight, accent)}>
      <MediaFace media={media} />
      <span className="absolute start-2 top-2">{chip(true)}</span>
    </span>
  );
}

/** La scène composée, arrêtée — dans le lien de la carte. */
export function ContentCardSceneBlock({
  scene,
  index,
  accent,
  readerLanguages,
  authorName,
  chip,
}: {
  readonly scene: ContentCardScene;
  readonly index: number;
  readonly accent: string;
  readonly readerLanguages: readonly string[];
  readonly authorName: string;
  readonly chip: TypeChipRender;
}) {
  return (
    <span data-content-card-scene className="relative block overflow-hidden" style={boxStyle(SCENE_RATIO, CONTENT_CARD_PORTRAIT_MAX_HEIGHT, accent)}>
      <SceneFace scene={scene} index={index} readerLanguages={readerLanguages} authorName={authorName} />
      <span className="pointer-events-none absolute start-2 top-2">{chip(true)}</span>
    </span>
  );
}

const pageKind = (page: ContentCardPage): 'image' | 'video' | 'scene' => (page.kind === 'scene' ? 'scene' : page.media.kind);

/**
 * LE DIAPORAMA — plusieurs médias, ou plusieurs scènes, qu'on fait glisser
 * page par page. La piste se parcourt au doigt, aux flèches et au clavier (←
 * →), et dit « Page n sur N » ; chaque page ouvre le contenu.
 */
export function ContentCardSlideshow({
  pages,
  scene,
  accent,
  readerLanguages,
  authorName,
  language,
  chip,
  renderOpen,
}: {
  readonly pages: readonly ContentCardPage[];
  readonly scene: ContentCardScene | undefined;
  readonly accent: string;
  readonly readerLanguages: readonly string[];
  readonly authorName: string;
  readonly language: InterfaceLanguage;
  readonly chip: TypeChipRender;
  readonly renderOpen: (face: ReactNode) => ReactNode;
}) {
  const count = pages.length;
  const { trackRef, current, scrollTo, trackHandlers } = useSnapPager(count);
  const first = pages[0];
  const [ratio, maxHeight] = first?.kind === 'media' ? [first.media.aspectRatio, first.media.maxHeight] : [SCENE_RATIO, CONTENT_CARD_PORTRAIT_MAX_HEIGHT];
  const scenes = first?.kind === 'scene';
  const labels = scenes
    ? { previous: translate(language, 'feed.scene.carousel.previous'), next: translate(language, 'feed.scene.carousel.next') }
    : { previous: translate(language, 'feed.post.media.previous'), next: translate(language, 'feed.post.media.next') };
  return (
    <div data-content-card-slideshow className="relative overflow-hidden" style={boxStyle(ratio, maxHeight, accent)}>
      <div
        ref={trackRef}
        data-content-card-track
        tabIndex={0}
        role="group"
        aria-roledescription={translate(language, 'content.card.slideshow')}
        aria-label={translate(language, 'content.card.slideshow.page', { index: String(current + 1), count: String(count) })}
        {...trackHandlers}
        className="scrollbar-none flex size-full overflow-x-auto overscroll-x-contain focus-visible:outline-2 focus-visible:-outline-offset-2"
        style={{ scrollSnapType: 'x mandatory', outlineColor: 'var(--color-ios-brand)' }}
      >
        {pages.map((page, index) => (
          <div
            key={page.kind === 'scene' ? `scene-${page.index}` : page.media.id}
            data-content-card-page={pageKind(page)}
            className="relative size-full shrink-0"
            style={{ scrollSnapAlign: 'start' }}
            {...(index === current ? { 'aria-current': 'true' } : { inert: true })}
          >
            {renderOpen(
              page.kind === 'media' ? (
                <MediaFace media={page.media} />
              ) : scene === undefined ? null : (
                <SceneFace scene={scene} index={page.index} readerLanguages={readerLanguages} authorName={authorName} />
              ),
            )}
          </div>
        ))}
      </div>
      <span className="pointer-events-none absolute start-2 top-2">{chip(true)}</span>
      <FeedCarouselChrome page={current} count={count} labels={labels} onPrevious={() => scrollTo(current - 1)} onNext={() => scrollTo(current + 1)} />
    </div>
  );
}

/** Un son seul — le lecteur du vocal de la bannière, sans quitter la conversation : Lecture joue, elle n'ouvre rien. */
export function ContentCardSoundBlock({
  sound,
  postId,
  accent,
  language,
}: {
  readonly sound: ContentCardSound;
  readonly postId: string;
  readonly accent: string;
  readonly language: InterfaceLanguage;
}) {
  return (
    <div data-content-card-sound className="px-3 pt-3">
      <span className="block min-w-0">
        <BannerAudioPlayer
          audio={{ url: sound.url, durationMs: sound.durationSeconds === undefined ? null : sound.durationSeconds * 1000 }}
          audioKey={`content-card:${postId}:${sound.attachmentId}`}
          accent={accent}
          language={language}
          labels={{
            play: translate(language, 'media.audio.play'),
            pause: translate(language, 'media.audio.pause'),
            speed: translate(language, 'media.audio.speed'),
          }}
        />
      </span>
    </div>
  );
}
