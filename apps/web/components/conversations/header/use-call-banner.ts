import { useState, useEffect, useCallback } from 'react';
import { useCallStore } from '@/stores/call-store';

export function useCallBanner(conversationId: string, onStartCall?: () => void) {
  const { currentCall, isInCall } = useCallStore();
  const [callDuration, setCallDuration] = useState(0);
  const [showCallBanner, setShowCallBanner] = useState(false);

  useEffect(() => {
    const hasActiveCall =
      currentCall &&
      isInCall &&
      currentCall.conversationId === conversationId &&
      currentCall.status !== 'ended';

    if (hasActiveCall) {
      setShowCallBanner(true);

      const updateDuration = () => {
        if (currentCall.startedAt) {
          const now = new Date();
          const start = new Date(currentCall.startedAt);
          const durationInSeconds = Math.floor((now.getTime() - start.getTime()) / 1000);
          setCallDuration(durationInSeconds);
        }
      };

      updateDuration();
      const interval = setInterval(updateDuration, 1000);

      return () => clearInterval(interval);
    } else {
      setShowCallBanner(false);
      setCallDuration(0);
    }
  }, [currentCall, isInCall, conversationId]);

  const handleJoinCall = useCallback(() => {
    if (currentCall && onStartCall) {
      onStartCall();
    }
  }, [currentCall, onStartCall]);

  const handleDismissCallBanner = useCallback(() => {
    setShowCallBanner(false);
  }, []);

  return {
    currentCall,
    callDuration,
    showCallBanner,
    handleJoinCall,
    handleDismissCallBanner,
  };
}
