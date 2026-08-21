'use client';

import type { BackgroundSoundV3 } from '@meeshy/shared/types/canvas-v3';
import { formatDuration } from '@/utils/audio-formatters';
import { cn } from '@/lib/utils';

const ORIGINAL_GLYPH = '♫〰';
const GENERIC_CREDIT_GLYPH = '♫ —';

export interface BackgroundSoundMeta {
  title?: string | null;
  username?: string | null;
  durationSeconds?: number | null;
}

/**
 * Résolveur PUR de l'annonce du fond audio — miroir exact du contrat B5 iOS
 * (`AudioChipDisplay.backgroundAnnouncement`, packages/MeeshySDK).
 *
 * B3.5 (existence) : pas de piste ⇒ `null`, rien à annoncer.
 * B3.4 (provenance) : piste ORIGINALE ⇒ `♫〰`, SI ET SEULEMENT SI — jamais pour
 * une piste de bibliothèque, même sans métadonnées résolues (cache froid) :
 * ce cas garde la forme CRÉDIT (`♫ —`), qui ne ment jamais sur la provenance.
 */
export function backgroundAnnouncement(
  sound: BackgroundSoundV3 | null | undefined,
  meta: BackgroundSoundMeta = {},
): string | null {
  if (!sound) return null;
  if (sound.source.t === 'original') return ORIGINAL_GLYPH;

  const title = meta.title?.trim() || undefined;
  const handle = meta.username?.trim().replace(/^@+/, '') || undefined;
  const duration =
    typeof meta.durationSeconds === 'number' && Number.isFinite(meta.durationSeconds)
      ? formatDuration(meta.durationSeconds)
      : undefined;

  const parts = [title, handle ? `@${handle}` : undefined, duration].filter(
    (part): part is string => Boolean(part),
  );
  return parts.length > 0 ? parts.join(' · ') : GENERIC_CREDIT_GLYPH;
}

export interface BackgroundSoundBadgeProps {
  sound?: BackgroundSoundV3 | null;
  title?: string | null;
  username?: string | null;
  durationSeconds?: number | null;
  /**
   * État muet du lecteur LOCAL que ce bouton bascule (vidéo de fond, ou
   * `<audio>` quand une URL de piste est déjà servie par le fil). Un son de
   * bibliothèque sans URL résolue reste monté sans lecture — dette explicite,
   * la résolution d'URL de son web est post-v1.
   */
  muted: boolean;
  onToggleMute?: () => void;
  muteLabel?: string;
  unmuteLabel?: string;
  className?: string;
}

/**
 * Annonce du fond + bouton 🔇 (B3.3-6 côté web). N'existe QUE si une piste
 * existe (B3.5) : sans piste, rend RIEN — pas de placeholder, pas de bouton.
 */
export function BackgroundSoundBadge({
  sound,
  title,
  username,
  durationSeconds,
  muted,
  onToggleMute,
  muteLabel = 'Mute',
  unmuteLabel = 'Unmute',
  className,
}: BackgroundSoundBadgeProps) {
  const announcement = backgroundAnnouncement(sound, { title, username, durationSeconds });
  if (announcement === null) return null;

  return (
    <div
      data-testid="background-sound-badge"
      className={cn('flex items-center gap-1.5 text-xs text-white/80', className)}
    >
      <span data-testid="background-sound-announcement" className="truncate max-w-[10rem]">
        {announcement}
      </span>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onToggleMute?.();
        }}
        aria-label={muted ? unmuteLabel : muteLabel}
        aria-pressed={muted}
        data-testid="background-sound-mute-toggle"
        className="p-1 rounded-full text-white/90 hover:text-white hover:bg-white/10 transition-colors duration-300"
      >
        {muted ? '🔇' : '🔊'}
      </button>
    </div>
  );
}
