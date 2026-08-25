'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useI18n } from '@/hooks/use-i18n';
import { cn } from '@/lib/utils';
import { Avatar } from './Avatar';
import { Button } from './Button';
import { AudienceUserPicker, AUDIENCE_VISIBILITIES, isAudienceIncomplete } from './AudienceUserPicker';
import { MediaAccessibilityFields } from './MediaAccessibilityFields';
import { ReferencePicker } from '@/components/composer/ReferencePicker';
import { ReferenceChipRow } from '@/components/composer/ReferenceChipRow';
import { useReferences } from '@/hooks/composer/useReferences';
import { useAttachmentUpload } from '@/hooks/composer/useAttachmentUpload';
import { useAuthStore } from '@/stores/auth-store';
import { AttachmentService } from '@/services/attachmentService';
import { qualifiesAsReel } from '@meeshy/shared/utils/reel-composition';
import { removingHandle } from '@meeshy/shared/utils/composer-references';
import { DEFAULT_PUBLICATION_VISIBILITY } from '@meeshy/shared/types/post';
import { PUBLICATION_VISIBILITY_OPTIONS } from './publication-visibility';
import type { PostType, PostVisibility } from '@meeshy/shared/types/post';
import type { PostReferenceDisplay } from '@meeshy/shared/types/post-reference';
import { MAX_POST_MEDIA } from '@meeshy/shared/types/attachment';
import type { ComposerDocumentPayload } from '@/components/composer/payload';

const REFERENCE_MODES: readonly Exclude<PostReferenceDisplay, 'INLINE'>[] = ['NOTE', 'SILENT'];

/**
 * La charge de publication est déclarée UNE fois, dans
 * `components/composer/payload.ts` — la surface unifiée rend exactement la même
 * au même appelant, et deux déclarations jumelles auraient pu diverger sans
 * qu'aucun gate ne rougisse (aucun ne type-vérifie `apps/web`). Ce nom reste le
 * nom historique de la charge pour les appelants existants.
 */
export type { ComposerDocumentPayload as PostPublishPayload };

export interface PostComposerProps {
  currentUser?: { username: string; avatar?: string | null } | null;
  onPublish: (data: ComposerDocumentPayload) => void;
  disabled?: boolean;
  className?: string;
}


// W6 media — cap client aligné sur la limite serveur `mediaIds`
// (`CreatePostSchema`/`UpdatePostSchema`, source unique
// `@meeshy/shared/types/attachment` → `MAX_POST_MEDIA`). Un seul pool
// combiné photos+vidéos, contrairement à StoryComposer qui répartit sur 3
// catégories.
const MEDIA_LIMIT = MAX_POST_MEDIA;

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
  const [visibility, setVisibility] = useState<PostVisibility>(DEFAULT_PUBLICATION_VISIBILITY);
  // W6 — audience explicite des visibilités EXCEPT/ONLY (fix : ces options
  // partaient sans liste → visibilité cassée). Même picker/gate que stories.
  const [visibilityUserIds, setVisibilityUserIds] = useState<string[]>([]);
  const [showVisibilityPicker, setShowVisibilityPicker] = useState(false);
  // W7 — Reel ⇄ Post toggle (Task 5). Default REEL, as iOS; only meaningful
  // while `compositionQualifies` is true — see below, `handlePublish` always
  // sends 'POST' otherwise so this state can never leak a false promotion.
  const [postType, setPostType] = useState<PostType>('REEL');
  const [isExpanded, setIsExpanded] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  // C7-UI — collecte du texte alternatif par média + de l'opt-in
  // `allowSoundExtraction` (post entier, cf. `MediaPublishPayload` ci-dessus).
  // `allowSoundExtractionTouched` distingue « jamais touché » (rien envoyé)
  // de « explicitement désactivé » (envoie `false`) — même sémantique que
  // `MediaAccessibilityStore.allowSoundExtractionPayload()` côté iOS.
  const [mediaAlt, setMediaAlt] = useState<Record<string, string>>({});
  const [allowSoundExtraction, setAllowSoundExtraction] = useState(false);
  const [allowSoundExtractionTouched, setAllowSoundExtractionTouched] = useState(false);
  const { references, pick, drop, clear: clearReferences, payload: referencesPayload } = useReferences();
  const [referencePickerOpen, setReferencePickerOpen] = useState(false);
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
    // useAttachmentUpload now counts `selectedFiles` alone as the single
    // source of truth for the cap check (Task 7, point 2 — it used to sum
    // selectedFiles.length + uploadedAttachments.length, double-counting
    // once uploads settled since selectedFiles is never trimmed on
    // success). MEDIA_LIMIT can be passed as-is.
    maxAttachments: MEDIA_LIMIT,
    // Un POST/RÉEL publie en `PostMedia` (via TUS), jamais en
    // `MessageAttachment` — voir `services/attachmentTransport.ts`.
    uploadContext: 'post',
  });

  const mediaLimitReached = selectedFiles.length >= MEDIA_LIMIT;

  // W7 — same source-of-truth predicate the gateway degrades REEL→POST with
  // (`@meeshy/shared/utils/reel-composition`). An attachment whose duration
  // is not yet known client-side is treated as non-qualifying — never a
  // false REEL promise the gateway would silently downgrade.
  const compositionQualifies = qualifiesAsReel(
    uploadedAttachments.map((att) => ({ mimeType: att.mimeType, duration: att.duration })),
  );
  const effectivePostType: PostType = compositionQualifies ? postType : 'POST';

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
    const validation = AttachmentService.validateFiles(filesToAdd, MEDIA_LIMIT);
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

  // Un média RETIRÉ (bouton x avant upload, ou upload en échec) ne doit pas
  // laisser un id orphelin dans `mediaAlt` — même garde que
  // `MediaAccessibilityStore.remove(mediaId:)` côté iOS. Pruning déclenché
  // par `uploadedAttachments` (source des ids réels), pas `selectedFiles`
  // (qui n'a pas encore d'id avant upload).
  useEffect(() => {
    const validIds = new Set(uploadedAttachments.map((att) => att.id));
    setMediaAlt((prev) => {
      const next = Object.fromEntries(Object.entries(prev).filter(([id]) => validIds.has(id)));
      return Object.keys(next).length === Object.keys(prev).length ? prev : next;
    });
  }, [uploadedAttachments]);

  const handleMediaAltChange = useCallback((mediaId: string, text: string) => {
    setMediaAlt((prev) => {
      if (text.length === 0) {
        if (!(mediaId in prev)) return prev;
        const { [mediaId]: _removed, ...rest } = prev;
        return rest;
      }
      return { ...prev, [mediaId]: text };
    });
  }, []);

  const handleAllowSoundExtractionChange = useCallback((allowed: boolean) => {
    setAllowSoundExtraction(allowed);
    setAllowSoundExtractionTouched(true);
  }, []);

  // A person typed as `@handle` in the caption is INLINE server-side (the
  // gateway derives it from the text — Task 1). Moving her to a declared
  // mode from the picker only makes sense once her handle leaves the
  // sentence, so any literal `@handle` still in the caption is stripped —
  // a no-op when it was never there.
  const handlePickReference = useCallback(
    (person: { username: string; userId?: string }, display: PostReferenceDisplay) => {
      pick(person, 'picker', display);
      if (display !== 'INLINE') {
        setContent((c) => removingHandle(person.username, c));
      }
    },
    [pick]
  );

  const handlePublish = useCallback(() => {
    const trimmed = content.trim();
    const mediaIds = uploadedAttachments.map((att) => att.id);
    const hasMedia = mediaIds.length > 0;
    if ((!trimmed && !hasMedia) || disabled || isUploading) return;

    if (isAudienceIncomplete(visibility, visibilityUserIds.length)) return;

    onPublish({
      content: trimmed,
      type: effectivePostType,
      visibility,
      visibilityUserIds: (AUDIENCE_VISIBILITIES as readonly string[]).includes(visibility)
        ? visibilityUserIds
        : undefined,
      mediaIds: hasMedia ? mediaIds : undefined,
      optimisticMedia: hasMedia
        ? uploadedAttachments.map((att, order) => ({
            id: att.id,
            mimeType: att.mimeType,
            fileUrl: att.fileUrl,
            thumbnailUrl: att.thumbnailUrl,
            duration: att.duration,
            order,
          }))
        : undefined,
      // Never `mentions: []` — absence means "not touched", `[]` erases the
      // declared references server-side (tri-state, Non-régression table).
      ...(referencesPayload.length > 0 ? { mentions: referencesPayload } : {}),
      // Only ids still present among `mediaIds` survive — a media removed
      // after its alt was typed must not resurrect an orphaned key.
      ...(() => {
        const prunedAlt = Object.fromEntries(
          Object.entries(mediaAlt).filter(([id]) => mediaIds.includes(id)),
        );
        return Object.keys(prunedAlt).length > 0 ? { mediaAlt: prunedAlt } : {};
      })(),
      ...(allowSoundExtractionTouched ? { allowSoundExtraction } : {}),
    });

    setContent('');
    setVisibilityUserIds([]);
    setIsExpanded(false);
    setMediaError(null);
    setPostType('REEL');
    setMediaAlt({});
    setAllowSoundExtraction(false);
    setAllowSoundExtractionTouched(false);
    clearAttachments();
    clearReferences();
  }, [content, disabled, isUploading, onPublish, visibility, visibilityUserIds, uploadedAttachments, effectivePostType, clearAttachments, referencesPayload, clearReferences, mediaAlt, allowSoundExtraction, allowSoundExtractionTouched]);

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
  const selectedVisibility =
    PUBLICATION_VISIBILITY_OPTIONS.find((v) => v.id === visibility) ?? PUBLICATION_VISIBILITY_OPTIONS[0];

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
                        {/* La jauge de CETTE vignette. `uploadProgress[0]`
                            affichait celle du premier fichier sur toutes :
                            trois téléversements volent en parallèle, donc le
                            premier atteint 100 % pendant que les autres
                            commencent — « 100% » partout, et Publier bloqué. */}
                        {uploadProgress[index] ?? 0}%
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

            {isExpanded && uploadedAttachments.length > 0 && (
              <MediaAccessibilityFields
                attachments={uploadedAttachments}
                altById={mediaAlt}
                onAltChange={handleMediaAltChange}
                allowSoundExtraction={allowSoundExtraction}
                onAllowSoundExtractionChange={handleAllowSoundExtractionChange}
              />
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

                  <ReferencePicker
                    references={references}
                    onChange={handlePickReference}
                    onRemove={drop}
                    modes={REFERENCE_MODES}
                    open={referencePickerOpen}
                    onOpenChange={setReferencePickerOpen}
                  />

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
                        {PUBLICATION_VISIBILITY_OPTIONS.map((opt) => (
                          <button
                            key={opt.id}
                            onClick={() => {
                              setVisibility(opt.id);
                              if (!(AUDIENCE_VISIBILITIES as readonly string[]).includes(opt.id)) {
                                setVisibilityUserIds([]);
                              }
                              setShowVisibilityPicker(false);
                            }}
                            className={cn(
                              'flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-[var(--gp-parchment)] transition-colors first:rounded-t-xl last:rounded-b-xl',
                              visibility === opt.id && 'text-[var(--gp-terracotta)] font-medium',
                            )}
                          >
                            <span>{opt.icon}</span>
                            <span>{t(opt.labelKey)}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* W7 — Reel ⇄ Post toggle: only shown once the uploaded
                      composition qualifies (mirrors the gateway's
                      qualifiesAsReel degradation threshold client-side) */}
                  {compositionQualifies && (
                    <div
                      className="flex items-center gap-0.5 rounded-lg border border-[var(--gp-border)] p-0.5"
                      role="group"
                      aria-label={t('postComposer.reelToggle.groupLabel')}
                      data-testid="post-composer-type-toggle"
                    >
                      <button
                        type="button"
                        onClick={() => setPostType('REEL')}
                        aria-pressed={postType === 'REEL'}
                        aria-label={t('postComposer.reelToggle.reel')}
                        data-testid="post-composer-type-reel"
                        className={cn(
                          'px-2 py-1 rounded-md text-xs transition-colors',
                          postType === 'REEL'
                            ? 'bg-[var(--gp-terracotta)] text-white'
                            : 'text-[var(--gp-text-secondary)] hover:bg-[var(--gp-parchment)]',
                        )}
                      >
                        🎬 {t('postComposer.reelToggle.reel')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPostType('POST')}
                        aria-pressed={postType === 'POST'}
                        aria-label={t('postComposer.reelToggle.post')}
                        data-testid="post-composer-type-post"
                        className={cn(
                          'px-2 py-1 rounded-md text-xs transition-colors',
                          postType === 'POST'
                            ? 'bg-[var(--gp-terracotta)] text-white'
                            : 'text-[var(--gp-text-secondary)] hover:bg-[var(--gp-parchment)]',
                        )}
                      >
                        {t('postComposer.reelToggle.post')}
                      </button>
                    </div>
                  )}

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

            {isExpanded && references.length > 0 && (
              <div className="mt-2">
                <ReferenceChipRow references={references} onOpen={() => setReferencePickerOpen(true)} />
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
