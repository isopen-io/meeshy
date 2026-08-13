/**
 * USE REMOTE TRANSCRIPTION ACTIVE HOOK
 * Signal de présence `call:transcription-active` (estampillé côté gateway,
 * anti-usurpation) : un pair vient d'activer ou de fermer son panneau de
 * transcription. Pilote l'indicateur d'invitation sur le bouton sous-titres —
 * « votre interlocuteur transcrit, activez aussi ».
 *
 * Contrairement au journal (use-call-transcript-journal, abonné panneau
 * ouvert uniquement), ce hook reste abonné en permanence pendant l'appel :
 * le signal doit précisément atteindre un panneau FERMÉ. Suivi par
 * speakerId (Set) pour rester correct en appel de groupe : l'indicateur ne
 * s'éteint que quand PLUS AUCUN pair ne transcrit.
 */

'use client';

import { useEffect, useState } from 'react';
import { meeshySocketIOService } from '@/services/meeshy-socketio.service';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { CallTranscriptionActiveBroadcast } from '@meeshy/shared/types/video-call';

export function useRemoteTranscriptionActive(callId: string | null): {
  peerTranscribing: boolean;
} {
  const [activeSpeakers, setActiveSpeakers] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    setActiveSpeakers(new Set());
    if (!callId) return;

    const socket = meeshySocketIOService.getSocket();
    if (!socket) return;

    const handleSignal = (event: CallTranscriptionActiveBroadcast) => {
      if (event.callId !== callId) return;
      setActiveSpeakers((previous) => {
        const next = new Set(previous);
        if (event.active) {
          next.add(event.speakerId);
        } else {
          next.delete(event.speakerId);
        }
        return next;
      });
    };

    socket.on(SERVER_EVENTS.CALL_TRANSCRIPTION_ACTIVE, handleSignal);
    return () => {
      socket.off(SERVER_EVENTS.CALL_TRANSCRIPTION_ACTIVE, handleSignal);
    };
  }, [callId]);

  return { peerTranscribing: activeSpeakers.size > 0 };
}
