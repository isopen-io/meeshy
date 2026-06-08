'use client';

import { focusManager } from '@tanstack/react-query';

// Debounce tab-focus events so rapid tab switches don't burst-refetch all queries.
// The safety-net (catching Socket.IO missed events) is preserved: we still
// refetch, just not more than once per 5-second window.
const FOCUS_DEBOUNCE_MS = 5_000;

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

if (typeof window !== 'undefined') {
  focusManager.setEventListener((handleFocus) => {
    const onFocus = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => handleFocus(true), FOCUS_DEBOUNCE_MS);
    };
    const onBlur = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      handleFocus(false);
    };
    window.addEventListener('focus', onFocus, false);
    window.addEventListener('blur', onBlur, false);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
    };
  });
}
