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
import type { CallQualityAlertEvent, CallScreenCaptureEvent } from '@meeshy/shared/types/video-call';

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
      setRemoteScreenCapturing(event.isCapturing);
    };

    socket.on(SERVER_EVENTS.CALL_QUALITY_ALERT, handleQualityAlert);
    socket.on(SERVER_EVENTS.CALL_SCREEN_CAPTURE_ALERT, handleScreenCaptureAlert);

    return () => {
      socket.off(SERVER_EVENTS.CALL_QUALITY_ALERT, handleQualityAlert);
      socket.off(SERVER_EVENTS.CALL_SCREEN_CAPTURE_ALERT, handleScreenCaptureAlert);
      if (resetTimeout) clearTimeout(resetTimeout);
    };
  }, [callId]);

  return { remoteQualityDegraded, remoteScreenCapturing };
}
