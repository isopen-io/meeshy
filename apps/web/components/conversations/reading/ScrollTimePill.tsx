'use client';

import { memo, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * ScrollTimePill — « Mercredi · 17:42 », le jour ET l'heure du message en tête
 * de viewport. Nouveau composant du volume 4 : elle N'EXISTE que pendant le
 * défilement et s'efface ~900 ms après l'arrêt du doigt.
 *
 * Source : `docs/design/2026-08-15-focal-spec-integration.html` § 3.
 *
 * `scrollTick` est un compteur incrémenté à chaque événement de défilement : le
 * parent possède le scroll, la pilule ne fait qu'observer. Chaque incrément
 * réarme le minuteur — un défilement continu ne fait jamais clignoter la
 * pilule.
 */
export const SCROLL_TIME_PILL_DISMISS_MS = 900;
export const SCROLL_TIME_PILL_FADE_MS = 280;

interface ScrollTimePillProps {
  label: string;
  scrollTick: number;
  className?: string;
}

export const ScrollTimePill = memo(function ScrollTimePill({
  label,
  scrollTick,
  className,
}: ScrollTimePillProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (scrollTick === 0) return;

    setIsVisible(true);
    const timer = setTimeout(() => setIsVisible(false), SCROLL_TIME_PILL_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [scrollTick]);

  if (!label) return null;

  return (
    <div
      className={cn(
        'pointer-events-none absolute left-1/2 z-20 -translate-x-1/2',
        className
      )}
      style={{ top: 'var(--lentille-thread-pill-top)' }}
    >
      <span
        aria-hidden={isVisible ? 'false' : 'true'}
        className={cn(
          'inline-block rounded-full border px-3 py-1 text-xs font-semibold',
          'border-indigo-200/70 bg-white/80 text-gray-700 backdrop-blur-md shadow-sm',
          'dark:border-indigo-900/70 dark:bg-gray-900/80 dark:text-gray-200',
          isVisible ? 'opacity-100' : 'opacity-0'
        )}
        style={{
          transitionProperty: 'opacity',
          transitionDuration: `${SCROLL_TIME_PILL_FADE_MS}ms`,
        }}
      >
        {label}
      </span>
    </div>
  );
});
