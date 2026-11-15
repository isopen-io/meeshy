import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';

import { holdWhileAudioPlays, type NowPlayingState, type PlaybackHold } from './shell-playback';

/**
 * **DANS LE NAVIGATEUR, LA NOTIFICATION D'UN VOCAL DIT QUI PARLE ET SE PILOTE**
 * (#10890) — la coque Android a sa carte de lecture (#10624) ; Chrome Android,
 * Chrome de bureau et Edge n'affichaient que leur carte générique « Meeshy »,
 * sans image, sans barre ni ±15 s. La Media Session API porte les MÊMES faits
 * par le MÊME `PlaybackHold` : `holdWhileAudioPlays` reste le seul moteur.
 *
 * Les libellés suivent la loi de la coque (`PlaybackRules.labels`) : titre
 * « {conversation} — {date courte} », artiste l'auteur, album la conversation ;
 * hors conversation, l'auteur seul ; un vocal PROTÉGÉ ne dit que son auteur et
 * « Message protégé », sans image.
 *
 * Les gestionnaires d'actions n'existent que tant que la lecture est tenue :
 * rendue, la carte rend la main au navigateur, dont la « Lecture » par défaut
 * relance un vocal mis en pause depuis l'app.
 */
export type MediaSessionPort<M> = {
  metadata: M | null;
  playbackState: MediaSessionPlaybackState;
  readonly setActionHandler: (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => void;
  readonly setPositionState?: (state?: MediaPositionState) => void;
};

export type NowPlayingWording = { readonly locale: string; readonly voiceMessage: string; readonly protectedMessage: string };

export type WebPlaybackOptions<M> = {
  readonly wording: () => NowPlayingWording;
  readonly makeMetadata: (init: MediaMetadataInit) => M;
  readonly now?: () => number;
};

const SKIP_SECONDS = 15;

const ACTIONS = ['play', 'pause', 'seekto', 'seekbackward', 'seekforward'] as const;

function metadataOf(state: NowPlayingState, wording: NowPlayingWording): MediaMetadataInit {
  const named = state.sender ?? wording.voiceMessage;
  if (state.protected) return { title: named, artist: wording.protectedMessage, album: '', artwork: [] };
  const artwork = state.artworkUrl === null ? [] : [{ src: state.artworkUrl }];
  if (state.conversation === null) return { title: named, artist: '', album: '', artwork };
  const title =
    state.sentAtMs === null
      ? state.conversation
      : `${state.conversation} — ${new Intl.DateTimeFormat(wording.locale, { dateStyle: 'short', timeStyle: 'short' }).format(state.sentAtMs)}`;
  return { title, artist: state.sender ?? '', album: state.conversation, artwork };
}

export function webPlaybackHold<M>(session: MediaSessionPort<M>, options: WebPlaybackOptions<M>): PlaybackHold {
  const { wording, makeMetadata, now = Date.now } = options;
  const pauses = new Set<() => void>();
  const plays = new Set<() => void>();
  const seeks = new Set<(positionMs: number) => void>();
  let last: { readonly state: NowPlayingState; readonly at: number } | null = null;
  let armed = false;

  const positionMs = (): number => {
    if (last === null) return 0;
    const { state, at } = last;
    const running = state.playing && !state.buffering ? (now() - at) * state.rate : 0;
    return state.positionMs + running;
  };
  const seekTo = (targetMs: number): void => {
    const durationMs = last?.state.durationMs ?? 0;
    const bounded = Math.max(0, durationMs > 0 ? Math.min(targetMs, durationMs) : targetMs);
    for (const listener of seeks) listener(bounded);
  };
  const handlerOf = (action: (typeof ACTIONS)[number]): MediaSessionActionHandler => {
    switch (action) {
      case 'play':
        return () => plays.forEach((listener) => listener());
      case 'pause':
        return () => pauses.forEach((listener) => listener());
      case 'seekto':
        return (details) => {
          if (typeof details.seekTime === 'number' && Number.isFinite(details.seekTime)) seekTo(details.seekTime * 1000);
        };
      case 'seekbackward':
        return (details) => seekTo(positionMs() - (details.seekOffset ?? SKIP_SECONDS) * 1000);
      case 'seekforward':
        return (details) => seekTo(positionMs() + (details.seekOffset ?? SKIP_SECONDS) * 1000);
    }
  };
  const setHandler = (action: MediaSessionAction, handler: MediaSessionActionHandler | null): void => {
    try {
      session.setActionHandler(action, handler);
    } catch {
      /* Une action que ce navigateur ne connaît pas : la carte se passe d'elle. */
    }
  };
  const arm = (): void => {
    if (armed) return;
    armed = true;
    for (const action of ACTIONS) setHandler(action, handlerOf(action));
  };
  const setPosition = (state?: MediaPositionState): void => {
    try {
      session.setPositionState?.(state);
    } catch {
      /* Une position que le navigateur refuse (durée encore inconnue) : la barre attend la suivante. */
    }
  };
  const listen =
    <L>(listeners: Set<L>) =>
    (listener: L): (() => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    };

  return {
    hold: arm,
    release: () => {
      last = null;
      if (armed) for (const action of ACTIONS) setHandler(action, null);
      armed = false;
      session.metadata = null;
      session.playbackState = 'none';
      setPosition();
    },
    park: () => {
      session.playbackState = 'paused';
    },
    update: (state) => {
      arm();
      last = { state, at: now() };
      session.metadata = makeMetadata(metadataOf(state, wording()));
      session.playbackState = state.playing ? 'playing' : 'paused';
      if (state.durationMs > 0) {
        setPosition({ duration: state.durationMs / 1000, position: Math.min(state.positionMs, state.durationMs) / 1000, playbackRate: state.rate });
      }
    },
    onPauseRequested: listen(pauses),
    onPlayRequested: listen(plays),
    onSeekRequested: listen(seeks),
  };
}

function interfaceWording(): NowPlayingWording {
  const language = currentInterfaceLanguage();
  return {
    locale: language,
    voiceMessage: translate(language, 'media.audio.mini.title'),
    protectedMessage: translate(language, 'announce.messageProtected'),
  };
}

/** Démarre la carte du navigateur sur les `<audio>` du document — appelé par `main.tsx`, hors coque. */
export function startWebNowPlaying(session: MediaSession = navigator.mediaSession): () => void {
  return holdWhileAudioPlays(document, webPlaybackHold(session, { wording: interfaceWording, makeMetadata: (init) => new MediaMetadata(init) }));
}
