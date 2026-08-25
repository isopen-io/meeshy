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
import {
  postTypeOf,
  webComposerOpening,
  webUpdatePayload,
  type ComposerDoor,
  type ComposerFormat,
} from '@/lib/composer-door';
import { qualifiesAsReel, type ReelMediaLike } from '@meeshy/shared/utils/reel-composition';
import { removingHandle } from '@meeshy/shared/utils/composer-references';
import { DEFAULT_PUBLICATION_VISIBILITY } from '@meeshy/shared/types/post';
import type { PostMedia, PostType, PostVisibility } from '@meeshy/shared/types/post';
import { MAX_POST_MEDIA } from '@meeshy/shared/types/attachment';
import type { PostReferenceDisplay } from '@meeshy/shared/types/post-reference';
import type { ComposerDocumentEditPayload, ComposerDocumentPayload } from '@/components/composer/payload';

/**
 * La surface DOCUMENT — celle des formats POST et RÉEL.
 *
 * Elle porte, capacité par capacité, ce que `components/v2/PostComposer.tsx`
 * (605 l., RETIRÉ à la Task W9) savait faire : un plafond de 5 000
 * caractères, un pool UNIQUE de dix médias, un texte alternatif par média,
 * l'opt-in son en tri-état, les références non-INLINE, les six audiences et
 * l'écho optimiste des médias uploadés. `meeshy-composer-post.test.tsx` en
 * est l'inventaire, cité à la ligne.
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
 *     RÉEL à POST, depuis le composer du fil.** Le composer hérité naissait sur
 *     RÉEL (`useState<PostType>('REEL')`) et ne dégradait que si la
 *     composition ne qualifiait pas (son `effectivePostType`) : joindre une
 *     vidéo de 5 s et publier sans rien toucher y donnait un RÉEL. Ici le
 *     format naît de la PORTE, et `feedComposer` ouvre sur `post`
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
 *     Conséquence pour le RETRAIT du composer hérité, SOLDÉE à la Task W9 :
 *     les trois assertions de `PostComposer.reelToggle.test.tsx` nommées
 *     « defaults to REEL » décrivaient le geste inverse de celui que cette
 *     surface tient — elles ne se sont pas reformulées sur elle, elles se
 *     sont remplacées par leur contrepartie assumée (le test « DIVERGENCE
 *     ASSUMÉE » de `meeshy-composer-post.test.tsx`), et le fichier entier a
 *     été retiré avec le composer hérité qu'il testait.
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
 * exactement la fonction que remplissait `effectivePostType` dans le composer
 * hérité.
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
export type { ComposerDocumentPayload, ComposerDocumentEditPayload };

/**
 * Ce que la surface HYDRATE quand la porte est `edit` — W8. `postType` sème le
 * format INITIAL (fourni séparément par `door.documentFormat`, traduit par
 * `MeeshyComposer`) et sert de RÉFÉRENCE pour dire si `type` a changé.
 * `media` est la composition SERVEUR de départ ; retirer un élément la fait
 * SORTIR de cette liste (`removedMediaIds`), jamais muter l'objet.
 *
 * Optionnel : sans lui, cette surface reste celle de la CRÉATION — un `door`
 * `edit` sans `editSource` peint un brouillon vide (`meeshy-composer-post.test.tsx`
 * le documente et n'y touche pas).
 */
export interface ComposerDocumentEditSource {
  readonly postId: string;
  readonly content: string;
  readonly visibility: PostVisibility;
  readonly visibilityUserIds: readonly string[];
  readonly media: readonly PostMedia[];
  readonly postType: PostType;
}

/**
 * La charge d'édition — pure, testable sans rendre le composant. `known` est
 * TOUJOURS la même liste structurelle (ce que ce formulaire sait rendre) ;
 * c'est le DRAFT qui porte `undefined` pour « inchangé » champ par champ.
 * `webUpdatePayload` (`lib/composer-door.ts`) applique ensuite la loi 3 :
 * `mentions`/`storyEffects` n'y figurent même pas — ce formulaire ne les rend
 * jamais, donc il ne les déclare jamais connus.
 *
 * `type` compare l'ORIGINAL à `publishedType` — pas au `format` brut de
 * l'éventail — pour que la DÉGRADATION silencieuse d'un réel qui perd sa
 * qualification (déjà le mécanisme de la CRÉATION, voir la note de fichier)
 * s'applique à l'édition SANS second garde-fou dédié : `publishedType` reste
 * la SEULE valeur consultée ici. Elle est simplement affinée, à sa propre
 * source, pour ne dégrader que ce que l'auteur a effectivement fait chuter —
 * voir `editSourceQualifies` à son site de calcul.
 *
 * `visibility`/`visibilityUserIds` voyagent ENSEMBLE dès que l'un des deux a
 * changé — jamais `visibility` seule quand c'est la liste qui a bougé : c'est
 * la règle du COUPLE que `webUpdatePayload` fait respecter, ici satisfaite en
 * amont pour qu'un changement d'audience SEUL (Step 1.1) n'entraîne jamais
 * `content` avec lui.
 */
function editDraftPayload(params: {
  readonly editSource: ComposerDocumentEditSource;
  readonly content: string;
  readonly visibility: PostVisibility;
  readonly visibilityUserIds: readonly string[];
  readonly publishedType: PostType;
  readonly newMediaIds: readonly string[];
  readonly removedMediaIds: readonly string[];
  readonly mediaAlt: Record<string, string>;
}): ComposerDocumentEditPayload['data'] {
  const trimmed = params.content.trim();
  const effectiveAudience = (AUDIENCE_VISIBILITIES as readonly string[]).includes(params.visibility)
    ? [...params.visibilityUserIds]
    : [];
  const contentChanged = trimmed !== params.editSource.content.trim();
  const visibilityChanged = params.visibility !== params.editSource.visibility;
  const audienceChanged =
    effectiveAudience.join(',') !== [...params.editSource.visibilityUserIds].join(',');
  const audienceCoupleChanged = visibilityChanged || audienceChanged;
  const typeChanged = params.editSource.postType !== params.publishedType;
  const prunedAlt = Object.fromEntries(
    Object.entries(params.mediaAlt).filter(([id]) => params.newMediaIds.includes(id)),
  );

  return webUpdatePayload(
    ['content', 'visibility', 'visibilityUserIds', 'mediaIds', 'removeMediaIds', 'type', 'mediaAlt'],
    {
      content: contentChanged ? trimmed : undefined,
      visibility: audienceCoupleChanged ? params.visibility : undefined,
      visibilityUserIds: audienceCoupleChanged ? effectiveAudience : undefined,
      mediaIds: params.newMediaIds.length > 0 ? [...params.newMediaIds] : undefined,
      removeMediaIds: params.removedMediaIds.length > 0 ? [...params.removedMediaIds] : undefined,
      type: typeChanged ? params.publishedType : undefined,
      mediaAlt: Object.keys(prunedAlt).length > 0 ? prunedAlt : undefined,
    },
  );
}

export interface ComposerDocumentSurfaceProps {
  readonly door: ComposerDoor;
  readonly format: DocumentFormat;
  readonly onFormatChange: (format: ComposerFormat) => void;
  /** W8 — présent seulement pour une porte `edit` ; voir `ComposerDocumentEditSource`. */
  readonly editSource?: ComposerDocumentEditSource;
  /** W8 — le canal de sauvegarde d'une édition, DISTINCT de `onPublish`. */
  readonly onSaveEdit?: (payload: ComposerDocumentEditPayload) => void;
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
 * Plafond client aligné sur la limite serveur de `mediaIds`
 * (`CreatePostSchema`/`UpdatePostSchema`, source unique
 * `@meeshy/shared/types/attachment` → `MAX_POST_MEDIA`). UN SEUL pool
 * photos+vidéos : `useAttachmentUpload` compte `selectedFiles` seul, qui
 * reflète déjà tout fichier en attente ou téléversé — la somme
 * `selectedFiles + uploadedAttachments` comptait double.
 */
const MEDIA_LIMIT = MAX_POST_MEDIA;

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
  editSource,
  onSaveEdit,
  routableFormats,
  currentUser,
  onPublish,
  armCaptureToken,
  onCaptureArmed,
  disabled = false,
  className,
}: ComposerDocumentSurfaceProps) {
  const { t } = useI18n('common');
  const isEditing = editSource !== undefined;
  const [content, setContent] = useState(() => editSource?.content ?? '');
  const [visibility, setVisibility] = useState<PostVisibility>(
    () => editSource?.visibility ?? DEFAULT_PUBLICATION_VISIBILITY,
  );
  const [visibilityUserIds, setVisibilityUserIds] = useState<string[]>(() => [
    ...(editSource?.visibilityUserIds ?? []),
  ]);
  const [showVisibilityPicker, setShowVisibilityPicker] = useState(false);
  const [isExpanded, setIsExpanded] = useState(() => isEditing);
  // Les médias EXISTANTS d'une édition — retirer un id le fait SORTIR de
  // `remainingExistingMedia`, jamais muter `editSource.media`. Toujours vide
  // en création : rien à retirer d'un brouillon qui n'a pas encore de serveur.
  const [removedMediaIds, setRemovedMediaIds] = useState<Set<string>>(() => new Set());

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
    // Un POST/RÉEL publie en `PostMedia` (via TUS), jamais en
    // `MessageAttachment` — voir `services/attachmentTransport.ts`.
    uploadContext: 'post',
  });

  // Les médias EXISTANTS encore présents — `editSource.media` moins ce que
  // l'auteur a retiré. Toujours `[]` en création (`editSource` absent).
  const remainingExistingMedia = (editSource?.media ?? []).filter((m) => !removedMediaIds.has(m.id));

  // La composition qui décide de l'éventail et de la dégradation RÉEL→POST :
  // en édition elle porte les médias EXISTANTS restants ET les fraîchement
  // téléversés — en création, seuls les seconds existent. Une seule liste,
  // jamais deux prédicats parallèles qui pourraient diverger.
  const composition: ReadonlyArray<ReelMediaLike> = isEditing
    ? [...remainingExistingMedia, ...uploadedAttachments]
    : uploadedAttachments;

  // Site UNIQUE du plafond de dix médias — `remainingExistingMedia` vaut
  // toujours `[]` hors édition (`editSource` y est `undefined`), donc
  // `totalMediaCount` DÉGÉNÈRE en `selectedFiles.length` à la création sans
  // qu'aucune branche `isEditing` n'ait besoin de le dire deux fois.
  // `mediaLimitReached` (l'AFFORDANCE — boutons grisés) et `available`
  // (l'EXÉCUTION — sélection tranchée, `handleMediaSelect` plus bas) lisent
  // tous deux CETTE valeur : les faire diverger exigerait de dupliquer le
  // calcul à nouveau, pas seulement d'éditer l'un des deux sites.
  const totalMediaCount = remainingExistingMedia.length + selectedFiles.length;
  const mediaLimitReached = totalMediaCount >= MEDIA_LIMIT;

  // `uploadedAttachments`/`composition` portent déjà la forme que le prédicat
  // partagé attend (`ReelMediaLike`) : aucune normalisation intermédiaire,
  // donc aucun second endroit où la règle du réel pourrait glisser.
  const compositionQualifies = qualifiesAsReel(composition);
  const { offeredFormats } = webComposerOpening(door, composition);
  // L'éventail ne peint que ce que l'hôte sait peindre. La table partagée n'est
  // pas rejouée ici — elle est INTERSECTÉE avec une capacité, et l'intersection
  // ne peut pas être vide tant que la surface est montée : l'hôte ne la monte
  // que sur un format qu'il route, et ce format appartient toujours à
  // `offeredFormats` (invariant du contrat).
  const selectableFormats = offeredFormats.filter((offered) => routableFormats.includes(offered));
  // La DÉGRADATION silencieuse (réel qui ne qualifie plus → POST au moment
  // d'envoyer) est le MÊME mécanisme en création et en édition — MAIS elle
  // n'est FIABLE en édition que si le client tenait, à l'HYDRATATION, une
  // composition qu'il savait COMPLÈTE et qualifiante (`editSource.media`). Un
  // repost-cite d'un RÉEL n'a AUCUN `PostMedia` propre (`repostPost` ne
  // duplique les médias que pour une source ÉPHÉMÈRE) : `editSource.media` y
  // est TOUJOURS vide alors que `editSource.postType` reste `REEL` — la
  // composition que ce formulaire connaît n'a jamais été complète, donc
  // `compositionQualifies` y vaut `false` dès l'ouverture, SANS le moindre
  // geste de l'auteur. La laisser dégrader ici enverrait `type: 'POST'` au
  // seul motif d'avoir ouvert la modale. Le retrait EXPLICITE d'un média
  // qualifiant (le cas voulu, `composer-door-edit.test.tsx`) reste couvert :
  // c'est alors `editSourceQualifies` qui était vrai, et c'est le retrait de
  // l'auteur qui fait chuter `compositionQualifies` en dessous. Toujours
  // AUCUN second garde-fou : une seule valeur, `publishedType`, affinée par
  // ce qu'`editSource` permettait de savoir dès le départ.
  const editSourceQualifies = isEditing && editSource ? qualifiesAsReel(editSource.media) : true;
  const publishedType: PostType = postTypeOf(
    format === 'reel' && (compositionQualifies || (isEditing && !editSourceQualifies)) ? 'reel' : 'post',
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

      // Même pool UNIQUE que `mediaLimitReached` (`totalMediaCount`, un seul
      // site) : à l'édition, la place restante compte aussi les médias
      // EXISTANTS non retirés — sans quoi 9 médias déjà en ligne laissaient
      // passer 10 de plus (`selectedFiles` seul valait 0), et le pool
      // franchissait le plafond serveur.
      const available = MEDIA_LIMIT - totalMediaCount;
      if (available <= 0) {
        setMediaError(t('composer.media.limitReached', { max: MEDIA_LIMIT }));
        return;
      }

      const requested = Array.from(files);
      const filesToAdd = requested.slice(0, available);
      // Pré-validation avec le même service que le hook (taille/type), pour
      // afficher le message spécifique DANS la surface plutôt que de laisser
      // le hook émettre un toast générique.
      const validation = AttachmentService.validateFiles(filesToAdd, MEDIA_LIMIT);
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
    [totalMediaCount, handleFilesSelected, t],
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
  // La transcription SERVEUR du fichier, elle, part bien depuis le lot W7bis :
  // ce composer déclare `uploadContext: 'post'`, donc `useAttachmentUpload`
  // rend des ids de `PostMedia` — la seule forme que `PostService.createPost`
  // sait réclamer, et sur laquelle il cherche son premier média audio.
  // La `duration` mesurée ici voyage AVEC le fichier (métadonnée TUS
  // `duration`, lue par `clientMeasuredMetadata` côté gateway) : l'en-tête
  // d'un WebM de `MediaRecorder` ne la porte pas, et sans elle la bulle
  // vocale resterait à 0:00.
  const handleAudioCaptured = useCallback(
    (result: AudioCaptureResult) => {
      // TROISIÈME écrivain de ce pool, après `handleMediaSelect` et le retrait
      // d'un média existant — il lit donc le MÊME `mediaLimitReached`, jamais
      // un second calcul. Le bouton BASCULE d'`AudioCapture` porte bien le
      // grisé, mais son bouton de CONFIRMATION est atteignable SANS lui :
      // `armCaptureToken` (W7) ouvre le panneau depuis le bouton rond du fil,
      // plafond atteint ou non. Une affordance grisée n'est pas une garde.
      if (mediaLimitReached) {
        setMediaError(t('composer.media.limitReached', { max: MEDIA_LIMIT }));
        return;
      }
      handleFilesSelected([result.file], [{ duration: result.durationMs }]);
    },
    [mediaLimitReached, handleFilesSelected, t],
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

  // Retirer un média EXISTANT ne le supprime PAS immédiatement — il sort de
  // `remainingExistingMedia` (dérivé), et son id atterrit dans
  // `removeMediaIds` au moment d'enregistrer. Aucun blocage « au moins un
  // média » ici : la dégradation RÉEL→POST (`publishedType`, ci-dessus) est le
  // mécanisme qui absorbe le cas « plus aucun média qualifiant » — un second
  // garde-fou qui bloquerait le geste referait ce que la dégradation fait déjà,
  // avec une UX plus pauvre (bouton désactivé plutôt qu'un format qui cède).
  const handleToggleExistingMedia = useCallback((mediaId: string) => {
    setRemovedMediaIds((prev) => {
      const next = new Set(prev);
      if (next.has(mediaId)) next.delete(mediaId);
      else next.add(mediaId);
      return next;
    });
  }, []);

  const editPayloadData = editSource
    ? editDraftPayload({
        editSource,
        content,
        visibility,
        visibilityUserIds,
        publishedType,
        newMediaIds: uploadedAttachments.map((att) => att.id),
        removedMediaIds: [...removedMediaIds],
        mediaAlt,
      })
    : undefined;

  const editHasChanges = editPayloadData !== undefined && Object.keys(editPayloadData).length > 0;

  const handleSaveEdit = useCallback(() => {
    if (!editSource || !editPayloadData || disabled) return;
    if (content.trim().length > CHAR_LIMIT) return;
    if (isAudienceIncomplete(visibility, visibilityUserIds.length)) return;
    if (!editHasChanges) return;

    onSaveEdit?.({ postId: editSource.postId, data: editPayloadData });
  }, [editSource, editPayloadData, disabled, content, visibility, visibilityUserIds, editHasChanges, onSaveEdit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (isEditing) handleSaveEdit();
        else handlePublish();
      }
    },
    // `isEditing` et `handleSaveEdit` manquaient : retirer un média EXISTANT
    // ne change ni la référence de `handlePublish` (dédiée à la CRÉATION) ni
    // aucune de SES dépendances, donc cmd+Entrée retombait sur la fermeture du
    // MONTAGE — un `handleSaveEdit` figé sur `editHasChanges === false` — et
    // n'envoyait RIEN, retrait compris.
    [isEditing, handleSaveEdit, handlePublish],
  );

  const trimmedContent = content.trim();
  const hasMedia = uploadedAttachments.length > 0;
  // En édition, un média EXISTANT non retiré compte autant qu'un média frais
  // pour la validité — un post qui n'a que des médias déjà en ligne, texte
  // effacé, reste publiable.
  const hasAnyMedia = isEditing ? totalMediaCount > 0 : hasMedia;
  const isValid = (trimmedContent.length > 0 || hasAnyMedia) && trimmedContent.length <= CHAR_LIMIT;
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
              aria-label={isEditing ? t('composer.edit.contentLabel') : t('postComposer.contentLabel')}
            />

            {isExpanded && isEditing && remainingExistingMedia.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2" data-testid="composer-existing-media">
                {remainingExistingMedia.map((media) => (
                  <div
                    key={media.id}
                    className="group relative rounded-lg overflow-hidden bg-[var(--gp-hover)]"
                  >
                    {media.mimeType.startsWith('image/') ? (
                      <img
                        src={media.thumbnailUrl ?? media.fileUrl}
                        alt={media.alt ?? ''}
                        className="h-16 w-16 object-cover"
                      />
                    ) : (
                      <div className="flex h-16 w-16 items-center justify-center text-2xl">
                        {media.mimeType.startsWith('video/') ? '🎬' : media.mimeType.startsWith('audio/') ? '🎵' : '📄'}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => handleToggleExistingMedia(media.id)}
                      disabled={disabled}
                      className={cn(
                        'absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full',
                        'bg-red-500 text-white text-xs opacity-0 group-hover:opacity-100',
                        'transition-opacity duration-200',
                      )}
                      aria-label={t('composer.edit.removeMedia')}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

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

            {isExpanded && !isEditing && uploadedAttachments.length > 0 && (
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

                  {/* Loi 3 — le formulaire d'édition ne rend jamais le jeu
                      AUTORITAIRE des références déclarées (le `select` du fil
                      les écarte silencieuses) : un contrôle qui ne peut avoir
                      aucun effet ne se peint pas (loi 4). */}
                  {!isEditing && (
                    <ReferencePicker
                      references={references}
                      onChange={handlePickReference}
                      onRemove={drop}
                      modes={REFERENCE_MODES}
                      open={referencePickerOpen}
                      onOpenChange={setReferencePickerOpen}
                    />
                  )}

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
                  onClick={isEditing ? handleSaveEdit : handlePublish}
                  disabled={
                    isEditing
                      ? !isValid ||
                        disabled ||
                        !editHasChanges ||
                        isAudienceIncomplete(visibility, visibilityUserIds.length)
                      : !isValid ||
                        disabled ||
                        isUploading ||
                        isAudienceIncomplete(visibility, visibilityUserIds.length)
                  }
                >
                  {isEditing ? t('save') : isUploading ? t('uploading') : t('publish')}
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

            {isExpanded && !isEditing && references.length > 0 && (
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
