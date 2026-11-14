import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Le BANDEAU NEUTRE de l'en-tête d'un direct : l'en-tête n'a pas de place pour
 * une phrase, ce que disent le talkie et le Bring se pose sous la barre, puis
 * s'efface. `marker` nomme l'émetteur (`data-thread-<marker>-notice`).
 */

const NOTICE_MS = 4_000;

export function ThreadHeaderNotice({ text, marker }: { readonly text: string; readonly marker: string }) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <p
      role="status"
      aria-live="polite"
      {...{ [`data-thread-${marker}-notice`]: '' }}
      className="pointer-events-none fixed inset-x-0 z-[70] mx-auto w-fit max-w-[calc(100%-2rem)] rounded-chip px-4 py-2.5 text-center text-caption font-semibold shadow-lg"
      style={{ top: 'calc(env(safe-area-inset-top, 0px) + 72px)', color: 'var(--color-ios-card)', backgroundColor: 'var(--color-ios-ink)' }}
    >
      {text}
    </p>,
    document.body,
  );
}

export function useTransientNotice(): readonly [string | null, (text: string) => void] {
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (notice === null) return undefined;
    const timer = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);
  return [notice, setNotice];
}
