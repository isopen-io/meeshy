'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { theme } from './theme';

export interface MessageTimestampProps {
  /** The timestamp to display */
  timestamp: Date | string;
  /** Format mode for the timestamp display */
  format?: 'time' | 'date' | 'datetime' | 'relative';
  /** Whether to show separator lines on sides */
  showSeparators?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Formats a timestamp with smart relative date handling.
 *
 * Rules:
 * - Today: "Aujourd'hui a HH:mm"
 * - Yesterday: "Hier a HH:mm"
 * - This week: "Lundi a HH:mm"
 * - This year: "27 janvier"
 * - Older: "27 janvier 2025"
 */
function formatSmartTimestamp(
  date: Date,
  format: 'time' | 'date' | 'datetime' | 'relative'
): string {
  const now = new Date();

  // Calculate day differences at midnight for accurate day comparison
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffTime = todayStart.getTime() - dateStart.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  // Format time consistently
  const timeStr = date.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  // Time only format
  if (format === 'time') {
    return timeStr;
  }

  // Date only format
  if (format === 'date') {
    if (diffDays === 0) {
      return "Aujourd'hui";
    }
    if (diffDays === 1) {
      return 'Hier';
    }
    if (diffDays < 7 && diffDays > 0) {
      const dayName = date.toLocaleDateString('fr-FR', { weekday: 'long' });
      return capitalizeFirst(dayName);
    }
    // Same year - no need to show year
    if (date.getFullYear() === now.getFullYear()) {
      const day = date.getDate();
      const month = date.toLocaleDateString('fr-FR', { month: 'long' });
      return `${day} ${month}`;
    }
    // Different year - show full date
    const day = date.getDate();
    const month = date.toLocaleDateString('fr-FR', { month: 'long' });
    const year = date.getFullYear();
    return `${day} ${month} ${year}`;
  }

  // Relative format (smart datetime)
  if (format === 'relative' || format === 'datetime') {
    if (diffDays === 0) {
      return format === 'relative'
        ? timeStr
        : `Aujourd'hui a ${timeStr}`;
    }
    if (diffDays === 1) {
      return `Hier a ${timeStr}`;
    }
    if (diffDays < 7 && diffDays > 0) {
      const dayName = date.toLocaleDateString('fr-FR', { weekday: 'long' });
      return `${capitalizeFirst(dayName)} a ${timeStr}`;
    }
    // Same year
    if (date.getFullYear() === now.getFullYear()) {
      const day = date.getDate();
      const month = date.toLocaleDateString('fr-FR', { month: 'long' });
      return `${day} ${month}`;
    }
    // Different year
    const day = date.getDate();
    const month = date.toLocaleDateString('fr-FR', { month: 'long' });
    const year = date.getFullYear();
    return `${day} ${month} ${year}`;
  }

  return timeStr;
}

/**
 * Capitalize the first letter of a string
 */
function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * MessageTimestamp - Displays timestamps between messages in conversation flow.
 *
 * Designed to be lightweight, centered, and non-intrusive while providing
 * clear temporal context for message groupings.
 *
 * @example
 * // Time only
 * <MessageTimestamp timestamp={new Date()} format="time" />
 * // Output: "14:32"
 *
 * @example
 * // Smart relative datetime
 * <MessageTimestamp timestamp={new Date()} format="datetime" />
 * // Output: "Aujourd'hui a 14:32"
 *
 * @example
 * // With separator lines
 * <MessageTimestamp timestamp={yesterday} showSeparators />
 * // Output: "--- Hier a 09:15 ---"
 */
export function MessageTimestamp({
  timestamp,
  format = 'datetime',
  showSeparators = false,
  className,
}: MessageTimestampProps) {
  // Parse and memoize the formatted timestamp
  const formattedTimestamp = useMemo(() => {
    const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;

    // Validate date
    if (isNaN(date.getTime())) {
      return '';
    }

    return formatSmartTimestamp(date, format);
  }, [timestamp, format]);

  // Don't render if invalid timestamp
  if (!formattedTimestamp) {
    return null;
  }

  return (
    <div
      className={cn(
        'flex items-center justify-center gap-3 py-3 select-none transition-colors duration-300',
        className
      )}
      role="separator"
      aria-label={`Message timestamp: ${formattedTimestamp}`}
    >
      {/* Left separator line */}
      {showSeparators && (
        <div
          className="flex-1 max-w-12 h-px transition-colors duration-300"
          style={{ backgroundColor: 'var(--gp-text-muted)', opacity: 0.3 }}
        />
      )}

      {/* Timestamp text */}
      <span
        className="text-xs font-medium whitespace-nowrap transition-colors duration-300"
        style={{
          color: 'var(--gp-text-muted)',
          fontFamily: theme.fonts.body,
        }}
      >
        {formattedTimestamp}
      </span>

      {/* Right separator line */}
      {showSeparators && (
        <div
          className="flex-1 max-w-12 h-px transition-colors duration-300"
          style={{ backgroundColor: 'var(--gp-text-muted)', opacity: 0.3 }}
        />
      )}
    </div>
  );
}

/**
 * Hook to determine if a timestamp separator should be shown between messages.
 * Shows timestamp when there's a significant time gap (default: 5 minutes).
 *
 * @param currentTimestamp - Current message timestamp
 * @param previousTimestamp - Previous message timestamp (if any)
 * @param gapMinutes - Minimum gap in minutes to show separator (default: 5)
 * @returns Whether to show the timestamp separator
 */
export function useShowTimestamp(
  currentTimestamp: Date | string | undefined,
  previousTimestamp: Date | string | undefined | null,
  gapMinutes: number = 5
): boolean {
  return useMemo(() => {
    if (!currentTimestamp) return false;
    if (!previousTimestamp) return true; // Always show for first message

    const current = typeof currentTimestamp === 'string'
      ? new Date(currentTimestamp)
      : currentTimestamp;
    const previous = typeof previousTimestamp === 'string'
      ? new Date(previousTimestamp)
      : previousTimestamp;

    // Validate dates
    if (isNaN(current.getTime()) || isNaN(previous.getTime())) {
      return false;
    }

    const diffMs = current.getTime() - previous.getTime();
    const diffMinutes = Math.abs(diffMs) / (1000 * 60);

    return diffMinutes >= gapMinutes;
  }, [currentTimestamp, previousTimestamp, gapMinutes]);
}

/**
 * Hook to determine if a date separator should be shown (new day).
 *
 * @param currentTimestamp - Current message timestamp
 * @param previousTimestamp - Previous message timestamp (if any)
 * @returns Whether to show the date separator
 */
export function useShowDateSeparator(
  currentTimestamp: Date | string | undefined,
  previousTimestamp: Date | string | undefined | null
): boolean {
  return useMemo(() => {
    if (!currentTimestamp) return false;
    if (!previousTimestamp) return true; // Always show for first message

    const current = typeof currentTimestamp === 'string'
      ? new Date(currentTimestamp)
      : currentTimestamp;
    const previous = typeof previousTimestamp === 'string'
      ? new Date(previousTimestamp)
      : previousTimestamp;

    // Validate dates
    if (isNaN(current.getTime()) || isNaN(previous.getTime())) {
      return false;
    }

    // Compare dates (ignoring time)
    const currentDay = new Date(
      current.getFullYear(),
      current.getMonth(),
      current.getDate()
    );
    const previousDay = new Date(
      previous.getFullYear(),
      previous.getMonth(),
      previous.getDate()
    );

    return currentDay.getTime() !== previousDay.getTime();
  }, [currentTimestamp, previousTimestamp]);
}

export default MessageTimestamp;
