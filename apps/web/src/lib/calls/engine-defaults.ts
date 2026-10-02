import { apiDeps } from '@/lib/api/deps';
import { sessionStore } from '@/lib/api/session';
import { resolveViewer } from '@/lib/api/viewer';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { safeLocalStorage } from '@/lib/storage';

import { fetchActiveCallId } from './active-call';
import { deviceLabel } from './call-analytics';
import type { CaptionsContext, CaptionsPort } from './call-captions-controller';
import { createCameraEffects } from './camera-effects';
import { browserConnection, dataProfileOf, opusShapeFor, type DataProfile } from './call-data-profile';
import { browserPreferenceStorage, preferredInputs, writeDevicePreference } from './call-devices';
import { acquireCallMedia, acquireCamera, acquireChosenInput, acquireDisplay } from './call-media';
import { createJournalRecorder, type JournalRecorder } from './call-network-journal-recorder';
import { createCallJournalStore } from './call-network-journal-store';
import { shapeOpusSdp } from './call-opus-sdp';
import type { QualityLoop, QualityLoopDeps } from './call-quality-loop';
import { callStore } from './call-store';
import { playCue, primeTones, startTone, stopTone } from './call-tones';
import { currentCallTransport } from './call-transport';
import type { CallEngineDeps } from './engine';
import { createPeerLink } from './peer-link';
import { acquireRearCamera } from './rear-camera';
import { browserColorSupport, videoEffectsStore } from './video-effects';

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

/** Le profil de données du moment (#8697) : relu à chaque négociation, capture et relevé. */
const currentProfile = (): DataProfile => dataProfileOf(browserConnection());

const viewerId = (): string => resolveViewer({ source: apiDeps.source, session: sessionStore.getState().session }).id ?? '';

/**
 * Le journal réseau de chaque appel (#8698), écrit dans l'espace du compte
 * (`call-network-journal-store.ts`) : un seul enregistreur par onglet, posé au
 * premier chargement du moteur.
 */
let recorder: JournalRecorder | null = null;
const journalRecorder = (): JournalRecorder =>
  (recorder ??= createJournalRecorder({ store: callStore, journal: createCallJournalStore({ storage: safeLocalStorage(), now: Date.now }), viewerId, now: Date.now }));

/**
 * La boucle de qualité est un chunk à part (`budgets.json` › `call_quality`),
 * chargé au premier relevé : `getStats`, paliers et survie ne pèsent que sur un
 * appel CONNECTÉ, jamais sur la sonnerie.
 */
function lazyQualityLoop(deps: QualityLoopDeps): QualityLoop {
  const loop = import('./call-quality-loop').then((module) => module.createQualityLoop({ ...deps, profile: currentProfile }));
  return {
    tick: async () => {
      const tick = await (await loop).tick();
      if (tick !== null) journalRecorder().noteTick(tick);
      return tick;
    },
  };
}

/**
 * Les sous-titres sont un chunk à part (`budgets.json` › `call_captions`, #8048),
 * chargé au premier besoin d'un appel. Les gestes arrivés avant lui attendent,
 * dans l'ordre ; ensuite ils passent tout de suite — le « bye » d'un raccroché
 * doit partir AVANT que les liens se ferment.
 */
function lazyCaptions(ctx: CaptionsContext): CaptionsPort {
  let ready: CaptionsPort | null = null;
  const loading = import('./call-captions-runtime').then((module) => (ready = module.createBrowserCaptions(ctx)));
  const run = (fn: (port: CaptionsPort) => void): void => (ready === null ? void loading.then(fn) : fn(ready));
  return {
    receive: (event, payload) => run((port) => port.receive(event, payload)),
    toggle: () => run((port) => port.toggle()),
    micChanged: () => run((port) => port.micChanged()),
    attach: (userId, channel) => run((port) => port.attach(userId, channel)),
    stop: (bye) => run((port) => port.stop(bye)),
  };
}

/**
 * Les effets de ma vidéo (#8442) : le traitement des images est un chunk à
 * part (`budgets.json` › `call_video_effects`), chargé au premier effet de
 * couleur — jamais pour qui n'en pose aucun.
 */
const cameraEffects = createCameraEffects({
  effects: () => videoEffectsStore.getState().effects,
  colorSupported: browserColorSupport,
  loadPipeline: () => import('./video-effects-pipeline').then((module) => (camera, effects) => module.createEffectsPipeline(camera, effects)),
});

export function loadDefaultEngineDeps(): Omit<CallEngineDeps, 'store'> {
  journalRecorder();
  return {
    transport: currentCallTransport,
    viewerId,
    fetchActiveCallId: (conversationId) => fetchActiveCallId(apiDeps, conversationId),
    acquireMedia: (options) => acquireCallMedia({ ...options, ...preferredInputs(), profile: currentProfile() }),
    acquireCamera: (facing) => (facing === 'environment' ? acquireRearCamera({ profile: currentProfile() }) : acquireCamera({ facing, cameraId: preferredInputs().cameraId, profile: currentProfile() })),
    acquireCameraDevice: (deviceId) => acquireChosenInput({ kind: 'camera', deviceId }),
    rememberCamera: (deviceId) => void writeDevicePreference(browserPreferenceStorage(), 'camera', deviceId),
    acquireDisplay: () => acquireDisplay(),
    createLink: (link) => createPeerLink({ ...link, shapeSdp: (sdp) => shapeOpusSdp(sdp, opusShapeFor(currentProfile())) }),
    cameraEffects,
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
    createCaptions: lazyCaptions,
  };
}
