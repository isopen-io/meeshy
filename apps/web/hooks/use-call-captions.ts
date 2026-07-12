/**
 * USE CALL CAPTIONS HOOK
 * Parité web des captions traduites en direct (arc transcription live
 * 2026-07-10) : le gateway traduit chaque segment final vers la langue de
 * chaque participant et relaie `call:translated-segment` à la room d'appel.
 * Le speaker est exclu du fanout — toute caption reçue vient d'un PAIR.
 * iOS consomme déjà ce flux (CallTranscriptionService.receiveTranslatedSegment).
 *
 * Sémantique miroir de iOS appendSegment :
 * - un segment NON-final remplace le non-final précédent du même speaker ;
 * - un segment final s'ajoute et efface le partial du même speaker ;
 * - rétention bornée à 4 lignes (overlay de sous-titres, pas un panneau
 *   transcript — iOS garde 50 segments dans son panneau dédié) ;
 * - l'overlay s'efface seul 6 s après le dernier segment reçu (chaque
 *   segment ré-arme la fenêtre, parité use-remote-call-alerts).
 *
 * Gâté strictement au [callId] actif : un segment d'un autre appel (trame
 * retardataire, fanout d'un appel en attente) est inerte.
 */

'use client';

import { useEffect, useState } from 'react';
import { meeshySocketIOService } from '@/services/meeshy-socketio.service';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { CallTranslatedSegmentEvent } from '@meeshy/shared/types/video-call';

export type CallCaption = {
  readonly key: string;
  readonly speakerId: string;
  readonly text: string;
  readonly isFinal: boolean;
};

const CAPTION_RETENTION = 4;
const CAPTION_LINGER_MS = 6_000;

export function useCallCaptions(callId: string | null): { captions: CallCaption[] } {
  const [captions, setCaptions] = useState<CallCaption[]>([]);

  useEffect(() => {
    setCaptions([]);
    if (!callId) return;

    const socket = meeshySocketIOService.getSocket();
    if (!socket) return;

    let lingerTimeout: ReturnType<typeof setTimeout> | null = null;
    let sequence = 0;

    const handleSegment = (event: CallTranslatedSegmentEvent) => {
      if (event.callId !== callId) return;
      const { segment } = event;
      sequence += 1;
      const caption: CallCaption = {
        key: `${segment.speakerId}:${sequence}`,
        speakerId: segment.speakerId,
        text: segment.translatedText ?? segment.text,
        isFinal: segment.isFinal,
      };
      setCaptions((previous) => [
        ...previous.filter((line) => !(line.speakerId === segment.speakerId && !line.isFinal)),
        caption,
      ].slice(-CAPTION_RETENTION));
      if (lingerTimeout) clearTimeout(lingerTimeout);
      lingerTimeout = setTimeout(() => {
        lingerTimeout = null;
        setCaptions([]);
      }, CAPTION_LINGER_MS);
    };

    socket.on(SERVER_EVENTS.CALL_TRANSLATED_SEGMENT, handleSegment);

    return () => {
      socket.off(SERVER_EVENTS.CALL_TRANSLATED_SEGMENT, handleSegment);
      if (lingerTimeout) clearTimeout(lingerTimeout);
    };
  }, [callId]);

  return { captions };
}
