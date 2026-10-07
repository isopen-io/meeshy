import { useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';

import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { PLAYBACK_SPEEDS, formatMediaTime, keyboardSeekTarget, seekFraction, speedLabel } from '@/lib/view/media-transport';
import type { MediaPlayback } from '@/lib/view/use-media-playback';

import '@/styles/media-transport.css';

import { GlyphSvg } from './glyph';
import { MEDIA_TRANSPORT_GLYPHS } from './glyphs-media-transport';
import { VIEWER_GLASS } from './viewer-chrome';

export type MediaTransportProps = {
  readonly playback: MediaPlayback;
  readonly language: InterfaceLanguage;
};

/**
 * LA BARRE DE LECTURE DU COULOIR BAS (#6359, #9577) — la PISTE qu'on parcourt,
 * seule, sur toute la largeur de l'écran. Le muet et « ⋯ » ont rejoint la
 * colonne d'actions (`VideoRailControls`) ; le temps est dit par la ligne
 * d'informations de la visionneuse, qui décompte pendant la lecture. Le
 * curseur garde les deux bouts pour un lecteur d'écran (`aria-valuetext`).
 *
 * TANT QUE L'ÉLÉMENT N'A PAS DE DURÉE, AUCUNE PISTE : une ligne qu'on ne peut
 * pas parcourir serait un contrôle sans effet (loi 4).
 *
 * LA VIDÉO SUIT LE DOIGT : chaque `pointermove` d'un geste en cours déplace
 * RÉELLEMENT la lecture (`seek`), le relâcher ne fait que conclure. C'est la
 * forme que `VideoTransportControls.seekBar` a prise après le retour porteur du
 * 2026-09-13 (« on voit le recul sur les frames ») et que la directive « les
 * gestes de glissement sont progressifs et annulables » exige.
 */
export function MediaTransport({ playback, language }: MediaTransportProps) {
  const [scrubFraction, setScrubFraction] = useState<number | null>(null);
  const draggingRef = useRef(false);

  const { duration, position } = playback;

  if (duration <= 0) return null;

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
        <span
          className="media-transport-thumb"
          style={{ left: `${fraction * 100}%`, ...({ '--media-transport-progress': fraction } as CSSProperties) }}
          aria-hidden
        />
      </div>
    </div>
  );
}

const RAIL_BUTTON = 'pointer-events-auto grid size-11 place-items-center rounded-full';
const RAIL_DISC = `${VIEWER_GLASS} viewer-disc grid place-items-center rounded-full`;

/**
 * LE MUET ET « ⋯ » DE LA VIDÉO, DANS LA COLONNE D'ACTIONS (#9577) — sous
 * « Composer », au même verre et à la même cible que le reste du rail
 * (`ViewerActionButton`). Le muet est une bascule : `aria-pressed`, jamais un
 * libellé qui change (contrat du chrome commun). « ⋯ » porte la vitesse et
 * l'image dans l'image ; son menu s'ouvre du côté de la scène, jamais sur les
 * actions voisines.
 */
export function VideoRailControls({ playback, language }: MediaTransportProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const moreButtonRef = useRef<HTMLButtonElement | null>(null);
  const { muted, rate, pictureInPicture } = playback;
  const pipOffered = pictureInPicture !== 'unsupported';

  return (
    <>
      <button
        type="button"
        data-viewer-action="mute"
        aria-label={translate(language, 'media.video.mute')}
        aria-pressed={muted}
        className={RAIL_BUTTON}
        onClick={() => playback.setMuted(!muted)}
      >
        <span className={RAIL_DISC}>
          <GlyphSvg glyph={muted ? MEDIA_TRANSPORT_GLYPHS.speakerSlash : MEDIA_TRANSPORT_GLYPHS.speakerHigh} size={18} />
        </span>
      </button>

      <div className="media-transport-more">
        <button
          ref={moreButtonRef}
          type="button"
          data-viewer-action="more"
          aria-label={translate(language, 'media.video.more_options')}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className={RAIL_BUTTON}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span className={RAIL_DISC}>
            <GlyphSvg glyph={MEDIA_TRANSPORT_GLYPHS.dotsThree} size={18} />
          </span>
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
    </>
  );
}
