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

interface UseAttachmentUploadOptions {
  /** Token d'authentification */
  token?: string;
  /** Limite maximale d'attachments */
  maxAttachments?: number;
  /** Callback quand les attachments changent */
  onAttachmentsChange?: (ids: string[], mimeTypes: string[]) => void;
  /** Fonction de traduction */
  t?: (key: string, options?: any) => string;
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
}: UseAttachmentUploadOptions = {}): UseAttachmentUploadReturn {
  // États
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadedAttachments, setUploadedAttachments] = useState<UploadedAttachmentResponse[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<number, number>>({});
  const [compressionProgress, setCompressionProgress] = useState<Record<number, CompressionProgress>>({});
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

    // Vérifier la limite
    const currentTotalAttachments = selectedFiles.length + uploadedAttachments.length;
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
      const response = await AttachmentService.uploadFiles(
        uniqueFiles,
        token,
        additionalMetadata,
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

      const attachments = response.attachments;
      if (response.success && attachments) {
        console.log(`✅ Upload réussi: ${attachments.length} fichier(s)`);
        setUploadedAttachments(prev => [...prev, ...attachments]);
      } else {
        console.warn('⚠️ Upload sans succès:', response);
      }
    } catch (error) {
      console.error('❌ Upload error:', error);
      if (error instanceof Error) {
        toast.error(`Upload failed: ${error.message}`);
      } else {
        toast.error('Upload failed. Please try again.');
      }
    } finally {
      setIsUploading(false);
    }
  }, [token, selectedFiles, uploadedAttachments, maxAttachments, t]);

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
