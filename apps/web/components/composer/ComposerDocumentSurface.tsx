'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '@/hooks/use-i18n';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/v2/Avatar';
import { Button } from '@/components/v2/Button';
import {
  AudienceUserPicker,
  AUDIENCE_VISIBILITIES,
  isAudienceIncomplete,
} from '@/components/v2/AudienceUserPicker';
import { MediaAccessibilityFields } from '@/components/v2/MediaAccessibilityFields';
import { PUBLICATION_VISIBILITY_OPTIONS } from '@/components/v2/publication-visibility';
import { ReferencePicker } from '@/components/composer/ReferencePicker';
import { ReferenceChipRow } from '@/components/composer/ReferenceChipRow';
import { ComposerFormatFan } from '@/components/composer/ComposerFormatFan';
import { AudioCapture, type AudioCaptureResult } from '@/components/composer/AudioCapture';
import { useReferences } from '@/hooks/composer/useReferences';
import { useAttachmentUpload } from '@/hooks/composer/useAttachmentUpload';
import { useAuthStore } from '@/stores/auth-store';
import { AttachmentService } from '@/services/attachmentService';
import { postTypeOf, webComposerOpening, type ComposerDoor, type ComposerFormat } from '@/lib/composer-door';
import { qualifiesAsReel } from '@meeshy/shared/utils/reel-composition';
import { removingHandle } from '@meeshy/shared/utils/composer-references';
import { DEFAULT_PUBLICATION_VISIBILITY } from '@meeshy/shared/types/post';
import type { PostType, PostVisibility } from '@meeshy/shared/types/post';
import type { PostReferenceDisplay } from '@meeshy/shared/types/post-reference';
import type { ComposerDocumentPayload } from '@/components/composer/payload';

/**
 * La surface DOCUMENT — celle des formats POST et RÉEL.
 *
 * Elle porte, capacité par capacité, ce que `components/v2/PostComposer.tsx`
 * (605 l.) sait faire : un plafond de 5 000 caractères, un pool UNIQUE de dix
 * médias, un texte alternatif par média, l'opt-in son en tri-état, les
 * références non-INLINE, les six audiences et l'écho optimiste des médias
 * uploadés. `meeshy-composer-post.test.tsx` en est l'inventaire, cité à la
 * ligne. Ce fichier ne décrit PAS l'état du composer hérité, qui vit sa vie
 * dans son propre fichier.
 *
 * TROIS choses changent par rapport à ce port, et la troisième est un
 * changement de PRODUIT, pas de forme :
 *
 *  1. **la bascule POST/RÉEL locale cède la place à l'éventail** de la porte.
 *     Le composer hérité peignait deux boutons dès que la composition
 *     qualifiait ; ici c'est `ComposerFormatFan` qui peint ce que la porte
 *     offre, et il en offre parfois plus de deux ;
 *  2. **les deux messages de plafond média passent par le catalogue.** Ils
 *     étaient anglais en dur ; les recopier tels quels aurait gravé l'anglais
 *     dans un fichier neuf, alors que le web est localisé en quatre langues ;
 *  3. **la CLASSIFICATION PAR DÉFAUT d'une composition qualifiante passe de
 *     RÉEL à POST, depuis le composer du fil.** Le composer hérité naît sur
 *     RÉEL (`PostComposer.tsx`, `useState<PostType>('REEL')`) et ne dégrade
 *     que si la composition ne qualifie pas (son `effectivePostType`) : joindre une vidéo de
 *     5 s et publier sans rien toucher y donne un RÉEL. Ici le format naît de
 *     la PORTE, et `feedComposer` ouvre sur `post`
 *     (`composer-contract.ts`, `case 'feedComposer'`) : le même geste publie un POST, et la
 *     publication n'entre plus dans le fil Réels. Passer en RÉEL devient un
 *     geste explicite de l'auteur dans l'éventail.
 *
 *     Ce n'est pas un oubli de port, c'est ce que la table partagée dit : la
 *     reproduire aurait demandé au web de re-semer un format initial contre le
 *     contrat, c'est-à-dire d'en forker la table — et l'asymétrie voulue de
 *     l'éventail (« re-qualifier ne rebascule PAS vers RÉEL ») interdit la
 *     promotion automatique. La conséquence se dit noir sur blanc plutôt que
 *     de se découvrir : **une vidéo publiée depuis le fil n'atterrit plus dans
 *     Réels par défaut.**
 *
 *     Conséquence pour le RETRAIT du composer hérité : trois assertions de
 *     `__tests__/components/v2/PostComposer.reelToggle.test.tsx` (les trois
 *     nommées « defaults to REEL ») décrivent le geste inverse de
 *     celui que cette surface tient. Elles ne se **reformulent** pas sur elle :
 *     elles se remplacent par leur contrepartie assumée. Tant que ce n'est pas
 *     fait, deux suites vertes décrivent le même geste avec des issues
 *     opposées.
 *
 * ### Deux garde-fous distincts sur le format, et aucun ne remplace l'autre
 *
 * L'éventail tient la SÉLECTION dans ce que la porte offre — c'est son repli,
 * et il vit dans `ComposerFormatFan`. La CHARGE, elle, dégrade en POST tout
 * réel dont la composition ne qualifie pas. Ce second garde-fou n'est pas une
 * ceinture de plus sur la même bretelle : la porte `reelTab` offre RÉEL avant
 * même qu'une composition existe (`composer-contract.ts`, `case 'reelTab'` — sans passage
 * par le gate de qualification), donc l'éventail n'a là rien à replier et
 * laisserait partir un RÉEL que le serveur rétrograderait en silence. C'est
 * exactement la fonction que `effectivePostType` remplit dans le composer
 * hérité (`PostComposer.tsx`, `effectivePostType`).
 */

const REFERENCE_MODES: readonly Exclude<PostReferenceDisplay, 'INLINE'>[] = ['NOTE', 'SILENT'];

/** Format d'un document publiable par cette surface. */
export type DocumentFormat = Extract<ComposerFormat, 'post' | 'reel'>;

/**
 * Ce que la surface rend à son appelant. La forme vit dans
 * `components/composer/payload.ts` et elle y est déclarée UNE SEULE fois : le
 * composer hérité rend la même charge au même appelant, et deux déclarations
 * jumelles auraient pu diverger sans qu'aucun gate ne rougisse. Le module
 * porteur n'est ni cette surface ni le composer hérité, donc la suppression
 * programmée du second n'emporte pas la déclaration.
 * `meeshy-composer-post.test.tsx` épingle le jeu de clés effectivement émis.
 */
export type { ComposerDocumentPayload };

export interface ComposerDocumentSurfaceProps {
  readonly door: ComposerDoor;
  readonly format: DocumentFormat;
  readonly onFormatChange: (format: ComposerFormat) => void;
  /**
   * Les formats que l'HÔTE sait peindre. La porte dit ce qui est composable ;
   * l'hôte dit ce qu'il sait rendre ; l'auteur se voit offrir l'intersection.
   * Offrir davantage démonterait la surface au clic — donc l'éventail, qui vit
   * dedans, donc tout retour — et le brouillon partirait avec.
   */
  readonly routableFormats: ReadonlyArray<ComposerFormat>;
  readonly currentUser?: { username: string; avatar?: string | null } | null;
  readonly onPublish: (payload: ComposerDocumentPayload) => void;
  /**
   * W7 — relayé tel quel à `AudioCapture.armToken`, et il force en plus
   * l'EXPANSION de cette surface : l'outil micro n'est monté que dans le
   * bloc `isExpanded` (voir plus bas), donc l'armer depuis l'extérieur sans
   * forcer l'expansion n'armerait rien — un composant non monté ne s'arme
   * pas. `undefined` ⇒ comportement inchangé (W4).
   */
  readonly armCaptureToken?: number;
  /** W7 (correctif R2) — relais de la CONSOMMATION du jeton, voir `AudioCapture.onArmed`. */
  readonly onCaptureArmed?: () => void;
  readonly disabled?: boolean;
  readonly className?: string;
}

/**
 * Plafond client aligné sur la limite serveur de `mediaIds` (≤ 10,
 * `CreatePostSchema`). UN SEUL pool photos+vidéos : `useAttachmentUpload`
 * compte `selectedFiles` seul, qui reflète déjà tout fichier en attente ou
 * téléversé — la somme `selectedFiles + uploadedAttachments` comptait double.
 */
const MEDIA_LIMIT = 10;

const CHAR_LIMIT = 5000;
const CHAR_COUNT_THRESHOLD = 4500;
const CHAR_COUNT_ALERT = 4900;

const MEDIA_ACCEPT = {
  image: 'image/*',
  video: 'video/*',
} as const;

function isImageFile(file: File): boolean {
  return file.type.startsWith('image/');
}

export function ComposerDocumentSurface({
  door,
  format,
  onFormatChange,
  routableFormats,
  currentUser,
  onPublish,
  armCaptureToken,
  onCaptureArmed,
  disabled = false,
  className,
}: ComposerDocumentSurfaceProps) {
  const { t } = useI18n('common');
  const [content, setContent] = useState('');
  const [visibility, setVisibility] = useState<PostVisibility>(DEFAULT_PUBLICATION_VISIBILITY);
  const [visibilityUserIds, setVisibilityUserIds] = useState<string[]>([]);
  const [showVisibilityPicker, setShowVisibilityPicker] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // W7 — l'armement externe force l'expansion : `AudioCapture` n'est monté
  // que dans le bloc `isExpanded` plus bas, donc un jeton reçu avant que
  // l'auteur ait touché le champ n'armerait rien tant que la surface reste
  // repliée. L'effet tourne aussi au MONTAGE (React exécute chaque effet une
  // première fois) : un jeton déjà défini quand cette surface apparaît force
  // l'expansion dès la première frame, pas seulement sur un changement
  // ultérieur.
  useEffect(() => {
    if (armCaptureToken === undefined) return;
    setIsExpanded(true);
  }, [armCaptureToken]);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [mediaAlt, setMediaAlt] = useState<Record<string, string>>({});
  // `allowSoundExtractionTouched` distingue « jamais touché » (rien envoyé) de
  // « explicitement désactivé » (envoie `false`) — c'est le tri-état, et il
  // exige bien deux états locaux : le booléen seul ne sait pas dire qu'il n'a
  // jamais été choisi.
  const [allowSoundExtraction, setAllowSoundExtraction] = useState(false);
  const [allowSoundExtractionTouched, setAllowSoundExtractionTouched] = useState(false);
  const { references, pick, drop, clear: clearReferences, payload: referencesPayload } = useReferences();
  const [referencePickerOpen, setReferencePickerOpen] = useState(false);
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
    maxAttachments: MEDIA_LIMIT,
  });

  const mediaLimitReached = selectedFiles.length >= MEDIA_LIMIT;
  const uploadPercentage = uploadProgress[0] ?? 0;

  // `uploadedAttachments` porte déjà la forme que le prédicat partagé attend
  // (`ReelMediaLike`) : aucune normalisation intermédiaire, donc aucun second
  // endroit où la règle du réel pourrait glisser.
  const compositionQualifies = qualifiesAsReel(uploadedAttachments);
  const { offeredFormats } = webComposerOpening(door, uploadedAttachments);
  // L'éventail ne peint que ce que l'hôte sait peindre. La table partagée n'est
  // pas rejouée ici — elle est INTERSECTÉE avec une capacité, et l'intersection
  // ne peut pas être vide tant que la surface est montée : l'hôte ne la monte
  // que sur un format qu'il route, et ce format appartient toujours à
  // `offeredFormats` (invariant du contrat).
  const selectableFormats = offeredFormats.filter((offered) => routableFormats.includes(offered));
  const publishedType: PostType = postTypeOf(
    format === 'reel' && compositionQualifies ? 'reel' : 'post',
  );

  // URLs blob mémoïsées par identité de File : retaper la légende re-rend à
  // chaque frappe et ne doit pas fabriquer une nouvelle URL d'objet. Révoquées
  // quand un fichier quitte la sélection, et au démontage.
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

  const handleMediaSelect = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;

      const available = MEDIA_LIMIT - selectedFiles.length;
      if (available <= 0) {
        setMediaError(t('composer.media.limitReached', { max: MEDIA_LIMIT }));
        return;
      }

      const requested = Array.from(files);
      const filesToAdd = requested.slice(0, available);
      // Pré-validation avec le même service que le hook (taille/type), pour
      // afficher le message spécifique DANS la surface plutôt que de laisser
      // le hook émettre un toast générique.
      const validation = AttachmentService.validateFiles(filesToAdd);
      if (!validation.valid) {
        setMediaError(validation.errors.join(' '));
        return;
      }

      setMediaError(
        filesToAdd.length < requested.length
          ? t('composer.media.limitPartial', { max: MEDIA_LIMIT, added: filesToAdd.length })
          : null,
      );
      handleFilesSelected(filesToAdd);
    },
    [selectedFiles.length, handleFilesSelected, t],
  );

  const handleRemoveMedia = useCallback(
    (index: number) => {
      handleRemoveFile(index);
      setMediaError(null);
    },
    [handleRemoveFile],
  );

  // Un média RETIRÉ (bouton ✕ avant téléversement, ou téléversement en échec)
  // ne doit pas laisser un id orphelin dans `mediaAlt`. Le pruning suit
  // `uploadedAttachments` (source des ids réels) et non `selectedFiles`, qui
  // n'a pas encore d'id.
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

  // Une seule stratégie de téléversement (Task W4) : l'outil micro rend le
  // fichier produit, et il entre dans le MÊME pool que photo/vidéo — jamais un
  // second appelant de téléversement.
  //
  // Le résultat ne porte AUCUNE langue, et cette surface n'en fabrique donc
  // aucune : `originalLanguage` décrit la langue de `content` — la légende
  // TAPÉE — et le seul signal qu'un reconnaisseur vocal pourrait offrir est sa
  // propre locale de configuration, qui ne la mesure pas. Le gateway détecte
  // depuis le texte (`detectLanguage`) dès que la clé est absente, ce qui est
  // exactement la règle F7d. Voir la note d'en-tête d'`AudioCapture.tsx`.
  //
  // Ce que cette note ne promet PAS (revue du 2026-08-25) : la transcription
  // serveur du fichier lui-même. `useAttachmentUpload` rend des ids de
  // `MessageAttachment`, que `PostService.createPost` ne sait pas réclamer —
  // il n'attend que des `PostMedia`. Dette mesurée et ANTÉRIEURE à cette
  // surface (le composer hérité téléversait déjà par ce pool) ; détail et
  // portée dans la note jumelle de `PostsFeedScreen.tsx`.
  const handleAudioCaptured = useCallback(
    (result: AudioCaptureResult) => {
      handleFilesSelected([result.file], [{ duration: result.durationMs }]);
    },
    [handleFilesSelected],
  );

  // Une personne écrite `@handle` dans la légende est INLINE côté serveur (le
  // gateway la dérive du texte). La déplacer vers un mode déclaré n'a de sens
  // qu'une fois son handle sorti de la phrase — le retrait est un no-op quand
  // il n'y était pas.
  const handlePickReference = useCallback(
    (person: { username: string; userId?: string }, display: PostReferenceDisplay) => {
      pick(person, 'picker', display);
      if (display !== 'INLINE') {
        setContent((c) => removingHandle(person.username, c));
      }
    },
    [pick],
  );

  const handlePublish = useCallback(() => {
    const trimmed = content.trim();
    const mediaIds = uploadedAttachments.map((att) => att.id);
    const hasUploadedMedia = mediaIds.length > 0;
    if ((!trimmed && !hasUploadedMedia) || disabled || isUploading) return;
    if (trimmed.length > CHAR_LIMIT) return;
    if (isAudienceIncomplete(visibility, visibilityUserIds.length)) return;

    onPublish({
      content: trimmed,
      type: publishedType,
      visibility,
      visibilityUserIds: (AUDIENCE_VISIBILITIES as readonly string[]).includes(visibility)
        ? visibilityUserIds
        : undefined,
      mediaIds: hasUploadedMedia ? mediaIds : undefined,
      optimisticMedia: hasUploadedMedia
        ? uploadedAttachments.map((att, order) => ({
            id: att.id,
            mimeType: att.mimeType,
            fileUrl: att.fileUrl,
            thumbnailUrl: att.thumbnailUrl,
            duration: att.duration,
            order,
          }))
        : undefined,
      // Jamais `mentions: []` — l'absence dit « pas touché », `[]` effacerait
      // les références déclarées côté serveur.
      ...(referencesPayload.length > 0 ? { mentions: referencesPayload } : {}),
      // Seuls les ids encore présents dans `mediaIds` survivent : un média
      // retiré après la saisie de son alt ne ressuscite pas une clé orpheline.
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
    setMediaAlt({});
    setAllowSoundExtraction(false);
    setAllowSoundExtractionTouched(false);
    clearAttachments();
    clearReferences();
  }, [
    content,
    disabled,
    isUploading,
    onPublish,
    visibility,
    visibilityUserIds,
    uploadedAttachments,
    publishedType,
    clearAttachments,
    referencesPayload,
    clearReferences,
    mediaAlt,
    allowSoundExtraction,
    allowSoundExtractionTouched,
  ]);

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
  const isValid = (trimmedContent.length > 0 || hasMedia) && trimmedContent.length <= CHAR_LIMIT;
  const charCount = content.length;
  const selectedVisibility =
    PUBLICATION_VISIBILITY_OPTIONS.find((v) => v.id === visibility) ?? PUBLICATION_VISIBILITY_OPTIONS[0];

  return (
    <div
      className={cn(
        'rounded-2xl border border-[var(--gp-border)] bg-[var(--gp-surface)] overflow-hidden transition-all',
        className,
      )}
      data-testid="composer-document-surface"
    >
      <div className="p-4">
        <div className="flex gap-3">
          <Avatar name={currentUser?.username ?? '?'} src={currentUser?.avatar ?? undefined} size="md" />

          <div className="flex-1 min-w-0">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsExpanded(true)}
              placeholder={t('postPlaceholder')}
              rows={isExpanded ? 4 : 2}
              maxLength={CHAR_LIMIT}
              disabled={disabled}
              className={cn(
                'w-full resize-none border-0 bg-transparent text-base outline-none',
                'text-[var(--gp-text-primary)] placeholder:text-[var(--gp-text-muted)]',
                disabled && 'opacity-50 cursor-not-allowed',
              )}
              aria-label={t('postComposer.contentLabel')}
            />

            {isExpanded && selectedFiles.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2" data-testid="composer-media-preview">
                {selectedFiles.map((file, index) => (
                  <div
                    key={`${file.name}-${file.lastModified}-${index}`}
                    className="group relative rounded-lg overflow-hidden bg-[var(--gp-hover)]"
                  >
                    {isImageFile(file) ? (
                      <img src={getPreviewUrl(file)} alt={file.name} className="h-16 w-16 object-cover" />
                    ) : (
                      <div className="flex h-16 w-16 items-center justify-center text-[var(--gp-text-secondary)]">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="24"
                          height="24"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
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
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            {isExpanded && mediaError && (
              <p className="mt-2 text-xs text-red-500" role="alert" data-testid="composer-media-error">
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

                  <AudioCapture
                    disabled={disabled || mediaLimitReached}
                    onCaptured={handleAudioCaptured}
                    armToken={armCaptureToken}
                    onArmed={onCaptureArmed}
                  />

                  <ReferencePicker
                    references={references}
                    onChange={handlePickReference}
                    onRemove={drop}
                    modes={REFERENCE_MODES}
                    open={referencePickerOpen}
                    onOpenChange={setReferencePickerOpen}
                  />

                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowVisibilityPicker(!showVisibilityPicker)}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-[var(--gp-text-secondary)] hover:bg-[var(--gp-parchment)] transition-colors"
                      aria-label={t('postComposer.changeVisibility')}
                    >
                      <span>{selectedVisibility.icon}</span>
                      <span>{t(selectedVisibility.labelKey)}</span>
                    </button>

                    {showVisibilityPicker && (
                      <div
                        data-testid="composer-visibility-options"
                        className="absolute bottom-full left-0 mb-1 bg-[var(--gp-surface)] border border-[var(--gp-border)] rounded-xl shadow-lg z-20 min-w-[160px]"
                      >
                        {PUBLICATION_VISIBILITY_OPTIONS.map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
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

                  <ComposerFormatFan
                    offered={selectableFormats}
                    selected={format}
                    onSelect={onFormatChange}
                  />

                  {charCount > CHAR_COUNT_THRESHOLD && (
                    <span
                      data-testid="composer-char-count"
                      className={cn(
                        'text-xs',
                        charCount > CHAR_COUNT_ALERT ? 'text-red-500' : 'text-[var(--gp-text-muted)]',
                      )}
                    >
                      {CHAR_LIMIT - charCount}
                    </span>
                  )}
                </div>

                <Button
                  variant="primary"
                  size="sm"
                  onClick={handlePublish}
                  disabled={
                    !isValid ||
                    disabled ||
                    isUploading ||
                    isAudienceIncomplete(visibility, visibilityUserIds.length)
                  }
                >
                  {isUploading ? t('uploading') : t('publish')}
                </Button>
              </div>
            )}

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

      <input
        ref={imageInputRef}
        data-testid="composer-media-input-image"
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
        data-testid="composer-media-input-video"
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

ComposerDocumentSurface.displayName = 'ComposerDocumentSurface';
