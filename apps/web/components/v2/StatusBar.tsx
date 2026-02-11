'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Skeleton } from './Skeleton';
import { TranslationToggle } from './TranslationToggle';
import { getLanguageName } from './flags';

// ============================================================================
// Types
// ============================================================================

export interface StatusItem {
  id: string;
  author: { name: string; avatar?: string };
  moodEmoji: string;
  content?: string;
  originalLanguage?: string;
  translations?: Array<{ languageCode: string; languageName: string; content: string }>;
  expiresAt: string;
  isOwn: boolean;
}

export interface StatusBarProps {
  statuses: StatusItem[];
  onStatusPress: (statusId: string) => void;
  onAddStatus: () => void;
  userLanguage?: string;
  isLoading?: boolean;
  className?: string;
}

// ============================================================================
// Helpers
// ============================================================================

function getTimeRemaining(expiresAt: string): string {
  const now = Date.now();
  const expiry = new Date(expiresAt).getTime();
  const diff = expiry - now;

  if (diff <= 0) return 'Expire';

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);

  if (hours >= 1) {
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours}h${remainingMinutes}m` : `${hours}h`;
  }

  return `${minutes}m`;
}

// ============================================================================
// Plus Icon
// ============================================================================

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 4v16m8-8H4"
      />
    </svg>
  );
}

// ============================================================================
// Clock Icon
// ============================================================================

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z"
      />
    </svg>
  );
}

// ============================================================================
// Status Popover
// ============================================================================

interface StatusPopoverProps {
  status: StatusItem;
  userLanguage?: string;
  onClose: () => void;
}

function StatusPopover({ status, userLanguage, onClose }: StatusPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Use a short delay so the click that opened the popover does not
    // immediately close it when the event propagates.
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  const timeRemaining = getTimeRemaining(status.expiresAt);

  return (
    <div
      ref={popoverRef}
      className={cn(
        'absolute top-full left-1/2 -translate-x-1/2 mt-2 z-30',
        'w-64 rounded-2xl p-4',
        'backdrop-blur-xl bg-[var(--gp-surface)]/95',
        'border border-[var(--gp-border)]',
        'shadow-[var(--gp-shadow-lg)]',
        'transition-colors duration-300',
        'animate-in fade-in zoom-in-95 duration-150'
      )}
    >
      {/* Large emoji */}
      <div className="text-center mb-3">
        <span className="text-4xl leading-none">{status.moodEmoji}</span>
      </div>

      {/* Author name */}
      <p className="text-center text-sm font-semibold text-[var(--gp-text-primary)] mb-2 transition-colors duration-300">
        {status.author.name}
      </p>

      {/* Content with optional translation toggle */}
      {status.content && (
        <div className="mb-3">
          {status.translations && status.translations.length > 0 && status.originalLanguage ? (
            <TranslationToggle
              variant="inline"
              originalContent={status.content}
              originalLanguage={status.originalLanguage}
              originalLanguageName={getLanguageName(status.originalLanguage)}
              translations={status.translations}
              userLanguage={userLanguage}
              className="w-full"
            />
          ) : (
            <p className="text-sm text-center text-[var(--gp-text-secondary)] transition-colors duration-300">
              {status.content}
            </p>
          )}
        </div>
      )}

      {/* Time remaining */}
      <div className="flex items-center justify-center gap-1 text-xs text-[var(--gp-text-muted)] transition-colors duration-300">
        <ClockIcon className="w-3 h-3" />
        <span>{timeRemaining} restant</span>
      </div>
    </div>
  );
}

// ============================================================================
// StatusBar
// ============================================================================

function StatusBar({
  statuses,
  onStatusPress,
  onAddStatus,
  userLanguage,
  isLoading = false,
  className,
}: StatusBarProps) {
  const [openPopoverId, setOpenPopoverId] = useState<string | null>(null);

  const handlePillClick = useCallback(
    (statusId: string) => {
      setOpenPopoverId((prev) => (prev === statusId ? null : statusId));
      onStatusPress(statusId);
    },
    [onStatusPress]
  );

  const handleClosePopover = useCallback(() => {
    setOpenPopoverId(null);
  }, []);

  // Sort: own statuses first, then by expiry
  const sortedStatuses = useMemo(
    () =>
      [...statuses].sort((a, b) => {
        if (a.isOwn && !b.isOwn) return -1;
        if (!a.isOwn && b.isOwn) return 1;
        return new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime();
      }),
    [statuses]
  );

  // Loading state
  if (isLoading) {
    return (
      <div
        className={cn(
          'flex gap-3 px-4 py-3 overflow-x-auto',
          className
        )}
        style={{ scrollbarWidth: 'none' }}
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton
            key={i}
            variant="circular"
            className="flex-shrink-0 w-[88px] h-[40px] !rounded-full"
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex gap-3 px-4 py-3 overflow-x-auto',
        // Hide scrollbar across browsers
        '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className
      )}
    >
      {/* Add Mood pill */}
      <button
        onClick={onAddStatus}
        className={cn(
          'flex-shrink-0 inline-flex items-center gap-1.5',
          'px-4 py-2 rounded-full',
          'border-2 border-dashed border-[var(--gp-terracotta)]/40',
          'text-[var(--gp-terracotta)] text-sm font-medium',
          'hover:border-[var(--gp-terracotta)] hover:bg-[var(--gp-terracotta)]/5',
          'active:scale-95',
          'transition-all duration-300'
        )}
      >
        <PlusIcon className="w-4 h-4" />
        <span>Mood</span>
      </button>

      {/* Status pills */}
      {sortedStatuses.map((status) => (
        <div key={status.id} className="relative flex-shrink-0">
          <button
            onClick={() => handlePillClick(status.id)}
            className={cn(
              'inline-flex items-center gap-2',
              'px-4 py-2 rounded-full',
              'backdrop-blur-xl bg-[var(--gp-surface)]/80',
              'border border-[var(--gp-border)]',
              'hover:bg-[var(--gp-surface)]',
              'active:scale-95',
              'transition-all duration-300',
              'shadow-[var(--gp-shadow-sm)]',
              // Terracotta ring for own status
              status.isOwn && 'ring-2 ring-[var(--gp-terracotta)]/50',
              // Active highlight
              openPopoverId === status.id && 'ring-2 ring-[var(--gp-terracotta)]'
            )}
          >
            <span className="text-lg leading-none">{status.moodEmoji}</span>
            <span className="text-sm font-medium text-[var(--gp-text-primary)] max-w-[80px] truncate transition-colors duration-300">
              {status.author.name}
            </span>
          </button>

          {/* Popover */}
          {openPopoverId === status.id && (
            <StatusPopover
              status={status}
              userLanguage={userLanguage}
              onClose={handleClosePopover}
            />
          )}
        </div>
      ))}
    </div>
  );
}

StatusBar.displayName = 'StatusBar';

export { StatusBar };
