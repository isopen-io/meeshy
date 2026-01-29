import { useState, useRef, useCallback } from 'react';

interface UseRateLimitingProps {
  cooldownMs?: number;
  onSend: () => Promise<void> | void;
  enableQueue?: boolean;
}

export const useRateLimiting = ({
  cooldownMs = 500,
  onSend,
  enableQueue = false,
}: UseRateLimitingProps) => {
  const [isInCooldown, setIsInCooldown] = useState(false);
  const [queueLength, setQueueLength] = useState(0);
  const lastSendTime = useRef<number>(0);
  const queueRef = useRef<Array<() => Promise<void>>>([]);
  const processingRef = useRef(false);

  const processQueue = useCallback(async () => {
    if (processingRef.current || queueRef.current.length === 0) return;

    processingRef.current = true;

    while (queueRef.current.length > 0) {
      const now = Date.now();
      const timeSinceLastSend = now - lastSendTime.current;

      if (timeSinceLastSend < cooldownMs) {
        const waitTime = cooldownMs - timeSinceLastSend;
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }

      const sendFn = queueRef.current.shift();
      if (sendFn) {
        await sendFn();
        lastSendTime.current = Date.now();
        setQueueLength(queueRef.current.length);
      }
    }

    processingRef.current = false;
    setIsInCooldown(false);
  }, [cooldownMs]);

  const sendWithRateLimit = useCallback(async () => {
    const now = Date.now();
    const timeSinceLastSend = now - lastSendTime.current;

    // Check if we're in cooldown OR if we already marked the send time
    if (timeSinceLastSend < cooldownMs || (lastSendTime.current > 0 && isInCooldown)) {
      if (enableQueue) {
        queueRef.current.push(async () => {
          await onSend();
        });
        setQueueLength(queueRef.current.length);
        setIsInCooldown(true);
        processQueue();
      }
      return;
    }

    setIsInCooldown(true);
    // Mark time immediately to block subsequent calls
    lastSendTime.current = Date.now();
    await onSend();

    setTimeout(() => {
      if (queueRef.current.length === 0) {
        setIsInCooldown(false);
      }
    }, cooldownMs);

    if (enableQueue) {
      processQueue();
    }
  }, [cooldownMs, onSend, enableQueue, processQueue, isInCooldown]);

  return {
    sendWithRateLimit,
    isInCooldown,
    queueLength,
  };
};
