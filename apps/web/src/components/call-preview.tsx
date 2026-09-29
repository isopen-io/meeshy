import { useState } from 'react';

import { StreamAudio, StreamVideo } from '@/components/call-media-elements';
import { GlyphSvg } from '@/components/glyph';
import { CALL_VIEW_GLYPHS } from '@/components/glyphs-call-view';
import { callActions } from '@/lib/calls/call-actions';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **L'APPELANT AVANT DE DÉCROCHER** (#8480) — ce que le moteur reçoit sur le
 * lien d'aperçu (`call.preview`) : sa vidéo derrière l'écran de sonnerie,
 * voilée pour que le nom et les boutons restent lisibles, et un bouton de son
 * qui se LIT d'emblée, en toutes lettres, en haut au centre (#8627). Le son
 * est COUPÉ par défaut : on l'active d'un geste, qui ouvre aussi la lecture
 * au navigateur et fait taire la sonnerie — on entend l'appelant, pas les
 * deux. Monté à la même place de la sonnerie au décroché,
 * l'aperçu garde son son jusqu'à ce que le vrai lien prenne le relais.
 */
export function CallPreview({ stream, language }: { readonly stream: MediaStream; readonly language: InterfaceLanguage }) {
  const [audible, setAudible] = useState(false);
  const label = translate(language, audible ? 'call.preview.soundOff' : 'call.preview.soundOn');
  return (
    <>
      {stream.getVideoTracks().length > 0 ? (
        <div className="pointer-events-none absolute inset-0" aria-hidden="true" data-call-preview="">
          <StreamVideo stream={stream} mirrored={false} className="h-full w-full" />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(7,6,11,0.55) 0%, rgba(7,6,11,0.25) 40%, rgba(7,6,11,0.8) 100%)' }} />
        </div>
      ) : null}
      <button
        type="button"
        className="glass-call-prominent absolute left-1/2 top-4 z-10 flex min-h-11 -translate-x-1/2 items-center gap-2 rounded-full px-4 text-body font-semibold text-white"
        style={{ marginTop: 'env(safe-area-inset-top)' }}
        aria-label={label}
        aria-pressed={audible}
        data-call-preview-sound=""
        onClick={() => {
          if (!audible) callActions.hearPreview();
          setAudible(!audible);
        }}
      >
        <GlyphSvg glyph={audible ? CALL_VIEW_GLYPHS.speakerHigh : CALL_VIEW_GLYPHS.speakerSlash} size={22} />
        <span aria-hidden>{label}</span>
      </button>
      {audible ? (
        <span hidden data-call-preview-audio="">
          <StreamAudio stream={stream} />
        </span>
      ) : null}
    </>
  );
}
