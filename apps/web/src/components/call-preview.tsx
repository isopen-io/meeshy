import type { CSSProperties, ReactNode } from 'react';

import type { StreamAudio, StreamVideo } from '@/components/call-media-elements';
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
 *
 * Chunk à part (`budgets.json` › `call_preview`), chargé quand un aperçu
 * arrive : un appel sans aperçu ne le télécharge pas.
 */
/** Ce que l'écran d'appel lui remet : ce chunk n'importe rien de `call_overlay`. */
export type CallPreviewKit = {
  readonly Video: typeof StreamVideo;
  readonly Audio: typeof StreamAudio;
  readonly soundOn: ReactNode;
  readonly soundOff: ReactNode;
};

type SoundProps = { readonly language: InterfaceLanguage; readonly kit: CallPreviewKit; readonly audible: boolean; readonly onAudible: (audible: boolean) => void; readonly className?: string; readonly style?: CSSProperties };

/**
 * Le bouton de son, une puce de verre (P17.2) : posé par l'écran dans l'ordre de l'en-tête d'un
 * appel vidéo qui sonne — la puce « Appel vidéo entrant », le nom, puis lui —, ou en haut au
 * centre pour un appel vocal. L'état « audible » est celui de l'écran, qui le rend aussi à l'aperçu.
 */
export function CallPreviewSound({ language, kit, audible, onAudible, className = '', style }: SoundProps & { readonly stream?: MediaStream }) {
  const label = translate(language, audible ? 'call.preview.soundOff' : 'call.preview.soundOn');
  return (
    <button
      type="button"
      className={`glass-call-prominent flex min-h-11 items-center gap-2 rounded-full px-4 text-body font-semibold text-on-media ${className}`}
      style={style}
      aria-label={label}
      aria-pressed={audible}
      data-call-preview-sound=""
      onClick={() => {
        if (!audible) callActions.hearPreview();
        onAudible(!audible);
      }}
    >
      {audible ? kit.soundOn : kit.soundOff}
      <span aria-hidden>{label}</span>
    </button>
  );
}

export function CallPreview({ stream, language, kit, audible, onAudible, soundInHeader }: Omit<SoundProps, 'className' | 'style'> & { readonly stream: MediaStream; readonly soundInHeader: boolean }) {
  return (
    <>
      {stream.getVideoTracks().length > 0 ? (
        <div className="pointer-events-none absolute inset-0" aria-hidden="true" data-call-preview="">
          <kit.Video stream={stream} mirrored={false} className="h-full w-full" />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, color-mix(in srgb, var(--color-media-backdrop) 55%, transparent) 0%, color-mix(in srgb, var(--color-media-backdrop) 25%, transparent) 40%, color-mix(in srgb, var(--color-media-backdrop) 80%, transparent) 100%)' }} />
        </div>
      ) : null}
      {soundInHeader ? null : <CallPreviewSound language={language} kit={kit} audible={audible} onAudible={onAudible} className="absolute left-1/2 top-4 z-10 -translate-x-1/2" style={{ marginTop: 'env(safe-area-inset-top)' }} />}
      {audible ? (
        <span hidden data-call-preview-audio="">
          <kit.Audio stream={stream} />
        </span>
      ) : null}
    </>
  );
}
