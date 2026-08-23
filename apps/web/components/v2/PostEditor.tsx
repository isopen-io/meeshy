'use client';

import { useState, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/hooks/use-i18n';
import { Button } from './Button';
import { Dialog, DialogHeader, DialogBody, DialogFooter } from './Dialog';
import { AudienceUserPicker, AUDIENCE_VISIBILITIES, isAudienceIncomplete } from './AudienceUserPicker';
import { PUBLICATION_VISIBILITY_OPTIONS } from './publication-visibility';
import type { PostVisibility, PostMedia } from '@meeshy/shared/types/post';

export interface PostEditorProps {
  open: boolean;
  initialContent?: string;
  initialVisibility?: PostVisibility;
  /// Audience nommée d'un post déjà en EXCEPT/ONLY. La rouvrir SANS elle
  /// rejouerait une liste vide dans le payload, donc effacerait les
  /// destinataires que l'auteur avait choisis.
  initialVisibilityUserIds?: readonly string[];
  media?: readonly PostMedia[];
  postType?: string;
  onSave: (data: {
    content: string;
    visibility: PostVisibility;
    visibilityUserIds: string[];
    removeMediaIds: string[];
  }) => void;
  onClose: () => void;
  saving?: boolean;
}

const needsExplicitAudience = (visibility: PostVisibility): boolean =>
  (AUDIENCE_VISIBILITIES as readonly string[]).includes(visibility);

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
  initialVisibilityUserIds,
  media,
  postType,
  onSave,
  onClose,
  saving = false,
}: PostEditorProps) {
  const { t } = useI18n('common');
  const [content, setContent] = useState(initialContent);
  const [visibility, setVisibility] = useState<PostVisibility>(initialVisibility);
  const [visibilityUserIds, setVisibilityUserIds] = useState<string[]>([...(initialVisibilityUserIds ?? [])]);
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());

  // Une audience nommée n'a de sens que sous EXCEPT/ONLY : la retenir sous
  // PUBLIC enverrait une liste que le gateway ignorerait, et la ré-afficherait
  // au prochain aller-retour comme si elle gouvernait encore quelque chose.
  const effectiveAudience = useMemo(
    () => (needsExplicitAudience(visibility) ? visibilityUserIds : []),
    [visibility, visibilityUserIds],
  );

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

  const initialAudienceKey = [...(initialVisibilityUserIds ?? [])].join(',');
  const audienceIncomplete = isAudienceIncomplete(visibility, effectiveAudience.length);
  const isValid =
    content.trim().length <= 5000 &&
    (content.trim().length > 0 || remainingCount > 0) &&
    !audienceIncomplete;
  const hasChanges =
    content.trim() !== initialContent.trim() ||
    visibility !== initialVisibility ||
    effectiveAudience.join(',') !== initialAudienceKey ||
    removedIds.size > 0;

  const handleSave = useCallback(() => {
    if (!isValid) return;
    onSave({
      content: content.trim(),
      visibility,
      visibilityUserIds: effectiveAudience,
      removeMediaIds: [...removedIds],
    });
  }, [isValid, content, visibility, effectiveAudience, removedIds, onSave]);

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
          <span className="text-sm text-[var(--gp-text-muted)]">{t('publicationVisibility.label')}</span>
          <select
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as PostVisibility)}
            className="text-sm rounded-lg border border-[var(--gp-border)] bg-[var(--gp-parchment)] px-2 py-1 text-[var(--gp-text-primary)] outline-none"
            aria-label={t('publicationVisibility.label')}
          >
            {PUBLICATION_VISIBILITY_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>{`${opt.icon} ${t(opt.labelKey)}`}</option>
            ))}
          </select>
        </div>

        {needsExplicitAudience(visibility) && (
          <div className="mt-3">
            <AudienceUserPicker
              mode={visibility as 'EXCEPT' | 'ONLY'}
              selectedIds={visibilityUserIds}
              onChange={setVisibilityUserIds}
            />
          </div>
        )}

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
