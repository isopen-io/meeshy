/**
 * CALL PAGE - Dynamic Route
 * Direct access to video call by ID
 */

'use client';

import React, { use, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { VideoCallInterface } from '@/components/video-calls/VideoCallInterface';
import { useAuth } from '@/hooks/use-auth';
import { useCallStore } from '@/stores/call-store';
import { meeshySocketIOService } from '@/services/meeshy-socketio.service';
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
  const { user, isLoading } = useAuth();
  const { currentCall, setCurrentCall, setInCall, reset } = useCallStore();

  const [isJoining, setIsJoining] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  useEffect(() => {
    if (isLoading) return;

    if (!user) {
      logger.warn('[CallPage]', 'User not authenticated, redirecting to login');
      toast.error('Please sign in to join the call');
      router.push(`/login?redirect=/call/${callId}`);
      return;
    }

    // If already in this call, don't rejoin
    if (currentCall?.id === callId) {
      logger.debug('[CallPage]', 'Already in this call');
      return;
    }

    // Auto-join the call
    const joinCall = async () => {
      setIsJoining(true);
      setError(null);

      try {
        const socket = meeshySocketIOService.getSocket();
        if (!socket) {
          throw new Error('No socket connection. Please refresh the page.');
        }

        logger.info('[CallPage]', 'Auto-joining call', { callId });

        // Emit join event
        socket.emit('call:join', {
          callId,
          settings: {
            audioEnabled: true,
            videoEnabled: true,
          },
        });

        // Wait for call:participant-joined or call:initiated event
        // The CallManager component will handle these events and update the store

        // Set a timeout for joining
        const timeout = setTimeout(() => {
          setError('Failed to join call. The call may not exist or has ended.');
          setIsJoining(false);
        }, 10000);

        // Listen for successful join
        const handleParticipantJoined = (event: any) => {
          if (event.callId === callId) {
            clearTimeout(timeout);
            setIsJoining(false);
            setInCall(true);
            socket.off('call:participant-joined', handleParticipantJoined);
          }
        };

        const handleCallInitiated = (event: any) => {
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
            });
            setInCall(true);
            socket.off('call:initiated', handleCallInitiated);
          }
        };

        socket.on('call:participant-joined', handleParticipantJoined);
        socket.on('call:initiated', handleCallInitiated);

        // Cleanup
        return () => {
          clearTimeout(timeout);
          socket.off('call:participant-joined', handleParticipantJoined);
          socket.off('call:initiated', handleCallInitiated);
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to join call';
        setError(message);
        setIsJoining(false);
        toast.error(message);
        logger.error('[CallPage]', 'Failed to join call', { error: err });
      }
    };

    joinCall();
  }, [callId, user, isLoading, currentCall, router, setCurrentCall, setInCall]);

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
    return <VideoCallInterface callId={callId} />;
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
