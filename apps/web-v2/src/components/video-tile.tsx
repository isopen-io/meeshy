import { attachmentSrc } from '@/lib/api/media-url';
import type { Attachment } from '@/lib/api/types';
import {
  DURATION_BADGE_OPACITY,
  PLAY_DIAMETER_MULTI,
  PLAY_DIAMETER_SOLO,
  soloVideoSlot,
} from '@/lib/view/media-grid-layout';
import { useMediaPlayback } from '@/lib/view/use-media-playback';

import { Glyph, GlyphSvg } from './glyph';
import { MEDIA_GLYPHS } from './glyphs-media';
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

/**
 * `VideoTile` (#6221) — LA LECTURE VIDÉO INLINE, miroir de `BubbleGridVideo
 * ThumbnailView`/`videoBody` (`+Media.swift:477-749`) : poster servi, bouton
 * central play/pause (`PLAY_DIAMETER_SOLO`/`MULTI`), badge de durée, barre
 * de progression en pied, bande d'erreur avec reprise.
 *
 * `onExpand` — tap HORS du bouton central ⇒ la visionneuse (§1.5 tableau
 * d'écarts) ; le bouton, lui, ne fait QUE piloter la lecture INLINE
 * (`useMediaPlayback`, coordinateur PARTAGÉ avec les vocaux — #6221).
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
  const { status, progress, toggle, bind } = useMediaPlayback({
    attachmentId: attachment.id,
    report: {
      kind: 'watched',
      ...(attachment.duration !== undefined ? { durationMs: attachment.duration } : {}),
      ...(consumption != null
        ? { resume: { positionMs: consumption.lastWatchPositionMs, complete: consumption.watchedComplete } }
        : {}),
    },
  });

  if (attachment.fileUrl === '') return <VideoFallback attachment={attachment} />;

  const diameter = solo ? PLAY_DIAMETER_SOLO : PLAY_DIAMETER_MULTI;
  const slot = solo ? soloVideoSlot(intrinsicRatio(attachment)) : undefined;
  const durationLabel = durationLabelOf(attachment.duration);
  const isPlaying = status === 'playing';
  const isError = status === 'error';
  const posterUrl = attachment.thumbnailUrl !== undefined && attachment.thumbnailUrl !== '' ? attachmentSrc(attachment.thumbnailUrl) : undefined;

  return (
    <div
      data-attachment={attachment.id}
      data-video-status={status}
      /* `data-media-tile` (#6169) — MANQUANT jusqu'ici : une grille comptant
         3 pièces dont une vidéo ne rendait que 2 `[data-media-tile]`,
         `ImageTile`/`GridCellImage` étant les SEULS à le poser. La tuile
         reste un `<div onClick>` (pas un `<button>`) — le clic pilote la
         lecture inline (`onExpand`), un rôle distinct d'« ouvrir la
         visionneuse » que `ImageTile`/`GridCellImage` remplissent en bouton
         — mais elle occupe une CASE de la grille au même titre qu'elles. */
      data-media-tile
      className={
        slot === undefined
          ? 'relative size-full overflow-hidden bg-black'
          : 'relative overflow-hidden rounded-media bg-black'
      }
      {...(slot !== undefined
        ? { style: { width: slot.width, maxWidth: '100%', aspectRatio: `${slot.width} / ${slot.height}` } }
        : {})}
      onClick={onExpand}
      role="presentation"
    >
      {/* `key={attachment.fileUrl}` (même dispositif que `VoiceAttachment`) —
          une source qui change REMONTE l'élément, jamais une réutilisation
          silencieuse d'un `<video>` déjà lié à une autre piste. */}
      <video
        key={attachment.fileUrl}
        ref={bind}
        preload="none"
        playsInline
        {...(posterUrl !== undefined ? { poster: posterUrl } : {})}
        src={attachmentSrc(attachment.fileUrl)}
        className="absolute inset-0 size-full object-cover"
      />

      <button
        type="button"
        data-play-diameter={diameter}
        onClick={(event) => {
          event.stopPropagation();
          toggle();
        }}
        aria-label={isPlaying ? 'Mettre en pause' : 'Lire la vidéo'}
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

      {durationLabel !== undefined ? (
        <span
          className="absolute bottom-1.5 right-1.5 rounded-full px-1.5 py-0.5 text-mini font-medium text-white tabular-nums"
          style={{ backgroundColor: `rgba(0,0,0,${DURATION_BADGE_OPACITY})` }}
        >
          {durationLabel}
        </span>
      ) : null}

      {isPlaying || progress > 0 ? (
        <span
          aria-hidden
          data-video-progress
          className="absolute inset-x-0 bottom-0 block h-[3px] origin-left"
          style={{ backgroundColor: 'var(--accent)', transform: `scaleX(${progress})` }}
        />
      ) : null}

      {isError ? (
        <div
          data-video-error-band
          className="absolute inset-x-0 bottom-0 flex items-center justify-center bg-black/60 py-1"
        >
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              toggle();
            }}
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
