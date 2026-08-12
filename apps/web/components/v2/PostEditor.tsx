'use client';

import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Button } from './Button';
import { Dialog, DialogHeader, DialogBody, DialogFooter } from './Dialog';
import type { PostVisibility, PostMedia } from '@meeshy/shared/types/post';

export interface PostEditorProps {
  open: boolean;
  initialContent?: string;
  initialVisibility?: PostVisibility;
  media?: readonly PostMedia[];
  postType?: string;
  onSave: (data: { content: string; visibility: PostVisibility; removeMediaIds: string[] }) => void;
  onClose: () => void;
  saving?: boolean;
}

const VISIBILITY_OPTIONS: { value: PostVisibility; label: string }[] = [
  { value: 'PUBLIC', label: '🌍 Public' },
  { value: 'FRIENDS', label: '👥 Friends' },
  { value: 'PRIVATE', label: '🔒 Private' },
];

function mediaKindLabel(mime: string): string {
  if (mime.startsWith('image/')) return '🖼️';
  if (mime.startsWith('video/')) return '🎬';
  if (mime.startsWith('audio/')) return '🎵';
  return '📄';
}

function PostEditor({
  open,
  initialContent = '',
  initialVisibility = 'PUBLIC',
  media,
  postType,
  onSave,
  onClose,
  saving = false,
}: PostEditorProps) {
  const [content, setContent] = useState(initialContent);
  const [visibility, setVisibility] = useState<PostVisibility>(initialVisibility);
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());

  const mediaList = media ?? [];
  const remainingCount = mediaList.length - removedIds.size;
  const isReel = postType === 'REEL';

  const toggleRemove = useCallback((id: string) => {
    setRemovedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        return next;
      }
      // A reel must keep at least one media — block removing the last one.
      if (isReel && mediaList.length - next.size <= 1) return prev;
      next.add(id);
      return next;
    });
  }, [isReel, mediaList.length]);

  const isValid = content.trim().length <= 5000 && (content.trim().length > 0 || remainingCount > 0);
  const hasChanges =
    content.trim() !== initialContent.trim() || visibility !== initialVisibility || removedIds.size > 0;

  const handleSave = useCallback(() => {
    if (!isValid) return;
    onSave({ content: content.trim(), visibility, removeMediaIds: [...removedIds] });
  }, [isValid, content, visibility, removedIds, onSave]);

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

        {mediaList.length > 0 && (
          <div className="mt-4">
            <span className="text-sm text-[var(--gp-text-muted)]">Attachments</span>
            <div className="grid grid-cols-4 gap-2 mt-2">
              {mediaList.map((m) => {
                const removed = removedIds.has(m.id);
                const isImage = m.mimeType.startsWith('image/');
                const preview = isImage ? (m.thumbnailUrl || m.fileUrl) : m.thumbnailUrl;
                const blockRemoval = isReel && !removed && remainingCount <= 1;
                return (
                  <div
                    key={m.id}
                    className={cn(
                      'relative aspect-square rounded-lg overflow-hidden border border-[var(--gp-border)] bg-[var(--gp-parchment)] flex items-center justify-center',
                      removed && 'opacity-40 grayscale',
                    )}
                  >
                    {preview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={preview} alt={m.alt ?? ''} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-2xl">{mediaKindLabel(m.mimeType)}</span>
                    )}
                    <button
                      type="button"
                      onClick={() => toggleRemove(m.id)}
                      disabled={blockRemoval || saving}
                      title={
                        blockRemoval
                          ? 'A reel must keep at least one media'
                          : removed
                            ? 'Keep this media'
                            : 'Remove this media'
                      }
                      aria-label={removed ? 'Keep this media' : 'Remove this media'}
                      className={cn(
                        'absolute top-1 right-1 h-6 w-6 rounded-full text-xs font-bold flex items-center justify-center shadow',
                        'disabled:opacity-30',
                        removed ? 'bg-[var(--gp-terracotta)] text-white' : 'bg-black/60 text-white hover:bg-red-600',
                      )}
                    >
                      {removed ? '↩' : '✕'}
                    </button>
                  </div>
                );
              })}
            </div>
            {isReel && (
              <p className="text-xs text-[var(--gp-text-muted)] mt-2">A reel must keep at least one media.</p>
            )}
          </div>
        )}

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
