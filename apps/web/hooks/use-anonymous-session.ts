'use client';

import { useEffect, useRef } from 'react';
import { authManager } from '@/services/auth-manager.service';
import { anonymousChatService } from '@/services/anonymous-chat.service';

const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

interface UseAnonymousSessionOptions {
  enabled?: boolean;
  linkId?: string;
}

export function useAnonymousSession({ enabled = false, linkId }: UseAnonymousSessionOptions) {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!enabled || !linkId) return;

    const session = authManager.getAnonymousSession();
    if (!session?.token) return;

    anonymousChatService.initialize(linkId);

    const refreshSession = async () => {
      try {
        await anonymousChatService.refreshSession();
      } catch (error) {
        console.error('[useAnonymousSession] Session refresh failed:', error);
      }
    };

    intervalRef.current = setInterval(refreshSession, REFRESH_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, linkId]);
}
