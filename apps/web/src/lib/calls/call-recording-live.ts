import { apiDeps } from '@/lib/api/deps';
import { sessionStore } from '@/lib/api/session';
import { resolveViewer } from '@/lib/api/viewer';

import { createCallRecording, createCallRecordingStore } from './call-recording';
import { callStore } from './call-store';
import { currentCallTransport } from './call-transport';

/**
 * **L'ENREGISTREMENT D'APPEL DE L'APPLICATION** (#8064) — l'instance que le
 * pont de connexion (`call-socket-bridge.ts`) alimente et que l'écran d'appel
 * lit. Ce qui capte n'est chargé que chez l'enregistreur, au démarrage
 * accordé par la passerelle (`budgets.json` › `call_recording_runtime`).
 */
export const callRecordingStore = createCallRecordingStore();

export const callRecording = createCallRecording({
  store: callRecordingStore,
  calls: callStore,
  viewerId: () => resolveViewer({ source: apiDeps.source, session: sessionStore.getState().session }).id ?? '',
  transport: currentCallTransport,
  loadRecorder: () => import('./call-recording-runtime').then((module) => module.startBrowserCallRecorder),
});
