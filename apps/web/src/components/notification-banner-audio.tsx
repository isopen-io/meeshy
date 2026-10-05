import { useEffect, useRef, type KeyboardEvent, type PointerEvent } from 'react';

import { attachmentSrc } from '@/lib/api/media-url';
import { translateNotificationRow } from '@/lib/i18n-notification-row-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import type { BannerAudio } from '@/lib/notifications/content-detail';
import { formatMediaTime, keyboardSeekTarget, seekFraction } from '@/lib/view/seek-track';
import { useMediaPlayback } from '@/lib/view/use-media-playback';

import { Glyph, GlyphSvg } from './glyph';
import { MEDIA_GLYPHS } from './glyphs-media';

/**
 * **LE VOCAL S'ÉCOUTE DEPUIS LA BANNIÈRE** (#8860, jumeau web de la
 * notification déployée iOS, #8859). Directive porteur : un lecteur ÉLÉGANT et
 * ALIGNÉ — lecture et vitesse ont le MÊME gabarit et partagent l'axe de la
 * ligne de progression ; la ligne porte un bouton et sa partie jouée à la
 * couleur d'accent ; les deux temps, en petit SOUS la ligne, s'alignent sur
 * ses bords.
 *
 * Le fichier ne se charge qu'au premier « Écouter » (`preload="none"`) : une
 * bannière qui passe ne télécharge rien. Pendant la lecture, la bannière ne
 * part pas (`onPlayingChange`). Aucun geste ici ne remonte à la carte : le
 * tirage vertical qui la ferme ne doit pas naître d'un réglage de la ligne.
 */

const CONTROL = 30;
const LINE = 3;
const KNOB = 12;

const stop = (event: PointerEvent<HTMLElement>) => event.stopPropagation();

/**
 * Trois vitesses, pas cinq : un vocal écouté depuis une bannière se survole.
 * `lib/view/media-transport.ts` (les cinq de la visionneuse) n'est pas importé :
 * son chunk ne se charge qu'à la demande (`budgets.json` › `media_transport`).
 */
const BANNER_SPEEDS = [1, 1.5, 2] as const;

function nextSpeed(rate: number): number {
  const index = BANNER_SPEEDS.findIndex((speed) => speed === rate);
  return BANNER_SPEEDS[(index + 1) % BANNER_SPEEDS.length] ?? 1;
}

const speedLabel = (rate: number, language: string): string => `${new Intl.NumberFormat(language).format(rate)}×`;

export function BannerAudioPlayer({
  audio,
  audioKey,
  accent,
  language,
  onPlayingChange,
}: {
  readonly audio: BannerAudio;
  readonly audioKey: string;
  readonly accent: string;
  readonly language: InterfaceLanguage;
  readonly onPlayingChange: (playing: boolean) => void;
}) {
  const playback = useMediaPlayback({ attachmentId: `notification:${audioKey}`, tracksTime: true });
  const playing = playback.status === 'playing';
  const duration = playback.duration > 0 ? playback.duration : (audio.durationMs ?? 0) / 1000;
  const fraction = duration > 0 ? Math.min(1, playback.position / duration) : playback.progress;
  const track = useRef<HTMLSpanElement | null>(null);
  const seeking = useRef(false);

  useEffect(() => onPlayingChange(playing), [playing, onPlayingChange]);

  const seekAt = (clientX: number) => {
    const element = track.current;
    if (element === null || duration <= 0) return;
    const box = element.getBoundingClientRect();
    const raw = seekFraction({ clientX, left: box.left, width: box.width });
    const rtl = getComputedStyle(element).direction === 'rtl';
    playback.seek((rtl ? 1 - raw : raw) * duration);
  };

  const onTrackDown = (event: PointerEvent<HTMLSpanElement>) => {
    event.stopPropagation();
    seeking.current = true;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* Pointeur synthétique sans capture : le geste reste suivi tant qu'il survole la ligne. */
    }
    seekAt(event.clientX);
  };
  const onTrackMove = (event: PointerEvent<HTMLSpanElement>) => {
    event.stopPropagation();
    if (seeking.current) seekAt(event.clientX);
  };
  const onTrackUp = (event: PointerEvent<HTMLSpanElement>) => {
    event.stopPropagation();
    seeking.current = false;
  };
  const onTrackKey = (event: KeyboardEvent<HTMLSpanElement>) => {
    const target = keyboardSeekTarget({ key: event.key, position: playback.position, duration, step: 5 });
    if (target === null) return;
    event.preventDefault();
    event.stopPropagation();
    playback.seek(target);
  };

  const control = { width: CONTROL, height: CONTROL, borderRadius: CONTROL / 2, flexShrink: 0 } as const;
  const played = `${(fraction * 100).toFixed(2)}%`;

  return (
    <div data-banner-audio className="flex min-w-0 items-start gap-2.5" onPointerDown={stop}>
      <audio ref={playback.bind} preload="none" src={attachmentSrc(audio.url)} className="hidden" />
      <button
        type="button"
        data-banner-audio-toggle
        onClick={playback.toggle}
        aria-label={translateNotificationRow(language, playing ? 'notifications.banner.pause' : 'notifications.banner.play')}
        className="grid place-items-center text-ios-on-brand focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{
          ...control,
          outlineColor: accent,
          backgroundImage: `linear-gradient(135deg, ${accent}, color-mix(in srgb, ${accent} 72%, var(--color-media-backdrop)))`,
          boxShadow: `0 2px 6px color-mix(in srgb, ${accent} 35%, transparent)`,
        }}
      >
        {playing ? <GlyphSvg glyph={MEDIA_GLYPHS.pause} size={12} /> : <Glyph name="fillPlay" size={12} />}
      </button>
      <span className="flex min-w-0 flex-1 flex-col">
        <span
          ref={track}
          role="slider"
          tabIndex={0}
          aria-label={translateNotificationRow(language, 'notifications.banner.play')}
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(playback.position)}
          aria-valuetext={`${formatMediaTime(playback.position)} / ${formatMediaTime(duration)}`}
          onPointerDown={onTrackDown}
          onPointerMove={onTrackMove}
          onPointerUp={onTrackUp}
          onPointerCancel={onTrackUp}
          onKeyDown={onTrackKey}
          className="relative block cursor-pointer rounded-full focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ height: CONTROL, touchAction: 'none', outlineColor: accent }}
        >
          <span
            aria-hidden="true"
            className="absolute inset-x-0 rounded-full"
            style={{ top: (CONTROL - LINE) / 2, height: LINE, backgroundColor: 'color-mix(in srgb, var(--color-ios-ink-2) 26%, transparent)' }}
          />
          <span
            aria-hidden="true"
            data-banner-audio-played
            className="absolute rounded-full"
            style={{ top: (CONTROL - LINE) / 2, height: LINE, insetInlineStart: 0, width: played, backgroundColor: accent }}
          />
          <span
            aria-hidden="true"
            data-banner-audio-knob
            className="absolute rounded-full"
            style={{
              top: (CONTROL - KNOB) / 2,
              width: KNOB,
              height: KNOB,
              insetInlineStart: `calc(${played} - ${KNOB / 2}px)`,
              backgroundColor: accent,
              boxShadow: '0 0 0 2px var(--color-ios-surface), 0 1px 3px var(--color-scrim-soft)',
            }}
          />
        </span>
        <span className="-mt-1.5 flex justify-between text-time font-medium tabular-nums leading-none" style={{ color: 'var(--color-ios-ink-2)' }}>
          <span>{formatMediaTime(playback.position)}</span>
          <span>{formatMediaTime(duration)}</span>
        </span>
      </span>
      <button
        type="button"
        data-banner-audio-speed
        onClick={() => playback.setRate(nextSpeed(playback.rate))}
        aria-label={translateNotificationRow(language, 'notifications.banner.speed')}
        className="grid place-items-center text-mini font-semibold tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ ...control, outlineColor: accent, color: accent, backgroundColor: `color-mix(in srgb, ${accent} 14%, transparent)` }}
      >
        {speedLabel(playback.rate, language)}
      </button>
    </div>
  );
}
