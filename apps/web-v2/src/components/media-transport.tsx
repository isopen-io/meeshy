import { useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';

import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import {
  PLAYBACK_SPEEDS,
  attachmentDurationLabel,
  formatMediaTime,
  keyboardSeekTarget,
  seekFraction,
  speedLabel,
} from '@/lib/view/media-transport';
import type { MediaPlayback } from '@/lib/view/use-media-playback';

import '@/styles/media-transport.css';

import { GlyphSvg } from './glyph';
import { MEDIA_TRANSPORT_GLYPHS } from './glyphs-media-transport';

export type MediaTransportProps = {
  readonly playback: MediaPlayback;
  /** La durée de la PIÈCE JOINTE (ms) — la seule lisible avant que l'élément ait chargé ses métadonnées. */
  readonly durationMs: number | undefined;
  readonly language: InterfaceLanguage;
};

/**
 * LA BARRE DE LECTURE DU COULOIR BAS (#6359) — miroir de
 * `VideoTransportControls(controls: [.scrubber, .mute, .speed, .pip],
 * placement: .corridor)` (`ConversationMediaGalleryView+Transport.swift`) :
 * la piste qu'on parcourt, le temps, le muet, et un menu « ⋯ » qui porte la
 * vitesse et l'image dans l'image.
 *
 * TANT QUE L'ÉLÉMENT N'A PAS DE DURÉE, AUCUNE PISTE : une ligne qu'on ne peut
 * pas parcourir serait un contrôle sans effet (loi 4). Seule la durée de la
 * pièce jointe s'affiche, et elle ne ment jamais (`currentDurationLabel`).
 *
 * LA VIDÉO SUIT LE DOIGT : chaque `pointermove` d'un geste en cours déplace
 * RÉELLEMENT la lecture (`seek`), le relâcher ne fait que conclure. C'est la
 * forme que `VideoTransportControls.seekBar` a prise après le retour porteur du
 * 2026-09-13 (« on voit le recul sur les frames ») et que la directive « les
 * gestes de glissement sont progressifs et annulables » exige.
 */
export function MediaTransport({ playback, durationMs, language }: MediaTransportProps) {
  const [scrubFraction, setScrubFraction] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const draggingRef = useRef(false);
  const moreButtonRef = useRef<HTMLButtonElement | null>(null);

  const { duration, position, muted, rate, pictureInPicture } = playback;

  if (duration <= 0) {
    const pieceLabel = attachmentDurationLabel(durationMs);
    if (pieceLabel === null) return null;
    return (
      <div data-media-transport="duration" className="media-transport">
        <span className="media-transport-time media-transport-time-alone">{pieceLabel}</span>
      </div>
    );
  }

  const shownSeconds = scrubFraction !== null ? scrubFraction * duration : position;
  const fraction = Math.min(1, Math.max(0, shownSeconds / duration));
  const elapsedLabel = formatMediaTime(shownSeconds);
  const totalLabel = formatMediaTime(duration);

  const seekAt = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect();
    const next = seekFraction({ clientX: event.clientX, left: rect.left, width: rect.width });
    setScrubFraction(next);
    playback.seek(next * duration);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    event.stopPropagation();
    draggingRef.current = true;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Un pointeur synthétique n'a pas toujours de capture possible ; le geste reste suivi par la piste.
    }
    seekAt(event);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!draggingRef.current) return;
    event.stopPropagation();
    seekAt(event);
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!draggingRef.current) return;
    event.stopPropagation();
    draggingRef.current = false;
    seekAt(event);
    setScrubFraction(null);
  };

  const onPointerCancel = (): void => {
    draggingRef.current = false;
    setScrubFraction(null);
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    const target = keyboardSeekTarget({ key: event.key, position, duration });
    if (target === null) return;
    event.preventDefault();
    event.stopPropagation();
    playback.seek(target);
  };

  const pipOffered = pictureInPicture !== 'unsupported';

  return (
    <div data-media-transport="bar" className="media-transport">
      <div
        role="slider"
        tabIndex={0}
        aria-label={translate(language, 'media.video.position')}
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.floor(shownSeconds)}
        aria-valuetext={translate(language, 'media.video.position.value', { elapsed: elapsedLabel, total: totalLabel })}
        className="media-transport-track"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <span className="media-transport-rail" aria-hidden />
        <span className="media-transport-fill" style={{ transform: `scaleX(${fraction})` }} aria-hidden />
        <span className="media-transport-thumb" style={{ left: `${fraction * 100}%` }} aria-hidden />
      </div>

      <span className="media-transport-time">{`${elapsedLabel} / ${totalLabel}`}</span>

      <button
        type="button"
        aria-label={translate(language, muted ? 'media.video.unmute' : 'media.video.mute')}
        aria-pressed={muted}
        className="media-transport-button"
        onClick={() => playback.setMuted(!muted)}
      >
        <GlyphSvg glyph={muted ? MEDIA_TRANSPORT_GLYPHS.speakerSlash : MEDIA_TRANSPORT_GLYPHS.speakerHigh} size={18} />
      </button>

      <div className="media-transport-more">
        <button
          ref={moreButtonRef}
          type="button"
          aria-label={translate(language, 'media.video.more_options')}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className="media-transport-button"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <GlyphSvg glyph={MEDIA_TRANSPORT_GLYPHS.dotsThree} size={18} />
        </button>
        {menuOpen ? (
          <div
            role="menu"
            aria-label={translate(language, 'media.video.more_options')}
            className="media-transport-menu"
            onKeyDown={(event) => {
              // Échap referme CE menu : la visionneuse, qui ferme sur Échap,
              // ne doit pas le recevoir en même temps.
              if (event.key !== 'Escape') return;
              event.preventDefault();
              event.stopPropagation();
              setMenuOpen(false);
              moreButtonRef.current?.focus();
            }}
          >
            <div role="group" aria-label={translate(language, 'media.video.speed')}>
              {PLAYBACK_SPEEDS.map((speed) => (
                <button
                  key={speed}
                  type="button"
                  role="menuitemradio"
                  aria-checked={rate === speed}
                  className="media-transport-menu-item"
                  onClick={() => {
                    playback.setRate(speed);
                    setMenuOpen(false);
                  }}
                >
                  {speedLabel(speed, language)}
                </button>
              ))}
            </div>
            {pipOffered ? (
              <button
                type="button"
                role="menuitem"
                className="media-transport-menu-item"
                onClick={() => {
                  playback.togglePictureInPicture();
                  setMenuOpen(false);
                }}
              >
                {translate(language, pictureInPicture === 'active' ? 'media.video.pip.exit' : 'media.video.pip.enter')}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
