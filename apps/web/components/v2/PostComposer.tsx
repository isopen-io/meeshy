'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useI18n } from '@/hooks/use-i18n';
import { cn } from '@/lib/utils';
import { Avatar } from './Avatar';
import { Button } from './Button';
import { AudienceUserPicker, AUDIENCE_VISIBILITIES, isAudienceIncomplete } from './AudienceUserPicker';
import { useAttachmentUpload } from '@/hooks/composer/useAttachmentUpload';
import { useAuthStore } from '@/stores/auth-store';
import { AttachmentService } from '@/services/attachmentService';
import type { PostType, PostVisibility } from '@meeshy/shared/types/post';

export interface PostPublishPayload {
  content: string;
  type: PostType;
  visibility: PostVisibility;
  visibilityUserIds?: string[];
  mediaIds?: string[];
}

export interface PostComposerProps {
  currentUser?: { username: string; avatar?: string | null } | null;
  onPublish: (data: PostPublishPayload) => void;
  disabled?: boolean;
  className?: string;
}

const VISIBILITY_OPTIONS: { value: PostVisibility; labelKey: string; icon: string }[] = [
  { value: 'PUBLIC', labelKey: 'postComposer.visibility.public', icon: '🌍' },
  { value: 'FRIENDS', labelKey: 'postComposer.visibility.friends', icon: '👥' },
  { value: 'EXCEPT', labelKey: 'postComposer.visibility.except', icon: '🚫' },
  { value: 'ONLY', labelKey: 'postComposer.visibility.only', icon: '🎯' },
  { value: 'PRIVATE', labelKey: 'postComposer.visibility.private', icon: '🔒' },
];

// W6 media — cap client aligné sur la limite serveur `mediaIds` (≤ 10,
// `CreatePostSchema`). Un seul pool combiné photos+vidéos, contrairement à
// StoryComposer qui répartit sur 3 catégories.
const MEDIA_LIMIT = 10;

const MEDIA_ACCEPT = {
  image: 'image/*',
  video: 'video/*',
} as const;

function isImageFile(file: File): boolean {
  return file.type.startsWith('image/');
}

function PostComposer({
  currentUser,
  onPublish,
  disabled = false,
  className,
}: PostComposerProps) {
  const { t } = useI18n('common');
  const [content, setContent] = useState('');
  const [visibility, setVisibility] = useState<PostVisibility>('PUBLIC');
  // W6 — audience explicite des visibilités EXCEPT/ONLY (fix : ces options
  // partaient sans liste → visibilité cassée). Même picker/gate que stories.
  const [visibilityUserIds, setVisibilityUserIds] = useState<string[]>([]);
  const [showVisibilityPicker, setShowVisibilityPicker] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const authToken = useAuthStore((s) => s.authToken);

  const {
    selectedFiles,
    uploadedAttachments,
    isUploading,
    uploadProgress,
    handleFilesSelected,
    handleRemoveFile,
    clearAttachments,
  } = useAttachmentUpload({
    token: authToken ?? undefined,
    // useAttachmentUpload counts `selectedFiles.length + uploadedAttachments.length`
    // against maxAttachments (useAttachmentUpload.ts:280-281), but selectedFiles is
    // never trimmed after a successful upload while uploadedAttachments grows
    // alongside it (:332, :359) — after N successful uploads both arrays hold N,
    // so the hook counts 2N. Double the ceiling here for headroom; MEDIA_LIMIT
    // stays the single client-facing cap via `mediaLimitReached` below.
    maxAttachments: MEDIA_LIMIT * 2,
  });

  const mediaLimitReached = selectedFiles.length >= MEDIA_LIMIT;
  const uploadPercentage = uploadProgress[0] ?? 0;

  // Blob URLs for image previews, memoized per File identity so retyping the
  // caption (re-render on every keystroke) never mints a new object URL —
  // only revoked (in the effect below) once a file actually drops out of
  // selectedFiles, on clear/publish, or on unmount.
  const objectUrlCacheRef = useRef<Map<File, string>>(new Map());

  const getPreviewUrl = (file: File): string => {
    const cache = objectUrlCacheRef.current;
    const existing = cache.get(file);
    if (existing) return existing;
    const url = URL.createObjectURL(file);
    cache.set(file, url);
    return url;
  };

  useEffect(() => {
    const cache = objectUrlCacheRef.current;
    const stillSelected = new Set(selectedFiles);
    cache.forEach((url, file) => {
      if (!stillSelected.has(file)) {
        URL.revokeObjectURL(url);
        cache.delete(file);
      }
    });
  }, [selectedFiles]);

  useEffect(() => {
    const cache = objectUrlCacheRef.current;
    return () => {
      cache.forEach((url) => URL.revokeObjectURL(url));
      cache.clear();
    };
  }, []);

  const handleMediaSelect = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;

    const available = MEDIA_LIMIT - selectedFiles.length;
    if (available <= 0) {
      setMediaError(`You can attach up to ${MEDIA_LIMIT} media files.`);
      return;
    }

    const requested = Array.from(files);
    const filesToAdd = requested.slice(0, available);
    // Pré-validation avec le même service que le hook (taille/type), pour
    // afficher le message spécifique DANS le composer plutôt que de laisser
    // le hook émettre un toast générique.
    const validation = AttachmentService.validateFiles(filesToAdd);
    if (!validation.valid) {
      setMediaError(validation.errors.join(' '));
      return;
    }

    setMediaError(
      filesToAdd.length < requested.length
        ? `You can attach up to ${MEDIA_LIMIT} media files. Only ${filesToAdd.length} added.`
        : null,
    );
    handleFilesSelected(filesToAdd);
  }, [selectedFiles.length, handleFilesSelected]);

  const handleRemoveMedia = useCallback((index: number) => {
    handleRemoveFile(index);
    setMediaError(null);
  }, [handleRemoveFile]);

  const handlePublish = useCallback(() => {
    const trimmed = content.trim();
    const mediaIds = uploadedAttachments.map((att) => att.id);
    const hasMedia = mediaIds.length > 0;
    if ((!trimmed && !hasMedia) || disabled || isUploading) return;

    if (isAudienceIncomplete(visibility, visibilityUserIds.length)) return;

    onPublish({
      content: trimmed,
      type: 'POST',
      visibility,
      visibilityUserIds: (AUDIENCE_VISIBILITIES as readonly string[]).includes(visibility)
        ? visibilityUserIds
        : undefined,
      mediaIds: hasMedia ? mediaIds : undefined,
    });

    setContent('');
    setVisibilityUserIds([]);
    setIsExpanded(false);
    setMediaError(null);
    clearAttachments();
  }, [content, disabled, isUploading, onPublish, visibility, visibilityUserIds, uploadedAttachments, clearAttachments]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handlePublish();
      }
    },
    [handlePublish],
  );

  const trimmedContent = content.trim();
  const hasMedia = uploadedAttachments.length > 0;
  const isValid = (trimmedContent.length > 0 || hasMedia) && trimmedContent.length <= 5000;
  const charCount = content.length;
  const selectedVisibility = VISIBILITY_OPTIONS.find((v) => v.value === visibility) ?? VISIBILITY_OPTIONS[0];

  return (
    <div
      className={cn(
        'rounded-2xl border border-[var(--gp-border)] bg-[var(--gp-surface)] overflow-hidden transition-all',
        className,
      )}
      data-testid="post-composer"
    >
      <div className="p-4">
        <div className="flex gap-3">
          <Avatar
            name={currentUser?.username ?? '?'}
            src={currentUser?.avatar ?? undefined}
            size="md"
          />

          <div className="flex-1 min-w-0">
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsExpanded(true)}
              placeholder={t('postPlaceholder')}
              rows={isExpanded ? 4 : 2}
              maxLength={5000}
              disabled={disabled}
              className={cn(
                'w-full resize-none border-0 bg-transparent text-base outline-none',
                'text-[var(--gp-text-primary)] placeholder:text-[var(--gp-text-muted)]',
                disabled && 'opacity-50 cursor-not-allowed',
              )}
              aria-label={t('postComposer.contentLabel')}
            />

            {isExpanded && selectedFiles.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2" data-testid="post-composer-media-preview">
                {selectedFiles.map((file, index) => (
                  <div
                    key={`${file.name}-${file.lastModified}-${index}`}
                    className="group relative rounded-lg overflow-hidden bg-[var(--gp-hover)]"
                  >
                    {isImageFile(file) ? (
                      <img
                        src={getPreviewUrl(file)}
                        alt={file.name}
                        className="h-16 w-16 object-cover"
                      />
                    ) : (
                      <div className="flex h-16 w-16 items-center justify-center text-[var(--gp-text-secondary)]">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polygon points="23 7 16 12 23 17 23 7" />
                          <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                        </svg>
                      </div>
                    )}
                    {isUploading && (
                      <div className="absolute inset-x-0 bottom-0 bg-black/60 px-1 py-0.5 text-center text-[10px] text-white">
                        {uploadPercentage}%
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => handleRemoveMedia(index)}
                      className={cn(
                        'absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full',
                        'bg-red-500 text-white text-xs opacity-0 group-hover:opacity-100',
                        'transition-opacity duration-200',
                      )}
                      aria-label={t('delete')}
                    >
                      x
                    </button>
                  </div>
                ))}
              </div>
            )}

            {isExpanded && mediaError && (
              <p className="mt-2 text-xs text-red-500" role="alert" data-testid="post-composer-media-error">
                {mediaError}
              </p>
            )}

            {isExpanded && (
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-[var(--gp-border)]">
                <div className="flex items-center gap-2">
                  {/* Media buttons */}
                  <button
                    type="button"
                    onClick={() => imageInputRef.current?.click()}
                    disabled={mediaLimitReached}
                    className={cn(
                      'p-2 rounded-lg text-[var(--gp-text-muted)] hover:bg-[var(--gp-parchment)] transition-colors',
                      mediaLimitReached && 'opacity-50 cursor-not-allowed hover:bg-transparent',
                    )}
                    aria-label={t('postComposer.addPhoto')}
                  >
                    📷
                  </button>
                  <button
                    type="button"
                    onClick={() => videoInputRef.current?.click()}
                    disabled={mediaLimitReached}
                    className={cn(
                      'p-2 rounded-lg text-[var(--gp-text-muted)] hover:bg-[var(--gp-parchment)] transition-colors',
                      mediaLimitReached && 'opacity-50 cursor-not-allowed hover:bg-transparent',
                    )}
                    aria-label={t('postComposer.addVideo')}
                  >
                    🎥
                  </button>

                  {/* Visibility picker */}
                  <div className="relative">
                    <button
                      onClick={() => setShowVisibilityPicker(!showVisibilityPicker)}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-[var(--gp-text-secondary)] hover:bg-[var(--gp-parchment)] transition-colors"
                      aria-label={t('postComposer.changeVisibility')}
                    >
                      <span>{selectedVisibility.icon}</span>
                      <span>{t(selectedVisibility.labelKey)}</span>
                    </button>

                    {showVisibilityPicker && (
                      <div className="absolute bottom-full left-0 mb-1 bg-[var(--gp-surface)] border border-[var(--gp-border)] rounded-xl shadow-lg z-20 min-w-[160px]">
                        {VISIBILITY_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            onClick={() => {
                              setVisibility(opt.value);
                              if (!(AUDIENCE_VISIBILITIES as readonly string[]).includes(opt.value)) {
                                setVisibilityUserIds([]);
                              }
                              setShowVisibilityPicker(false);
                            }}
                            className={cn(
                              'flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-[var(--gp-parchment)] transition-colors first:rounded-t-xl last:rounded-b-xl',
                              visibility === opt.value && 'text-[var(--gp-terracotta)] font-medium',
                            )}
                          >
                            <span>{opt.icon}</span>
                            <span>{t(opt.labelKey)}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Character count */}
                  {charCount > 4500 && (
                    <span className={cn(
                      'text-xs',
                      charCount > 4900 ? 'text-red-500' : 'text-[var(--gp-text-muted)]',
                    )}>
                      {5000 - charCount}
                    </span>
                  )}
                </div>

                <Button
                  variant="primary"
                  size="sm"
                  onClick={handlePublish}
                  disabled={!isValid || disabled || isUploading || isAudienceIncomplete(visibility, visibilityUserIds.length)}
                >
                  {isUploading ? t('uploading') : t('publish')}
                </Button>
              </div>
            )}

            {/* W6 — audience explicite pour EXCEPT/ONLY */}
            {isExpanded && (AUDIENCE_VISIBILITIES as readonly string[]).includes(visibility) && (
              <div className="mt-2">
                <AudienceUserPicker
                  mode={visibility as 'EXCEPT' | 'ONLY'}
                  selectedIds={visibilityUserIds}
                  onChange={setVisibilityUserIds}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Hidden file inputs */}
      <input
        ref={imageInputRef}
        type="file"
        accept={MEDIA_ACCEPT.image}
        multiple
        className="hidden"
        onChange={(e) => {
          handleMediaSelect(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept={MEDIA_ACCEPT.video}
        multiple
        className="hidden"
        onChange={(e) => {
          handleMediaSelect(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}

PostComposer.displayName = 'PostComposer';
export { PostComposer };
