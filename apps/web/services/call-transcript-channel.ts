/**
 * Pont entre la couche WebRTC (webrtc-service, hors React) et le hook de
 * journal de transcription (use-call-transcript-journal). Les entrées
 * `transcript-entry` reçues en P2P sur le data channel `"transcription"`
 * sont publiées ici ; le hook s'y abonne et fusionne avec le relais serveur
 * `call:translated-segment` par id stable. Module-scope volontaire : un seul
 * appel actif à la fois côté web, et le gâchage par `callId` est fait à la
 * consommation.
 */

import type { CallTranscriptEntryPayload } from '@meeshy/shared/types/video-call';

type TranscriptEntryListener = (entry: CallTranscriptEntryPayload) => void;

const listeners = new Set<TranscriptEntryListener>();

export const callTranscriptChannel = {
  publish(entry: CallTranscriptEntryPayload): void {
    listeners.forEach((listener) => listener(entry));
  },
  subscribe(listener: TranscriptEntryListener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
