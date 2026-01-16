'use client';

import { useState, useRef, KeyboardEvent, forwardRef, useImperativeHandle, useEffect, useCallback, useMemo, memo } from 'react';
import { Send, MapPin, X, MessageCircle, Languages, Paperclip, Loader2, Mic, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { LanguageFlagSelector } from '@/components/translation';
import { getMaxMessageLength } from '@/lib/constants/languages';
import { type LanguageChoice } from '@/lib/bubble-stream-modules';
import { useI18n } from '@/hooks/useI18n';
import { useReplyStore, type ReplyingToMessage } from '@/stores/reply-store';
import { AttachmentCarousel } from '@/components/attachments/AttachmentCarousel';
import { AttachmentLimitModal } from '@/components/attachments/AttachmentLimitModal';
import { AttachmentPreviewReply } from '@/components/attachments/AttachmentPreviewReply';
import { useTextAttachmentDetection } from '@/hooks/useTextAttachmentDetection';
import { AttachmentService } from '@/services/attachmentService';
import { UploadedAttachmentResponse } from '@meeshy/shared/types/attachment';
import { toast } from 'sonner';
import { AudioRecorderWithEffects } from '@/components/audio/AudioRecorderWithEffects';
import { meeshySocketIOService } from '@/services/meeshy-socketio.service';
import { MentionAutocomplete } from './MentionAutocomplete';
import { detectMentionAtCursor } from '@meeshy/shared/types/mention';
import { getCursorPosition, adjustPositionForViewport } from '@/lib/cursor-position';
import { compressMultipleFiles, needsCompression } from '@/utils/media-compression';

interface MessageComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  selectedLanguage: string;
  onLanguageChange: (language: string) => void;
  location?: string;
  isComposingEnabled?: boolean;
  placeholder?: string;
  onKeyPress?: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  className?: string;
  choices?: LanguageChoice[]; // Choix de langues disponibles pour l'utilisateur
  // Nouveaux props pour les attachments
  onAttachmentsChange?: (attachmentIds: string[], mimeTypes: string[]) => void;
  token?: string;
  userRole?: string; // Rôle de l'utilisateur pour déterminer la limite de caractères
  conversationId?: string; // ID de la conversation pour les événements typing
}

export interface MessageComposerRef {
  focus: () => void;
  blur: () => void;
  clearAttachments?: () => void;
  getMentionedUserIds?: () => string[]; // Exposer les mentions
  clearMentionedUserIds?: () => void; // Nettoyer les mentions après envoi
  resetTextareaSize?: () => void; // Réinitialiser la taille du textarea
}

/**
 * Composant modulaire pour la saisie et l'envoi de messages
 * Inclut le textarea, sélecteur de langue, localisation et bouton d'envoi
 */
export const MessageComposer = forwardRef<MessageComposerRef, MessageComposerProps>(({
  value,
  onChange,
  onSend,
  selectedLanguage,
  onLanguageChange,
  location,
  isComposingEnabled = true,
  placeholder,
  onKeyPress,
  className = "",
  choices,
  onAttachmentsChange,
  token,
  userRole,
  conversationId
}, ref) => {

  // ...hooks d'état et variables...
  const { t } = useI18n('conversations');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // Déterminer la limite de caractères en fonction du rôle
  const maxMessageLength = getMaxMessageLength(userRole);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { replyingTo, clearReply } = useReplyStore();
  const [isMobile, setIsMobile] = useState(false);

  // États pour les attachments
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadedAttachments, setUploadedAttachments] = useState<UploadedAttachmentResponse[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ [key: number]: number }>({});
  const [showAttachmentLimitModal, setShowAttachmentLimitModal] = useState(false);
  const [attemptedCount, setAttemptedCount] = useState(0); // Compte incluant les fichiers rejetés

  // États pour la compression
  const [isCompressing, setIsCompressing] = useState(false);
  const [compressionProgress, setCompressionProgress] = useState<{ [key: number]: { progress: number; status: string } }>({});

  // États pour l'enregistrement audio
  const [showAudioRecorder, setShowAudioRecorder] = useState(false);
  const [currentAudioBlob, setCurrentAudioBlob] = useState<{ blob: Blob; duration: number } | null>(null);
  const [audioRecorderKey, setAudioRecorderKey] = useState(0); // Key pour forcer re-mount
  const [isRecording, setIsRecording] = useState(false); // État pour savoir si on enregistre
  const audioRecorderRef = useRef<any>(null);
  const shouldUploadAfterStopRef = useRef(false); // Flag pour uploader après arrêt
  const currentAudioBlobRef = useRef<{ blob: Blob; duration: number } | null>(null); // Ref pour éviter problème de closure

  // Ref pour gérer le timeout de stopTyping
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // États pour le système de mentions @username
  const [showMentionAutocomplete, setShowMentionAutocomplete] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionPosition, setMentionPosition] = useState<{ top?: number; bottom?: number; left: number }>({ left: 0 });
  const [mentionCursorStart, setMentionCursorStart] = useState(0);
  const [mentionedUserIds, setMentionedUserIds] = useState<string[]>([]); // Tracker les IDs des utilisateurs mentionnés

  // Utiliser le placeholder fourni ou la traduction par défaut
  const finalPlaceholder = placeholder || t('writeMessage');

  
  // Détection mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Cleanup du typing timeout au démontage
  // NOTE: Typing stopTyping is handled by parent components
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  // Gestion du collage de texte trop long : créer un .txt UTF-8 et ne pas remplir le textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const handlePaste = async (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData('text');
      if (text && text.length > maxMessageLength) {
        e.preventDefault();
        // Créer un fichier texte UTF-8
        const encoder = new TextEncoder();
        const utf8Text = encoder.encode(text);
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        const fileName = `presspaper-content-${year}${month}${day}-${hours}${minutes}${seconds}.txt`;
        const textFile = new File([utf8Text], fileName, { type: 'text/plain;charset=utf-8' });
        setSelectedFiles(prev => [...prev, textFile]);
        toast.info(t('conversations.pasteTooLongTxtCreated'));
      }
    };
    textarea.addEventListener('paste', handlePaste as any);
    return () => textarea.removeEventListener('paste', handlePaste as any);
  }, [maxMessageLength, t]);

  // Fonction pour formater la date en fonction du jour
  const formatReplyDate = (date: Date | string) => {
    const messageDate = new Date(date);
    const now = new Date();

    // Réinitialiser l'heure pour comparer uniquement les dates
    const messageDateOnly = new Date(messageDate.getFullYear(), messageDate.getMonth(), messageDate.getDate());
    const nowDateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    const isSameDay = messageDateOnly.getTime() === nowDateOnly.getTime();
    const isSameYear = messageDate.getFullYear() === now.getFullYear();
    
    if (isSameDay) {
      // Même jour : afficher seulement l'heure
      return messageDate.toLocaleString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit'
      });
    } else if (isSameYear) {
      // Même année mais jour différent : afficher jour + mois + heure
      return messageDate.toLocaleString('fr-FR', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      });
    } else {
      // Année différente : afficher date complète + heure
      return messageDate.toLocaleString('fr-FR', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
  };

  // Handler pour créer un attachment texte avec nom formaté - mémorisé (déclaré en premier car utilisé par le hook)
  const handleCreateTextAttachment = useCallback(async (text: string) => {
    if (!text) return;

    setIsUploading(true);
    try {
      // Générer le nom de fichier avec la date actuelle
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');
      
      const fileName = `presspaper-content-${year}${month}${day}-${hours}${minutes}${seconds}.txt`;
      
      // Créer un fichier virtuel pour l'affichage dans le carrousel
      const textFile = new File([text], fileName, {
        type: 'text/plain',
      });
      
      // Ajouter immédiatement au carrousel pour feedback visuel
      setSelectedFiles(prev => [...prev, textFile]);
      
      // Upload le texte
      const response = await AttachmentService.uploadText(text, token);
      if (response.success && response.attachment) {
        setUploadedAttachments(prev => [...prev, response.attachment]);
      }
    } catch (error) {
      console.error('❌ Erreur création text attachment:', error);
      // Retirer le fichier du carrousel en cas d'erreur
      setSelectedFiles(prev => prev.slice(0, -1));
    } finally {
      setIsUploading(false);
    }
  }, [token]);

  // Hook pour la détection de texte collé - création automatique
  // Utilise maxMessageLength comme threshold (1500 pour USER, 2000 pour MODERATOR+)
  useTextAttachmentDetection(textareaRef as React.RefObject<HTMLTextAreaElement>, {
    enabled: true,
    threshold: maxMessageLength,
    onTextDetected: async (text) => {
      // Créer automatiquement l'attachement sans demander
      await handleCreateTextAttachment(text);
    },
  });

  // FIX CRITIQUE: Mémoiser les IDs pour éviter les re-renders inutiles
  const attachmentIdsString = useMemo(() => {
    return JSON.stringify(uploadedAttachments.map(att => att.id));
  }, [uploadedAttachments]);

  // Ref pour stocker uploadedAttachments et éviter la closure stale
  const uploadedAttachmentsRef = useRef<UploadedAttachmentResponse[]>([]);
  useEffect(() => {
    uploadedAttachmentsRef.current = uploadedAttachments;
  }, [uploadedAttachments]);

  // Ref pour tracker la dernière valeur notifiée au parent
  const lastNotifiedIdsStringRef = useRef<string>('');

  // Notifier le parent quand les attachments changent (comparaison par valeur sérialisée)
  useEffect(() => {
    // PROTECTION ABSOLUE: Ne rien faire si les IDs n'ont pas changé
    if (attachmentIdsString === lastNotifiedIdsStringRef.current) {
      return;
    }

    // Les IDs ont changé, notifier le parent
    const currentAttachments = uploadedAttachmentsRef.current;
    const attachmentIds = currentAttachments.map(att => att.id);
    const mimeTypes = currentAttachments.map(att => att.mimeType);


    if (onAttachmentsChange) {
      onAttachmentsChange(attachmentIds, mimeTypes);
    }

    // Sauvegarder la valeur notifiée
    lastNotifiedIdsStringRef.current = attachmentIdsString;
  }, [attachmentIdsString, onAttachmentsChange]);

  // Handler pour la sélection de fichiers - mémorisé et optimisé
  const handleFilesSelected = useCallback(async (files: File[], additionalMetadata?: any) => {
    if (files.length === 0) return;

    // Log compact pour ne pas ralentir l'UI sur mobile
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    console.log(`📎 Traitement de ${files.length} fichier(s) (${(totalSize / (1024 * 1024)).toFixed(1)}MB)`);

    console.log('📋 [MessageComposer] handleFilesSelected received:', {
      fileCount: files.length,
      hasAdditionalMetadata: !!additionalMetadata,
      additionalMetadata: additionalMetadata,
      firstFileType: files[0]?.type
    });

    // Filtrer les doublons basés sur nom, taille et date de modification
    // Vérifier contre selectedFiles ET uploadedAttachments
    const existingFileSignatures = new Set([
      ...selectedFiles.map(f => `${f.name}_${f.size}_${f.lastModified}`),
      ...uploadedAttachments.map(att => `${att.originalName}_${att.fileSize}_${new Date(att.createdAt).getTime()}`)
    ]);

    const uniqueFiles = files.filter(file => {
      const signature = `${file.name}_${file.size}_${file.lastModified}`;
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

    // Vérifier la limite de 50 attachements par message
    const currentTotalAttachments = selectedFiles.length + uploadedAttachments.length;
    const newTotalAttachments = currentTotalAttachments + uniqueFiles.length;

    if (newTotalAttachments > 50) {
      console.log(`❌ Limite dépassée: ${newTotalAttachments}/50 attachements`);
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

    // Vérifier si des fichiers nécessitent une compression
    const filesToCompress = uniqueFiles.filter(f => needsCompression(f));
    if (filesToCompress.length > 0) {
      console.log(`🗜️ ${filesToCompress.length} fichier(s) nécessite(nt) une compression`);
      setIsCompressing(true);
      setCompressionProgress({});

      try {
        // Compresser les fichiers qui le nécessitent
        const compressedFiles = await compressMultipleFiles(uniqueFiles, (fileIndex, progress, status) => {
          setCompressionProgress(prev => ({
            ...prev,
            [fileIndex]: { progress, status }
          }));
        });

        // Utiliser les fichiers compressés
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

    // Mise à jour immédiate de l'UI avec les fichiers sélectionnés
    setSelectedFiles(prev => [...prev, ...uniqueFiles]);
    setIsUploading(true);

    console.log(`📤 Upload démarré: ${uniqueFiles.length} fichier(s)`);

    console.log('🚀 [MessageComposer] Calling AttachmentService.uploadFiles with:', {
      fileCount: uniqueFiles.length,
      hasMetadata: !!additionalMetadata,
      metadata: additionalMetadata,
      metadataIsArray: Array.isArray(additionalMetadata),
      metadataDetails: additionalMetadata ? JSON.stringify(additionalMetadata) : 'none'
    });

    try {
      // Upload les fichiers avec progress tracking
      const response = await AttachmentService.uploadFiles(
        uniqueFiles,
        token,
        additionalMetadata, // métadonnées additionnelles (ex: audioEffectsTimeline)
        (percentage, loaded, total) => {
          // Mettre à jour la progression globale
          setUploadProgress(prev => ({ ...prev, 0: percentage }));

          // Log seulement aux étapes importantes (25%, 50%, 75%, 100%) pour ne pas ralentir
          if (percentage % 25 === 0) {
            const totalSizeMB = total / (1024 * 1024);
            if (totalSizeMB > 50) {
              console.log(`📊 ${percentage}% - ${(loaded / (1024 * 1024)).toFixed(1)}/${totalSizeMB.toFixed(1)}MB`);
            }
          }
        }
      );

      if (response.success && response.attachments) {
        console.log(`✅ Upload réussi: ${response.attachments.length} fichier(s)`);

        setUploadedAttachments(prev => [...prev, ...response.attachments]);
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
  }, [token, selectedFiles, uploadedAttachments, t]);

  // Handlers pour le drag & drop - mémorisés pour éviter les re-créations
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

  // Handler pour le clic sur l'icône d'attachement - mémorisé
  const handleAttachmentClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // Handler pour le changement de l'input file - mémorisé et optimisé pour mobile
  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    // CRITIQUE: Sur iOS, il faut extraire les fichiers et reset l'input IMMÉDIATEMENT
    // pour fermer le sélecteur et libérer l'UI thread
    const files = e.target.files ? Array.from(e.target.files) : [];

    // Reset l'input IMMÉDIATEMENT pour fermer le sélecteur iOS
    e.target.value = '';

    // Afficher immédiatement un feedback visuel
    if (files.length > 0) {
      // Toast rapide pour indiquer que le fichier est en cours de traitement
      const fileNames = files.map(f => f.name).join(', ');
      const totalSize = files.reduce((sum, f) => sum + f.size, 0);
      const sizeMB = (totalSize / (1024 * 1024)).toFixed(1);

      console.log(`📱 Fichier(s) sélectionné(s): ${fileNames} (${sizeMB}MB) - Traitement en arrière-plan...`);

      // Si c'est un gros fichier (> 50MB), afficher un toast
      if (totalSize > 50 * 1024 * 1024) {
        toast.info(`Préparation de ${files.length} fichier(s) (${sizeMB}MB)...`, { duration: 2000 });
      }
    }

    // Traiter les fichiers de manière asynchrone après avoir libéré l'UI
    // Utiliser setTimeout avec 0ms pour déplacer le traitement hors du thread principal
    setTimeout(() => {
      handleFilesSelected(files);
    }, 0);
  }, [handleFilesSelected]);

  // Handler pour retirer un fichier - mémorisé
  const handleRemoveFile = useCallback(async (index: number) => {
    // Récupérer l'attachment uploadé correspondant à cet index
    const attachmentToDelete = uploadedAttachments[index];

    // Si l'attachment a un ID (déjà uploadé), le supprimer du backend
    if (attachmentToDelete?.id) {
      try {
        await AttachmentService.deleteAttachment(attachmentToDelete.id, token);
      } catch (error) {
        console.error('[MessageComposer] ❌ Erreur suppression attachment:', error);
        toast.error('Impossible de supprimer le fichier');
        return; // Ne pas supprimer du state local si la suppression backend a échoué
      }
    }

    // Supprimer du state local uniquement si la suppression backend a réussi
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    setUploadedAttachments(prev => prev.filter((_, i) => i !== index));
  }, [uploadedAttachments, token]);

  // Clear attachments après envoi - mémorisé
  const clearAttachments = useCallback(() => {
    setSelectedFiles([]);
    setUploadedAttachments([]);
    setUploadProgress({});
    // Reset aussi l'état audio
    setShowAudioRecorder(false);
    setCurrentAudioBlob(null);
    currentAudioBlobRef.current = null; // Reset le ref aussi
    setAudioRecorderKey(0);
    setIsRecording(false);
    shouldUploadAfterStopRef.current = false; // Reset le flag
  }, []);

  // Handler pour le changement d'état d'enregistrement - mémorisé
  const handleRecordingStateChange = useCallback((recording: boolean) => {
    setIsRecording(recording);
  }, []);

  // Fonction helper pour obtenir l'extension correcte selon le MIME type
  const getAudioFileExtension = useCallback((mimeType: string): string => {
    const cleanMimeType = mimeType.split(';')[0].trim();

    // Détecter l'extension selon le MIME type
    if (cleanMimeType.includes('webm')) return 'webm';
    if (cleanMimeType.includes('mp4') || cleanMimeType.includes('m4a')) return 'm4a';
    if (cleanMimeType.includes('ogg')) return 'ogg';
    if (cleanMimeType.includes('wav')) return 'wav';
    if (cleanMimeType.includes('mpeg') || cleanMimeType.includes('mp3')) return 'mp3';

    // Par défaut, utiliser webm
    return 'webm';
  }, []);

  // Handler pour l'enregistrement audio terminé - mémorisé
  const handleAudioRecordingComplete = useCallback(async (audioBlob: Blob, duration: number, metadata?: any) => {
    console.log('🎵 [MessageComposer] Audio recording complete:', {
      duration,
      hasMetadata: !!metadata,
      metadata: metadata,
      hasAudioEffectsTimeline: !!metadata?.audioEffectsTimeline,
      audioEffectsTimelineEvents: metadata?.audioEffectsTimeline?.events?.length || 0
    });

    // Stocker le blob dans les refs ET le state
    const blobData = { blob: audioBlob, duration };
    currentAudioBlobRef.current = blobData;
    setCurrentAudioBlob(blobData);

    // Si on doit uploader immédiatement après l'arrêt
    if (shouldUploadAfterStopRef.current) {
      shouldUploadAfterStopRef.current = false; // Reset le flag

      // Nettoyer le MIME type en enlevant les paramètres (audio/webm;codecs=opus -> audio/webm)
      const cleanMimeType = audioBlob.type.split(';')[0].trim();

      // Obtenir l'extension correcte selon le MIME type
      const extension = getAudioFileExtension(audioBlob.type);
      const filename = `audio_${Date.now()}.${extension}`;

      const audioFile = new File([audioBlob], filename, { type: cleanMimeType });

      // Reset l'état audio et fermer le recorder IMMÉDIATEMENT avant l'upload
      // Cela évite le glitch visuel où plusieurs AudioRecorderCard apparaissent
      currentAudioBlobRef.current = null;
      setCurrentAudioBlob(null);
      setShowAudioRecorder(false);
      setIsRecording(false);

      console.log('📤 [MessageComposer] Preparing to upload audio with metadata:', {
        filename,
        metadataArray: metadata ? [metadata] : undefined,
        hasTimeline: !!metadata?.audioEffectsTimeline
      });

      // Upload le fichier en arrière-plan (après reset de l'UI)
      // Passer les métadonnées (incluant audioEffectsTimeline si présent) sous forme de tableau
      await handleFilesSelected([audioFile], metadata ? [metadata] : undefined);
    }
  }, [handleFilesSelected, getAudioFileExtension]);

  // Handler pour supprimer l'enregistrement audio - mémorisé
  const handleRemoveAudioRecording = useCallback(() => {

    // Fermer le recorder et reset tous les états audio
    setShowAudioRecorder(false);
    setCurrentAudioBlob(null);
    currentAudioBlobRef.current = null; // Reset le ref aussi
    setIsRecording(false);
    shouldUploadAfterStopRef.current = false; // Reset le flag
  }, []);

  // Handler appelé AVANT que l'enregistrement s'arrête (depuis le bouton STOP du AudioRecorderCard)
  const handleBeforeStop = useCallback(() => {
    // Activer le flag pour uploader après l'arrêt
    shouldUploadAfterStopRef.current = true;
  }, []);

  // Handler pour le clic sur le bouton micro - workflow simplifié
  const handleMicrophoneClick = useCallback(async () => {
    // Si un enregistrement est EN COURS
    if (showAudioRecorder && isRecording) {

      // Activer le flag pour uploader après l'arrêt
      shouldUploadAfterStopRef.current = true;

      // Arrêter l'enregistrement - handleAudioRecordingComplete sera appelé et gérera l'upload
      audioRecorderRef.current?.stopRecording();

      return;
    }

    // Si pas d'enregistrement en cours mais recorder ouvert (mode lecture)
    if (showAudioRecorder && currentAudioBlobRef.current) {
      // Nettoyer le MIME type en enlevant les paramètres (audio/webm;codecs=opus -> audio/webm)
      const cleanMimeType = currentAudioBlobRef.current.blob.type.split(';')[0].trim();

      // Obtenir l'extension correcte selon le MIME type
      const extension = getAudioFileExtension(currentAudioBlobRef.current.blob.type);
      const filename = `audio_${Date.now()}.${extension}`;

      const audioFile = new File([currentAudioBlobRef.current.blob], filename, { type: cleanMimeType });

      // Upload le fichier via handleFilesSelected
      await handleFilesSelected([audioFile]);

      // Reset et fermer le recorder
      currentAudioBlobRef.current = null;
      setCurrentAudioBlob(null);
      setShowAudioRecorder(false);
      setIsRecording(false);
      return;
    }

    // Sinon, ouvrir le recorder (l'utilisateur démarrera l'enregistrement en cliquant sur le bouton Start)
    if (!showAudioRecorder) {
      setShowAudioRecorder(true);
      setAudioRecorderKey(prev => prev + 1);
      // Note: isRecording sera mis à jour par handleRecordingStateChange quand l'utilisateur clique sur Start
    }
  }, [showAudioRecorder, isRecording, handleFilesSelected, getAudioFileExtension]);

  // Handle blur for mobile to ensure zoom out - mémorisé
  const handleBlur = useCallback(() => {
    if (isMobile && textareaRef.current) {
      // Force blur and zoom out on mobile devices
      textareaRef.current.blur();
      // Slight delay to ensure keyboard is fully dismissed before zoom reset
      setTimeout(() => {
        window.scrollTo(0, window.scrollY);
      }, 100);
    }
  }, [isMobile]);

  // Fonction pour réinitialiser la taille du textarea - mémorisée
  const resetTextareaSize = useCallback(() => {
    if (textareaRef.current && textareaRef.current.style) {
      try {
        textareaRef.current.style.height = '80px'; // Hauteur minimale
        textareaRef.current.style.overflowY = 'hidden';
      } catch (error) {
        console.warn('Erreur lors de la réinitialisation du textarea:', error);
      }
    }

    // Sur mobile, faire le blur pour fermer le clavier et dézoom
    if (isMobile) {
      handleBlur();
    }
  }, [isMobile, handleBlur]);

  // Handler pour l'envoi de message
  // Note: Le bouton est désactivé pendant l'enregistrement, donc pas besoin de gérer ce cas
  const handleSendMessage = useCallback(() => {
    onSend();
    // Réinitialiser la taille du textarea après l'envoi
    resetTextareaSize();
  }, [onSend, resetTextareaSize]);

  useImperativeHandle(ref, () => ({
    focus: () => textareaRef.current?.focus(),
    blur: () => textareaRef.current?.blur(),
    clearAttachments, // Exposer la fonction pour clear les attachments
    getMentionedUserIds: () => mentionedUserIds, // Exposer les mentions
    clearMentionedUserIds: () => setMentionedUserIds([]), // Nettoyer les mentions
    resetTextareaSize // Exposer la fonction de réinitialisation
  } as any));

  // Initialiser la hauteur du textarea au montage
  useEffect(() => {
    if (textareaRef.current && textareaRef.current.style) {
      try {
        textareaRef.current.style.height = '80px'; // Hauteur minimale
      } catch (error) {
        console.warn('Erreur lors de l\'initialisation du textarea:', error);
      }
    }
  }, []);

  const handleKeyPress = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (onKeyPress) {
      onKeyPress(e);
    }
  }, [onKeyPress]);

  // Gérer le focus sur mobile - scroller le textarea dans la vue quand le clavier s'ouvre
  useEffect(() => {
    if (!isMobile || !textareaRef.current) return;

    const textarea = textareaRef.current;

    const handleFocus = () => {
      // Petit délai pour laisser le clavier s'ouvrir
      setTimeout(() => {
        // Scroller le textarea dans la vue
        textarea.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
          inline: 'nearest'
        });

        // Sur iOS, forcer un scroll supplémentaire pour compenser le comportement du clavier
        if (/iPhone|iPad|iPod/.test(navigator.userAgent)) {
          setTimeout(() => {
            window.scrollTo({
              top: window.scrollY + 50,
              behavior: 'smooth'
            });
          }, 300);
        }
      }, 300);
    };

    textarea.addEventListener('focus', handleFocus);

    return () => {
      textarea.removeEventListener('focus', handleFocus);
    };
  }, [isMobile]);

  // Auto-resize du textarea comme dans BubbleStreamPage - mémorisé
  const handleTextareaChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;

    // IMPORTANT: Call onChange first so parent can manage typing
    // Parent components like BubbleStreamPage and ConversationLayout
    // handle typing events via their onChange callback
    onChange(newValue);

    // NOTE: Typing events are managed by parent components via onChange
    // The conversationId prop is kept for potential future use but
    // typing is NOT emitted here to avoid duplication with parent handlers

    // Détection des mentions @username
    const textarea = e.target;
    const cursorPosition = textarea.selectionStart;
    const mentionDetection = detectMentionAtCursor(newValue, cursorPosition);

    // Vérifier que conversationId est un ObjectId MongoDB valide (24 caractères hexadécimaux)
    const isValidObjectId = conversationId && /^[a-f\d]{24}$/i.test(conversationId);

    if (mentionDetection && isValidObjectId) {
      // Valider que la query est un username valide (lettres, chiffres, underscore, max 30 caractères)
      const isValidQuery = /^\w{0,30}$/.test(mentionDetection.query);

      if (isValidQuery) {
        // Calculer la position de l'autocomplete AU NIVEAU DU CURSEUR
        if (textareaRef.current) {
          // Obtenir la position exacte du curseur dans le textarea
          const cursorPos = getCursorPosition(textareaRef.current, cursorPosition);

          // Get lineHeight from textarea computed styles
          const computed = window.getComputedStyle(textareaRef.current);
          const lineHeight = parseFloat(computed.lineHeight) || parseFloat(computed.fontSize) * 1.2;

          // Ajuster la position pour qu'elle reste visible dans le viewport
          const adjustedPosition = adjustPositionForViewport(cursorPos.x, cursorPos.y, 224, 256, lineHeight);

          setMentionPosition(adjustedPosition);
        }

        setMentionQuery(mentionDetection.query);
        setMentionCursorStart(mentionDetection.start);
        setShowMentionAutocomplete(true);
      } else {
        // Query invalide (caractères spéciaux ou trop longue) → fermer l'autocomplete
        setShowMentionAutocomplete(false);
        setMentionQuery('');
      }
    } else {
      setShowMentionAutocomplete(false);
      setMentionQuery('');
    }

    // Auto-resize textarea avec gestion améliorée des retours à la ligne
    if (textareaRef.current && textareaRef.current.style) {
      try {
        // Réinitialiser la hauteur pour obtenir la hauteur naturelle du contenu
        textareaRef.current.style.height = 'auto';

        // Calculer la hauteur nécessaire avec une hauteur minimale
        const minHeight = 80; // Correspond à min-h-[80px]
        const maxHeight = 160; // Correspond à max-h-40 (40 * 4px = 160px)
        const scrollHeight = textareaRef.current.scrollHeight;

        // Utiliser la hauteur calculée en respectant les limites
        const newHeight = Math.max(minHeight, Math.min(scrollHeight, maxHeight));
        textareaRef.current.style.height = `${newHeight}px`;

        // Si le contenu dépasse la hauteur maximale, permettre le scroll
        if (scrollHeight > maxHeight) {
          textareaRef.current.style.overflowY = 'auto';
        } else {
          textareaRef.current.style.overflowY = 'hidden';
        }

        // Auto-scroll vers la fin pendant la frappe
        textareaRef.current.scrollTop = textareaRef.current.scrollHeight;
      } catch (error) {
        console.warn('Erreur lors du redimensionnement du textarea:', error);
      }
    }
  }, [onChange, conversationId]);

  // Handler pour la sélection d'une mention - mémorisé
  const handleMentionSelect = useCallback((username: string, userId: string) => {
    if (!textareaRef.current) return;

    const currentValue = value;
    const beforeMention = currentValue.substring(0, mentionCursorStart);
    const afterCursor = currentValue.substring(textareaRef.current.selectionStart);
    const newValue = `${beforeMention}@${username} ${afterCursor}`;

    onChange(newValue);
    setShowMentionAutocomplete(false);
    setMentionQuery('');

    // Ajouter l'userId à la liste des mentions (éviter les doublons)
    setMentionedUserIds(prev => {
      if (!prev.includes(userId)) {
        return [...prev, userId];
      }
      return prev;
    });

    // Placer le curseur après la mention insérée
    setTimeout(() => {
      if (textareaRef.current) {
        const newCursorPos = mentionCursorStart + username.length + 2; // +2 pour @ et espace
        textareaRef.current.selectionStart = newCursorPos;
        textareaRef.current.selectionEnd = newCursorPos;
        textareaRef.current.focus();
      }
    }, 0);
  }, [value, mentionCursorStart, onChange]);


  return (
    <div 
      className={`relative ${className} ${isDragOver ? 'ring-2 ring-blue-500 bg-blue-50/20' : ''}`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Affichage du message auquel on répond */}
      {replyingTo && (
        <div className="p-3 bg-gradient-to-r from-blue-50/90 to-indigo-50/90 dark:from-blue-900/30 dark:to-indigo-900/30 border-l-4 border-blue-400 dark:border-blue-500 rounded-t-lg backdrop-blur-sm">
          <div className="flex items-start justify-between space-x-2">
            <div className="flex items-start space-x-2 flex-1 min-w-0">
              <MessageCircle className="h-4 w-4 text-blue-500 dark:text-blue-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-2 mb-1">
                  <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
                    {t('replyingTo')} {replyingTo.sender?.displayName || replyingTo.sender?.username || t('unknownUser')}
                  </span>
                  <span className="text-xs text-blue-600/60 dark:text-blue-400/60">
                    {formatReplyDate(replyingTo.createdAt)}
                  </span>
                </div>
                <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2 italic">
                  {replyingTo.content}
                </p>
                {replyingTo.attachments && replyingTo.attachments.length > 0 && (
                  <AttachmentPreviewReply
                    attachments={replyingTo.attachments}
                    isOwnMessage={false}
                  />
                )}
                {replyingTo.translations && replyingTo.translations.length > 0 && (
                  <div className="mt-1 flex items-center space-x-1">
                    <Languages className="h-3 w-3 text-blue-500/60 dark:text-blue-400/60" />
                    <span className="text-xs text-blue-600/60 dark:text-blue-400/60">
                      {replyingTo.translations.length} {t('translations')}
                    </span>
                  </div>
                )}
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearReply}
              className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 p-1 h-6 w-6"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Indicateur de compression */}
      {isCompressing && Object.keys(compressionProgress).length > 0 && (
        <div className="mb-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
            <span className="text-sm font-medium text-blue-900">Compression en cours...</span>
          </div>
          <div className="space-y-1">
            {Object.entries(compressionProgress).map(([fileIndex, { progress, status }]) => (
              <div key={fileIndex} className="text-xs text-blue-700">
                <div className="flex justify-between items-center mb-1">
                  <span className="truncate">{status}</span>
                  <span className="ml-2 font-medium">{progress}%</span>
                </div>
                <div className="w-full bg-blue-200 rounded-full h-1.5">
                  <div
                    className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Carrousel d'attachments - positionné juste après la citation */}
      {((selectedFiles.length > 0 || showAudioRecorder) || showAttachmentLimitModal) && (
        <div className="relative min-h-[120px] mb-2">
          {(selectedFiles.length > 0 || showAudioRecorder) && (
            <AttachmentCarousel
              files={selectedFiles}
              onRemove={handleRemoveFile}
              uploadProgress={uploadProgress}
              disabled={isUploading}
              audioRecorderSlot={
                showAudioRecorder ? (
                  <AudioRecorderWithEffects
                    key={audioRecorderKey}
                    ref={audioRecorderRef}
                    onRecordingComplete={handleAudioRecordingComplete}
                    onRecordingStateChange={handleRecordingStateChange}
                    onRemove={handleRemoveAudioRecording}
                    onStop={handleBeforeStop}
                    maxDuration={600}
                  />
                ) : undefined
              }
            />
          )}

          {/* Modale de limite d'attachements - Overlay de la zone d'attachement */}
          {showAttachmentLimitModal && (
            <AttachmentLimitModal
              isOpen={showAttachmentLimitModal}
              onClose={() => {
                setShowAttachmentLimitModal(false);
                setAttemptedCount(0);
              }}
              currentCount={attemptedCount > 0 ? attemptedCount : selectedFiles.length + uploadedAttachments.length}
              maxCount={50}
              remainingSlots={Math.max(0, 50 - (selectedFiles.length + uploadedAttachments.length))}
            />
          )}
        </div>
      )}
      
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={handleTextareaChange}
        onKeyPress={handleKeyPress}
        onBlur={handleBlur}
        placeholder={finalPlaceholder}
        className={`expandable-textarea min-h-[60px] sm:min-h-[80px] max-h-40 resize-none pr-20 sm:pr-28 pb-12 pt-3 pl-3 border-blue-200/60 bg-white/90 backdrop-blur-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30 focus:bg-white/95 placeholder:text-gray-600 scroll-hidden transition-all duration-200 ${
          replyingTo || selectedFiles.length > 0 || showAudioRecorder
            ? 'rounded-b-2xl rounded-t-none border-t-0'
            : 'rounded-2xl'
        } ${isMobile ? 'text-base' : 'text-sm sm:text-base'}`}
        maxLength={maxMessageLength}
        disabled={!isComposingEnabled}
        style={{
          borderRadius: replyingTo || selectedFiles.length > 0 || showAudioRecorder ? '0 0 16px 16px' : '16px',
          boxShadow: '0 4px 20px rgba(59, 130, 246, 0.15)',
          fontSize: isMobile ? '16px' : undefined
        }}
      />

      {/* Autocomplete des mentions @username */}
      {showMentionAutocomplete && conversationId && (
        <MentionAutocomplete
          conversationId={conversationId}
          query={mentionQuery}
          onSelect={handleMentionSelect}
          onClose={() => {
            setShowMentionAutocomplete(false);
            setMentionQuery('');
          }}
          position={mentionPosition}
        />
      )}

      {/* Indicateurs et boutons à gauche: Flag selector, Audio, Document, localisation, upload */}
      <div className="absolute bottom-2 sm:bottom-3 left-3 flex items-center space-x-1 text-xs sm:text-sm text-gray-600 pointer-events-auto">
        {/* Sélecteur de langue d'envoi (en premier) */}
        <div className="scale-100 sm:scale-100 origin-left">
          <LanguageFlagSelector
            value={selectedLanguage}
            onValueChange={onLanguageChange}
            choices={choices}
            popoverSide="top"
            popoverAlign="start"
            popoverSideOffset={8}
            showLanguageName={false}
          />
        </div>

        {/* Bouton Microphone (Audio) - Agrandi pour mobile */}
        <Button
          onClick={handleMicrophoneClick}
          disabled={!isComposingEnabled}
          size="sm"
          variant="ghost"
          className="h-[30px] w-[30px] sm:h-[32px] sm:w-[32px] p-0 rounded-full hover:bg-gray-100 relative min-w-0 min-h-0 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          aria-label="Enregistrer un message vocal"
        >
          <Mic className={`h-[20px] w-[20px] sm:h-[22px] sm:w-[22px] ${showAudioRecorder ? 'text-blue-600' : 'text-gray-600'}`} aria-hidden="true" />
        </Button>

        {/* Bouton d'attachement (Document) - Agrandi pour mobile */}
        <Button
          onClick={handleAttachmentClick}
          disabled={!isComposingEnabled || isUploading || isCompressing}
          size="sm"
          variant="ghost"
          className="h-[30px] w-[30px] sm:h-[32px] sm:w-[32px] p-0 rounded-full hover:bg-gray-100 relative min-w-0 min-h-0 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          aria-label={isCompressing ? 'Compression en cours' : isUploading ? 'Upload en cours' : 'Ajouter des fichiers'}
        >
          {isCompressing || isUploading ? (
            <Loader2 className="h-[20px] w-[20px] sm:h-[22px] sm:w-[22px] text-blue-600 animate-spin" aria-hidden="true" />
          ) : (
            <Paperclip className="h-[20px] w-[20px] sm:h-[22px] sm:w-[22px] text-gray-600" aria-hidden="true" />
          )}
          {selectedFiles.length > 0 && (
            <span className="absolute -top-1 -right-1 bg-blue-600 text-white text-[10px] rounded-full h-3.5 w-3.5 flex items-center justify-center" aria-label={`${selectedFiles.length} fichiers sélectionnés`}>
              {selectedFiles.length}
            </span>
          )}
        </Button>

        {/* Localisation */}
        {location && (
          <div className="flex items-center space-x-1">
            <MapPin className="h-[22px] w-[22px] sm:h-[22px] sm:w-[22px]" />
            <span className="hidden sm:inline">{location}</span>
          </div>
        )}
      </div>

      {/* Bouton d'envoi à droite */}
      <div className="absolute bottom-2 sm:bottom-3 right-3 sm:right-4 flex items-center space-x-2 pointer-events-auto">
        {/* Compteur de caractères : affiché uniquement si > 90% du max */}
        {value.length > maxMessageLength * 0.9 && (
          <span className={`hidden sm:inline text-xs ${value.length > maxMessageLength ? 'text-red-500' : 'text-orange-500'}`}>
            {value.length}/{maxMessageLength}
          </span>
        )}

        {/* Compteur d'attachements : affiché si > 40 attachements (80% de 50) */}
        {(selectedFiles.length + uploadedAttachments.length) > 40 && (
          <span className={`hidden sm:inline text-xs ${(selectedFiles.length + uploadedAttachments.length) > 50 ? 'text-red-500' : 'text-orange-500'}`}>
            {selectedFiles.length + uploadedAttachments.length}/50
          </span>
        )}

        {/* Bouton d'envoi (agrandi de 50% sur desktop) */}
        <Button
          onClick={handleSendMessage}
          disabled={(!value.trim() && selectedFiles.length === 0 && uploadedAttachments.length === 0) || value.length > maxMessageLength || !isComposingEnabled || isUploading || isCompressing || isRecording || (selectedFiles.length + uploadedAttachments.length) > 50}
          size="sm"
          className="bg-blue-600 hover:bg-blue-700 text-white h-6 w-6 sm:h-9 sm:w-9 p-0 rounded-full shadow-lg hover:shadow-xl transition-all duration-200 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          aria-label={isCompressing ? "Compression en cours" : isRecording ? "Arrêtez l'enregistrement avant d'envoyer" : "Envoyer le message"}
        >
          <Send className="h-3 w-3 sm:h-5 sm:w-5" aria-hidden="true" />
        </Button>
      </div>

      {/* Input file caché - Optimisé pour les gros fichiers de la photothèque */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileInputChange}
        accept="image/*,video/*,audio/*,application/pdf,text/plain,.doc,.docx,.ppt,.pptx,.md,.sh,.js,.ts,.py,.zip"
        capture={undefined}
        aria-label="Sélectionner des fichiers à joindre (images, vidéos, audio, PDF, documents)"
      />
    </div>
  );
});

MessageComposer.displayName = 'MessageComposer';
