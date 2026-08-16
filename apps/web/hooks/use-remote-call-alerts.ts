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
 *
 * Identité du/des pair(s) concerné(s) (Vague 131, 2026-08-16) : les deux
 * booléens ci-dessus ne disent PAS qui est dégradé/capturant — dans un appel
 * de groupe, `VideoCallInterface` labellisait ces alertes avec le premier
 * participant distant trouvé (`.find()`), sans rapport avec le VRAI
 * `event.participantId` que le gateway relaie déjà. Ce hook expose donc aussi
 * `remoteQualityDegradedParticipantId` (le DERNIER pair à avoir rapporté une
 * dégradation — cohérent avec l'auto-effacement 15 s, qui suit le dernier
 * rapporteur) et `remoteScreenCapturingParticipantIds` (l'ensemble ordonné
 * des pairs actuellement capturants, miroir exact de `capturingParticipants`
 * ci-dessous) pour que l'appelant résolve le VRAI nom à afficher.
 *
 * Espace d'identité (Vague 132, 2026-08-16) : `event.participantId` est
 * `CallParticipant.participantId` (FK vers `Participant.id`), PAS
 * `User.id`. `VideoCallInterface.resolveParticipantName` cherche pourtant
 * dans le roster par `(p.userId || p.participantId)`, où `p.userId` porte un
 * vrai `User.id` pour un participant enregistré (`participantId` n'existe
 * même pas sur l'entrée roster côté client — jamais peuplé par le gateway).
 * Résultat avant correctif : nom introuvable pour QUASIMENT tout appel
 * (seul un invité anonyme, dont `userId` retombe déjà sur son
 * `Participant.id`, matchait par coïncidence). `resolveAlertIdentity`
 * ci-dessous préfère `event.userId` (ajouté Vague 132, même dérivation que
 * `toCallParticipantResponse`) et ne retombe sur `event.participantId` que
 * si le gateway ne l'a pas encore envoyé — c'est CETTE valeur, jamais le
 * `participantId` brut, qui doit peupler les deux Maps/Set ci-dessous ET la
 * clé de nettoyage sur `call:participant-left`, sous peine de rendre le
 * retrait silencieusement inopérant (les trois événements doivent
 * s'accorder sur le même espace d'identité).
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

/**
 * The identity to key alert state by — see the file-level doc comment
 * (Vague 132). Applied uniformly to all three side-channel events so a
 * `participant-left` cleanup always matches what quality/screen-capture
 * alerts wrote.
 */
const resolveAlertIdentity = (event: { participantId: string; userId?: string }): string =>
  event.userId || event.participantId;

export function useRemoteCallAlerts(callId: string | null): {
  remoteQualityDegraded: boolean;
  remoteQualityDegradedParticipantId: string | null;
  remoteScreenCapturing: boolean;
  remoteScreenCapturingParticipantIds: readonly string[];
} {
  const [remoteQualityDegraded, setRemoteQualityDegraded] = useState(false);
  const [remoteQualityDegradedParticipantId, setRemoteQualityDegradedParticipantId] =
    useState<string | null>(null);
  const [remoteScreenCapturing, setRemoteScreenCapturing] = useState(false);
  const [remoteScreenCapturingParticipantIds, setRemoteScreenCapturingParticipantIds] =
    useState<readonly string[]>([]);

  useEffect(() => {
    setRemoteQualityDegraded(false);
    setRemoteQualityDegradedParticipantId(null);
    setRemoteScreenCapturing(false);
    setRemoteScreenCapturingParticipantIds([]);
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
      // Last reporter wins — consistent with the 15s auto-clear below, which
      // already tracks only the most recent alert regardless of who sent it.
      setRemoteQualityDegradedParticipantId(resolveAlertIdentity(event));
      if (resetTimeout) clearTimeout(resetTimeout);
      resetTimeout = setTimeout(() => {
        resetTimeout = null;
        setRemoteQualityDegraded(false);
        setRemoteQualityDegradedParticipantId(null);
      }, REMOTE_QUALITY_RESET_MS);
    };

    const handleScreenCaptureAlert = (event: CallScreenCaptureEvent) => {
      if (event.callId !== callId) return;
      const identity = resolveAlertIdentity(event);
      if (event.isCapturing) {
        capturingParticipants.add(identity);
      } else {
        capturingParticipants.delete(identity);
      }
      setRemoteScreenCapturing(capturingParticipants.size > 0);
      setRemoteScreenCapturingParticipantIds(Array.from(capturingParticipants));
    };

    // A capturing participant can leave the call (hangup, disconnect) without
    // ever emitting a stop transition — without this, their entry survives
    // in the set forever, pinning the privacy pill on for the REST of the
    // call even once nobody is capturing anymore.
    const handleParticipantLeft = (event: CallParticipantLeftEvent) => {
      if (event.callId !== callId) return;
      if (capturingParticipants.delete(resolveAlertIdentity(event))) {
        setRemoteScreenCapturing(capturingParticipants.size > 0);
        setRemoteScreenCapturingParticipantIds(Array.from(capturingParticipants));
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

  return {
    remoteQualityDegraded,
    remoteQualityDegradedParticipantId,
    remoteScreenCapturing,
    remoteScreenCapturingParticipantIds,
  };
}
