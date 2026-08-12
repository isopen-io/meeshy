'use client';

import { useEffect, useState } from 'react';
import { formatClock } from '@meeshy/shared/utils/duration-format';

/**
 * Format elapsed seconds as `m:ss` (or `h:mm:ss` past an hour).
 * Delegates to the canonical {@link formatClock} (single source of truth).
 */
export function formatCallDuration(totalSeconds: number): string {
  return formatClock(totalSeconds);
}

/**
 * Ticking call duration derived from the call's start time. Returns both the
 * raw seconds and a preformatted label. Self-contained (owns its interval) so
 * the call UI doesn't carry a timer effect.
 */
export function useCallDuration(
  startedAt?: string | Date | null
): { seconds: number; label: string } {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!startedAt) {
      setSeconds(0);
      return;
    }
    const start = new Date(startedAt).getTime();
    const tick = () => setSeconds(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  return { seconds, label: formatCallDuration(seconds) };
}
