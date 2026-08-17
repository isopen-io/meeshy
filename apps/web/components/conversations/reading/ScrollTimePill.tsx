'use client';

import { memo } from 'react';
import { cn } from '@/lib/utils';

/**
 * ScrollTimePill — « Mercredi · 17:42 », le jour ET l'heure du message en tête
 * de viewport. Nouveau composant du volume 4 : elle N'EXISTE que pendant le
 * défilement et s'efface après la fenêtre de persistance de la loi partagée
 * `scrollActivityLaw` (`SCROLL_ACTIVITY_LINGER_MS`,
 * `packages/shared/utils/scroll-activity.ts`) une fois le doigt arrêté.
 *
 * Source : `docs/design/2026-08-15-focal-spec-integration.html` § 3.
 *
 * Composant PUR — même patron que `FocalTimePill` (WF-111) et
 * `SectionScrollPill` (WL-103) : `visible` est entièrement piloté par
 * `useScrollActivity` (WL-104, hook PARTAGÉ) côté appelant
 * (`ConversationMessages`). Aucun minuteur ici — un second minuteur local
 * dupliquerait la loi (garde R15).
 */
export const SCROLL_TIME_PILL_FADE_MS = 280;

interface ScrollTimePillProps {
  label: string;
  visible: boolean;
  className?: string;
}

export const ScrollTimePill = memo(function ScrollTimePill({
  label,
  visible,
  className,
}: ScrollTimePillProps) {
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
        aria-hidden={visible ? 'false' : 'true'}
        className={cn(
          'inline-block rounded-full border px-3 py-1 text-xs font-semibold',
          'border-indigo-200/70 bg-white/80 text-gray-700 backdrop-blur-md shadow-sm',
          'dark:border-indigo-900/70 dark:bg-gray-900/80 dark:text-gray-200',
          visible ? 'opacity-100' : 'opacity-0'
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
