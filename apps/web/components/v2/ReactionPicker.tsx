'use client';

import { useCallback } from 'react';
import { cn } from '@/lib/utils';

export interface ReactionPickerProps {
  onReact: (emoji: string) => void;
  currentReaction?: string;
  className?: string;
}

const REACTIONS = ['\u2764\uFE0F', '\uD83D\uDD25', '\uD83D\uDE02', '\uD83D\uDE2E', '\uD83D\uDE22', '\uD83D\uDC4F'];

function ReactionPicker({ onReact, currentReaction, className }: ReactionPickerProps) {
  const handleClick = useCallback(
    (emoji: string) => {
      onReact(emoji);
    },
    [onReact]
  );

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-1 border transition-colors duration-300',
        className
      )}
      style={{
        background: 'var(--gp-surface)',
        borderColor: 'var(--gp-border)',
        boxShadow: 'var(--gp-shadow-lg)',
      }}
      role="group"
      aria-label="Reactions"
    >
      {REACTIONS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => handleClick(emoji)}
          aria-label={`React with ${emoji}`}
          aria-pressed={currentReaction === emoji}
          className={cn(
            'text-xl p-1.5 rounded-full transition-all duration-300 hover:scale-125',
            currentReaction === emoji && 'bg-[var(--gp-parchment)]'
          )}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

ReactionPicker.displayName = 'ReactionPicker';

export { ReactionPicker };
export type { ReactionPickerProps };
