'use client';

import { useState, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Dialog, DialogHeader, DialogBody, DialogFooter } from './Dialog';
import { Button } from './Button';

// ============================================================================
// Types
// ============================================================================

export interface StatusComposerProps {
  open: boolean;
  onClose: () => void;
  onPublish: (status: { moodEmoji: string; content?: string }) => void;
  currentStatus?: { moodEmoji: string; content?: string };
}

// ============================================================================
// Constants
// ============================================================================

const MOOD_EMOJIS = ['😴', '🎉', '💪', '☕', '🔥', '💭', '🎵', '📚', '✈️', '❤️'] as const;
const MAX_CONTENT_LENGTH = 140;

// ============================================================================
// StatusComposer
// ============================================================================

function StatusComposer({ open, onClose, onPublish, currentStatus }: StatusComposerProps) {
  const [selectedEmoji, setSelectedEmoji] = useState<string>(currentStatus?.moodEmoji ?? '');
  const [content, setContent] = useState<string>(currentStatus?.content ?? '');

  // Sync state when currentStatus changes or dialog opens
  useEffect(() => {
    if (open) {
      setSelectedEmoji(currentStatus?.moodEmoji ?? '');
      setContent(currentStatus?.content ?? '');
    }
  }, [open, currentStatus]);

  const handlePublish = useCallback(() => {
    if (!selectedEmoji) return;
    onPublish({
      moodEmoji: selectedEmoji,
      content: content.trim() || undefined,
    });
    onClose();
  }, [selectedEmoji, content, onPublish, onClose]);

  const handleClear = useCallback(() => {
    setSelectedEmoji('');
    setContent('');
    onPublish({ moodEmoji: '', content: undefined });
    onClose();
  }, [onPublish, onClose]);

  const handleContentChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      if (value.length <= MAX_CONTENT_LENGTH) {
        setContent(value);
      }
    },
    []
  );

  const canPublish = selectedEmoji.length > 0;

  return (
    <Dialog open={open} onClose={onClose}>
      {/* Header */}
      <DialogHeader>
        <h2 className="text-lg font-semibold text-[var(--gp-text-primary)] transition-colors duration-300">
          Quel est ton mood ?
        </h2>
      </DialogHeader>

      {/* Body */}
      <DialogBody className="space-y-6">
        {/* Emoji grid: 5 columns, 2 rows */}
        <div className="grid grid-cols-5 gap-3 justify-items-center">
          {MOOD_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => setSelectedEmoji(emoji)}
              className={cn(
                'w-12 h-12 flex items-center justify-center rounded-full text-2xl',
                'transition-all duration-300',
                'hover:bg-[var(--gp-hover)] active:scale-90',
                selectedEmoji === emoji
                  ? 'ring-2 ring-[var(--gp-terracotta)] ring-offset-2 ring-offset-[var(--gp-surface)] bg-[var(--gp-terracotta)]/10 scale-110'
                  : 'bg-[var(--gp-parchment)]'
              )}
              type="button"
              aria-label={`Mood ${emoji}`}
              aria-pressed={selectedEmoji === emoji}
            >
              {emoji}
            </button>
          ))}
        </div>

        {/* Text input */}
        <div className="space-y-2">
          <input
            type="text"
            value={content}
            onChange={handleContentChange}
            placeholder="Qu'est-ce que tu fais ?"
            maxLength={MAX_CONTENT_LENGTH}
            className={cn(
              'w-full px-4 py-2.5 rounded-xl text-sm',
              'bg-[var(--gp-parchment)] text-[var(--gp-text-primary)]',
              'placeholder:text-[var(--gp-text-muted)]',
              'border border-[var(--gp-border)]',
              'focus:outline-none focus:ring-2 focus:ring-[var(--gp-terracotta)]/50 focus:border-[var(--gp-terracotta)]',
              'transition-colors duration-300'
            )}
          />
          <div className="text-right">
            <span
              className={cn(
                'text-xs transition-colors duration-300',
                content.length >= MAX_CONTENT_LENGTH
                  ? 'text-[#C1292E] font-medium'
                  : 'text-[var(--gp-text-muted)]'
              )}
            >
              {content.length}/{MAX_CONTENT_LENGTH}
            </span>
          </div>
        </div>

        {/* Live preview */}
        {selectedEmoji && (
          <div className="space-y-2">
            <p className="text-xs text-[var(--gp-text-muted)] font-medium transition-colors duration-300">
              Apercu
            </p>
            <div
              className={cn(
                'inline-flex items-center gap-2',
                'px-4 py-2 rounded-full',
                'backdrop-blur-xl bg-[var(--gp-surface)]/80',
                'border border-[var(--gp-border)]',
                'shadow-[var(--gp-shadow-sm)]',
                'transition-colors duration-300'
              )}
            >
              <span className="text-lg leading-none">{selectedEmoji}</span>
              {content.trim() && (
                <span className="text-sm font-medium text-[var(--gp-text-primary)] max-w-[200px] truncate transition-colors duration-300">
                  {content.trim()}
                </span>
              )}
              {!content.trim() && (
                <span className="text-sm text-[var(--gp-text-muted)] italic transition-colors duration-300">
                  Ton nom
                </span>
              )}
            </div>
          </div>
        )}
      </DialogBody>

      {/* Footer */}
      <DialogFooter className="flex-col gap-2">
        <Button
          variant="primary"
          onClick={handlePublish}
          disabled={!canPublish}
          className="w-full"
        >
          Publier
        </Button>

        {currentStatus && (
          <Button
            variant="ghost"
            onClick={handleClear}
            className="w-full text-[var(--gp-text-muted)]"
            size="sm"
          >
            Effacer mon status
          </Button>
        )}
      </DialogFooter>
    </Dialog>
  );
}

StatusComposer.displayName = 'StatusComposer';

export { StatusComposer };
