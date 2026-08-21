'use client';

import { useState, useCallback, useRef, useMemo } from 'react';
import { useI18n } from '@/hooks/use-i18n';
import { cn } from '@/lib/utils';
import { Dialog, DialogHeader, DialogBody } from './Dialog';
import { Button } from './Button';
import { toast } from 'sonner';
import { useAttachmentUpload } from '@/hooks/composer/useAttachmentUpload';
import { useAuthStore } from '@/stores/auth-store';
import { AudienceUserPicker, AUDIENCE_VISIBILITIES, isAudienceIncomplete } from './AudienceUserPicker';
import { ReferencePicker } from '@/components/composer/ReferencePicker';
import { ReferenceChipRow } from '@/components/composer/ReferenceChipRow';
import { useReferences } from '@/hooks/composer/useReferences';
import { removingHandle } from '@meeshy/shared/utils/composer-references';
import type { PostReferenceDisplay, PostReferenceInput } from '@meeshy/shared/types/post-reference';
import type { CanvasV3, ObjectV3 } from '@meeshy/shared/types/canvas-v3';

// ============================================================================
// Types
// ============================================================================

const REFERENCE_MODES: readonly Exclude<PostReferenceDisplay, 'INLINE'>[] = ['NOTE', 'SILENT'];

type TextStyle = 'bold' | 'neon' | 'typewriter' | 'handwriting';

type MediaCategory = 'image' | 'video' | 'audio';

/// W3 — parité `PostVisibility` complète (inc.2) : EXCEPT/ONLY sont servis
/// par l'AudienceUserPicker et gatés à la publication (`isAudienceIncomplete`,
/// partagé avec PostComposer depuis le module du picker) — jamais publiés
/// sans liste (le trou W6).
type StoryVisibility = 'PUBLIC' | 'FRIENDS' | 'COMMUNITY' | 'PRIVATE' | 'EXCEPT' | 'ONLY';

interface StoryComposerProps {
  open: boolean;
  onClose: () => void;
  onPublish: (story: {
    content?: string;
    storyEffects: Record<string, unknown>;
    visibility: StoryVisibility;
    /// W3 — audience explicite (EXCEPT/ONLY). Plombé jusqu'au service ;
    /// alimenté par le picker à l'inc.2.
    visibilityUserIds?: string[];
    mediaIds?: string[];
    mentions?: readonly PostReferenceInput[];
  }) => void;
  defaultVisibility?: StoryVisibility;
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

export const VISIBILITY_OPTIONS: { id: StoryVisibility; labelKey: string; icon: string }[] = [
  { id: 'PUBLIC', labelKey: 'storyVisibility.public', icon: '\uD83C\uDF0D' },
  { id: 'FRIENDS', labelKey: 'storyVisibility.friends', icon: '\uD83D\uDC65' },
  { id: 'COMMUNITY', labelKey: 'storyVisibility.community', icon: '\uD83C\uDFD8\uFE0F' },
  { id: 'EXCEPT', labelKey: 'storyVisibility.except', icon: '\uD83D\uDEAB' },
  { id: 'ONLY', labelKey: 'storyVisibility.only', icon: '\uD83C\uDFAF' },
  { id: 'PRIVATE', labelKey: 'storyVisibility.private', icon: '\uD83D\uDD12' },
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

function getCategoryLabelKey(category: MediaCategory): string {
  switch (category) {
    case 'image': return 'mediaCategory.photo';
    case 'video': return 'mediaCategory.video';
    case 'audio': return 'mediaCategory.audio';
  }
}

function generateStoryObjectId(): string {
  const cryptoRef = (globalThis as { crypto?: Crypto }).crypto;
  if (cryptoRef && typeof cryptoRef.randomUUID === 'function') {
    return cryptoRef.randomUUID();
  }
  if (cryptoRef && typeof cryptoRef.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    cryptoRef.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
  }
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

// ============================================================================
// F5b — le composer ÉMET du v3
// ============================================================================

/// Fond canonique du fil (`#hex` | `gradient:from,to` | url) : la palette du
/// composer parle CSS (`linear-gradient(135deg, A, B)`), forme qu'aucun
/// lecteur — ni `CanvasV3Scene`, ni le chemin legacy, ni iOS — ne sait lire.
const CSS_GRADIENT_STOPS = /^linear-gradient\([^,]*,(.*)\)$/;

function canonicalBackground(value: string): string {
  const stops = CSS_GRADIENT_STOPS.exec(value)?.[1];
  if (stops === undefined) return value;
  return `gradient:${stops.split(',').map((stop) => stop.trim()).filter(Boolean).join(',')}`;
}

const NEUTRAL_TRANSFORM: ObjectV3['transform'] = { scale: 1, rotation: 0, opacity: 1 };

type UnrankedObjectV3 = Omit<ObjectV3, 'z'>;

type CanvasMediaSource = {
  postMediaId: string;
  mediaType: 'image' | 'video';
  x: number;
  y: number;
  isBackground: boolean;
  duration?: number;
};

type CanvasAudioSource = {
  postMediaId: string;
  placement: string;
  x: number;
  y: number;
  volume: number;
  isBackground: boolean;
  duration?: number;
};

type CanvasComposerState = {
  background: string;
  textStyle: TextStyle;
  content?: string;
  media?: readonly CanvasMediaSource[];
  audio?: readonly CanvasAudioSource[];
};

function backgroundObject(background: string): UnrankedObjectV3 {
  return {
    id: generateStoryObjectId(),
    kind: 'media',
    anchor: { t: 'free', x: 0.5, y: 0.5 },
    plane: 'bg',
    transform: NEUTRAL_TRANSFORM,
    payload: { background: canonicalBackground(background) },
  };
}

/// G3 — le stylage RACINE devient un objet texte seulement en l'absence
/// d'objet texte : l'écran web n'a pas de famille `textObjects`, son contenu
/// est donc toujours ce texte-là. Sans lui, `StoryViewer` en v3 n'affiche plus
/// rien (le bloc legacy `story.content` ne se monte plus).
function rootTextObject(content: string, textStyle: TextStyle): UnrankedObjectV3 {
  return {
    id: generateStoryObjectId(),
    kind: 'text',
    anchor: { t: 'free', x: 0.5, y: 0.5 },
    plane: 'fg',
    transform: NEUTRAL_TRANSFORM,
    payload: { text: content, textStyle },
  };
}

function mediaObject(media: CanvasMediaSource): UnrankedObjectV3 {
  return {
    id: generateStoryObjectId(),
    kind: 'media',
    anchor: { t: 'free', x: media.x, y: media.y },
    plane: 'content',
    transform: NEUTRAL_TRANSFORM,
    payload: {
      postMediaId: media.postMediaId,
      mediaType: media.mediaType,
      isBackground: media.isBackground,
      ...(media.duration !== undefined ? { duration: media.duration } : {}),
    },
  };
}

/// `volume` n'est émis que s'il s'écarte de 1 et `waveformSamples` reste
/// DEHORS (spec §C2bis) : les deux côtés décodent 1 par défaut, et les golden
/// v1→v3 ne portent pas l'échantillonnage de composition.
function audioObject(audio: CanvasAudioSource): UnrankedObjectV3 {
  return {
    id: generateStoryObjectId(),
    kind: 'audio',
    anchor: { t: 'free', x: audio.x, y: audio.y },
    plane: 'content',
    transform: NEUTRAL_TRANSFORM,
    payload: {
      postMediaId: audio.postMediaId,
      placement: audio.placement,
      isBackground: audio.isBackground,
      ...(audio.volume !== 1 ? { volume: audio.volume } : {}),
      ...(audio.duration !== undefined ? { duration: audio.duration } : {}),
    },
  };
}

/// O3 — jamais de cadre vide servi au fil : la palette a toujours une valeur,
/// le porteur de fond existe donc TOUJOURS et la scène ne peut pas être vide.
/// `z` est le rang d'INSERTION (fond, texte racine, porteur, audio), pas un
/// ordre par plan — le plan porte déjà l'empilement à la lecture.
function buildCanvasV3(state: CanvasComposerState): CanvasV3 {
  const objects: ObjectV3[] = [
    backgroundObject(state.background),
    ...(state.content?.trim() ? [rootTextObject(state.content, state.textStyle)] : []),
    ...(state.media ?? []).map(mediaObject),
    ...(state.audio ?? []).map(audioObject),
  ].map((object, index) => ({ ...object, z: index }));

  return { v: 3, scenes: [{ id: 's1', objects }] };
}

// ============================================================================
// StoryComposer
// ============================================================================

function StoryComposer({ open, onClose, onPublish, defaultVisibility = 'FRIENDS' }: StoryComposerProps) {
  const { t } = useI18n('common');
  const [selectedBg, setSelectedBg] = useState<string>(BACKGROUND_COLORS[0].value);
  const [selectedTextStyle, setSelectedTextStyle] = useState<TextStyle>('bold');
  const [content, setContent] = useState<string>('');
  const [visibility, setVisibility] = useState<StoryVisibility>(defaultVisibility);
  // W3 inc.2 — audience explicite des visibilités EXCEPT/ONLY.
  const [visibilityUserIds, setVisibilityUserIds] = useState<string[]>([]);
  const { references, pick, drop, clear: clearReferences, payload: referencesPayload } = useReferences();
  const [referencePickerOpen, setReferencePickerOpen] = useState(false);

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
      toast.error(t('limitReached', { limit: String(limit), category: t(getCategoryLabelKey(category)) }));
      return;
    }

    const filesToAdd = Array.from(files).slice(0, available);
    if (filesToAdd.length < files.length) {
      toast.warning(t('filesAdded', { count: String(filesToAdd.length) }));
    }

    handleFilesSelected(filesToAdd);
  }, [mediaCounts, handleFilesSelected, t]);

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
    const mediaIds = uploadedAttachments.map(att => att.id);
    const firstVisualMedia = uploadedAttachments.find((att) => {
      const category = getMediaCategory(att.mimeType);
      return category === 'image' || category === 'video';
    });
    const firstAudioMedia = uploadedAttachments.find((att) => getMediaCategory(att.mimeType) === 'audio');

    const media: CanvasMediaSource[] = firstVisualMedia ? [{
      postMediaId: firstVisualMedia.id,
      mediaType: getMediaCategory(firstVisualMedia.mimeType) === 'video' ? 'video' : 'image',
      x: 0.5,
      y: 0.5,
      isBackground: true,
      ...(typeof firstVisualMedia.duration === 'number' ? { duration: firstVisualMedia.duration / 1000 } : {}),
    }] : [];

    const audio: CanvasAudioSource[] = firstAudioMedia ? [{
      postMediaId: firstAudioMedia.id,
      placement: 'overlay',
      x: 0.5,
      y: 0.85,
      volume: 1,
      isBackground: true,
      ...(typeof firstAudioMedia.duration === 'number' ? { duration: firstAudioMedia.duration / 1000 } : {}),
    }] : [];

    onPublish({
      content: content || undefined,
      storyEffects: buildCanvasV3({
        background: selectedBg,
        textStyle: selectedTextStyle,
        content: content || undefined,
        media,
        audio,
      }),
      visibility,
      visibilityUserIds: (AUDIENCE_VISIBILITIES as readonly string[]).includes(visibility) ? visibilityUserIds : undefined,
      mediaIds: mediaIds.length > 0 ? mediaIds : undefined,
      ...(referencesPayload.length > 0 ? { mentions: referencesPayload } : {}),
    });
    setContent('');
    setSelectedBg(BACKGROUND_COLORS[0].value);
    setSelectedTextStyle('bold');
    setVisibilityUserIds([]);
    clearAttachments();
    clearReferences();
  }, [content, selectedBg, selectedTextStyle, visibility, visibilityUserIds, onPublish, uploadedAttachments, clearAttachments, referencesPayload, clearReferences]);

  const handleClose = useCallback(() => {
    onClose();
    setContent('');
    setSelectedBg(BACKGROUND_COLORS[0].value);
    setSelectedTextStyle('bold');
    setVisibility(defaultVisibility);
    setVisibilityUserIds([]);
    clearAttachments();
    clearReferences();
  }, [onClose, clearAttachments, defaultVisibility, clearReferences]);

  const hasContent = content.trim().length > 0 || selectedFiles.length > 0;
  // W3 inc.2 — EXCEPT/ONLY sans audience = publication bloquée (jamais de
  // visibilité cassée, cf. W6).
  const audienceIncomplete = isAudienceIncomplete(visibility, visibilityUserIds.length);

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
          aria-label={t('close')}
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
          {t('newStory')}
        </h2>

        <Button
          size="sm"
          variant="primary"
          onClick={handlePublish}
          disabled={!hasContent || isUploading || audienceIncomplete}
        >
          {isUploading ? t('uploading') : t('publish')}
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
            placeholder={t('storyPlaceholder')}
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
                      aria-label={t('delete')}
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

          {/* References */}
          <div className="flex items-center justify-center gap-2">
            <ReferencePicker
              references={references}
              onChange={handlePickReference}
              onRemove={drop}
              modes={REFERENCE_MODES}
              open={referencePickerOpen}
              onOpenChange={setReferencePickerOpen}
            />
            {references.length > 0 && (
              <ReferenceChipRow references={references} onOpen={() => setReferencePickerOpen(true)} />
            )}
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

          {/* Visibility Selector */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            {VISIBILITY_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setVisibility(opt.id)}
                className={cn(
                  'flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-300',
                  visibility === opt.id
                    ? 'bg-[var(--gp-terracotta)] text-white'
                    : 'bg-[var(--gp-hover)] text-[var(--gp-text-secondary)] hover:text-[var(--gp-text-primary)]'
                )}
              >
                <span>{opt.icon}</span>
                {t(opt.labelKey)}
              </button>
            ))}
          </div>

          {/* W3 inc.2 — audience explicite pour EXCEPT/ONLY */}
          {(AUDIENCE_VISIBILITIES as readonly string[]).includes(visibility) && (
            <AudienceUserPicker
              mode={visibility as 'EXCEPT' | 'ONLY'}
              selectedIds={visibilityUserIds}
              onChange={setVisibilityUserIds}
            />
          )}
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
export type { StoryComposerProps, StoryVisibility };
