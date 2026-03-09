'use client';

import { useState, useCallback, useRef, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Dialog, DialogHeader, DialogBody } from './Dialog';
import { Button } from './Button';
import { toast } from 'sonner';
import { useAttachmentUpload } from '@/hooks/composer/useAttachmentUpload';
import { useAuthStore } from '@/stores/auth-store';

// ============================================================================
// Types
// ============================================================================

type TextStyle = 'bold' | 'neon' | 'typewriter' | 'handwriting';

type MediaCategory = 'image' | 'video' | 'audio';

interface StoryComposerProps {
  open: boolean;
  onClose: () => void;
  onPublish: (story: {
    content?: string;
    storyEffects: Record<string, unknown>;
    visibility: string;
    mediaIds?: string[];
  }) => void;
}

// ============================================================================
// Constants
// ============================================================================

const MEDIA_LIMITS: Record<MediaCategory, number> = {
  image: 5,
  video: 2,
  audio: 3,
};

const MEDIA_ACCEPT: Record<MediaCategory, string> = {
  image: 'image/*',
  video: 'video/*',
  audio: 'audio/*',
};

const BACKGROUND_COLORS = [
  { id: 'terracotta', value: '#C4704B', label: 'Terracotta' },
  { id: 'teal', value: '#1A6B5A', label: 'Teal' },
  { id: 'charcoal', value: '#2D3748', label: 'Charcoal' },
  { id: 'gold', value: '#E8C547', label: 'Gold' },
  { id: 'pink', value: '#E74C9B', label: 'Pink' },
  {
    id: 'gradient',
    value: 'linear-gradient(135deg, #C4704B, #1A6B5A)',
    label: 'Gradient',
  },
] as const;

const TEXT_STYLES: { id: TextStyle; label: string }[] = [
  { id: 'bold', label: 'Aa' },
  { id: 'neon', label: 'Ne' },
  { id: 'typewriter', label: 'Tt' },
  { id: 'handwriting', label: 'Hh' },
];

// ============================================================================
// Helpers
// ============================================================================

function getTextStyleClasses(style: TextStyle): string {
  switch (style) {
    case 'bold':
      return 'font-bold';
    case 'neon':
      return 'font-bold [text-shadow:0_0_8px_rgba(255,255,255,0.8),0_0_20px_rgba(255,255,255,0.4)]';
    case 'typewriter':
      return 'font-mono tracking-wider';
    case 'handwriting':
      return 'italic font-light tracking-wide';
    default:
      return 'font-bold';
  }
}

function isGradient(bg: string): boolean {
  return bg.startsWith('linear-gradient');
}

function getMediaCategory(mimeType: string): MediaCategory | null {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return null;
}

function getCategoryLabel(category: MediaCategory): string {
  switch (category) {
    case 'image': return 'photo';
    case 'video': return 'video';
    case 'audio': return 'audio';
  }
}

// ============================================================================
// StoryComposer
// ============================================================================

function StoryComposer({ open, onClose, onPublish }: StoryComposerProps) {
  const [selectedBg, setSelectedBg] = useState<string>(BACKGROUND_COLORS[0].value);
  const [selectedTextStyle, setSelectedTextStyle] = useState<TextStyle>('bold');
  const [content, setContent] = useState<string>('');

  const token = useAuthStore(s => s.authToken);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  const {
    selectedFiles,
    uploadedAttachments,
    isUploading,
    handleFilesSelected,
    handleRemoveFile,
    clearAttachments,
  } = useAttachmentUpload({
    token: token ?? undefined,
    maxAttachments: MEDIA_LIMITS.image + MEDIA_LIMITS.video + MEDIA_LIMITS.audio,
  });

  const mediaCounts = useMemo(() => {
    const counts: Record<MediaCategory, number> = { image: 0, video: 0, audio: 0 };
    for (const file of selectedFiles) {
      const cat = getMediaCategory(file.type);
      if (cat) counts[cat]++;
    }
    return counts;
  }, [selectedFiles]);

  const handleMediaSelect = useCallback((category: MediaCategory, files: FileList | null) => {
    if (!files || files.length === 0) return;

    const limit = MEDIA_LIMITS[category];
    const current = mediaCounts[category];
    const available = limit - current;

    if (available <= 0) {
      toast.error(`Limite atteinte : ${limit} ${getCategoryLabel(category)}s maximum`);
      return;
    }

    const filesToAdd = Array.from(files).slice(0, available);
    if (filesToAdd.length < files.length) {
      toast.warning(
        `Seuls ${filesToAdd.length} fichier(s) ajouté(s) (limite : ${limit} ${getCategoryLabel(category)}s)`
      );
    }

    handleFilesSelected(filesToAdd);
  }, [mediaCounts, handleFilesSelected]);

  const handlePublish = useCallback(() => {
    const mediaIds = uploadedAttachments.map(att => att.id);
    onPublish({
      content: content || undefined,
      storyEffects: {
        backgroundColor: selectedBg,
        textStyle: selectedTextStyle,
      },
      visibility: 'public',
      mediaIds: mediaIds.length > 0 ? mediaIds : undefined,
    });
    setContent('');
    setSelectedBg(BACKGROUND_COLORS[0].value);
    setSelectedTextStyle('bold');
    clearAttachments();
  }, [content, selectedBg, selectedTextStyle, onPublish, uploadedAttachments, clearAttachments]);

  const handleClose = useCallback(() => {
    onClose();
    setContent('');
    setSelectedBg(BACKGROUND_COLORS[0].value);
    setSelectedTextStyle('bold');
    clearAttachments();
  }, [onClose, clearAttachments]);

  const hasContent = content.trim().length > 0 || selectedFiles.length > 0;

  return (
    <Dialog open={open} onClose={handleClose} className="max-w-lg">
      {/* Header */}
      <DialogHeader className="flex items-center justify-between p-4 pb-3">
        <button
          type="button"
          onClick={handleClose}
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-full',
            'text-[var(--gp-text-secondary)] hover:bg-[var(--gp-hover)]',
            'transition-colors duration-300'
          )}
          aria-label="Fermer"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <h2 className="text-base font-semibold text-[var(--gp-text-primary)] transition-colors duration-300">
          Nouvelle Story
        </h2>

        <Button
          size="sm"
          variant="primary"
          onClick={handlePublish}
          disabled={!hasContent || isUploading}
        >
          {isUploading ? 'Upload...' : 'Publier'}
        </Button>
      </DialogHeader>

      {/* Body */}
      <DialogBody className="p-4 pt-0">
        {/* Preview Zone */}
        <div
          className="relative flex min-h-[320px] items-center justify-center overflow-hidden rounded-xl"
          style={{
            background: selectedBg,
          }}
        >
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Tapez votre story..."
            maxLength={500}
            className={cn(
              'z-10 w-full resize-none bg-transparent px-6 py-4 text-center text-xl text-white',
              'placeholder:text-white/50 focus:outline-none',
              'min-h-[200px]',
              getTextStyleClasses(selectedTextStyle)
            )}
          />
        </div>

        {/* Media Preview */}
        {selectedFiles.length > 0 && (
          <div className="mt-3 space-y-2">
            <div className="flex flex-wrap gap-2">
              {selectedFiles.map((file, index) => {
                const category = getMediaCategory(file.type);
                const isImage = category === 'image';
                const isVideo = category === 'video';
                const isAudio = category === 'audio';

                return (
                  <div
                    key={`${file.name}-${file.lastModified}`}
                    className="group relative rounded-lg overflow-hidden bg-[var(--gp-hover)]"
                  >
                    {isImage && (
                      <img
                        src={URL.createObjectURL(file)}
                        alt={file.name}
                        className="h-16 w-16 object-cover"
                      />
                    )}
                    {isVideo && (
                      <div className="flex h-16 w-16 items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--gp-text-secondary)]">
                          <polygon points="5 3 19 12 5 21 5 3" />
                        </svg>
                      </div>
                    )}
                    {isAudio && (
                      <div className="flex h-16 w-16 items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--gp-text-secondary)]">
                          <path d="M9 18V5l12-2v13" />
                          <circle cx="6" cy="18" r="3" />
                          <circle cx="18" cy="16" r="3" />
                        </svg>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => handleRemoveFile(index)}
                      className={cn(
                        'absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full',
                        'bg-red-500 text-white text-xs opacity-0 group-hover:opacity-100',
                        'transition-opacity duration-200'
                      )}
                      aria-label="Supprimer"
                    >
                      x
                    </button>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-[var(--gp-text-tertiary)]">
              {mediaCounts.image > 0 && `${mediaCounts.image}/${MEDIA_LIMITS.image} photos`}
              {mediaCounts.image > 0 && (mediaCounts.video > 0 || mediaCounts.audio > 0) && ' · '}
              {mediaCounts.video > 0 && `${mediaCounts.video}/${MEDIA_LIMITS.video} videos`}
              {mediaCounts.video > 0 && mediaCounts.audio > 0 && ' · '}
              {mediaCounts.audio > 0 && `${mediaCounts.audio}/${MEDIA_LIMITS.audio} audios`}
            </p>
          </div>
        )}

        {/* Bottom Toolbar */}
        <div className="mt-4 space-y-3">
          {/* Media Buttons */}
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              disabled={mediaCounts.image >= MEDIA_LIMITS.image}
              className={cn(
                'flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-300',
                mediaCounts.image >= MEDIA_LIMITS.image
                  ? 'bg-[var(--gp-hover)] text-[var(--gp-text-tertiary)] cursor-not-allowed'
                  : 'bg-[var(--gp-hover)] text-[var(--gp-text-secondary)] hover:text-[var(--gp-text-primary)] hover:bg-[var(--gp-surface)]'
              )}
              title={`Photos (${mediaCounts.image}/${MEDIA_LIMITS.image})`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
              {mediaCounts.image}/{MEDIA_LIMITS.image}
            </button>
            <button
              type="button"
              onClick={() => videoInputRef.current?.click()}
              disabled={mediaCounts.video >= MEDIA_LIMITS.video}
              className={cn(
                'flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-300',
                mediaCounts.video >= MEDIA_LIMITS.video
                  ? 'bg-[var(--gp-hover)] text-[var(--gp-text-tertiary)] cursor-not-allowed'
                  : 'bg-[var(--gp-hover)] text-[var(--gp-text-secondary)] hover:text-[var(--gp-text-primary)] hover:bg-[var(--gp-surface)]'
              )}
              title={`Videos (${mediaCounts.video}/${MEDIA_LIMITS.video})`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="23 7 16 12 23 17 23 7" />
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
              </svg>
              {mediaCounts.video}/{MEDIA_LIMITS.video}
            </button>
            <button
              type="button"
              onClick={() => audioInputRef.current?.click()}
              disabled={mediaCounts.audio >= MEDIA_LIMITS.audio}
              className={cn(
                'flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-300',
                mediaCounts.audio >= MEDIA_LIMITS.audio
                  ? 'bg-[var(--gp-hover)] text-[var(--gp-text-tertiary)] cursor-not-allowed'
                  : 'bg-[var(--gp-hover)] text-[var(--gp-text-secondary)] hover:text-[var(--gp-text-primary)] hover:bg-[var(--gp-surface)]'
              )}
              title={`Audios (${mediaCounts.audio}/${MEDIA_LIMITS.audio})`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18V5l12-2v13" />
                <circle cx="6" cy="18" r="3" />
                <circle cx="18" cy="16" r="3" />
              </svg>
              {mediaCounts.audio}/{MEDIA_LIMITS.audio}
            </button>
          </div>

          {/* Color Palette */}
          <div className="flex items-center justify-center gap-3">
            {BACKGROUND_COLORS.map((color) => (
              <button
                key={color.id}
                type="button"
                onClick={() => setSelectedBg(color.value)}
                aria-label={color.label}
                className={cn(
                  'h-8 w-8 shrink-0 rounded-full transition-all duration-300',
                  selectedBg === color.value
                    ? 'ring-2 ring-white ring-offset-2 ring-offset-[var(--gp-surface)] scale-110'
                    : 'hover:scale-105'
                )}
                style={{
                  background: isGradient(color.value)
                    ? color.value
                    : color.value,
                }}
              />
            ))}
          </div>

          {/* Text Style Buttons */}
          <div className="flex items-center justify-center gap-2">
            {TEXT_STYLES.map((style) => (
              <button
                key={style.id}
                type="button"
                onClick={() => setSelectedTextStyle(style.id)}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-medium transition-colors duration-300',
                  selectedTextStyle === style.id
                    ? 'bg-[var(--gp-terracotta)] text-white'
                    : 'bg-[var(--gp-hover)] text-[var(--gp-text-secondary)] hover:text-[var(--gp-text-primary)]'
                )}
              >
                {style.label}
              </button>
            ))}
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
            handleMediaSelect('image', e.target.files);
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
            handleMediaSelect('video', e.target.files);
            e.target.value = '';
          }}
        />
        <input
          ref={audioInputRef}
          type="file"
          accept={MEDIA_ACCEPT.audio}
          multiple
          className="hidden"
          onChange={(e) => {
            handleMediaSelect('audio', e.target.files);
            e.target.value = '';
          }}
        />
      </DialogBody>
    </Dialog>
  );
}

StoryComposer.displayName = 'StoryComposer';

export { StoryComposer };
export type { StoryComposerProps };
