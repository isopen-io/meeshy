import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Glyph, GlyphSvg } from './glyph';
import { FEED_GLYPHS } from './glyphs-feed';
import { MEDIA_TRANSPORT_GLYPHS } from './glyphs-media-transport';
import { MediaUnavailable } from './media-unavailable';
import { PlaybackStallIndicator } from './playback-stall-indicator';
import { ReelPoster } from './reel-poster';
import { GLYPH_SIZE } from './ui-chrome';
import { usePublicationParticipation } from '@/lib/view/publication-participation';

import { VIEWER_GLASS, ViewerActionRail, ViewerBottomBar, ViewerIdentity, type ViewerAction } from './viewer-chrome';
import { carrierMediaIdentity } from '@/lib/canvas/carrier';
import { watchMediaStall } from '@/lib/media/media-stall';
import { sceneWaitingImage } from '@/lib/canvas/scene-placeholder';
import { sceneHasAudibleBackgroundVideo, sceneHasControllableSound } from '@/lib/canvas/background-sound';
import { documentAnnouncesSound } from '@/lib/canvas/document';
import type { ProtectedMediaDeps, ProtectedMediaUnavailableReason } from '@/lib/api/protected-media';
import type { FeedCardMedia, FeedCardModel, FeedCardScene } from '@/lib/feed/card-model';
import type { PostToggleKind } from '@/lib/feed/interactions';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { reelStageOf } from '@/lib/reels/scene';
import type { ReelPageMode } from '@/lib/reels/thread';
import { useFrameProgress } from '@/lib/view/frame-progress';
import { useReelPlayback } from '@/lib/view/use-reel-playback';

/** Chargé À LA DEMANDE (#6903, motif D-54) : un réel de MÉDIAS (vidéo, audio,
 * images) ne paie jamais le moteur de scène. */
const ReelSceneStage = lazy(() => import('./reel-scene-stage'));
/** Chargée À LA DEMANDE elle aussi (revue-correction #6484, même motif) : la
 * galerie d'un réel d'IMAGES. Son affiche — la première image — tient la page
 * le temps du chunk ; un réel vidéo ne la paie plus, et le plafond du chunk
 * `reels` (7 Ko, `budgets.json`) ne monte pas. */
const ReelImages = lazy(() => import('./reel-images'));

/**
 * UNE PAGE DU LECTEUR DES RÉELS (#6457) — miroir de `ReelPageView`
 * (`ReelsPlayerView.swift`) : le média plein cadre sur fond noir, un voile bas,
 * l'auteur et la légende (Prisme, `resolveFeedCardModel`) en bas à gauche, le
 * rail d'actions à droite.
 *
 * - **Le mode décide du lecteur** (`pageModeOf`, `lib/reels/thread.ts`,
 *   #9702) : le réel visible monte et JOUE son `<video>` ; ses voisins N±1 le
 *   montent en `preload="auto"` — leur première image est décodée par le
 *   navigateur avant le balayage, qui n'attend donc pas le réseau ; N±2 le
 *   montent en attente de métadonnées (un retour en arrière ne recrée rien) ;
 *   les autres ne portent que leur affiche, leurs octets de tête étant amorcés
 *   à part tant qu'ils restent dans la fenêtre (`lib/reels/media-primer.ts`).
 * - **La vidéo n'est pas recadrée** : `.resizeAspect` côté iOS
 *   (`ReelsPlayerView+Video.swift`), `object-contain` ici.
 * - **Le rail n'offre que ce qui a un effet** (loi 4), dans l'ordre d'iOS
 *   (`ReelActionRail`) : aimer, commenter (la feuille PARTAGÉE avec le lecteur
 *   de stories, D-89), enregistrer, repartager (optimiste, append-only) — ces
 *   deux-là à un lecteur connecté seulement (#6484) —, puis partager, et le
 *   son quand le réel se lit. Web seul : partager et le son restent sur le
 *   rail, faute du menu « … » et de la couche d'information d'iOS.
 */
type GestureHandler = (postId: string, kind: PostToggleKind) => void;

export type ReelPageProps = {
  readonly model: FeedCardModel;
  readonly index: number;
  readonly count: number;
  readonly mode: ReelPageMode;
  readonly soundOn: boolean;
  readonly language: InterfaceLanguage;
  readonly preferredLanguages: readonly string[];
  readonly onToggleSound: () => void;
  readonly onGesture: GestureHandler;
  readonly onShare: (postId: string) => void;
  /** Ouvre la feuille de commentaires PARTAGÉE (D-89, #6484) — jamais une
   * navigation : contrairement à la carte du Flux, le lecteur des Réels
   * reste en place, la feuille se pose PAR-DESSUS lui. `undefined` ⇒
   * l'écran ne l'offre pas encore (visiteur anonyme, même garde que
   * `CommentThread.canWrite`) et le bouton ne se rend pas (loi 4). */
  readonly onComment?: (postId: string) => void;
  /** Repartage SIMPLE, optimiste, append-only (#6484, miroir
   * `ReelsViewModel.repost`). Même garde d'absence que `onComment`. */
  readonly onRepost?: (postId: string) => void;
  /** Un `play()` SONORE de la SCÈNE refusé par la politique de lecture
   * automatique (#6903) — même politique que le réel vidéo (`soundOn =
   * false`), câblée par l'écran (`routes/reels.tsx`). */
  readonly onSoundBlocked: () => void;
  /** Injectable pour les témoins UNIQUEMENT — la production prend les
   * dépendances de `BackgroundTrackAudio` ; sans elle, « la piste protégée
   * est refusée » ne s'éprouve qu'en laissant partir un vrai `fetch`. */
  readonly mediaDeps?: ProtectedMediaDeps;
  /** La feuille de commentaires est ouverte (`chromeYields`, #8601) : le
   * chrome du réel s'efface, inerte ; le média reste. */
  readonly chromeHidden?: boolean;
};

function ReelPlayable({
  media,
  tag,
  mode,
  soundOn,
  accent,
  language,
}: {
  readonly media: FeedCardMedia;
  readonly tag: 'video' | 'audio';
  readonly mode: Exclude<ReelPageMode, 'far'>;
  readonly soundOn: boolean;
  readonly accent: string;
  readonly language: InterfaceLanguage;
}) {
  const active = mode === 'active';
  const { status, toggle, bind } = useReelPlayback({ mediaId: media.id, active, soundOn });
  const poster = media.thumbnailSrc ?? media.placeholder;
  const preload = mode === 'warm' ? 'metadata' : 'auto';
  /* L'ATTENTE SE DIT (#9277) : l'élément lié est aussi écouté pour son buffer. */
  const [element, setElement] = useState<HTMLMediaElement | null>(null);
  const [stalled, setStalled] = useState(false);
  const attach = useCallback(
    (el: HTMLMediaElement | null) => {
      bind(el);
      setElement(el);
    },
    [bind],
  );
  useEffect(() => (element === null ? undefined : watchMediaStall(element, setStalled)), [element]);
  const bar = useRef<HTMLSpanElement | null>(null);
  useFrameProgress({ media: element, playing: status === 'playing', bar });

  return (
    <>
      {tag === 'video' ? (
        /* `key` — une source qui change REMONTE l'élément (motif `VideoTile`). */
        <video
          key={media.src}
          ref={attach}
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
          <div aria-hidden="true" className="absolute inset-0 grid place-items-center" style={{ background: `radial-gradient(circle at 50% 42%, ${accent}, var(--color-media-backdrop) 72%)` }}>
            <GlyphSvg glyph={FEED_GLYPHS.waveform} size={112} style={{ color: 'var(--color-on-media-3)' }} />
          </div>
          <audio key={media.src} ref={attach} src={media.src} preload={preload} loop muted={!soundOn} data-reel-media="audio" />
        </>
      )}
      <button
        type="button"
        data-reel-surface
        aria-label={translate(language, status === 'playing' ? 'reels.pause' : 'reels.play')}
        onClick={toggle}
        className="absolute inset-0 grid place-items-center focus-visible:outline-2 focus-visible:-outline-offset-4"
        style={{ outlineColor: 'var(--color-on-media)', WebkitTapHighlightColor: 'transparent' }}
      >
        {status === 'paused' ? (
          <span aria-hidden="true" className={`${VIEWER_GLASS} grid size-18 place-items-center rounded-full`}>
            <Glyph name="fillPlay" size={34} className="text-on-media" />
          </span>
        ) : null}
      </button>
      <PlaybackStallIndicator stalled={stalled && active && status !== 'paused'} language={language} />
      {/* La progression est ÉCRITE, jamais animée : une transition sur la
          transformation amortirait le suivi de la lecture. Elle s'écrit À
          CHAQUE IMAGE sur l'horloge du média (`useFrameProgress`, #9702), plus
          sur `timeupdate` (≈ 4 Hz, une seconde par saut sur un réel d'une
          minute) : `scaleX(0)` n'est que sa valeur de départ.

          `z-10` (revue-correction #6903) — LE VOILE BAS EST PEINT APRÈS CETTE
          BARRE, et il l'effaçait : mesuré au pixel sur la capture,
          `rgb(15,15,36)` de rempli contre `rgb(12,12,12)` de piste, soit
          ~15 % de la couleur voulue (le voile vaut 0,85 d'opacité à 2 px du
          bas). Une barre de progression qu'on ne distingue pas ne dit rien
          de la lecture — iOS la peint franchement
          (`ReelsPlayerView.swift:656-664`). Le voile reste sur le MÉDIA,
          où il sert la lisibilité du blanc ; la barre passe au-dessus. */}
      <span
        aria-hidden="true"
        ref={bar}
        data-reel-progress
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10 block h-[3px] origin-left"
        style={{ backgroundColor: 'var(--color-on-media-2)', transform: 'scaleX(0)' }}
      />
      {status === 'error' ? (
        /* L'ÉTAT D'UN MÉDIA QUI NE SE LIT PAS est CELUI des trois autres surfaces
           (story, post, message — `MediaUnavailable`, #7022) : un bouton local
           de plus était le quatrième dessin d'un même manque. Le réessai est un
           échec TRANSITOIRE, donc offert ici (`onRetry`, #8141). */
        <div data-reel-media-error className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-center px-6">
          <MediaUnavailable language={language} onRetry={toggle} />
        </div>
      ) : null}
    </>
  );
}

/** `carrier.media.find(id === carrierMediaIdentity(scene))?.poster` (#6903) —
 * la vignette du média de FOND, servie tant que le chunk `reel-scene-stage`
 * n'est pas chargé (`Suspense`) et pour toute la fenêtre `far`. */
function scenePosterOf(scene: FeedCardScene): string | undefined {
  const first = scene.document.scenes[0];
  if (first === undefined) return undefined;
  const identity = carrierMediaIdentity(first);
  const poster = identity === null ? undefined : scene.carrier.media.find((m) => m.id === identity)?.poster;
  return poster ?? sceneWaitingImage(first);
}

function ReelStage({
  model,
  mode,
  soundOn,
  language,
  preferredLanguages,
  onSoundBlocked,
  onSoundUnavailable,
  mediaDeps,
}: Pick<ReelPageProps, 'model' | 'mode' | 'soundOn' | 'language' | 'preferredLanguages' | 'onSoundBlocked' | 'mediaDeps'> & {
  readonly onSoundUnavailable: (reason: ProtectedMediaUnavailableReason) => void;
}) {
  const stage = reelStageOf(model);
  const accent = model.author.accentColor;
  // LA SCÈNE DÉCIDE AVANT LE MÉDIA (#6903, miroir `ReelsPlayerView.swift:900-904`) :
  // un réel composé la joue même si `media` porte aussi une vidéo.
  if (stage.kind === 'scene') {
    const poster = scenePosterOf(stage.scene);
    // `far` et `warm` ne chargent JAMAIS le chunk du moteur — la scène est
    // un lecteur complet, réservé au réel visible et à ses voisins immédiats.
    if (mode === 'far' || mode === 'warm') return <ReelPoster src={poster} />;
    return (
      <Suspense fallback={<ReelPoster src={poster} />}>
        <ReelSceneStage
          scene={stage.scene}
          mode={mode}
          soundOn={soundOn}
          accent={accent}
          language={language}
          preferredLanguages={preferredLanguages}
          {...(poster !== undefined ? { poster } : {})}
          onSoundBlocked={onSoundBlocked}
          onSoundUnavailable={onSoundUnavailable}
          {...(mediaDeps !== undefined ? { mediaDeps } : {})}
        />
      </Suspense>
    );
  }
  if (stage.kind === 'video' || stage.kind === 'audio') {
    return mode === 'far' ? (
      <ReelPoster src={stage.media.thumbnailSrc ?? stage.media.placeholder} />
    ) : (
      <ReelPlayable media={stage.media} tag={stage.kind} mode={mode} soundOn={soundOn} accent={accent} language={language} />
    );
  }
  if (stage.kind === 'images') {
    const first = stage.images[0];
    const poster = <ReelPoster src={first?.thumbnailSrc ?? first?.src} />;
    return mode === 'far' || mode === 'warm' ? (
      poster
    ) : (
      <Suspense fallback={poster}>
        <ReelImages images={stage.images} language={language} />
      </Suspense>
    );
  }
  return <div aria-hidden="true" className="absolute inset-0" style={{ background: `linear-gradient(160deg, ${accent}, var(--color-media-backdrop) 75%)` }} />;
}

type RailGlyph = keyof typeof FEED_GLYPHS | keyof typeof MEDIA_TRANSPORT_GLYPHS;

const railGlyph = (name: RailGlyph) => (
  <GlyphSvg glyph={name in FEED_GLYPHS ? FEED_GLYPHS[name as keyof typeof FEED_GLYPHS] : MEDIA_TRANSPORT_GLYPHS[name as keyof typeof MEDIA_TRANSPORT_GLYPHS]} size={GLYPH_SIZE.lg} />
);

/**
 * **LE RAIL DU RÉEL** — les actions, dans l'ordre d'iOS (`ReelActionRail` :
 * aimer · commenter · enregistrer · repartager · partager · son), rendues par
 * `ViewerActionRail` : le MÊME disque, le même compteur, le même pas que le
 * rail des stories et celui de la visionneuse de médias (#8879). Ce qui reste
 * ici est ce que le réel SAIT FAIRE : un rappel absent ⇒ l'action n'existe pas
 * (loi 4, même garde que `CommentThread.canWrite`).
 *
 * « Commenter » ouvre la feuille PARTAGÉE (D-89) ; « Répondre… » — la capsule
 * de la barre basse — ouvre la MÊME, par le MÊME rappel.
 */
function reelActions({
  model,
  playable,
  soundOn,
  language,
  onToggleSound,
  onGesture,
  onShare,
  onComment,
  onRepost,
  commented,
}: Pick<ReelPageProps, 'model' | 'soundOn' | 'language' | 'onToggleSound' | 'onGesture' | 'onShare' | 'onComment' | 'onRepost'> & {
  readonly playable: boolean;
  /** Le lecteur a commenté ce réel pendant la session (`usePublicationParticipation`). */
  readonly commented: boolean;
}): readonly ViewerAction[] {
  const { liked, bookmarked, reposted } = model.viewer;
  /* L'ANNEAU DU GESTE FAIT, dans la couleur de l'auteur — `ReelActionRail.swift`
     (`outline`, `accentHex: reel.authorColor`) ; directive porteur 2026-10-01. */
  const ringed = (done: boolean): string | undefined => (done ? model.author.accentColor : undefined);
  return [
    {
      action: 'like',
      label: translate(language, 'reels.action.like'),
      glyph: railGlyph(liked ? 'heartFill' : 'heart'),
      pressed: liked,
      count: model.stats.likeCount,
      ink: liked ? 'var(--ios-error)' : undefined,
      glow: liked ? 'var(--ios-error)' : undefined,
      contour: ringed(liked),
      onPress: () => onGesture(model.id, 'like'),
      probe: { 'data-reel-gesture': 'like' },
    },
    {
      action: 'comment',
      label: translate(language, 'feed.post.action.comment'),
      glyph: railGlyph('chatCircle'),
      count: model.stats.commentCount,
      contour: ringed(commented),
      onPress: onComment === undefined ? undefined : () => onComment(model.id),
      probe: { 'data-reel-gesture': 'comment' },
    },
    {
      action: 'bookmark',
      label: translate(language, 'reels.action.bookmark'),
      glyph: railGlyph(bookmarked ? 'bookmarkFill' : 'bookmark'),
      pressed: bookmarked,
      count: model.stats.bookmarkCount,
      contour: ringed(bookmarked),
      onPress: () => onGesture(model.id, 'bookmark'),
      probe: { 'data-reel-gesture': 'bookmark' },
    },
    /* REPARTAGER — `var(--color-ok)` une fois posé (append-only, miroir
       `MeeshyColors.success` de `ReelActionRail.swift:92`) ; jamais défait par
       un second tap, iOS ne l'offre pas non plus. */
    {
      action: 'repost',
      label: translate(language, 'feed.post.action.repost'),
      glyph: railGlyph('arrowsClockwise'),
      pressed: reposted,
      count: model.stats.repostCount,
      ink: reposted ? 'var(--color-ok)' : undefined,
      contour: ringed(reposted),
      onPress: onRepost === undefined ? undefined : () => onRepost(model.id),
      probe: { 'data-reel-gesture': 'repost' },
    },
    {
      action: 'share',
      label: translate(language, 'reels.action.share'),
      glyph: railGlyph('shareNetwork'),
      count: model.stats.shareCount,
      onPress: () => onShare(model.id),
      probe: { 'data-reel-gesture': 'share' },
    },
    {
      action: 'sound',
      label: translate(language, soundOn ? 'reels.sound.off' : 'reels.sound.on'),
      glyph: railGlyph(soundOn ? 'speakerHigh' : 'speakerSlash'),
      glow: soundOn ? 'var(--ios-indigo-400)' : undefined,
      onPress: playable ? onToggleSound : undefined,
      probe: { 'data-reel-gesture': 'sound' },
    },
  ];
}

/**
 * MÉMOÏSÉE (#9277) : changer de réel ne change le `mode` que de trois pages au
 * plus ; les autres gardent leurs props (rappels stables chez l'hôte, modèle
 * mis en cache par publication) et ne se re-rendent plus pendant le geste —
 * un coût qui croissait avec chaque page de réels chargée, sur le fil
 * principal d'un Android lent.
 */
export const ReelPage = memo(function ReelPage(props: ReelPageProps) {
  const { model, index, count, mode, language } = props;
  const stage = reelStageOf(model);
  // Une scène JOUE toujours (elle est le fond) ; le bouton son n'existe que
  // si elle a un son À COUPER (`sceneHasControllableSound`, miroir
  // `BackgroundSoundBadge.showsMuteButton` — loi 4, #6903).
  /**
   * ET LE TRANSPORT A SON MOT À DIRE (#7015, seconde revue).
   * `sceneHasControllableSound` est STRUCTUREL : il répond d'après ce que le
   * DOCUMENT déclare. Une piste empruntée servie par la route authentifiée
   * peut être définitivement refusée (401) — `ReelSceneStage` l'apprend et le
   * remonte ici. Il ne reste alors à couper que la vidéo de fond NON muette ;
   * s'il n'y en a pas, le rail son serait resté au-dessus d'une scène sans
   * `<audio>` — exactement le contrôle INERTE que `playable` écarte déjà pour
   * une scène muette. Le repli est la MOITIÉ vidéo de la même loi, jamais une
   * seconde règle (`sceneHasAudibleBackgroundVideo`).
   */
  const [soundUnavailable, setSoundUnavailable] = useState<ProtectedMediaUnavailableReason | null>(null);
  const participation = usePublicationParticipation(model.id);
  const sceneSound =
    stage.kind === 'scene' &&
    (soundUnavailable === null
      ? sceneHasControllableSound({ document: stage.scene.document, sceneIndex: 0, carrier: stage.scene.carrier })
      : sceneHasAudibleBackgroundVideo({ document: stage.scene.document, sceneIndex: 0 }));
  const playable = stage.kind === 'video' || stage.kind === 'audio' || sceneSound;
  /* LA NOTE DU CRÉDIT EST LE MUET (#9698) dès que la scène annonce un son de
     fond qu'on peut couper ; le bouton son du rail ne reste que sans crédit —
     la piste propre d'une vidéo, d'un son, ou d'une vidéo de fond. */
  const noteMutes = sceneSound && documentAnnouncesSound(model.scene?.document);
  const { soundOn, onToggleSound } = props;
  const soundControl = useMemo(
    () => (noteMutes ? { muted: !soundOn, onToggle: onToggleSound, probe: { 'data-reel-gesture': 'sound' } as const } : undefined),
    [noteMutes, soundOn, onToggleSound],
  );
  const chromeHidden = props.chromeHidden === true;

  return (
    <article
      data-reel={model.id}
      data-reel-index={index}
      data-reel-mode={mode}
      tabIndex={-1}
      aria-label={translate(language, 'reels.item', { author: model.author.name, index: String(index + 1), count: String(count) })}
      className="relative w-full snap-start snap-always overflow-hidden bg-media-backdrop outline-none"
      /* `contain` (#9702) : chaque page est un îlot de mise en page et de
         peinture — un rail qui bascule ou une légende qui s'étire ne relaie
         jamais le pager ni ses voisins pendant le balayage. */
      style={{ height: '100%', contain: 'layout paint' }}
    >
      <ReelStage
        model={model}
        mode={mode}
        soundOn={props.soundOn}
        language={language}
        preferredLanguages={props.preferredLanguages}
        onSoundBlocked={props.onSoundBlocked}
        onSoundUnavailable={setSoundUnavailable}
        {...(props.mediaDeps !== undefined ? { mediaDeps: props.mediaDeps } : {})}
      />
      {/* LE CHROME CÈDE À LA FEUILLE (#8601, `lib/view/chrome-yields.ts`) — voile,
          identité, légende et rail s'effacent ENSEMBLE, inertes, quand on
          commente ; le média reste. C'est `ViewerBottomBar` qui cède (`hidden`),
          et `data-reel-chrome` est SA prise : le gate l'interroge.

          **LA COUCHE PORTE `z-[9]`, sous la barre de progression (`z-10`)** :
          le voile bas de la barre effaçait sinon le trait de lecture
          (#6903 — mesuré au pixel : ~15 % de la couleur voulue). Un
          contexte d'empilement PROPRE à la couche garde le voile en dessous,
          et la barre franche au-dessus — le pouce, lui, atteint toujours
          l'identité, le rail et la capsule, posés sur la couche. */}
      <div className="pointer-events-none absolute inset-0 z-[9]">
        <ViewerBottomBar
          probe={{ 'data-reel-chrome': '' }}
          placement="overlay"
          scrim="strong"
          hidden={chromeHidden}
          caption={
            <>
              {/* L'IDENTITÉ REPREND LE POINTEUR (#7241) — et reste en BAS avec la
                  légende (divergence admise : dans un pager vertical elle
                  appartient au contenu de la page, `ReelPageView` d'iOS ; la
                  barre haute fixe ne porte que la sortie). */}
              <div className="flex min-w-0">
                {/* LE CRÉDIT DU SON (#9678, `ReelPageView+Info.swift`) — sa propre ligne sous le nom. */}
                <ViewerIdentity
                  nameProbe={{ 'data-reel-author': '' }}
                  soundDocument={model.scene?.document}
                  soundControl={soundControl}
                  identity={{
                    name: model.author.name,
                    initials: model.author.initials,
                    avatarColor: model.author.accentColor,
                    ...(model.author.avatarSrc !== undefined ? { avatarSrc: model.author.avatarSrc } : {}),
                    ...(model.author.username !== undefined ? { profileUsername: model.author.username } : {}),
                    time: { iso: model.createdAt, label: model.relativeTime },
                  }}
                />
              </div>
              {model.text !== undefined ? (
                <p
                  data-reel-caption
                  {...(model.text.language !== '' ? { lang: model.text.language } : {})}
                  className="text-body"
                  style={{ color: 'var(--color-on-media)', display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                >
                  {model.text.full}
                </p>
              ) : null}
            </>
          }
          rail={
            <ViewerActionRail
              probe={{ 'data-reel-rail': '' }}
              label={translate(language, 'reels.title')}
              hidden={chromeHidden}
              actions={reelActions({
                model,
                playable: playable && !noteMutes,
                soundOn: props.soundOn,
                language,
                onToggleSound: props.onToggleSound,
                onGesture: props.onGesture,
                onShare: props.onShare,
                ...(props.onComment !== undefined ? { onComment: props.onComment } : {}),
                ...(props.onRepost !== undefined ? { onRepost: props.onRepost } : {}),
                commented: participation.has('commented'),
              })}
            />
          }
          reply={{
            label: translate(language, 'comments.placeholder'),
            onReply: props.onComment === undefined ? undefined : () => props.onComment?.(model.id),
          }}
        />
      </div>
    </article>
  );
});
