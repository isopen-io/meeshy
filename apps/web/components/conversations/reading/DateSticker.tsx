'use client';

import { memo } from 'react';
import { cn } from '@/lib/utils';

/**
 * Le « data sticker » de catégorisation — repris d'iOS
 * (`MessageDaySeparator.swift`), rendu COLLANT partout sur le web.
 *
 * Source : `docs/design/2026-08-15-focal-spec-integration.html` § 3.
 * Capsule translucide, bord fin, libellés « Aujourd'hui / Hier / Lundi 9 mai ».
 */
interface DateStickerProps {
  label: string;
  className?: string;
}

export const DateSticker = memo(function DateSticker({ label, className }: DateStickerProps) {
  return (
    <div
      className={cn('sticky top-1 z-[5] flex justify-center py-1', className)}
      data-date-sticker={label}
    >
      <span
        className={cn(
          'rounded-full border px-3 py-[5px] font-semibold uppercase tracking-[0.1em]',
          'border-indigo-200/70 bg-white/70 text-gray-600 backdrop-blur-md',
          'dark:border-indigo-900/70 dark:bg-gray-900/70 dark:text-gray-300'
        )}
        style={{ fontSize: 'var(--lentille-list-sticker-size)' }}
      >
        {label}
      </span>
    </div>
  );
});
