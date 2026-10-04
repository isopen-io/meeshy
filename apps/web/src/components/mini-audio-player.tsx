import { useEffect, useRef } from 'react';
import { useStore } from 'zustand/react';

import type { ConversationsDeps } from '@/lib/api/conversations';
import { attachmentSrc } from '@/lib/api/media-url';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { audioCarryStore, dropCarriedAudio, type CarriedAudio } from '@/lib/view/audio-carry';
import type { MediaCoordinator } from '@/lib/view/media-coordinator';
import { formatMediaTime } from '@/lib/view/media-transport';
import { useMediaPlayback } from '@/lib/view/use-media-playback';

import { Glyph, GlyphSvg } from './glyph';
import { MEDIA_GLYPHS } from './glyphs-media';

/**
 * LE MINI-LECTEUR (#9256) — miroir de `MiniAudioPlayerBar` iOS : l'aplat
 * indigo, le bouton lecture/pause, l'auteur et le temps, la barre de
 * progression, et « Fermer le lecteur ». Il reprend le vocal que le lecteur
 * plein écran jouait quand on l'a fermé (`audio-carry.ts`) — même piste, même
 * seconde, même vitesse — et rapporte l'écoute comme la page l'aurait fait.
 *
 * Sa clé d'exclusivité n'est PAS l'id de la pièce (`claimKey`) : toucher la
 * bulle du même vocal, ou n'importe quel autre média, le met en pause, comme
 * le coordinateur iOS qui n'a qu'un moteur. Arrivé au bout, il se retire.
 */
export type MiniAudioPlayerProps = {
  readonly carried: CarriedAudio;
  readonly onClose: () => void;
  /** INJECTABLES pour les témoins — le coordinateur et `apiDeps` de l'application par défaut. */
  readonly coordinator?: MediaCoordinator;
  readonly deps?: ConversationsDeps;
};

export function MiniAudioPlayer({ carried, onClose, coordinator, deps }: MiniAudioPlayerProps) {
  const language = currentInterfaceLanguage();
  const { attachment } = carried;
  const playback = useMediaPlayback({
    attachmentId: attachment.id,
    claimKey: `carry:${attachment.id}`,
    tracksTime: true,
    ...(coordinator !== undefined ? { coordinator } : {}),
    report: {
      kind: 'listened',
      language: carried.trackLanguage,
      resume: { positionMs: carried.positionMs, complete: false },
      ...(attachment.duration !== undefined ? { durationMs: attachment.duration } : {}),
      ...(deps !== undefined ? { deps } : {}),
    },
  });
  const { status, progress, position, duration, toggle, bind, setRate } = playback;
  const isPlaying = status === 'playing';

  const startRef = useRef({ toggle, setRate });
  useEffect(() => {
    startRef.current.setRate(carried.rate);
    startRef.current.toggle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (status === 'idle' && progress === 1) onClose();
  }, [status, progress, onClose]);

  const totalSeconds = duration > 0 ? duration : (attachment.duration ?? 0) / 1000;
  const title = carried.title ?? translate(language, 'media.audio.mini.title');

  const close = (): void => {
    if (isPlaying) toggle();
    onClose();
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 z-40 flex justify-center px-4" style={{ top: 'calc(env(safe-area-inset-top, 0px) + 8px)' }}>
      <div
        role="region"
        aria-label={translate(language, 'media.audio.mini.label')}
        data-mini-audio-player={attachment.id}
        data-mini-audio-status={status}
        className="pointer-events-auto relative flex w-full items-center gap-2 overflow-hidden rounded-chip py-1 pe-1 ps-1 shadow-lg"
        style={{ maxWidth: 420, backgroundColor: 'var(--ios-indigo-600)', color: 'var(--color-on-brand)' }}
      >
        <audio
          ref={bind}
          preload="auto"
          data-mini-audio-track={carried.trackLanguage}
          className="hidden"
          {...(carried.trackUrl === '' ? {} : { src: attachmentSrc(carried.trackUrl) })}
        />
        <button
          type="button"
          data-mini-audio-toggle
          aria-label={translate(language, isPlaying ? 'media.audio.pause' : 'media.audio.play')}
          className="grid size-11 shrink-0 place-items-center rounded-full"
          onClick={toggle}
        >
          {isPlaying ? <GlyphSvg glyph={MEDIA_GLYPHS.pause} size={20} /> : <Glyph name="fillPlay" size={20} />}
        </button>
        <span className="grid min-w-0 flex-1 leading-tight">
          <span data-mini-audio-title className="truncate text-check font-semibold">
            {title}
          </span>
          <span data-mini-audio-time className="truncate text-caption tabular-nums" style={{ opacity: 0.72 }}>
            {formatMediaTime(position)} / {formatMediaTime(totalSeconds)}
          </span>
        </span>
        <button
          type="button"
          data-mini-audio-close
          aria-label={translate(language, 'media.audio.mini.close')}
          className="grid size-11 shrink-0 place-items-center rounded-full"
          onClick={close}
        >
          <Glyph name="x" size={18} />
        </button>
        <span
          aria-hidden
          className="absolute bottom-0 start-0"
          style={{ height: 2, width: `${Math.max(0, Math.min(1, progress)) * 100}%`, backgroundColor: 'var(--color-on-brand)', opacity: 0.8 }}
        />
      </div>
    </div>
  );
}

/** L'HÔTE, monté par la coquille tant qu'une piste est confiée — la clé `serial` remonte le lecteur à chaque reprise. */
export default function MiniAudioPlayerHost() {
  const carried = useStore(audioCarryStore, (state) => state.carried);
  const serial = useStore(audioCarryStore, (state) => state.serial);
  if (carried === null) return null;
  return <MiniAudioPlayer key={serial} carried={carried} onClose={dropCarriedAudio} />;
}
