'use client';

import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Button } from './Button';
import { Dialog, DialogHeader, DialogBody, DialogFooter } from './Dialog';
import type { PostVisibility } from '@meeshy/shared/types/post';

export interface PostEditorProps {
  open: boolean;
  initialContent?: string;
  initialVisibility?: PostVisibility;
  onSave: (data: { content: string; visibility: PostVisibility }) => void;
  onClose: () => void;
  saving?: boolean;
}

const VISIBILITY_OPTIONS: { value: PostVisibility; label: string }[] = [
  { value: 'PUBLIC', label: '🌍 Public' },
  { value: 'FRIENDS', label: '👥 Friends' },
  { value: 'PRIVATE', label: '🔒 Private' },
];

function PostEditor({
  open,
  initialContent = '',
  initialVisibility = 'PUBLIC',
  onSave,
  onClose,
  saving = false,
}: PostEditorProps) {
  const [content, setContent] = useState(initialContent);
  const [visibility, setVisibility] = useState<PostVisibility>(initialVisibility);

  const handleSave = useCallback(() => {
    const trimmed = content.trim();
    if (!trimmed) return;
    onSave({ content: trimmed, visibility });
  }, [content, visibility, onSave]);

  const isValid = content.trim().length > 0 && content.trim().length <= 5000;
  const hasChanges = content.trim() !== initialContent.trim() || visibility !== initialVisibility;

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogHeader>
        <h2 className="text-lg font-semibold text-[var(--gp-text-primary)]">Edit Post</h2>
      </DialogHeader>

      <DialogBody>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={6}
          maxLength={5000}
          className={cn(
            'w-full resize-none rounded-xl border px-4 py-3 text-base outline-none transition-colors',
            'bg-[var(--gp-parchment)] border-[var(--gp-border)]',
            'text-[var(--gp-text-primary)] placeholder:text-[var(--gp-text-muted)]',
            'focus:border-[var(--gp-terracotta)]',
          )}
          aria-label="Edit post content"
        />

        <div className="flex items-center gap-2 mt-3">
          <span className="text-sm text-[var(--gp-text-muted)]">Visibility:</span>
          <select
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as PostVisibility)}
            className="text-sm rounded-lg border border-[var(--gp-border)] bg-[var(--gp-parchment)] px-2 py-1 text-[var(--gp-text-primary)] outline-none"
            aria-label="Post visibility"
          >
            {VISIBILITY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {content.length > 4500 && (
          <p className={cn('text-xs mt-2', content.length > 4900 ? 'text-red-500' : 'text-[var(--gp-text-muted)]')}>
            {5000 - content.length} characters remaining
          </p>
        )}
      </DialogBody>

      <DialogFooter>
        <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={handleSave}
          disabled={!isValid || !hasChanges || saving}
        >
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

PostEditor.displayName = 'PostEditor';
export { PostEditor };
