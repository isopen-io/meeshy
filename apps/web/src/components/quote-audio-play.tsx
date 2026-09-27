import type { MouseEvent } from 'react';

import { attachmentSrc } from '@/lib/api/media-url';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import type { QuotedAudio } from '@/lib/view/quoted-audio';
import { useMediaPlayback } from '@/lib/view/use-media-playback';

import { Glyph, GlyphSvg } from './glyph';
import { MEDIA_GLYPHS } from './glyphs-media';

/**
 * LA ZONE LECTURE D'UNE CITATION AUDIO (#8320) — miroir de
 * `QuotedAudioPreview` + `QuotedAudioPlaybackIndicator` côté iOS.
 *
 * Un toucher joue l'audio cité SUR PLACE, un second le met en pause ; la
 * progression se lit dans l'anneau de la miniature. Elle n'ouvre RIEN : le
 * saut au message d'origine est l'affaire du bouton voisin, et les deux zones
 * sont exclusives (le clic ne remonte pas).
 *
 * AUCUN SECOND LECTEUR. L'élément `<audio>` passe par `useMediaPlayback`, donc
 * par le coordinateur PARTAGÉ (`mediaCoordinator`) : jouer une citation arrête
 * le vocal ou la vidéo en cours, exactement comme ailleurs dans le fil.
 * L'identifiant de lecture porte le message CITANT — deux réponses qui citent
 * le même vocal sont deux lecteurs, et le coordinateur doit pouvoir mettre
 * l'une en pause quand l'autre démarre (un `claim` du MÊME id serait un
 * no-op, et les deux joueraient ensemble).
 *
 * La piste est déjà ÉLUE (`quotedAudioOf`, Prisme audio) : ce composant ne
 * la redescend pas. `key={audio.url}` remonte l'élément quand la langue
 * change — un `<audio>` dont le `src` change en cours de lecture s'arrête
 * sans émettre `pause` (revue #5805).
 *
 * Cible de 44 × 44 px (dimension 5) : le cercle dessiné fait 36 px, le bouton
 * qui le porte fait la cible entière.
 */
export function QuoteAudioPlay({
  audio,
  citingId,
  isMine,
  interfaceLanguage,
}: {
  readonly audio: QuotedAudio;
  readonly citingId: string;
  readonly isMine: boolean;
  readonly interfaceLanguage: InterfaceLanguage;
}) {
  const { status, progress, toggle, bind } = useMediaPlayback({
    attachmentId: `quote:${citingId}:${audio.attachmentId}`,
  });
  const isPlaying = status === 'playing';
  const ink = isMine ? 'white' : 'var(--accent)';
  const degrees = Math.round(Math.max(0, Math.min(1, progress)) * 360);
  const onClick = (event: MouseEvent<HTMLButtonElement>): void => {
    event.stopPropagation();
    toggle();
  };

  return (
    <>
      <audio
        key={audio.url}
        ref={bind}
        preload="none"
        data-quote-audio-track={audio.language}
        className="hidden"
        src={attachmentSrc(audio.url)}
      />
      <button
        type="button"
        onClick={onClick}
        data-quote-play={isPlaying ? 'playing' : 'idle'}
        aria-label={translate(interfaceLanguage, isPlaying ? 'quote.audio.pause' : 'quote.audio.listen')}
        aria-pressed={isPlaying}
        className="grid size-11 shrink-0 place-items-center self-center"
      >
        <span
          data-quote-progress={degrees}
          className="grid size-9 place-items-center rounded-full"
          style={{
            background: `conic-gradient(${ink} ${degrees}deg, color-mix(in srgb, ${ink} 22%, transparent) ${degrees}deg)`,
          }}
          aria-hidden
        >
          <span
            className="grid size-[30px] place-items-center rounded-full"
            style={{ backgroundColor: isMine ? 'var(--color-quote-mine)' : 'var(--color-quote)' }}
          >
            {isPlaying ? (
              <GlyphSvg glyph={MEDIA_GLYPHS.pause} size={12} style={{ color: ink }} />
            ) : (
              <Glyph name="fillPlay" size={12} style={{ color: ink }} />
            )}
          </span>
        </span>
      </button>
    </>
  );
}
