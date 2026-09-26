import { apiDeps } from '@/lib/api/deps';
import { sessionStore } from '@/lib/api/session';
import { resolveViewer } from '@/lib/api/viewer';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';

import { fetchActiveCallId } from './active-call';
import { deviceLabel } from './call-analytics';
import { preferredInputs } from './call-devices';
import { acquireCallMedia, acquireCamera, acquireDisplay } from './call-media';
import type { QualityLoop, QualityLoopDeps } from './call-quality-loop';
import { playCue, primeTones, startTone, stopTone } from './call-tones';
import { currentCallTransport } from './call-transport';
import type { CallEngineDeps } from './engine';
import { createPeerLink } from './peer-link';

/**
 * **LES DÉPENDANCES DU NAVIGATEUR** (#6382, #8047) — ce que le moteur
 * (`engine.ts`) reçoit hors des témoins : le socket, WebRTC, les médias,
 * l'horloge, la boucle de qualité et l'écoute du réseau. Même chunk que le
 * moteur (seul `engine.ts` l'importe).
 */

/** Rend la liste des pistes d'un flux — dans un navigateur, un `MediaStream` neuf pour que l'écran relise. */
function defaultCreateStream(tracks: readonly MediaStreamTrack[]): MediaStream {
  return new MediaStream([...tracks]);
}

/** Un changement de réseau : le retour en ligne, ou le type de connexion qui change (`navigator.connection`, là où il existe). */
function watchBrowserNetwork(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const connection = (navigator as Navigator & { readonly connection?: EventTarget }).connection;
  window.addEventListener('online', onChange);
  connection?.addEventListener('change', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    connection?.removeEventListener('change', onChange);
  };
}

/**
 * La boucle de qualité est un chunk à part (`budgets.json` › `call_quality`),
 * chargé au premier relevé : `getStats`, paliers et survie ne pèsent que sur un
 * appel CONNECTÉ, jamais sur la sonnerie.
 */
function lazyQualityLoop(deps: QualityLoopDeps): QualityLoop {
  const loop = import('./call-quality-loop').then((module) => module.createQualityLoop(deps));
  return { tick: () => loop.then((ready) => ready.tick()) };
}

export function loadDefaultEngineDeps(): Omit<CallEngineDeps, 'store'> {
  return {
    transport: currentCallTransport,
    viewerId: () => resolveViewer({ source: apiDeps.source, session: sessionStore.getState().session }).id ?? '',
    fetchActiveCallId: (conversationId) => fetchActiveCallId(apiDeps, conversationId),
    acquireMedia: (options) => acquireCallMedia({ ...options, ...preferredInputs() }),
    acquireCamera: (facing) => acquireCamera({ facing, cameraId: preferredInputs().cameraId }),
    acquireDisplay: () => acquireDisplay(),
    createLink: createPeerLink,
    createStream: defaultCreateStream,
    now: Date.now,
    schedule: (fn, ms) => setTimeout(fn, ms),
    cancel: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    repeat: (fn, ms) => setInterval(fn, ms),
    stopRepeat: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
    tones: { start: startTone, stop: stopTone, cue: playCue, prime: primeTones },
    ringLabel: () => translate(currentInterfaceLanguage(), 'call.incoming.title.tab'),
    createQualityLoop: lazyQualityLoop,
    watchNetwork: watchBrowserNetwork,
    platform: () => (__SHELL__ ? 'android-shell' : 'web'),
    deviceModel: () => (typeof navigator === 'undefined' ? 'web' : deviceLabel(navigator.userAgent)),
  };
}
