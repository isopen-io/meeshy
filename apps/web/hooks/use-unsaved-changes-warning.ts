'use client';

import { useEffect, useCallback, useRef } from 'react';
import { useIsMutating } from '@tanstack/react-query';

export function useUnsavedChangesWarning(enabled = true) {
  const pendingMutations = useIsMutating();
  const hasPending = enabled && pendingMutations > 0;
  const hasPendingRef = useRef(hasPending);
  hasPendingRef.current = hasPending;

  const handleBeforeUnload = useCallback((e: BeforeUnloadEvent) => {
    if (hasPendingRef.current) {
      e.preventDefault();
    }
  }, []);

  useEffect(() => {
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [handleBeforeUnload]);

  return { hasPendingChanges: hasPending };
}
