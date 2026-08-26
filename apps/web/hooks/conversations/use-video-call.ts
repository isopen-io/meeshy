/**
 * useVideoCall - Gère l'initiation des appels vidéo
 *
 * Suit les Vercel React Best Practices:
 * - Logique isolée dans un hook dédié
 * - Gestion propre des ressources (MediaStream)
 *
 * @module hooks/conversations/use-video-call
 */

import { useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { meeshySocketIOService } from '@/services/meeshy-socketio.service';
import { useCallStore } from '@/stores/call-store';
import { useAuth } from '@/hooks/use-auth';
import { useI18n, type TFunction } from '@/hooks/useI18n';
import { CLIENT_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { Conversation } from '@meeshy/shared/types';
import type { CallInitiateAck } from '@meeshy/shared/types/video-call';
import { getCallMediaConstraints, stopPreauthorizedStream } from '@/lib/calls/call-media-constraints';

interface UseVideoCallOptions {
  /**
   * Conversation sélectionnée
   */
  conversation: Conversation | null;
}

export type CallMediaType = 'audio' | 'video';

// Sibling of CALL_JOIN_ACK_TIMEOUT_MS (CallManager.tsx, Vague 88) and the
// pre-existing SOCKET_ACK_TIMEOUT_MS pattern (use-post-mutations.ts /
// use-comment-mutations.ts) — Socket.IO client 4.8 does NOT auto-reject a
// pending ack callback when the transport drops between emit and response
// unless the caller opts in via `socket.timeout(ms)`, which this call site
// never did. A dropped `call:initiate` ack (transient disconnect right
// after the emit, gateway restart mid-request, ordinary mobile flakiness)
// left `startCallInFlightRef` stuck `true` forever — every subsequent Call
// button click silently swallowed by the re-entrancy guard — and the
// pre-authorized camera/mic stream never released.
const CALL_INITIATE_ACK_TIMEOUT_MS = 10_000;

interface UseVideoCallReturn {
  startCall: (type?: CallMediaType) => Promise<void>;
}

/**
 * Hook pour initier un appel vidéo/audio.
 *
 * N'expose QUE `startCall` : c'est le seul membre consommé en production
 * (`ConversationLayout`, `CallSystemMessage`) — répondre/rejeter/raccrocher/
 * toggle audio-vidéo passent tous par `CallManager.tsx` + `call-store.ts`,
 * pas par ce hook. Les anciens `answerCall`/`rejectCall`/`endCall`/
 * `toggleAudio`/`toggleVideo`/`isCallSupported`/`error` n'avaient aucun
 * appelant en dehors de leurs propres tests (retiré Vague 57, cf.
 * `tasks/calls-fonctionnel-todo.md`).
 */
export function useVideoCall({ conversation }: UseVideoCallOptions): UseVideoCallReturn {
  const { user } = useAuth();
  const { t } = useI18n('calls');

  // A double-click (or a re-render firing the click handler twice) before the
  // first getUserMedia + call:initiate round-trip settles used to acquire a
  // SECOND camera/mic stream and overwrite window.__preauthorizedMediaStream
  // with it, orphaning the first stream — nothing ever calls stop() on it, so
  // the camera/mic indicator stayed lit for the rest of the session. Same
  // failure family as videoToggleInFlightRef/cameraSwitchInFlightRef
  // (VideoCallInterface.tsx) and acceptingCallIdRef (CallManager.tsx). Unlike
  // those, the guard can't be a plain try/finally around the whole function:
  // socket.emit's ack fires asynchronously via callback, well after the
  // outer async function has already returned, so the ref is only cleared
  // explicitly on every exit path below (early return, catch, and inside the
  // ack callback) — never by a finally block, which would clear it while the
  // request is still in flight.
  const startCallInFlightRef = useRef(false);

  /**
   * Démarre un appel vidéo
   */
  const startCall = useCallback(async (type: CallMediaType = 'video') => {
    if (!conversation) {
      toast.error(t('toasts.selectConversation'));
      return;
    }

    if (conversation.type !== 'direct' && conversation.type !== 'group') {
      toast.error(t('toasts.unsupportedConversationType'));
      return;
    }

    if (startCallInFlightRef.current) {
      return;
    }
    startCallInFlightRef.current = true;

    const isVideo = type === 'video';
    let stream: MediaStream | null = null;

    try {
      // Demander les permissions média (vidéo uniquement pour un appel vidéo)
      stream = await navigator.mediaDevices.getUserMedia(getCallMediaConstraints(type));

      // Stocker le stream pour réutilisation
      (window as any).__preauthorizedMediaStream = stream;

      // Vérifier la connexion Socket
      const socket = meeshySocketIOService.getSocket();

      if (!socket?.connected) {
        toast.error(t('toasts.connectionError'));
        stopPreauthorizedStream(stream);
        startCallInFlightRef.current = false;
        return;
      }

      // Initier l'appel avec le type correct CallInitiateEvent
      const callData = {
        conversationId: conversation.id,
        type,
        settings: {
          screenShareEnabled: isVideo,
          translationEnabled: true,
        },
      };

      let ack: CallInitiateAck;
      try {
        ack = await new Promise<CallInitiateAck>((resolve, reject) => {
          const timer = setTimeout(
            () => reject(new Error('CALL_INITIATE_ACK_TIMEOUT')),
            CALL_INITIATE_ACK_TIMEOUT_MS
          );
          socket.emit(CLIENT_EVENTS.CALL_INITIATE, callData, (response: CallInitiateAck) => {
            clearTimeout(timer);
            resolve(response);
          });
        });
      } catch {
        // Ack never arrived in time (dropped packet, gateway restart
        // mid-request) — same fallback as an explicit ack failure below, so
        // the guard is released and the pre-authorized stream is stopped
        // either way.
        startCallInFlightRef.current = false;
        stopPreauthorizedStream(stream);
        toast.error(t('toasts.startFailed'));
        return;
      }

      // Whichever way the ack resolves, the attempt this ref was guarding
      // against re-entrancy is over — clear it first so it can't be left
      // stuck true by an early return below.
      startCallInFlightRef.current = false;

      // The gateway can reject call:initiate (callee busy/blocked/offline,
      // rate-limited, validation error). Without handling this branch the
      // pre-authorized camera/mic stream stays hot forever — the only
      // consumer that releases it is VideoCallInterface, which never
      // mounts because currentCall is never set — and the user is left
      // staring at a "Starting call..." toast with no further feedback.
      if (!ack?.success) {
        stopPreauthorizedStream(stream);
        toast.error(ack?.error?.message ?? t('toasts.startFailed'));
        return;
      }

      // Persist the server-provided ICE servers (STUN + time-limited TURN)
      // so the initiator's RTCPeerConnection is built with TURN credentials
      // before the SDP offer is created.
      if (ack.data?.iceServers?.length) {
        useCallStore.getState().setIceServers(ack.data.iceServers);
      }

      // P0 fix (2026-07-06) — the gateway deliberately never re-emits
      // `call:initiated` back to the initiator's own socket(s) (it only
      // notifies the OTHER conversation members); `CallManager`'s
      // `isInitiator` branch that would set `currentCall`/`isInCall` is
      // therefore unreachable for the caller on web. Without this, the
      // callee gets rung correctly but the caller's own screen never shows
      // the call UI. Set the call as current directly from the ack — the
      // only data the caller actually needs to start rendering; the
      // participants list is populated as callees join via the existing
      // `call:participant-joined` handler (a no-op until `currentCall`
      // exists, so this is the step that unblocks it).
      if (ack.data?.callId && user) {
        // Vague 91 — this ack can land up to CALL_INITIATE_ACK_TIMEOUT_MS
        // after the request, long enough for the user to have accepted an
        // unrelated incoming call in the meantime (CallManager's
        // acceptOrJoinCall sets currentCall/isInCall on its own accord, with
        // no coordination with this hook). Committing to this call now would
        // silently clobber the single currentCall slot out from under a call
        // the user is already actively in, re-pointing the mounted
        // VideoCallInterface at a stale callId mid-conversation. Mirror
        // CallManager.tsx's rejectWaitingCall precedent for the symmetric
        // case (an unwanted second call while already in one): abandon the
        // newcomer instead — end it on the wire so its callee isn't left
        // ringing forever, and release the media acquired for it.
        const activeCall = useCallStore.getState().currentCall;
        if (activeCall && activeCall.id !== ack.data.callId) {
          socket.emit(CLIENT_EVENTS.CALL_END, {
            callId: ack.data.callId,
            reason: 'rejected',
          });
          stopPreauthorizedStream(stream);
          return;
        }

        useCallStore.getState().setCurrentCall({
          id: ack.data.callId,
          conversationId: conversation.id,
          mode: ack.data.mode,
          status: 'initiated',
          initiatorId: user.id,
          startedAt: new Date(),
          participants: [],
          metadata: { type },
        });
      }

      toast.success(t('toasts.startingCall'));
    } catch (error: unknown) {
      startCallInFlightRef.current = false;
      stopPreauthorizedStream(stream);
      handleMediaError(error, t);
    }
  }, [conversation, user, t]);

  return {
    startCall,
  };
}

/**
 * Gère les erreurs d'accès aux médias
 */
function handleMediaError(error: unknown, t: TFunction): void {
  if (error instanceof Error) {
    switch (error.name) {
      case 'NotAllowedError':
        toast.error(t('toasts.micPermissionDenied'));
        break;
      case 'NotFoundError':
        toast.error(t('toasts.micNotFound'));
        break;
      default:
        toast.error(t('toasts.micAccessFailed', { message: error.message }));
    }
  } else {
    toast.error(t('toasts.micAccessFailedGeneric'));
  }
}
