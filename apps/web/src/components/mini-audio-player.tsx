import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from 'zustand/react';

import type { ConversationsDeps } from '@/lib/api/conversations';
import { attachmentSrc } from '@/lib/api/media-url';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { useOptionalRoute } from '@/lib/router';
import {
  audioCarryStore,
  concealsMiniPlayer,
  dropCarriedAudio,
  publishCarriedPlayback,
  withdrawCarriedPlayback,
  type CarriedAudio,
  type CarriedPlayback,
} from '@/lib/view/audio-carry';
import type { MediaCoordinator } from '@/lib/view/media-coordinator';
import { formatMediaTime } from '@/lib/view/media-transport';
import { useMediaPlayback } from '@/lib/view/use-media-playback';
import { handOffVideoPosition } from '@/lib/view/video-handoff';

import { Glyph, GlyphSvg } from './glyph';
import { MEDIA_GLYPHS } from './glyphs-media';

/** Le plein écran rouvert au toucher (#9279) — son chunk est déjà chargé : la lecture confiée en vient. */
const MediaViewer = lazy(() => import('./media-viewer'));

/**
 * LE MINI-LECTEUR (#9256) — miroir de `MiniAudioPlayerBar` iOS : l'aplat
 * indigo, le bouton lecture/pause, l'auteur et le temps, la barre de
 * progression, et « Fermer le lecteur ». Il reprend le vocal que le lecteur
 * plein écran jouait quand on l'a fermé (`audio-carry.ts`) — même piste, même
 * seconde, même vitesse — et rapporte l'écoute comme la page l'aurait fait.
 *
 * #9279 — c'est le MOTEUR du vocal confié : il publie sa lecture, et la bulle
 * du même vocal la reflète et la commande (`useCarriedPlayback`) au lieu
 * d'ouvrir un second son. Dans la conversation du vocal il s'EFFACE
 * (`concealed`) sans s'arrêter — la bulle y reprend la main, comme iOS. Le
 * toucher (hors lecture/pause et fermer) rouvre le plein écran à la même
 * seconde (`onOpen`).
 *
 * Sa clé d'exclusivité n'est PAS l'id de la pièce (`claimKey`) : n'importe
 * quel autre média qui joue le met en pause, comme le coordinateur iOS qui
 * n'a qu'un moteur. Arrivé au bout, il se retire.
 */
export type MiniAudioPlayerProps = {
  readonly carried: CarriedAudio;
  readonly onClose: () => void;
  /** Rouvrir le plein écran — la position est déjà confiée à la page audio (`handOffVideoPosition`). */
  readonly onOpen?: () => void;
  /** Dans la conversation du vocal : rien à l'écran, la lecture continue. */
  readonly concealed?: boolean;
  /** INJECTABLES pour les témoins — le coordinateur et `apiDeps` de l'application par défaut. */
  readonly coordinator?: MediaCoordinator;
  readonly deps?: ConversationsDeps;
};

export function MiniAudioPlayer({ carried, onClose, onOpen, concealed = false, coordinator, deps }: MiniAudioPlayerProps) {
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
      resume: { positionMs: carried.positionMs, complete: false, handedOff: true },
      ...(attachment.duration !== undefined ? { durationMs: attachment.duration } : {}),
      ...(deps !== undefined ? { deps } : {}),
    },
  });
  const { status, progress, position, duration, rate, toggle, bind, seek, setRate } = playback;
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

  const [element, setElement] = useState<HTMLMediaElement | null>(null);
  const bindAudio = useCallback(
    (next: HTMLAudioElement | null) => {
      bind(next);
      setElement(next);
    },
    [bind],
  );

  /* La télécommande de la bulle : des verbes STABLES, qui appellent toujours la
     dernière commande (`toggle` change d'identité avec l'état). */
  const controlsRef = useRef({ toggle, seek, setRate });
  controlsRef.current = { toggle, seek, setRate };
  const remote = useMemo(
    () => ({
      toggle: () => controlsRef.current.toggle(),
      seek: (seconds: number) => controlsRef.current.seek(seconds),
      setRate: (next: number) => controlsRef.current.setRate(next),
    }),
    [],
  );
  const totalSeconds = duration > 0 ? duration : (attachment.duration ?? 0) / 1000;
  useEffect(() => {
    const live: CarriedPlayback = { attachmentId: attachment.id, status, progress, position, duration: totalSeconds, rate, element, ...remote };
    publishCarriedPlayback(live);
  }, [attachment.id, status, progress, position, totalSeconds, rate, element, remote]);
  useEffect(() => () => withdrawCarriedPlayback(remote.toggle), [remote]);

  const title = carried.title ?? translate(language, 'media.audio.mini.title');

  const close = (): void => {
    if (isPlaying) toggle();
    onClose();
  };

  const open = (): void => {
    if (element !== null && element.currentTime > 0) {
      handOffVideoPosition({ attachmentId: attachment.id, positionMs: Math.round(element.currentTime * 1000) });
    }
    onOpen?.();
  };

  return (
    <div className={concealed ? 'hidden' : 'pointer-events-none flex w-full justify-center'} hidden={concealed} {...(concealed ? { 'data-mini-audio-concealed': '' } : {})}>
      <div
        role="region"
        aria-label={translate(language, 'media.audio.mini.label')}
        data-mini-audio-player={attachment.id}
        data-mini-audio-status={status}
        className="pointer-events-auto relative flex w-full items-center gap-2 overflow-hidden rounded-chip py-1 pe-1 ps-1 shadow-lg"
        style={{ maxWidth: 420, backgroundColor: 'var(--ios-indigo-600)', color: 'var(--color-on-brand)' }}
      >
        <audio
          ref={bindAudio}
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
        <button
          type="button"
          data-mini-audio-open
          aria-label={`${title} — ${translate(language, 'media.viewer.open_fullscreen')}`}
          className="grid min-h-11 min-w-0 flex-1 text-start leading-tight"
          onClick={open}
        >
          <span data-mini-audio-title className="truncate text-check font-semibold">
            {title}
          </span>
          <span data-mini-audio-time className="truncate text-caption tabular-nums" style={{ opacity: 0.72 }}>
            {formatMediaTime(position)} / {formatMediaTime(totalSeconds)}
          </span>
        </button>
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

/**
 * LE PLEIN ÉCRAN ROUVERT (#9279) — la page audio du vocal confié, dans la
 * langue qu'on écoutait. Le fermer lâche la reprise : la visionneuse en confie
 * une NEUVE en se démontant si le vocal joue encore (`useCarryOnClose`), sinon
 * le mini-lecteur se retire, comme à la première fermeture.
 */
function ReopenedViewer({ carried }: { readonly carried: CarriedAudio }) {
  return (
    <Suspense fallback={null}>
      <MediaViewer
        items={[carried.attachment]}
        startIndex={0}
        onClose={dropCarriedAudio}
        languages={carried.languages ?? [carried.trackLanguage]}
        displayLanguage={carried.trackLanguage}
        fallbackLanguage={carried.fallbackLanguage ?? carried.trackLanguage}
        {...(carried.carrier != null ? { carrier: carried.carrier } : {})}
        {...(carried.conversationId != null ? { conversationId: carried.conversationId } : {})}
      />
    </Suspense>
  );
}

/** L'HÔTE, monté par la coquille tant qu'une piste est confiée — la clé `serial` remonte le lecteur à chaque reprise. */
export default function MiniAudioPlayerHost() {
  const carried = useStore(audioCarryStore, (state) => state.carried);
  const serial = useStore(audioCarryStore, (state) => state.serial);
  const route = useOptionalRoute();
  const [reopened, setReopened] = useState<number | null>(null);
  if (carried === null) return null;
  if (reopened === serial) return <ReopenedViewer carried={carried} />;
  const openConversationId = route?.key === 'thread' ? (route.params.conversation ?? null) : null;
  return (
    <MiniAudioPlayer
      key={serial}
      carried={carried}
      concealed={concealsMiniPlayer({ carried, openConversationId })}
      onClose={dropCarriedAudio}
      onOpen={() => setReopened(serial)}
    />
  );
}
