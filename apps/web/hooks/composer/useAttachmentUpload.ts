/**
 * Hook de gestion des uploads d'attachments
 * Gère: sélection, compression, upload, drag & drop, validation
 *
 * @module hooks/composer/useAttachmentUpload
 */

'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { AttachmentService } from '@/services/attachmentService';
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
 * Réconcilie les fichiers envoyés avec les attachments effectivement échoués
 * par la réponse serveur. Nécessaire car `UploadProcessor.uploadMultiple`
 * avale les échecs par fichier et renvoie un tableau `attachments` plus court
 * (voire vide) sous `success: true` — la route `/attachments/upload` répond
 * toujours `sendSuccess`, donc `response.success` seul ne détecte rien.
 *
 * Apparie chaque fichier envoyé au premier attachment retourné dont
 * `originalName` correspond (par ordre, une seule consommation par match) ;
 * tout fichier n'ayant trouvé aucune correspondance est considéré échoué et
 * retourné pour rollback. Corrélation par nom uniquement (le serveur ne
 * renvoie aucun index d'origine) — fiable dans le cas courant (noms
 * uniques dans une même sélection) ; en cas d'homonymes, l'appariement par
 * ordre reste déterministe et conservateur (jamais un match fantaisiste).
 */
function reconcileUploadFailures(
  files: readonly File[],
  succeededAttachments: readonly UploadedAttachmentResponse[],
): File[] {
  const remainingNames = succeededAttachments.map((attachment) => attachment.originalName);
  return files.filter((file) => {
    const matchIndex = remainingNames.indexOf(file.name);
    if (matchIndex === -1) {
      return true;
    }
    remainingNames.splice(matchIndex, 1);
    return false;
  });
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
  maxAttachments = MAX_ATTACHMENTS_DEFAULT,
  onAttachmentsChange,
  t = (key: string) => key,
  batchSize = 10,
  onUploadError,
}: UseAttachmentUploadOptions = {}): UseAttachmentUploadReturn {
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

  // Upload en lots PARALLÈLES bornés.
  //
  // Les lots partaient en séquence : 199 fichiers = 20 requêtes l'une après
  // l'autre, chacune attendant la précédente. `MAX_CONCURRENT_UPLOADS` lots
  // volent désormais ensemble (le même plafond que le service TUS), ce qui
  // divise l'attente sans ouvrir 20 connexions d'un coup.
  const uploadFilesInBatches = useCallback(async (files: File[], additionalMetadata?: AttachmentSelectionMetadataList) => {
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
          const response = await AttachmentService.uploadFiles(
            batch.files,
            token,
            batch.metadata,
            (percentage) => {
              // La progression d'un lot vaut pour CHAQUE fichier qu'il porte :
              // une requête multipart n'expose pas de granularité par fichier.
              // Ce callback indexait par numéro de LOT alors que la pastille de
              // chaque vignette lit `uploadProgress[indexDuFichier]` — seule la
              // première vignette bougeait, les autres restaient vides.
              setUploadProgress(prev => {
                const next = { ...prev };
                for (let offset = 0; offset < batch.files.length; offset++) {
                  next[batch.start + offset] = percentage;
                }
                return next;
              });
            }
          );

          const attachments = response.attachments || (response as any).data?.attachments;
          const succeededAttachments = response.success && attachments ? attachments : [];

          // La route répond toujours success:true (sendSuccess) même quand
          // UploadProcessor.uploadMultiple a avalé des échecs par fichier et
          // renvoyé un tableau plus court — response.success seul ne le
          // détecte pas. Réconcilier par nom pour purger précisément les
          // fichiers de CE lot qui n'ont pas d'attachment correspondant.
          const failedFiles = reconcileUploadFailures(batch.files, succeededAttachments);
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

          return succeededAttachments;
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
    // pièces restent dans l'ordre de sélection malgré le parallélisme.
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
  }, [batchSize, token, onUploadError, t]);

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

    // Valider les fichiers
    const validation = AttachmentService.validateFiles(uniqueFiles);
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
        await uploadFilesInBatches(uniqueFiles, metadataForUpload);
      } else {
        const response = await AttachmentService.uploadFiles(
          uniqueFiles,
          token,
          metadataForUpload,
          (percentage, loaded, total) => {
            // Même correction que sur le chemin multi-lot : la progression
            // vaut pour chaque vignette de la requête, pas seulement l'index 0.
            setUploadProgress(prev => {
              const next = { ...prev };
              for (let index = 0; index < uniqueFiles.length; index++) {
                next[index] = percentage;
              }
              return next;
            });
            if (percentage % 25 === 0) {
              const totalSizeMB = total / (1024 * 1024);
              if (totalSizeMB > 50) {
                console.log(`📊 ${percentage}% - ${(loaded / (1024 * 1024)).toFixed(1)}/${totalSizeMB.toFixed(1)}MB`);
              }
            }
          }
        );

        // Support both { attachments: [...] } and { data: { attachments: [...] } } response formats
        const attachments = response.attachments || (response as any).data?.attachments;
        const succeededAttachments = response.success && attachments ? attachments : [];
        if (succeededAttachments.length > 0) {
          console.log(`✅ Upload réussi: ${succeededAttachments.length} fichier(s)`);
          setUploadedAttachments(prev => [...prev, ...succeededAttachments]);
        }

        // La route /attachments/upload répond toujours success:true (sendSuccess),
        // même quand UploadProcessor.uploadMultiple a avalé des échecs par
        // fichier côté serveur et renvoyé moins d'attachments que de fichiers
        // envoyés (voire aucun) — `response.success` seul ne détecte donc pas
        // cette perte silencieuse. Réconcilier par nom pour purger précisément
        // les fichiers sans attachment correspondant (Task 7 review, Important #2).
        const failedFiles = reconcileUploadFailures(uniqueFiles, succeededAttachments);
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
      setIsUploading(false);
    }
  }, [token, selectedFiles, uploadedAttachments, maxAttachments, t, batchSize, uploadFilesInBatches, onUploadError]);

  // Créer un attachment texte
  const handleCreateTextAttachment = useCallback(async (text: string) => {
    if (!text) return;

    setIsUploading(true);
    try {
      const fileName = generateTextFileName();
      const textFile = new File([text], fileName, { type: 'text/plain' });

      setSelectedFiles(prev => [...prev, textFile]);

      const response = await AttachmentService.uploadText(text, token);
      if (response.success && response.attachment) {
        setUploadedAttachments(prev => [...prev, response.attachment]);
      }
    } catch (error) {
      console.error('❌ Erreur création text attachment:', error);
      setSelectedFiles(prev => prev.slice(0, -1));
    } finally {
      setIsUploading(false);
    }
  }, [token]);

  // Supprimer un fichier
  const handleRemoveFile = useCallback(async (index: number) => {
    const attachmentToDelete = uploadedAttachments[index];

    if (attachmentToDelete?.id) {
      try {
        await AttachmentService.deleteAttachment(attachmentToDelete.id, token);
      } catch (error) {
        console.error('❌ Erreur suppression attachment:', error);
        toast.error('Impossible de supprimer le fichier');
        return;
      }
    }

    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    setUploadedAttachments(prev => prev.filter((_, i) => i !== index));
  }, [uploadedAttachments, token]);

  // Effacer tous les attachments
  const clearAttachments = useCallback(() => {
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
