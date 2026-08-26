/**
 * Hook de gestion des uploads d'attachments
 * Gère: sélection, compression, upload, drag & drop, validation
 *
 * @module hooks/composer/useAttachmentUpload
 */

'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { resolveAttachmentTransport, type AttachmentUploadContext } from '@/services/attachmentTransport';
import { compressMultipleFiles, needsCompression } from '@/utils/media-compression';
import {
  UploadedAttachmentResponse,
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_CONCURRENT_UPLOADS,
} from '@meeshy/shared/types/attachment';
import { mapWithConcurrency, chunk } from '@meeshy/shared/utils/concurrency';

interface CompressionProgress {
  progress: number;
  status: string;
}

interface BatchProgress {
  current: number;
  total: number;
  currentBatch: number;
  totalBatches: number;
}

interface UseAttachmentUploadOptions {
  /** Token d'authentification */
  token?: string;
  /**
   * Contexte d'upload — ABSENT (défaut) = transport MESSAGE, inchangé.
   * Un composer de publication (post/reel/story/status) le déclare pour que
   * ses médias voyagent en `PostMedia` (via TUS) plutôt qu'en
   * `MessageAttachment` : voir `services/attachmentTransport.ts`.
   */
  uploadContext?: AttachmentUploadContext;
  /** Limite maximale d'attachments */
  maxAttachments?: number;
  /** Callback quand les attachments changent */
  onAttachmentsChange?: (ids: string[], mimeTypes: string[]) => void;
  /** Fonction de traduction */
  t?: (key: string, options?: any) => string;
  /** Taille des batches pour upload multiple */
  batchSize?: number;
  /**
   * Callback appelé quand un upload échoue en cours de traitement (réseau,
   * timeout...). Additif — le toast interne existant reste émis pour les
   * appelants qui ne consomment pas cette API.
   */
  onUploadError?: (message: string) => void;
}

interface UseAttachmentUploadReturn {
  /** Fichiers sélectionnés (pour prévisualisation) */
  selectedFiles: File[];
  /** Attachments uploadés (avec IDs serveur) */
  uploadedAttachments: UploadedAttachmentResponse[];
  /** Upload en cours */
  isUploading: boolean;
  /** Compression en cours */
  isCompressing: boolean;
  /** Drag over actif */
  isDragOver: boolean;
  /** Progression de l'upload par index */
  uploadProgress: Record<number, number>;
  /** Progression de la compression par index */
  compressionProgress: Record<number, CompressionProgress>;
  /** Progression du batch upload */
  batchProgress: BatchProgress;
  /** Afficher la modale de limite */
  showAttachmentLimitModal: boolean;
  /** Nombre de fichiers tentés */
  attemptedCount: number;
  /** Dernier message d'erreur d'upload (mid-upload), `null` si aucun/résolu */
  uploadError: string | null;
  /** Ajouter des fichiers */
  handleFilesSelected: (files: File[], metadata?: any[]) => Promise<void>;
  /** Supprimer un fichier */
  handleRemoveFile: (index: number) => Promise<void>;
  /** Effacer tous les attachments */
  clearAttachments: () => void;
  /** Créer un attachment texte */
  handleCreateTextAttachment: (text: string) => Promise<void>;
  /** Handlers drag & drop */
  handleDragEnter: (e: React.DragEvent) => void;
  handleDragLeave: (e: React.DragEvent) => void;
  handleDragOver: (e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent) => Promise<void>;
  /** Handler pour le file input */
  handleFileInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** Fermer la modale de limite */
  closeAttachmentLimitModal: () => void;
  /** Ref pour l'input file */
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  /** Handler pour clic sur bouton attachment */
  handleAttachmentClick: () => void;
}

// Constantes
// Plafond partagé (199) — un composer plein doit franchir le validator et les
// deux schémas du gateway, qui lisent la même constante. Une valeur locale de
// 50 bornait le web sous le plafond produit sans que rien ne le signale.
const MAX_ATTACHMENTS_DEFAULT = MAX_ATTACHMENTS_PER_MESSAGE;
const MEDIA_DURATION_EXTRACTION_TIMEOUT_MS = 4000;

type AttachmentSelectionMetadata = Record<string, unknown> & { duration?: number };
type AttachmentSelectionMetadataList = Array<AttachmentSelectionMetadata | undefined>;

/** Clé i18n du conseil « réduisez le nombre de pièces jointes ». */
const REDUCE_HINT_KEY = 'attachmentUploadFailure.reduceCount';

/**
 * Complète un message d'échec d'envoi par un conseil actionnable : réduire le
 * nombre de pièces jointes et réessayer. Un échec sur un envoi de 150 pièces
 * n'a pas le même remède qu'un échec sur une pièce isolée — le dire évite à
 * l'utilisateur de rejouer à l'identique le même envoi trop lourd.
 *
 * Silencieux sur un envoi d'une seule pièce (réduire n'y veut rien dire), et
 * silencieux si `t` est l'identité (défaut du hook, hors contexte i18n) —
 * sinon la clé brute s'afficherait à l'utilisateur.
 */
export function withReduceAttachmentsHint(
  message: string,
  attachmentCount: number,
  t: (key: string, options?: any) => string
): string {
  if (attachmentCount < 2) return message;
  const hint = t(REDUCE_HINT_KEY, { count: attachmentCount });
  if (!hint || hint === REDUCE_HINT_KEY) return message;
  return `${message} ${hint}`;
}

function isDurationEligibleFile(file: File): boolean {
  return file.type.startsWith('video/') || file.type.startsWith('audio/');
}

/**
 * Extrait la durée (en millisecondes, contrat gateway — voir
 * packages/shared/types/attachment.ts:197) d'un fichier vidéo/audio via un
 * élément média caché monté sur une object URL et l'évènement
 * `loadedmetadata`. Timeout court : ne bloque JAMAIS l'upload — résout
 * `undefined` sur erreur/timeout plutôt que de rejeter.
 */
function extractMediaDurationMs(file: File): Promise<number | undefined> {
  if (!isDurationEligibleFile(file) || typeof document === 'undefined') {
    return Promise.resolve(undefined);
  }

  return new Promise((resolve) => {
    const tagName = file.type.startsWith('video/') ? 'video' : 'audio';
    const element = document.createElement(tagName) as HTMLMediaElement;
    const objectUrl = URL.createObjectURL(file);
    let settled = false;

    const finish = (durationMs: number | undefined) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      element.removeEventListener('loadedmetadata', onLoadedMetadata);
      element.removeEventListener('error', onError);
      URL.revokeObjectURL(objectUrl);
      resolve(durationMs);
    };

    const onLoadedMetadata = () => {
      const seconds = element.duration;
      finish(Number.isFinite(seconds) && seconds >= 0 ? Math.round(seconds * 1000) : undefined);
    };

    const onError = () => finish(undefined);

    const timeoutId = setTimeout(() => finish(undefined), MEDIA_DURATION_EXTRACTION_TIMEOUT_MS);

    element.addEventListener('loadedmetadata', onLoadedMetadata);
    element.addEventListener('error', onError);
    element.preload = 'metadata';
    element.src = objectUrl;
  });
}

/**
 * Construit le tableau de métadonnées par fichier envoyé à l'upload, en
 * fusionnant la durée extraite côté client (vidéo/audio) avec les
 * métadonnées éventuellement fournies par l'appelant (ex: audioEffectsTimeline
 * du recorder audio). Ne fabrique jamais de tableau si ni l'appelant ni
 * l'extraction n'ont produit la moindre donnée — préserve `undefined` pour un
 * comportement identique à avant sur les sélections sans média temporel.
 */
async function buildUploadMetadata(
  files: File[],
  provided?: AttachmentSelectionMetadataList,
): Promise<AttachmentSelectionMetadataList | undefined> {
  const durations = await Promise.all(files.map(extractMediaDurationMs));
  const hasExtractedDuration = durations.some((duration) => duration !== undefined);

  if (!hasExtractedDuration) {
    return provided;
  }

  return files.map((_file, index) => {
    const entry = provided?.[index];
    const duration = durations[index];
    if (duration === undefined) {
      return entry;
    }
    return { ...entry, duration: entry?.duration ?? duration };
  });
}

/**
 * Génère une signature unique pour un fichier
 */
function getFileSignature(file: File): string {
  return `${file.name}_${file.size}_${file.lastModified}`;
}

/**
 * Le fichier envoyé et l'attachment qu'il est devenu — l'appariement dont
 * DEUX questions dépendent, et qui n'existait qu'en creux dans une seule
 * d'entre elles : « qui a échoué ? » (rollback) et « qui l'utilisateur
 * a-t-il retiré pendant qu'il volait ? » (relâchement serveur).
 */
type UploadPairing = {
  readonly paired: ReadonlyArray<{ file: File; attachment: UploadedAttachmentResponse }>;
  readonly failed: readonly File[];
};

/**
 * Apparie les fichiers envoyés aux attachments que le serveur a réellement
 * rendus — et, ce faisant, nomme ceux qui ont ÉCHOUÉ. Nécessaire car
 * `UploadProcessor.uploadMultiple` avale les échecs par fichier et renvoie un
 * tableau `attachments` plus court (voire vide) sous `success: true` — la
 * route `/attachments/upload` répond toujours `sendSuccess`, donc
 * `response.success` seul ne détecte rien. Le transport POST rend la même
 * forme, pour la même raison (`uploadFilesSettled`).
 *
 * Apparie chaque fichier envoyé au premier attachment retourné dont
 * `originalName` correspond (par ordre, une seule consommation par match) ;
 * tout fichier n'ayant trouvé aucune correspondance est considéré échoué et
 * retourné pour rollback. Corrélation par nom uniquement (le serveur ne
 * renvoie aucun index d'origine) — fiable dans le cas courant (noms
 * uniques dans une même sélection) ; en cas d'homonymes, l'appariement par
 * ordre reste déterministe et conservateur (jamais un match fantaisiste).
 */
function pairUploads(
  files: readonly File[],
  succeededAttachments: readonly UploadedAttachmentResponse[],
): UploadPairing {
  const pool = [...succeededAttachments];
  const paired: Array<{ file: File; attachment: UploadedAttachmentResponse }> = [];
  const failed: File[] = [];

  files.forEach((file) => {
    const matchIndex = pool.findIndex((attachment) => attachment.originalName === file.name);
    if (matchIndex === -1) {
      failed.push(file);
      return;
    }
    paired.push({ file, attachment: pool[matchIndex] });
    pool.splice(matchIndex, 1);
  });

  return { paired, failed };
}

/**
 * Génère un nom de fichier texte avec timestamp
 */
function generateTextFileName(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `presspaper-content-${year}${month}${day}-${hours}${minutes}${seconds}.txt`;
}

/**
 * Hook pour gérer les uploads d'attachments
 */
export function useAttachmentUpload({
  token,
  uploadContext,
  maxAttachments = MAX_ATTACHMENTS_DEFAULT,
  onAttachmentsChange,
  t = (key: string) => key,
  batchSize = 10,
  onUploadError,
}: UseAttachmentUploadOptions = {}): UseAttachmentUploadReturn {
  // `uploadContext` ABSENT ⇒ transport MESSAGE — un enrobage littéral des
  // appels `AttachmentService` d'aujourd'hui. C'est le défaut : tout composer
  // qui ne le déclare pas (le composer de message) ne traverse aucune ligne
  // neuve. Voir `attachmentTransport.ts`.
  const transport = useMemo(() => resolveAttachmentTransport(uploadContext), [uploadContext]);

  // États
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadedAttachments, setUploadedAttachments] = useState<UploadedAttachmentResponse[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<number, number>>({});
  const [compressionProgress, setCompressionProgress] = useState<Record<number, CompressionProgress>>({});
  const [batchProgress, setBatchProgress] = useState<BatchProgress>({
    current: 0,
    total: 0,
    currentBatch: 0,
    totalBatches: 0,
  });
  const [showAttachmentLimitModal, setShowAttachmentLimitModal] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [attemptedCount, setAttemptedCount] = useState(0);

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadedAttachmentsRef = useRef<UploadedAttachmentResponse[]>([]);
  const lastNotifiedIdsStringRef = useRef<string>('');
  /**
   * Les fichiers que l'utilisateur a RETIRÉS pendant que leur téléversement
   * volait encore. À ce moment-là leur id n'existe pas : `handleRemoveFile`
   * n'a rien à relâcher et la vignette part seule — puis l'arrivée du lot
   * ajoutait TOUT, retiré compris, et le média retiré était PUBLIÉ. Ces
   * fichiers sont donc écartés à l'arrivée, et leur ligne relâchée.
   *
   * Un `Set` de `File` : l'identité de l'objet, jamais un index — les index
   * bougent sous les retraits suivants.
   */
  const inFlightRemovalsRef = useRef<Set<File>>(new Set());

  // Sync ref avec state
  useEffect(() => {
    uploadedAttachmentsRef.current = uploadedAttachments;
  }, [uploadedAttachments]);

  // Mémoriser les IDs pour éviter re-renders
  const attachmentIdsString = useMemo(() => {
    return JSON.stringify(uploadedAttachments.map(att => att.id));
  }, [uploadedAttachments]);

  // Notifier le parent quand les attachments changent
  useEffect(() => {
    if (attachmentIdsString === lastNotifiedIdsStringRef.current) {
      return;
    }

    const currentAttachments = uploadedAttachmentsRef.current;
    const attachmentIds = currentAttachments.map(att => att.id);
    const mimeTypes = currentAttachments.map(att => att.mimeType);

    if (onAttachmentsChange) {
      onAttachmentsChange(attachmentIds, mimeTypes);
    }

    lastNotifiedIdsStringRef.current = attachmentIdsString;
  }, [attachmentIdsString, onAttachmentsChange]);

  /**
   * Ce qu'un lot arrivé donne réellement à l'écran.
   *
   * Deux choses que « pousser les attachments » ne dit pas :
   * - un fichier RETIRÉ pendant son vol ne doit pas entrer (il serait publié
   *   alors que sa vignette a disparu de l'écran) ;
   * - sa ligne serveur, elle, EXISTE déjà — il faut la relâcher, sans quoi
   *   elle reste orpheline (le balayage quotidien du gateway est le filet de
   *   sécurité, pas le premier recours).
   *
   * Ne pousse RIEN lui-même : l'ordre d'insertion dans `uploadedAttachments`
   * est celui de la SÉLECTION, et seul l'appelant sait quand il le tient (les
   * lots parallèles s'achèvent dans le désordre).
   */
  const settleUploadedBatch = useCallback(
    (files: readonly File[], succeededAttachments: readonly UploadedAttachmentResponse[]) => {
      const { paired, failed } = pairUploads(files, succeededAttachments);
      const removals = inFlightRemovalsRef.current;

      const kept: UploadedAttachmentResponse[] = [];
      paired.forEach(({ file, attachment }) => {
        if (!removals.has(file)) {
          kept.push(attachment);
          return;
        }
        removals.delete(file);
        void transport.remove(attachment.id, token).catch((error) => {
          console.error('❌ Relâchement du média retiré en vol impossible:', error);
        });
      });

      return { kept, failed };
    },
    [token, transport],
  );

  // Upload en lots PARALLÈLES bornés.
  //
  // Les lots partaient en séquence : 199 fichiers = 20 requêtes l'une après
  // l'autre, chacune attendant la précédente. `MAX_CONCURRENT_UPLOADS` lots
  // volent désormais ensemble (le même plafond que le service TUS), ce qui
  // divise l'attente sans ouvrir 20 connexions d'un coup.
  const uploadFilesInBatches = useCallback(async (
    files: File[],
    additionalMetadata: AttachmentSelectionMetadataList | undefined,
    /**
     * Index de CE lot dans `selectedFiles` — les surfaces lisent
     * `uploadProgress[index]` avec l'index de la VIGNETTE, jamais celui du
     * fichier dans l'appel. Sans ce décalage, la deuxième sélection écrase la
     * progression des vignettes de la première.
     */
    progressBase: number,
  ) => {
    const totalFiles = files.length;
    const batches = chunk(files, batchSize).map((batchFiles, batchIndex) => {
      const start = batchIndex * batchSize;
      return {
        files: batchFiles,
        start,
        metadata: additionalMetadata?.slice(start, start + batchFiles.length),
      };
    });

    setBatchProgress({
      current: 0,
      total: totalFiles,
      currentBatch: 0,
      totalBatches: batches.length,
    });

    let completedBatches = 0;
    let uploadedCount = 0;

    const perBatchAttachments = await mapWithConcurrency(
      batches,
      MAX_CONCURRENT_UPLOADS,
      async (batch, batchIndex) => {
        try {
          const response = await transport.upload(
            batch.files,
            token,
            batch.metadata,
            (fileIndex, percentage) => {
              // Le transport MESSAGE fait déjà suivre le même pourcentage à
              // CHAQUE fichier du lot (une requête multipart n'expose pas de
              // granularité par fichier) ; le transport POST relaie une
              // progression PAR fichier (TUS). Dans les deux cas, l'index
              // reçu porte sur CE lot — décalé par `batch.start` ici.
              setUploadProgress(prev => ({ ...prev, [progressBase + batch.start + fileIndex]: percentage }));
            }
          );

          const attachments = response.attachments || (response as any).data?.attachments;
          const succeededAttachments = response.success && attachments ? attachments : [];

          // La route répond toujours success:true (sendSuccess) même quand
          // UploadProcessor.uploadMultiple a avalé des échecs par fichier et
          // renvoyé un tableau plus court — response.success seul ne le
          // détecte pas. Réconcilier par nom pour purger précisément les
          // fichiers de CE lot qui n'ont pas d'attachment correspondant, et
          // écarter au passage ceux que l'utilisateur a retirés en vol.
          const { kept, failed: failedFiles } = settleUploadedBatch(batch.files, succeededAttachments);
          if (failedFiles.length > 0) {
            console.warn(`⚠️ Batch ${batchIndex + 1}: ${failedFiles.length}/${batch.files.length} fichier(s) non uploadé(s) (réponse serveur incomplète)`, response);
            const message = withReduceAttachmentsHint(
              `${failedFiles.length} fichier(s) sur ${batch.files.length} n'ont pas pu être uploadé(s).`,
              totalFiles,
              t
            );
            setUploadError(message);
            onUploadError?.(message);
            setSelectedFiles(prev => prev.filter((f) => !failedFiles.includes(f)));
          }

          return kept;
        } catch (error) {
          console.error(`❌ Batch ${batchIndex + 1} upload error:`, error);
          const message = withReduceAttachmentsHint(
            error instanceof Error ? error.message : 'Upload failed. Please try again.',
            totalFiles,
            t
          );
          setUploadError(message);
          onUploadError?.(message);
          setSelectedFiles(prev => prev.filter((f) => !batch.files.includes(f)));
          return [] as UploadedAttachmentResponse[];
        } finally {
          // Les lots s'achèvent dans le désordre : compter les achèvements,
          // jamais l'index du lot courant.
          completedBatches += 1;
          uploadedCount += batch.files.length;
          setBatchProgress(prev => ({
            ...prev,
            current: uploadedCount,
            currentBatch: completedBatches,
          }));
        }
      }
    );

    // `mapWithConcurrency` rend les résultats dans l'ordre des lots : les
    // pièces restent dans l'ordre de sélection malgré le parallélisme — et cet
    // ordre est celui que `mediaIds` porte jusqu'à `PostMedia.order`.
    const allUploadedAttachments = perBatchAttachments.flat();
    if (allUploadedAttachments.length > 0) {
      setUploadedAttachments(prev => [...prev, ...allUploadedAttachments]);
    }

    // Reset progress
    setBatchProgress({
      current: 0,
      total: 0,
      currentBatch: 0,
      totalBatches: 0,
    });
  }, [batchSize, token, onUploadError, t, transport, settleUploadedBatch]);

  // Ajouter des fichiers
  const handleFilesSelected = useCallback(async (files: File[], additionalMetadata?: any) => {
    if (files.length === 0) return;

    setUploadError(null);

    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    console.log(`📎 Traitement de ${files.length} fichier(s) (${(totalSize / (1024 * 1024)).toFixed(1)}MB)`);

    // Filtrer les doublons
    const existingFileSignatures = new Set([
      ...selectedFiles.map(getFileSignature),
      ...uploadedAttachments.map(att => `${att.originalName}_${att.fileSize}_${new Date(att.createdAt).getTime()}`)
    ]);

    const uniqueFiles = files.filter(file => {
      const signature = getFileSignature(file);
      const isDuplicate = existingFileSignatures.has(signature);
      if (isDuplicate) {
        console.log(`❌ DOUBLON: ${file.name}`);
      }
      return !isDuplicate;
    });

    if (uniqueFiles.length < files.length) {
      const duplicateCount = files.length - uniqueFiles.length;
      toast.warning(
        duplicateCount === 1
          ? t('attachmentDuplicate.single')
          : t('attachmentDuplicate.multiple', { count: duplicateCount })
      );
    }

    if (uniqueFiles.length === 0) {
      return;
    }

    // Validation des fichiers vides
    const emptyFiles = uniqueFiles.filter(f => f.size === 0);
    if (emptyFiles.length > 0) {
      console.error('❌ Fichiers vides détectés:', emptyFiles.map(f => f.name));
      toast.error(`Fichier(s) vide(s) détecté(s): ${emptyFiles.map(f => f.name).join(', ')}`);
      const nonEmptyFiles = uniqueFiles.filter(f => f.size > 0);
      if (nonEmptyFiles.length === 0) {
        return;
      }
      uniqueFiles.splice(0, uniqueFiles.length, ...nonEmptyFiles);
    }

    // Vérifier la limite — `selectedFiles` est la SEULE source de vérité :
    // il contient déjà tout fichier en attente OU uploadé avec succès
    // (jamais purgé au succès, purgé sur échec — cf. rollback plus bas),
    // donc l'additionner à `uploadedAttachments.length` double le compte en
    // régime établi (N + N au lieu de N).
    const currentTotalAttachments = selectedFiles.length;
    const newTotalAttachments = currentTotalAttachments + uniqueFiles.length;

    if (newTotalAttachments > maxAttachments) {
      console.log(`❌ Limite dépassée: ${newTotalAttachments}/${maxAttachments} attachements`);
      setAttemptedCount(newTotalAttachments);
      setShowAttachmentLimitModal(true);
      return;
    }

    // Valider les fichiers — les règles DIFFÈRENT selon le transport (le
    // plafond de nombre, pas la taille : voir `attachmentTransport.ts`).
    const validation = transport.validate(uniqueFiles);
    if (!validation.valid) {
      console.error('❌ Validation échouée:', validation.errors);
      validation.errors.forEach(error => {
        toast.error(error);
      });
      return;
    }

    // Compression si nécessaire
    const filesToCompress = uniqueFiles.filter(f => needsCompression(f));
    if (filesToCompress.length > 0) {
      console.log(`🗜️ ${filesToCompress.length} fichier(s) nécessite(nt) une compression`);
      setIsCompressing(true);
      setCompressionProgress({});

      try {
        const compressedFiles = await compressMultipleFiles(uniqueFiles, (fileIndex, progress, status) => {
          setCompressionProgress(prev => ({
            ...prev,
            [fileIndex]: { progress, status }
          }));
        });

        uniqueFiles.splice(0, uniqueFiles.length, ...compressedFiles);

        const compressedSize = compressedFiles.reduce((sum, f) => sum + f.size, 0);
        const savedSize = totalSize - compressedSize;
        if (savedSize > 0) {
          toast.success(`Compression réussie ! ${(savedSize / (1024 * 1024)).toFixed(1)}MB économisés`);
        }
      } catch (error) {
        console.error('❌ Erreur compression:', error);
        toast.error('Erreur lors de la compression, fichiers originaux utilisés');
      } finally {
        setIsCompressing(false);
        setCompressionProgress({});
      }
    }

    // Index de la PREMIÈRE vignette de cette sélection. Les surfaces lisent
    // `uploadProgress[index]` avec l'index de la vignette dans `selectedFiles` ;
    // les transports, eux, comptent à partir de 0 sur les fichiers de LEUR
    // appel. Sans ce décalage, la deuxième sélection écrit sa progression sur
    // les vignettes de la première.
    const progressBase = selectedFiles.length;

    // Update UI avec les fichiers
    setSelectedFiles(prev => [...prev, ...uniqueFiles]);
    setIsUploading(true);

    try {
      // Durée média (vidéo/audio) extraite côté client, fusionnée aux
      // métadonnées éventuellement fournies par l'appelant, avant l'upload —
      // débloque le toggle Réel et la duration des stories (Task 7, point 1).
      // Faite APRÈS setIsUploading(true) (et non avant) pour que l'état
      // "upload en cours" reste synchrone à l'appel, avant tout `await`.
      const metadataForUpload = await buildUploadMetadata(uniqueFiles, additionalMetadata);

      if (uniqueFiles.length > batchSize) {
        console.log(`📦 Upload en batches: ${uniqueFiles.length} fichiers (${Math.ceil(uniqueFiles.length / batchSize)} batches)`);
        await uploadFilesInBatches(uniqueFiles, metadataForUpload, progressBase);
      } else {
        const response = await transport.upload(
          uniqueFiles,
          token,
          metadataForUpload,
          (fileIndex, percentage) => {
            // Le transport MESSAGE fait déjà suivre le même pourcentage à
            // CHAQUE fichier (une requête multipart n'expose pas de
            // granularité par fichier) ; le transport POST relaie une
            // progression PAR fichier (TUS) — `fileIndex` sert dans les
            // deux cas.
            setUploadProgress(prev => ({ ...prev, [progressBase + fileIndex]: percentage }));
          }
        );

        // Support both { attachments: [...] } and { data: { attachments: [...] } } response formats
        const attachments = response.attachments || (response as any).data?.attachments;
        const succeededAttachments = response.success && attachments ? attachments : [];
        // Écarte les fichiers retirés PENDANT leur vol (et relâche leur ligne
        // serveur) avant de pousser quoi que ce soit à l'écran.
        const { kept, failed: failedFiles } = settleUploadedBatch(uniqueFiles, succeededAttachments);
        if (kept.length > 0) {
          console.log(`✅ Upload réussi: ${kept.length} fichier(s)`);
          setUploadedAttachments(prev => [...prev, ...kept]);
        }

        // La route /attachments/upload répond toujours success:true (sendSuccess),
        // même quand UploadProcessor.uploadMultiple a avalé des échecs par
        // fichier côté serveur et renvoyé moins d'attachments que de fichiers
        // envoyés (voire aucun) — `response.success` seul ne détecte donc pas
        // cette perte silencieuse. Réconcilier par nom pour purger précisément
        // les fichiers sans attachment correspondant (Task 7 review, Important #2).
        if (failedFiles.length > 0) {
          console.warn('⚠️ Upload partiellement ou totalement échoué côté serveur:', response);
          const message = withReduceAttachmentsHint(
            uniqueFiles.length === 1
              ? 'Upload failed. Please try again.'
              : `${failedFiles.length} fichier(s) sur ${uniqueFiles.length} n'ont pas pu être uploadé(s).`,
            uniqueFiles.length,
            t
          );
          toast.error(message);
          setUploadError(message);
          onUploadError?.(message);
          setSelectedFiles(prev => prev.filter((f) => !failedFiles.includes(f)));
        }
      }
    } catch (error) {
      console.error('❌ Upload error:', error);
      const message = withReduceAttachmentsHint(
        error instanceof Error ? error.message : 'Upload failed. Please try again.',
        uniqueFiles.length,
        t
      );
      toast.error(
        error instanceof Error
          ? withReduceAttachmentsHint(`Upload failed: ${error.message}`, uniqueFiles.length, t)
          : message
      );
      setUploadError(message);
      onUploadError?.(message);
      // Symétrie avec handleCreateTextAttachment: purger les fichiers de CETTE
      // sélection de selectedFiles pour que le compteur (source de vérité
      // unique — voir plus haut) ne dérive pas après un échec réseau.
      setSelectedFiles(prev => prev.filter((f) => !uniqueFiles.includes(f)));
    } finally {
      // Cette sélection est SOLDÉE : plus aucune arrivée ne peut porter ses
      // fichiers. `settleUploadedBatch` n'efface la note que des fichiers
      // APPARIÉS — un lot qui rejette en bloc n'apparie rien, et la note
      // resterait collée à l'objet `File`, écartant en silence toute nouvelle
      // tentative avec le même.
      uniqueFiles.forEach((file) => inFlightRemovalsRef.current.delete(file));
      setIsUploading(false);
    }
  }, [token, selectedFiles, uploadedAttachments, maxAttachments, t, batchSize, uploadFilesInBatches, onUploadError, transport, settleUploadedBatch]);

  // Créer un attachment texte
  const handleCreateTextAttachment = useCallback(async (text: string) => {
    if (!text) return;

    setIsUploading(true);
    try {
      const fileName = generateTextFileName();
      const textFile = new File([text], fileName, { type: 'text/plain' });

      setSelectedFiles(prev => [...prev, textFile]);

      // Par le TRANSPORT, comme l'upload et la suppression : `uploadText` crée
      // un `MessageAttachment`, dont l'id serait irréclamable par `mediaIds`
      // et introuvable par la route de relâchement `PostMedia`. Le transport
      // de publication refuse donc explicitement — mieux qu'une pièce jointe
      // qui disparaît en silence à la publication.
      const attachment = await transport.createTextAttachment(text, token);
      if (attachment) {
        setUploadedAttachments(prev => [...prev, attachment]);
      }
    } catch (error) {
      console.error('❌ Erreur création text attachment:', error);
      setSelectedFiles(prev => prev.slice(0, -1));
    } finally {
      setIsUploading(false);
    }
  }, [token, transport]);

  // Supprimer un fichier
  const handleRemoveFile = useCallback(async (index: number) => {
    const attachmentToDelete = uploadedAttachments[index];
    const fileToRemove = selectedFiles[index];

    if (attachmentToDelete?.id) {
      try {
        await transport.remove(attachmentToDelete.id, token);
      } catch (error) {
        console.error('❌ Erreur suppression attachment:', error);
        toast.error('Impossible de supprimer le fichier');
        return;
      }
    } else if (fileToRemove) {
      // Retrait EN VOL : l'id n'existe pas encore ici, donc il n'y a rien à
      // relâcher MAINTENANT. Sans cette note, l'arrivée du lot rajoutait le
      // fichier retiré à `uploadedAttachments` — donc à `mediaIds` — et le
      // média disparu de l'écran était PUBLIÉ. Voir `settleUploadedBatch`.
      inFlightRemovalsRef.current.add(fileToRemove);
    }

    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    setUploadedAttachments(prev => prev.filter((_, i) => i !== index));
    // Les clés de progression indexent les VIGNETTES : elles doivent glisser
    // avec elles, sans quoi le pourcentage d'un fichier s'affiche sur son
    // voisin dès le premier retrait.
    setUploadProgress(prev => {
      const shifted: Record<number, number> = {};
      Object.entries(prev).forEach(([key, percentage]) => {
        const position = Number(key);
        if (position === index) return;
        shifted[position > index ? position - 1 : position] = percentage;
      });
      return shifted;
    });
  }, [uploadedAttachments, selectedFiles, token, transport]);

  // Effacer tous les attachments
  const clearAttachments = useCallback(() => {
    // Ne relâche RIEN côté serveur, volontairement : les trois composers
    // n'appellent `clearAttachments` que DANS `handlePublish`, juste après
    // avoir remis `mediaIds` — relâcher là courrait après la publication qu'on
    // vient de demander. Les médias qu'un composer abandonne sans publier sont
    // moissonnés côté gateway (`sweepPendingPostMedia`, balayage journalier) :
    // c'est le seul endroit qui survive à un onglet fermé ou un réseau coupé.
    inFlightRemovalsRef.current.clear();
    setSelectedFiles([]);
    setUploadedAttachments([]);
    setUploadProgress({});
    setUploadError(null);
  }, []);

  // Handlers drag & drop
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    await handleFilesSelected(files);
  }, [handleFilesSelected]);

  // Handler pour le file input
  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = '';

    if (files.length > 0) {
      const totalSize = files.reduce((sum, f) => sum + f.size, 0);
      const sizeMB = (totalSize / (1024 * 1024)).toFixed(1);
      console.log(`📱 Fichier(s) sélectionné(s): ${files.map(f => f.name).join(', ')} (${sizeMB}MB)`);

      if (totalSize > 50 * 1024 * 1024) {
        toast.info(`Préparation de ${files.length} fichier(s) (${sizeMB}MB)...`, { duration: 2000 });
      }
    }

    setTimeout(() => {
      handleFilesSelected(files);
    }, 0);
  }, [handleFilesSelected]);

  // Handler pour clic sur bouton attachment
  const handleAttachmentClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // Fermer la modale de limite
  const closeAttachmentLimitModal = useCallback(() => {
    setShowAttachmentLimitModal(false);
    setAttemptedCount(0);
  }, []);

  return {
    selectedFiles,
    uploadedAttachments,
    isUploading,
    isCompressing,
    isDragOver,
    uploadProgress,
    compressionProgress,
    batchProgress,
    showAttachmentLimitModal,
    attemptedCount,
    uploadError,
    handleFilesSelected,
    handleRemoveFile,
    clearAttachments,
    handleCreateTextAttachment,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handleFileInputChange,
    closeAttachmentLimitModal,
    fileInputRef,
    handleAttachmentClick,
  };
}
