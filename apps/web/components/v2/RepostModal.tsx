'use client';

import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Button } from './Button';
import { Dialog, DialogHeader, DialogBody, DialogFooter } from './Dialog';

export interface RepostModalProps {
  open: boolean;
  originalAuthor?: string;
  originalContent?: string;
  onRepost: () => void;
  onQuote: (content: string) => void;
  onClose: () => void;
  saving?: boolean;
}

function RepostModal({
  open,
  originalAuthor,
  originalContent,
  onRepost,
  onQuote,
  onClose,
  saving = false,
}: RepostModalProps) {
  const [mode, setMode] = useState<'repost' | 'quote'>('repost');
  const [quoteContent, setQuoteContent] = useState('');

  const handleSubmit = useCallback(() => {
    if (mode === 'repost') {
      onRepost();
    } else {
      onQuote(quoteContent.trim());
    }
  }, [mode, quoteContent, onRepost, onQuote]);

  const isValid = mode === 'repost' || quoteContent.trim().length > 0;

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogHeader>
        <h2 className="text-lg font-semibold text-[var(--gp-text-primary)]">Repost</h2>
      </DialogHeader>

      <DialogBody>
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setMode('repost')}
            className={cn(
              'flex-1 py-2 rounded-lg text-sm font-medium transition-colors',
              mode === 'repost'
                ? 'bg-[var(--gp-terracotta)] text-white'
                : 'bg-[var(--gp-parchment)] text-[var(--gp-text-secondary)]',
            )}
          >
            Repost
          </button>
          <button
            onClick={() => setMode('quote')}
            className={cn(
              'flex-1 py-2 rounded-lg text-sm font-medium transition-colors',
              mode === 'quote'
                ? 'bg-[var(--gp-terracotta)] text-white'
                : 'bg-[var(--gp-parchment)] text-[var(--gp-text-secondary)]',
            )}
          >
            Quote
          </button>
        </div>

        {mode === 'quote' && (
          <textarea
            value={quoteContent}
            onChange={(e) => setQuoteContent(e.target.value)}
            placeholder="Add your thoughts..."
            rows={3}
            maxLength={5000}
            className={cn(
              'w-full resize-none rounded-xl border px-4 py-3 text-base outline-none transition-colors mb-3',
              'bg-[var(--gp-parchment)] border-[var(--gp-border)]',
              'text-[var(--gp-text-primary)] placeholder:text-[var(--gp-text-muted)]',
              'focus:border-[var(--gp-terracotta)]',
            )}
            aria-label="Quote content"
          />
        )}

        {originalContent && (
          <div className="rounded-xl border border-[var(--gp-border)] bg-[var(--gp-parchment)] p-3">
            {originalAuthor && (
              <p className="text-xs font-medium text-[var(--gp-text-muted)] mb-1">{originalAuthor}</p>
            )}
            <p className="text-sm text-[var(--gp-text-secondary)] line-clamp-3">{originalContent}</p>
          </div>
        )}
      </DialogBody>

      <DialogFooter>
        <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button variant="primary" size="sm" onClick={handleSubmit} disabled={!isValid || saving}>
          {saving ? 'Posting...' : mode === 'repost' ? 'Repost' : 'Quote'}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

RepostModal.displayName = 'RepostModal';
export { RepostModal };
