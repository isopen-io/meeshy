/**
 * CALL PAGE - Dynamic Route
 * Direct access to video call by ID
 */

'use client';

import React, { use, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { VideoCallInterface } from '@/components/video-calls/VideoCallInterface';
import { CallErrorBoundary } from '@/components/video-calls/CallErrorBoundary';
import { useAuth } from '@/hooks/use-auth';
import { useCallStore } from '@/stores/call-store';
import { meeshySocketIOService } from '@/services/meeshy-socketio.service';
import { CLIENT_EVENTS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { CallInitiatedEvent, CallParticipantJoinedEvent, CallJoinAck } from '@meeshy/shared/types/video-call';
import { logger } from '@/utils/logger';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

interface CallPageProps {
  params: Promise<{
    callId: string;
  }>;
}

export default function CallPage({ params }: CallPageProps) {
  const resolvedParams = use(params);
  const { callId } = resolvedParams;
  const router = useRouter();
  const { user, isChecking: isLoading } = useAuth();
  const { currentCall, setCurrentCall, setInCall, setIceServers, reset } = useCallStore();

  const [isJoining, setIsJoining] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  useEffect(() => {
    if (isLoading) return;

    if (!user) {
      logger.warn('[CallPage]', 'User not authenticated, redirecting to login');
      toast.error('Please sign in to join the call');
      router.push(`/login?returnUrl=${encodeURIComponent(`/call/${callId}`)}`);
      return;
    }

    // If already in this call, don't rejoin
    if (currentCall?.id === callId) {
      logger.debug('[CallPage]', 'Already in this call');
      return;
    }

    // Auto-join the call. The socket listeners and the join-timeout are
    // registered synchronously in the effect body (not inside an async
    // closure) so the function returned here is the effect's REAL cleanup —
    // React only runs a cleanup returned directly from the effect callback,
    // never one returned by a Promise the effect merely calls. Registering
    // them from inside `async () => {...}; joinCall();` (as before) meant
    // React always saw `undefined` as this effect's cleanup: the listeners
    // and the 10s timeout survived unmount/re-run, permanently stacking up
    // on the shared socket singleton on every call-page visit.
    setIsJoining(true);
    setError(null);

    const socket = meeshySocketIOService.getSocket();
    if (!socket) {
      const message = 'No socket connection. Please refresh the page.';
      setError(message);
      setIsJoining(false);
      toast.error(message);
      logger.error('[CallPage]', 'Failed to join call', { error: message });
      return;
    }

    logger.info('[CallPage]', 'Auto-joining call', { callId });

    // Set a timeout for joining
    const timeout = setTimeout(() => {
      setError('Failed to join call. The call may not exist or has ended.');
      setIsJoining(false);
    }, 10000);

    // Listen for successful join
    const handleParticipantJoined = (event: CallParticipantJoinedEvent) => {
      if (event.callId === callId) {
        clearTimeout(timeout);
        setIsJoining(false);
        setInCall(true);
        socket.off(SERVER_EVENTS.CALL_PARTICIPANT_JOINED, handleParticipantJoined);
      }
    };

    const handleCallInitiated = (event: CallInitiatedEvent) => {
      if (event.callId === callId) {
        clearTimeout(timeout);
        setIsJoining(false);
        setCurrentCall({
          id: event.callId,
          conversationId: event.conversationId,
          mode: event.mode,
          status: 'active',
          initiatorId: event.initiator.userId,
          startedAt: new Date(),
          participants: event.participants,
          metadata: { type: event.type },
        });
        setInCall(true);
        socket.off(SERVER_EVENTS.CALL_INITIATED, handleCallInitiated);
      }
    };

    socket.on(SERVER_EVENTS.CALL_PARTICIPANT_JOINED, handleParticipantJoined);
    socket.on(SERVER_EVENTS.CALL_INITIATED, handleCallInitiated);

    // Emit join event. The ack is this page's ONLY completion signal for
    // THIS user's own join — `CALL_PARTICIPANT_JOINED` is a broadcast the
    // gateway deliberately never sends back to the socket that just joined
    // (CallEventsHandler.ts: `if (remoteSocket.id === socket.id) continue;`
    // in its call:join handler) — it exists to tell OTHER participants
    // someone new arrived, not to confirm this join. Relying on it here
    // meant a user landing directly on an already-active call (bookmarked
    // link, shared URL) always hit the 10s timeout and a spurious "Call
    // Error" screen even though the join had already succeeded server-side.
    // `handleParticipantJoined`/`handleCallInitiated` above stay registered
    // for later participants; they're just no longer this page's own
    // completion path. Mirrors `acceptOrJoinCall` in CallManager.tsx, which
    // already treats its own call:join ack as authoritative.
    socket.emit(CLIENT_EVENTS.CALL_JOIN, {
      callId,
      settings: {
        audioEnabled: true,
        videoEnabled: true,
      },
    }, (ack: CallJoinAck) => {
      clearTimeout(timeout);
      if (ack?.success && ack.data?.callSession) {
        if (ack.data.iceServers?.length) {
          setIceServers(ack.data.iceServers);
        }
        setCurrentCall(ack.data.callSession);
        setInCall(true);
        setIsJoining(false);
      } else {
        setError(ack?.error?.message || 'Failed to join call. The call may not exist or has ended.');
        setIsJoining(false);
      }
    });

    return () => {
      clearTimeout(timeout);
      socket.off(SERVER_EVENTS.CALL_PARTICIPANT_JOINED, handleParticipantJoined);
      socket.off(SERVER_EVENTS.CALL_INITIATED, handleCallInitiated);
    };
  }, [callId, user, isLoading, currentCall, router, setCurrentCall, setInCall, setIceServers]);

  // Handle call ended - redirect to home
  useEffect(() => {
    if (!currentCall && !isJoining && !isLoading && user) {
      const timer = setTimeout(() => {
        logger.debug('[CallPage]', 'Call ended, redirecting to home');
        router.push('/');
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [currentCall, isJoining, isLoading, user, router]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      reset();
    };
  }, [reset]);

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-white animate-spin mx-auto mb-4" />
          <p className="text-white text-lg">Loading...</p>
        </div>
      </div>
    );
  }

  if (isJoining) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-white animate-spin mx-auto mb-4" />
          <p className="text-white text-lg">Joining call...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-6">
          <div className="bg-red-600 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-white text-2xl font-bold mb-2">Call Error</h1>
          <p className="text-gray-300 mb-6">{error}</p>
          <button
            onClick={() => router.push('/')}
            className="bg-white text-black px-6 py-3 rounded-lg font-medium hover:bg-gray-100 transition"
          >
            Return Home
          </button>
        </div>
      </div>
    );
  }

  if (currentCall) {
    return (
      <CallErrorBoundary>
        <VideoCallInterface callId={callId} />
      </CallErrorBoundary>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="w-12 h-12 text-white animate-spin mx-auto mb-4" />
        <p className="text-white text-lg">Loading call...</p>
      </div>
    </div>
  );
}
