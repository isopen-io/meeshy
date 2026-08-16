/**
 * USE REMOTE CALL ALERTS HOOK
 * Parité web des side-channels d'alerte du gateway, déjà affichés par iOS et
 * Android (audit appels 2026-07-11, solde parité web/android) :
 *
 * - `call:quality-alert` — le lien du PAIR se dégrade de façon soutenue
 *   (jamais le lien local, dont le tier vit dans `useCallQuality` : le gateway
 *   exclut le reporter du fanout). Indicateur transitoire auto-effacé 15 s
 *   après la dernière alerte ; le gateway ré-émet à chaque rapport dégradé
 *   soutenu, donc chaque alerte ré-arme la fenêtre — l'indicateur reste allumé
 *   exactement tant que le lien du pair reste mauvais (parité iOS
 *   `scheduleRemoteQualityReset` / Android `CallQualityResetTimer`).
 * - `call:screen-capture-alert` — le pair capture l'écran de l'appel. Signal
 *   privacy tenu (pas d'auto-effacement) jusqu'au capture-stopped ou au
 *   changement d'appel.
 *
 * Les deux sont gâtés strictement au [callId] actif : le fanout d'un appel en
 * attente ou une trame retardataire d'un appel précédent est inerte.
 */

'use client';

import { useEffect, useState } from 'react';
import { meeshySocketIOService } from '@/services/meeshy-socketio.service';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import type {
  CallParticipantLeftEvent,
  CallQualityAlertEvent,
  CallScreenCaptureEvent,
} from '@meeshy/shared/types/video-call';

/** Parité iOS `QualityThresholds.remoteQualityResetSeconds` (15 s). */
const REMOTE_QUALITY_RESET_MS = 15_000;

export function useRemoteCallAlerts(callId: string | null): {
  remoteQualityDegraded: boolean;
  remoteScreenCapturing: boolean;
} {
  const [remoteQualityDegraded, setRemoteQualityDegraded] = useState(false);
  const [remoteScreenCapturing, setRemoteScreenCapturing] = useState(false);

  useEffect(() => {
    setRemoteQualityDegraded(false);
    setRemoteScreenCapturing(false);
    if (!callId) return;

    const socket = meeshySocketIOService.getSocket();
    if (!socket) return;

    let resetTimeout: ReturnType<typeof setTimeout> | null = null;

    // Group calls (cap lifted 2026-08-13, mesh confirmed for 3+ web peers by
    // Vague 126) carry one screen-capture-alert PER PARTICIPANT, keyed by
    // `event.participantId` (gateway relays each peer's own start/stop
    // transition — see CallEventsHandler.ts SCREEN_CAPTURE_DETECTED). Before
    // this, `remoteScreenCapturing` was written as a bare last-writer-wins
    // scalar straight from `event.isCapturing`, discarding `participantId`
    // entirely — the exact W4/W5 shape of bug (per-participant fact modeled
    // as a call-wide scalar), but here on a PRIVACY signal: participant A
    // capturing (true) is silently masked the instant participant B, who
    // was never capturing (or had capture on independently and just
    // stopped), reports its own `isCapturing: false`. The set below tracks
    // who is CURRENTLY capturing; the flag is the OR across the whole call,
    // never a single peer's last report.
    const capturingParticipants = new Set<string>();

    const handleQualityAlert = (event: CallQualityAlertEvent) => {
      if (event.callId !== callId) return;
      setRemoteQualityDegraded(true);
      if (resetTimeout) clearTimeout(resetTimeout);
      resetTimeout = setTimeout(() => {
        resetTimeout = null;
        setRemoteQualityDegraded(false);
      }, REMOTE_QUALITY_RESET_MS);
    };

    const handleScreenCaptureAlert = (event: CallScreenCaptureEvent) => {
      if (event.callId !== callId) return;
      if (event.isCapturing) {
        capturingParticipants.add(event.participantId);
      } else {
        capturingParticipants.delete(event.participantId);
      }
      setRemoteScreenCapturing(capturingParticipants.size > 0);
    };

    // A capturing participant can leave the call (hangup, disconnect) without
    // ever emitting a stop transition — without this, their entry survives
    // in the set forever, pinning the privacy pill on for the REST of the
    // call even once nobody is capturing anymore.
    const handleParticipantLeft = (event: CallParticipantLeftEvent) => {
      if (event.callId !== callId) return;
      if (capturingParticipants.delete(event.participantId)) {
        setRemoteScreenCapturing(capturingParticipants.size > 0);
      }
    };

    socket.on(SERVER_EVENTS.CALL_QUALITY_ALERT, handleQualityAlert);
    socket.on(SERVER_EVENTS.CALL_SCREEN_CAPTURE_ALERT, handleScreenCaptureAlert);
    socket.on(SERVER_EVENTS.CALL_PARTICIPANT_LEFT, handleParticipantLeft);

    return () => {
      socket.off(SERVER_EVENTS.CALL_QUALITY_ALERT, handleQualityAlert);
      socket.off(SERVER_EVENTS.CALL_SCREEN_CAPTURE_ALERT, handleScreenCaptureAlert);
      socket.off(SERVER_EVENTS.CALL_PARTICIPANT_LEFT, handleParticipantLeft);
      if (resetTimeout) clearTimeout(resetTimeout);
    };
  }, [callId]);

  return { remoteQualityDegraded, remoteScreenCapturing };
}
