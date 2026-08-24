'use client';

import { useState, useCallback, useRef, useMemo, type ReactNode } from 'react';
import { useI18n } from '@/hooks/use-i18n';
import { cn } from '@/lib/utils';
import { Dialog, DialogHeader } from './Dialog';
import { Button } from './Button';
import { toast } from 'sonner';
import { useAttachmentUpload } from '@/hooks/composer/useAttachmentUpload';
import { useAuthStore } from '@/stores/auth-store';
import { AudienceUserPicker, AUDIENCE_VISIBILITIES, isAudienceIncomplete } from './AudienceUserPicker';
import { ReferencePicker } from '@/components/composer/ReferencePicker';
import { ReferenceChipRow } from '@/components/composer/ReferenceChipRow';
import { ComposerFormatFan } from '@/components/composer/ComposerFormatFan';
import { useReferences } from '@/hooks/composer/useReferences';
import { removingHandle } from '@meeshy/shared/utils/composer-references';
import type { PostReferenceDisplay, PostReferenceInput } from '@meeshy/shared/types/post-reference';
import { DEFAULT_PUBLICATION_VISIBILITY } from '@meeshy/shared/types/post';
import { PUBLICATION_VISIBILITY_OPTIONS } from './publication-visibility';
import { webComposerOpening, type ComposerDoor, type ComposerFormat } from '@/lib/composer-door';
import {
  MEDIA_LIMITS,
  MEDIA_ACCEPT,
  BACKGROUND_COLORS,
  TEXT_STYLES,
  getTextStyleClasses,
  buildCanvasV3,
  type TextStyle,
  type MediaCategory,
  type CanvasMediaSource,
  type CanvasAudioSource,
} from '@/lib/story-canvas-v3';

/**
 * F5b / W5 — le composer story ÉMET du v3, et sa SURFACE est désormais
 * absorbée par le meuble unifié.
 *
 * `StoryComposerSurface` porte tout le formulaire (aperçu, médias, palette,
 * styles de texte, audience, et — quand elle est montée par le meuble —
 * l'éventail des formats). `StoryComposer` en reste l'enrobage historique :
 * un `Dialog` modal avec son bouton de fermeture et son titre, monté tel quel
 * par `PostsFeedScreen.tsx` (§G — absorbé, jamais retiré). L'émetteur v3
 * (`buildCanvasV3` et ses catalogues) vit dans `lib/story-canvas-v3.ts` :
 * aucune UI n'y est descendue, pour qu'il reste consommable identiquement par
 * les deux enrobages.
 *
 * ### C'est l'ENROBAGE qui décide où va le bouton Publier
 *
 * Les deux n'ont pas la même contrainte de place, et ce n'est pas un détail de
 * goût :
 *
 * - le **dialogue** vit dans un `Dialog` (`components/v2/Dialog.tsx`) qui n'a
 *   NI `max-h` NI `overflow-y` : ce qui dépasse la fenêtre est coupé et
 *   devient inatteignable. Son en-tête portait donc historiquement TROIS
 *   enfants sous `flex items-center justify-between` — fermer, titre,
 *   Publier — ce qui centrait le titre par construction ET gardait le CTA
 *   visible avant toute saisie, quelle que soit la hauteur du corps
 *   (six rangées d'outils, plus `AudienceUserPicker` sous EXCEPT/ONLY) ;
 * - le **meuble** n'est pas un modal : sa surface défile avec la page, et son
 *   Publier vit au bas du formulaire, sur la même rangée que l'éventail,
 *   comme `ComposerDocumentSurface`.
 *
 * D'où `renderPublishHeader` : la surface reste la SEULE à savoir si l'on peut
 * publier et à porter le geste ; l'enrobage choisit où le peindre. Le fournir
 * retire le bouton du bas — jamais deux Publier pour une seule intention.
 */

// ============================================================================
// Types
// ============================================================================

const REFERENCE_MODES: readonly Exclude<PostReferenceDisplay, 'INLINE'>[] = ['NOTE', 'SILENT'];

/// W3 — parité `PostVisibility` complète (inc.2) : EXCEPT/ONLY sont servis
/// par l'AudienceUserPicker et gatés à la publication (`isAudienceIncomplete`,
/// partagé avec PostComposer depuis le module du picker) — jamais publiés
/// sans liste (le trou W6).
type StoryVisibility = 'PUBLIC' | 'FRIENDS' | 'COMMUNITY' | 'PRIVATE' | 'EXCEPT' | 'ONLY';

/**
 * La charge d'une publication story, déclarée UNE fois — consommée par les
 * deux enrobages (`StoryComposer`, `StoryComposerSurface`) qui partagent le
 * même corps de formulaire, donc n'ont jamais deux déclarations à faire
 * diverger.
 */
export interface ComposerStoryPayload {
  content?: string;
  storyEffects: Record<string, unknown>;
  visibility: StoryVisibility;
  /// W3 — audience explicite (EXCEPT/ONLY). Plombé jusqu'au service ;
  /// alimenté par le picker à l'inc.2.
  visibilityUserIds?: string[];
  mediaIds?: string[];
  mentions?: readonly PostReferenceInput[];
}

interface StoryComposerProps {
  open: boolean;
  onClose: () => void;
  onPublish: (story: ComposerStoryPayload) => void;
  defaultVisibility?: StoryVisibility;
}

/**
 * Ce qu'un enrobage doit connaître pour peindre le bouton Publier lui-même :
 * le geste, l'état du geste, et son libellé. Rien de plus — la surface reste
 * la seule à savoir POURQUOI il est désactivé.
 */
export interface StoryPublishControl {
  readonly publish: () => void;
  readonly disabled: boolean;
  readonly label: string;
}

/**
 * Le corps montable du format story.
 *
 * `door`, `onFormatChange` et `routableFormats` sont OPTIONNELS et n'arrivent
 * ensemble que d'un seul appelant : `MeeshyComposer`, qui les fournit tous
 * les trois pour peindre l'éventail (`ComposerFormatFan`) — exactement le
 * même composant partagé que `ComposerDocumentSurface`. Le dialogue autonome
 * (`StoryComposer`) ne les fournit jamais : pas de porte, pas d'éventail,
 * comportement identique à avant W5.
 */
export interface StoryComposerSurfaceProps {
  readonly onPublish: (payload: ComposerStoryPayload) => void;
  readonly defaultVisibility?: StoryVisibility;
  readonly door?: ComposerDoor;
  readonly onFormatChange?: (format: ComposerFormat) => void;
  readonly routableFormats?: ReadonlyArray<ComposerFormat>;
  /**
   * Peint par l'enrobage AU-DESSUS du formulaire, avec de quoi publier. Le
   * fournir DÉPLACE le bouton Publier : la surface ne peint plus le sien —
   * voir la note de fichier. Absent ⇒ la surface garde son bouton bas.
   */
  readonly renderPublishHeader?: (control: StoryPublishControl) => ReactNode;
  readonly disabled?: boolean;
  readonly className?: string;
}

// ============================================================================
// Helpers (UI — pas de l'émission v3, restent ici)
// ============================================================================

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

// ============================================================================
// StoryComposerSurface — le corps, montable par le dialogue OU le meuble
// ============================================================================

function StoryComposerSurface({
  onPublish,
  defaultVisibility = DEFAULT_PUBLICATION_VISIBILITY,
  door,
  onFormatChange,
  routableFormats,
  renderPublishHeader,
  disabled = false,
  className,
}: StoryComposerSurfaceProps) {
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

  // L'éventail n'est peint QUE quand les trois props de la porte arrivent
  // ensemble — c'est-à-dire seulement depuis le meuble. `uploadedAttachments`
  // porte déjà la forme `ReelMediaLike` attendue par le prédicat partagé,
  // comme pour `ComposerDocumentSurface`.
  const showFan = door !== undefined && onFormatChange !== undefined && routableFormats !== undefined;
  const offeredFormats = showFan ? webComposerOpening(door, uploadedAttachments).offeredFormats : [];
  const selectableFormats = showFan
    ? offeredFormats.filter((offered) => routableFormats!.includes(offered))
    : [];

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

  const hasContent = content.trim().length > 0 || selectedFiles.length > 0;
  // W3 inc.2 — EXCEPT/ONLY sans audience = publication bloquée (jamais de
  // visibilité cassée, cf. W6).
  const audienceIncomplete = isAudienceIncomplete(visibility, visibilityUserIds.length);

  // L'état du bouton Publier, calculé UNE fois : les deux emplacements
  // possibles (l'en-tête de l'enrobage, le bas du formulaire) le lisent au
  // même endroit, donc ils ne peuvent pas diverger.
  const publishDisabled = !hasContent || isUploading || audienceIncomplete || disabled;
  const publishLabel = isUploading ? t('uploading') : t('publish');

  return (
    <>
      {renderPublishHeader?.({ publish: handlePublish, disabled: publishDisabled, label: publishLabel })}
      <div className={cn(className)} data-testid="composer-story-surface">
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
            disabled={disabled}
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
            {PUBLICATION_VISIBILITY_OPTIONS.map((opt) => (
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

          {/* Éventail (meuble uniquement) + Publier — même rangée que
              `ComposerDocumentSurface` : outils à gauche, publication à droite.
              Le bouton disparaît quand l'enrobage le peint lui-même. */}
          <div className="flex items-center justify-between gap-2">
            <div>
              {showFan && (
                <ComposerFormatFan
                  offered={selectableFormats}
                  selected="story"
                  onSelect={onFormatChange!}
                />
              )}
            </div>
            {!renderPublishHeader && (
              <Button size="sm" variant="primary" onClick={handlePublish} disabled={publishDisabled}>
                {publishLabel}
              </Button>
            )}
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
      </div>
    </>
  );
}

StoryComposerSurface.displayName = 'StoryComposerSurface';

// ============================================================================
// StoryComposer — l'enrobage historique, un Dialog mince autour de la surface
// ============================================================================

function StoryComposer({ open, onClose, onPublish, defaultVisibility = DEFAULT_PUBLICATION_VISIBILITY }: StoryComposerProps) {
  const { t } = useI18n('common');

  // L'en-tête et le corps sont rendus par la MÊME surface : c'est elle qui
  // tient l'état de publication, et c'est l'enrobage qui dit où le bouton se
  // peint (voir la note de fichier). Les TROIS enfants de l'en-tête sont
  // load-bearing sous `justify-between` — retirer le bouton plaquerait le
  // titre contre le bord droit et repousserait le CTA sous six rangées
  // d'outils dans un dialogue qui ne défile pas.
  return (
    <Dialog open={open} onClose={onClose} className="max-w-lg">
      <StoryComposerSurface
        onPublish={onPublish}
        defaultVisibility={defaultVisibility}
        className="p-4 pt-0"
        renderPublishHeader={({ publish, disabled, label }) => (
          <DialogHeader className="flex items-center justify-between p-4 pb-3">
            <button
              type="button"
              onClick={onClose}
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

            <Button size="sm" variant="primary" onClick={publish} disabled={disabled}>
              {label}
            </Button>
          </DialogHeader>
        )}
      />
    </Dialog>
  );
}

StoryComposer.displayName = 'StoryComposer';

export { StoryComposer, StoryComposerSurface };
export type { StoryComposerProps, StoryVisibility };
