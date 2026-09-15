import { attachmentSrc } from '@/lib/api/media-url';
import type { Attachment } from '@/lib/api/types';
import { DURATION_BADGE_OPACITY, PLAY_DIAMETER_MULTI, PLAY_DIAMETER_SOLO } from '@/lib/view/media-grid-layout';
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

/**
 * `VideoTile` (#6221) — LA LECTURE VIDÉO INLINE, miroir de `BubbleGridVideo
 * ThumbnailView`/`videoBody` (`+Media.swift:477-749`) : poster servi, bouton
 * central play/pause (`PLAY_DIAMETER_SOLO`/`MULTI`), badge de durée, barre
 * de progression en pied, bande d'erreur avec reprise.
 *
 * `onExpand` — tap HORS du bouton central ⇒ la visionneuse (§1.5 tableau
 * d'écarts) ; le bouton, lui, ne fait QUE piloter la lecture INLINE
 * (`useMediaPlayback`, coordinateur PARTAGÉ avec les vocaux — #6221).
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
  const { status, progress, toggle, bind } = useMediaPlayback({ attachmentId: attachment.id });

  if (attachment.fileUrl === '') return <VideoFallback attachment={attachment} />;

  const diameter = solo ? PLAY_DIAMETER_SOLO : PLAY_DIAMETER_MULTI;
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
      className="relative size-full overflow-hidden bg-black"
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
