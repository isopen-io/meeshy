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
import { UploadedAttachmentResponse } from '@meeshy/shared/types/attachment';

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
const MAX_ATTACHMENTS_DEFAULT = 50;
const MEDIA_DURATION_EXTRACTION_TIMEOUT_MS = 4000;

type AttachmentSelectionMetadata = Record<string, unknown> & { duration?: number };
type AttachmentSelectionMetadataList = Array<AttachmentSelectionMetadata | undefined>;

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

  // Upload en batches
  const uploadFilesInBatches = useCallback(async (files: File[], additionalMetadata?: AttachmentSelectionMetadataList) => {
    const totalFiles = files.length;
    const totalBatches = Math.ceil(totalFiles / batchSize);

    setBatchProgress({
      current: 0,
      total: totalFiles,
      currentBatch: 0,
      totalBatches,
    });

    let uploadedCount = 0;
    const allUploadedAttachments: UploadedAttachmentResponse[] = [];

    for (let i = 0; i < totalBatches; i++) {
      const start = i * batchSize;
      const end = Math.min(start + batchSize, totalFiles);
      const batch = files.slice(start, end);
      const batchMetadata = additionalMetadata?.slice(start, end);

      setBatchProgress(prev => ({
        ...prev,
        currentBatch: i + 1,
      }));

      try {
        const response = await AttachmentService.uploadFiles(
          batch,
          token,
          batchMetadata,
          (percentage, loaded, total) => {
            setUploadProgress(prev => ({ ...prev, [i]: percentage }));
          }
        );

        const attachments = response.attachments || (response as any).data?.attachments;
        if (response.success && attachments) {
          allUploadedAttachments.push(...attachments);
        }
      } catch (error) {
        console.error(`❌ Batch ${i + 1} upload error:`, error);
        setSelectedFiles(prev => prev.filter((f) => !batch.includes(f)));
      }

      uploadedCount += batch.length;
      setBatchProgress(prev => ({
        ...prev,
        current: uploadedCount,
      }));
    }

    // Update uploaded attachments
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
  }, [batchSize, token]);

  // Ajouter des fichiers
  const handleFilesSelected = useCallback(async (files: File[], additionalMetadata?: any) => {
    if (files.length === 0) return;

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
            setUploadProgress(prev => ({ ...prev, 0: percentage }));
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
        if (response.success && attachments) {
          console.log(`✅ Upload réussi: ${attachments.length} fichier(s)`);
          setUploadedAttachments(prev => [...prev, ...attachments]);
        } else {
          console.warn('⚠️ Upload sans succès:', response);
        }
      }
    } catch (error) {
      console.error('❌ Upload error:', error);
      if (error instanceof Error) {
        toast.error(`Upload failed: ${error.message}`);
      } else {
        toast.error('Upload failed. Please try again.');
      }
      // Symétrie avec handleCreateTextAttachment: purger les fichiers de CETTE
      // sélection de selectedFiles pour que le compteur (source de vérité
      // unique — voir plus haut) ne dérive pas après un échec réseau.
      setSelectedFiles(prev => prev.filter((f) => !uniqueFiles.includes(f)));
    } finally {
      setIsUploading(false);
    }
  }, [token, selectedFiles, uploadedAttachments, maxAttachments, t, batchSize, uploadFilesInBatches]);

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
