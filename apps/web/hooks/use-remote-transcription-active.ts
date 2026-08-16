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
 *
 * Nettoyage `call:participant-left` (Vague 134, 2026-08-16) : un pair peut
 * quitter l'appel (raccroché, crash, coupure réseau) panneau ouvert, sans
 * jamais émettre `{active: false}` — sans ce nettoyage, son entrée survit
 * dans le Set pour le RESTE de l'appel, laissant le badge d'invitation
 * allumé pour personne. Miroir exact de `handleParticipantLeft` dans
 * `useRemoteCallAlerts` (même risque, même garde) : identité résolue par
 * `event.userId || event.participantId`, jamais l'un sans l'autre.
 */

'use client';

import { useEffect, useState } from 'react';
import { meeshySocketIOService } from '@/services/meeshy-socketio.service';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import type {
  CallParticipantLeftEvent,
  CallTranscriptionActiveBroadcast,
} from '@meeshy/shared/types/video-call';

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

    const handleParticipantLeft = (event: CallParticipantLeftEvent) => {
      if (event.callId !== callId) return;
      const identity = event.userId || event.participantId;
      setActiveSpeakers((previous) => {
        if (!previous.has(identity)) return previous;
        const next = new Set(previous);
        next.delete(identity);
        return next;
      });
    };

    socket.on(SERVER_EVENTS.CALL_TRANSCRIPTION_ACTIVE, handleSignal);
    socket.on(SERVER_EVENTS.CALL_PARTICIPANT_LEFT, handleParticipantLeft);
    return () => {
      socket.off(SERVER_EVENTS.CALL_TRANSCRIPTION_ACTIVE, handleSignal);
      socket.off(SERVER_EVENTS.CALL_PARTICIPANT_LEFT, handleParticipantLeft);
    };
  }, [callId]);

  return { peerTranscribing: activeSpeakers.size > 0 };
}
