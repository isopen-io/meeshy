import { useCallback, useRef } from 'react';

import { attachmentSrc } from '@/lib/api/media-url';
import type { Attachment } from '@/lib/api/types';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { PIECE_RATIO_ATTRIBUTE, pieceAspectRatio } from '@/lib/view/message-preview';
import {
  DURATION_BADGE_OPACITY,
  PLAY_DIAMETER_MULTI,
  PLAY_DIAMETER_SOLO,
  soloVideoSlot,
} from '@/lib/view/media-grid-layout';
import { useMediaPlayback } from '@/lib/view/use-media-playback';
import { handOffVideoPosition } from '@/lib/view/video-handoff';

import { AttachmentReactionBadge } from './attachment-reaction-badge';
import { Glyph, GlyphSvg } from './glyph';
import { MEDIA_GLYPHS } from './glyphs-media';
import { MEDIA_TRANSPORT_GLYPHS } from './glyphs-media-transport';
import { THREAD_STATES_GLYPHS } from './glyphs-thread-states';

/** `duration` en MILLISECONDES (même convention que `VoiceAttachment`) → `m:ss`. */
const durationLabelOf = (durationMs: number | undefined): string | undefined => {
  if (durationMs === undefined) return undefined;
  const seconds = Math.round(durationMs / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

/**
 * LE REPLI D'UNE PIÈCE VIDÉO SANS FICHIER (#6193, déménagé ici #6221 étape 4)
 * — la LECTURE (poster, `<video>`, plein écran) est désormais ASSURÉE par
 * `VideoTile` ; ce widget reste le repli D-42 pour une pièce SANS `fileUrl`
 * (fixture legacy, ou une pièce dont l'upload a échoué avant l'URL).
 */
export function VideoFallback({ attachment }: { readonly attachment: Attachment }) {
  const duration = durationLabelOf(attachment.duration);

  return (
    <div className="flex items-center gap-2 py-1" data-attachment={attachment.id} data-video-fallback>
      <GlyphSvg glyph={THREAD_STATES_GLYPHS.videoCamera} size={24} />
      <span className="min-w-0 flex-1 truncate text-title">
        {attachment.originalName !== '' ? attachment.originalName : 'Vidéo'}
      </span>
      <span className="shrink-0 text-time opacity-70 tabular-nums">
        {duration ?? `${Math.round(attachment.fileSize / 1024)} Ko`}
      </span>
    </div>
  );
}

/** Le ratio INTRINSÈQUE d'une pièce, ou `undefined` — `soloVideoSlot` sait déjà replier sur 16/9. */
const intrinsicRatio = (attachment: Attachment): number | undefined =>
  attachment.width !== undefined && attachment.height !== undefined && attachment.height > 0
    ? attachment.width / attachment.height
    : undefined;

/** Le diamètre des deux petits contrôles de tête (son, plein écran) — `28 × 28` d'iOS (`MeeshyVideoPlayer+Controls.swift`, `topBar`). */
const HEAD_CONTROL_PX = 28;

/**
 * `VideoTile` (#6221, #8234) — LA VIDÉO REÇUE DANS LE FIL, miroir de
 * `MeeshyVideoPlayer(.inline, controls: .inlineMinimal, surfaceTapExpands:
 * true)` (#8231, directive porteur du 2026-09-27, amendée : « il faut
 * permettre de jouer en inline mais avec peu de contrôleurs : son,
 * pause/play et plein écran »).
 *
 * UN GESTE, UN EFFET :
 *  - toucher la SURFACE (hors contrôles) ouvre le plein écran DIRECTEMENT,
 *    avant comme pendant la lecture. Pendant la lecture, la tuile se met en
 *    pause et CONFIE sa position à la visionneuse (`handOffVideoPosition`),
 *    qui reprend à la même image. La surface est un `<button>` : Entrée et
 *    Espace l'activent nativement ;
 *  - le bouton ▶︎ lit DANS LE FIL. Une fois la lecture partie, EXACTEMENT trois
 *    contrôles : pause/lecture au centre, son et plein écran en tête. Ni
 *    barre, ni temps, ni vitesse, ni image dans l'image : c'est la visionneuse
 *    qui les porte. Les contrôles ne se masquent pas — toucher la surface
 *    ouvre le plein écran, il ne pourrait plus les faire revenir.
 *
 * La tuile reste un `<div>` : la surface et les contrôles sont des boutons
 * VOISINS, jamais imbriqués.
 *
 * `solo` NE CHOISIT PLUS SEULEMENT UN DIAMÈTRE : IL DÉCIDE QUI DIMENSIONNE
 * (#7016). En GRILLE, la case est déjà dimensionnée par `mediaGridSlots` et la
 * tuile la remplit (`size-full`) ; SEULE, aucun porteur ne lui donnait de
 * hauteur — `size-full` contre un parent en hauteur `auto` se résout en `auto`
 * → contenu → **ZÉRO**, et tous les enfants étant `absolute inset-0`, la vidéo
 * disparaissait purement et simplement (mesuré : 246 × 0 en Focal, 119 × 0 en
 * Bulles). La loi qui la dimensionne — `soloVideoSlot`, miroir de
 * `FocalMediaGridLayout.soloVideoSlot` — existait, testée et gardée par le
 * gate de cotes, sans AUCUN site d'appel.
 *
 * C'est ICI qu'elle s'applique, et pas chez l'hôte : `VideoTile` est le seul à
 * savoir qu'un `fileUrl` vide le fait retomber sur `VideoFallback` — une
 * RANGÉE de texte, que boucler dans une boîte 300 × 168,75 déformerait. Une
 * boîte posée par `MediaGrid` ne pourrait pas le savoir sans recopier ce
 * prédicat.
 *
 * `width` + `aspectRatio` + `maxWidth: 100 %` — exactement la recette
 * d'`ImageTile` : la hauteur DESCEND avec la largeur quand le porteur est plus
 * étroit que 300 px (le cas nominal de la bulle, 253,4 px à 390 px), là où un
 * `height` figé écraserait l'image. Le PLAFOND de hauteur que `soloVideoSlot`
 * applique (1,6 × la largeur, pour qu'un portrait 9:16 ne mange pas l'écran)
 * voyage dans le ratio : il est déjà mordu au moment où la loi rend son couple.
 */
export function VideoTile({
  attachment,
  solo,
  onExpand,
}: {
  readonly attachment: Attachment;
  readonly solo: boolean;
  readonly onExpand: () => void;
}) {
  /**
   * `report` (#7225, W6) — LA VIDÉO AUSSI reprend et rapporte : le lot est
   * nommé « un audio OU UNE VIDÉO reprend là où on l'avait laissé », et le
   * verbe du wire pour une vidéo est `watched` (`AttachmentStatusBodySchema`,
   * `services/gateway/src/validation/messages-schemas.ts:212-251`), servi par
   * `lastWatchPositionMs`/`watchedComplete` — JAMAIS les champs audio, qui
   * vivent à côté d'eux sur le même objet.
   */
  const consumption = attachment.currentUserConsumption;
  const { status, muted, toggle, setMuted, bind } = useMediaPlayback({
    attachmentId: attachment.id,
    report: {
      kind: 'watched',
      ...(attachment.duration !== undefined ? { durationMs: attachment.duration } : {}),
      ...(consumption != null
        ? { resume: { positionMs: consumption.lastWatchPositionMs, complete: consumption.watchedComplete } }
        : {}),
    },
  });
  /* La position au moment d'ouvrir le plein écran se lit sur l'ÉLÉMENT : le
     moteur ne la suit pas hors visionneuse (`tracksTime`), et la tuile n'a pas
     à se re-rendre chaque seconde pour un chiffre qu'elle ne montre pas. Un
     `ref` STABLE : un rappel neuf à chaque rendu délierait puis relierait
     l'élément, et `bind(null)` ramène la lecture à `idle`. */
  const elementRef = useRef<HTMLMediaElement | null>(null);
  const bindElement = useCallback(
    (element: HTMLMediaElement | null) => {
      elementRef.current = element;
      bind(element);
    },
    [bind],
  );

  if (attachment.fileUrl === '') return <VideoFallback attachment={attachment} />;

  const diameter = solo ? PLAY_DIAMETER_SOLO : PLAY_DIAMETER_MULTI;
  const slot = solo ? soloVideoSlot(intrinsicRatio(attachment)) : undefined;
  const durationLabel = durationLabelOf(attachment.duration);
  const isPlaying = status === 'playing';
  const isError = status === 'error';
  /* La lecture est PARTIE dès le premier ▶︎ : les trois contrôles restent
     ensuite, en pause comme en lecture. Au repos, le poster et son ▶︎ seuls. */
  const started = status === 'playing' || status === 'paused';
  const language = currentInterfaceLanguage();
  const posterUrl = attachment.thumbnailUrl !== undefined && attachment.thumbnailUrl !== '' ? attachmentSrc(attachment.thumbnailUrl) : undefined;

  const expand = (): void => {
    const element = elementRef.current;
    if (started && element !== null) {
      handOffVideoPosition({ attachmentId: attachment.id, positionMs: Math.round(element.currentTime * 1000) });
    }
    if (isPlaying) toggle();
    onExpand();
  };

  const headControlStyle = {
    width: HEAD_CONTROL_PX,
    height: HEAD_CONTROL_PX,
    backgroundColor: 'rgba(0,0,0,0.45)',
  };

  return (
    <div
      data-attachment={attachment.id}
      data-video-status={status}
      /* `data-media-tile` (#6169) — la tuile occupe une CASE de la grille au
         même titre qu'`ImageTile`/`GridCellImage` ; ses gestes vivent dans ses
         boutons (#8234). */
      data-media-tile
      {...{ [PIECE_RATIO_ATTRIBUTE]: pieceAspectRatio(attachment) }}
      className={
        slot === undefined
          ? 'relative size-full overflow-hidden bg-black'
          : 'relative overflow-hidden rounded-media bg-black'
      }
      {...(slot !== undefined
        ? { style: { width: slot.width, maxWidth: '100%', aspectRatio: `${slot.width} / ${slot.height}` } }
        : {})}
    >
      {/* `key={attachment.fileUrl}` (même dispositif que `VoiceAttachment`) —
          une source qui change REMONTE l'élément, jamais une réutilisation
          silencieuse d'un `<video>` déjà lié à une autre piste. */}
      <video
        key={attachment.fileUrl}
        ref={bindElement}
        preload="none"
        playsInline
        {...(posterUrl !== undefined ? { poster: posterUrl } : {})}
        src={attachmentSrc(attachment.fileUrl)}
        className="absolute inset-0 size-full object-cover"
      />

      {/* LA SURFACE (#8234) — tout ce qui n'est pas un contrôle ouvre le plein
          écran. Posée SOUS les contrôles, qui la recouvrent là où ils sont. */}
      <button
        type="button"
        data-video-surface
        onClick={expand}
        aria-label={translate(language, 'media.viewer.open_fullscreen')}
        className="absolute inset-0 size-full"
      />

      <button
        type="button"
        data-video-control="play-pause"
        data-play-diameter={diameter}
        onClick={toggle}
        aria-label={translate(language, isPlaying ? 'media.video.pause' : 'media.video.play')}
        className="tap-target-34 absolute inset-0 m-auto grid place-items-center rounded-full"
        style={{
          width: diameter,
          height: diameter,
          backgroundColor: 'color-mix(in srgb, var(--accent) 85%, transparent)',
        }}
      >
        {isPlaying ? (
          <GlyphSvg glyph={MEDIA_GLYPHS.pause} size={diameter * 0.32} className="text-white" />
        ) : (
          <Glyph name="fillPlay" size={diameter * 0.34} className="text-white" />
        )}
      </button>

      {started ? (
        <div data-video-head className="absolute inset-x-0 top-1.5 flex justify-center gap-2.5">
          <button
            type="button"
            data-video-control="expand"
            onClick={expand}
            aria-label={translate(language, 'media.viewer.open_fullscreen')}
            className="tap-target-34 grid place-items-center rounded-full text-white"
            style={headControlStyle}
          >
            <GlyphSvg glyph={MEDIA_GLYPHS.arrowsOutSimple} size={13} />
          </button>
          <button
            type="button"
            data-video-control="mute"
            onClick={() => setMuted(!muted)}
            aria-label={translate(language, muted ? 'media.video.unmute' : 'media.video.mute')}
            className="tap-target-34 grid place-items-center rounded-full text-white"
            style={headControlStyle}
          >
            <GlyphSvg glyph={muted ? MEDIA_TRANSPORT_GLYPHS.speakerSlash : MEDIA_TRANSPORT_GLYPHS.speakerHigh} size={13} />
          </button>
        </div>
      ) : durationLabel !== undefined ? (
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-1.5 right-1.5 rounded-full px-1.5 py-0.5 text-mini font-medium text-white tabular-nums"
          style={{ backgroundColor: `rgba(0,0,0,${DURATION_BADGE_OPACITY})` }}
        >
          {durationLabel}
        </span>
      ) : null}

      <AttachmentReactionBadge attachment={attachment} />

      {isError ? (
        <div
          data-video-error-band
          className="absolute inset-x-0 bottom-0 flex items-center justify-center bg-black/60 py-1"
        >
          <button
            type="button"
            onClick={toggle}
            className="text-mini text-white underline"
            style={{ minHeight: 44 }}
          >
            Lecture impossible — Réessayer
          </button>
        </div>
      ) : null}
    </div>
  );
}
