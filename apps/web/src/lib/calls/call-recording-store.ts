import { createStore } from 'zustand/vanilla';

import type { CallRecordingState, CallRecordingStoreApi } from './call-recording';

/**
 * **L'ÉTAT DE L'ENREGISTREMENT D'APPEL, SANS SES GESTES** (#8064 ; #10086).
 *
 * La couche d'appel (`components/call-layer.tsx`), montée sur TOUTES les
 * routes, ne fait que LIRE cet état pour savoir s'il faut monter la question
 * de consentement. Les gestes (`call-recording.ts`, demander, répondre,
 * arrêter) et leur instance (`call-recording-live.ts`) partent avec la
 * connexion et l'écran d'appel, jamais avant le premier pixel : le magasin
 * vit donc seul ici, et les deux côtés partagent la MÊME instance.
 */
const IDLE: CallRecordingState = { view: { kind: 'idle' }, notice: null };

export function createCallRecordingStore(): CallRecordingStoreApi {
  return createStore<CallRecordingState>(() => IDLE);
}

export const callRecordingStore = createCallRecordingStore();
