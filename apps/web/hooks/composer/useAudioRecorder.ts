/**
 * Hook de gestion de l'enregistrement audio
 * Gère: state machine audio, Safari compatibility, upload automatique
 *
 * @module hooks/composer/useAudioRecorder
 */

'use client';

import { useState, useCallback, useRef } from 'react';

interface AudioBlobData {
  blob: Blob;
  duration: number;
}

interface UseAudioRecorderOptions {
  /** Callback quand l'audio est prêt pour upload */
  onAudioReady: (files: File[], metadata?: any[]) => Promise<void>;
}

interface UseAudioRecorderReturn {
  /** Afficher le recorder */
  showAudioRecorder: boolean;
  /** Audio blob courant */
  currentAudioBlob: AudioBlobData | null;
  /** Clé pour forcer re-mount */
  audioRecorderKey: number;
  /** En cours d'enregistrement */
  isRecording: boolean;
  /** Ref pour le composant AudioRecorder */
  audioRecorderRef: React.RefObject<any>;
  /** Handler pour le changement d'état d'enregistrement */
  handleRecordingStateChange: (recording: boolean) => void;
  /** Handler pour l'enregistrement terminé */
  handleAudioRecordingComplete: (audioBlob: Blob, duration: number, metadata?: any) => Promise<void>;
  /** Handler pour supprimer l'enregistrement */
  handleRemoveAudioRecording: () => void;
  /** Handler appelé avant l'arrêt */
  handleBeforeStop: () => void;
  /** Handler pour le clic sur le bouton micro */
  handleMicrophoneClick: () => Promise<void>;
  /** Reset complet de l'état audio */
  resetAudioState: () => void;
}

/**
 * Crée un File à partir d'un Blob de manière compatible avec Safari.
 * Sur Safari, les blobs créés par MediaRecorder peuvent causer "WebKitBlobResource error 1"
 */
async function createSafariSafeFile(blob: Blob, filename: string, mimeType: string): Promise<File> {
  console.log('🔧 [createSafariSafeFile] Input:', {
    blobSize: blob.size,
    blobType: blob.type,
    targetMimeType: mimeType,
    filename
  });

  if (blob.size === 0) {
    console.error('❌ [createSafariSafeFile] ERROR: Input blob has size 0!');
    throw new Error('Cannot create file from empty blob');
  }

  try {
    if (typeof blob.arrayBuffer === 'function') {
      const arrayBuffer = await blob.arrayBuffer();
      console.log('🔧 [createSafariSafeFile] ArrayBuffer created:', { byteLength: arrayBuffer.byteLength });

      if (arrayBuffer.byteLength === 0) {
        console.error('❌ [createSafariSafeFile] ERROR: ArrayBuffer is empty');
        throw new Error('ArrayBuffer conversion resulted in empty data');
      }

      const materializedBlob = new Blob([arrayBuffer], { type: mimeType });
      const file = new File([materializedBlob], filename, { type: mimeType, lastModified: Date.now() });

      console.log('🔧 [createSafariSafeFile] Final file:', { name: file.name, size: file.size, type: file.type });

      if (file.size === 0) {
        console.error('❌ [createSafariSafeFile] ERROR: Final file has size 0!');
        throw new Error('File creation resulted in empty file');
      }

      return file;
    }

    throw new Error('blob.arrayBuffer not available');
  } catch (error) {
    console.warn('⚠️ [createSafariSafeFile] Method 1 failed:', error);
    console.log('🔧 [createSafariSafeFile] Trying FileReader fallback...');

    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        try {
          const arrayBuffer = reader.result as ArrayBuffer;
          console.log('🔧 [createSafariSafeFile] FileReader success:', { byteLength: arrayBuffer.byteLength });

          if (arrayBuffer.byteLength === 0) {
            reject(new Error('FileReader produced empty ArrayBuffer'));
            return;
          }

          const materializedBlob = new Blob([arrayBuffer], { type: mimeType });
          const file = new File([materializedBlob], filename, { type: mimeType, lastModified: Date.now() });

          console.log('🔧 [createSafariSafeFile] FileReader final file:', { name: file.name, size: file.size, type: file.type });

          if (file.size === 0) {
            reject(new Error('FileReader file creation resulted in empty file'));
            return;
          }

          resolve(file);
        } catch (err) {
          reject(err);
        }
      };

      reader.onerror = () => {
        console.error('❌ [createSafariSafeFile] FileReader error:', reader.error);
        reject(reader.error || new Error('FileReader failed'));
      };

      reader.readAsArrayBuffer(blob);
    });
  }
}

/**
 * Obtient l'extension correcte selon le MIME type audio
 */
function getAudioFileExtension(mimeType: string): string {
  const cleanMimeType = mimeType.split(';')[0].trim();
  if (cleanMimeType.includes('webm')) return 'webm';
  if (cleanMimeType.includes('mp4') || cleanMimeType.includes('m4a')) return 'm4a';
  if (cleanMimeType.includes('ogg')) return 'ogg';
  if (cleanMimeType.includes('wav')) return 'wav';
  if (cleanMimeType.includes('mpeg') || cleanMimeType.includes('mp3')) return 'mp3';
  return 'webm';
}

/**
 * Hook pour gérer l'enregistrement audio
 */
export function useAudioRecorder({
  onAudioReady,
}: UseAudioRecorderOptions): UseAudioRecorderReturn {
  // États
  const [showAudioRecorder, setShowAudioRecorder] = useState(false);
  const [currentAudioBlob, setCurrentAudioBlob] = useState<AudioBlobData | null>(null);
  const [audioRecorderKey, setAudioRecorderKey] = useState(0);
  const [isRecording, setIsRecording] = useState(false);

  // Refs
  const audioRecorderRef = useRef<any>(null);
  const shouldUploadAfterStopRef = useRef(false);
  const currentAudioBlobRef = useRef<AudioBlobData | null>(null);

  // Handler pour le changement d'état d'enregistrement
  const handleRecordingStateChange = useCallback((recording: boolean) => {
    setIsRecording(recording);
  }, []);

  // Handler pour l'enregistrement terminé
  const handleAudioRecordingComplete = useCallback(async (audioBlob: Blob, duration: number, metadata?: any) => {
    console.log('🎵 [useAudioRecorder] Audio recording complete:', {
      duration,
      hasMetadata: !!metadata,
      metadata: metadata,
      hasAudioEffectsTimeline: !!metadata?.audioEffectsTimeline,
      audioEffectsTimelineEvents: metadata?.audioEffectsTimeline?.events?.length || 0
    });

    const blobData = { blob: audioBlob, duration };
    currentAudioBlobRef.current = blobData;
    setCurrentAudioBlob(blobData);

    if (shouldUploadAfterStopRef.current) {
      shouldUploadAfterStopRef.current = false;

      const cleanMimeType = audioBlob.type.split(';')[0].trim();
      const extension = getAudioFileExtension(audioBlob.type);
      const filename = `audio_${Date.now()}.${extension}`;

      const audioFile = await createSafariSafeFile(audioBlob, filename, cleanMimeType);

      // Reset l'état audio IMMÉDIATEMENT avant l'upload
      currentAudioBlobRef.current = null;
      setCurrentAudioBlob(null);
      setShowAudioRecorder(false);
      setIsRecording(false);

      console.log('📤 [useAudioRecorder] Preparing to upload audio with metadata:', {
        filename,
        metadataArray: metadata ? [metadata] : undefined,
        hasTimeline: !!metadata?.audioEffectsTimeline
      });

      // Ce son sort du MICRO de l'application : il n'a encore été entendu par
      // personne. Rien dans le fichier ne le distingue d'un son importé — seul
      // ce chemin le sait, et seulement à cet instant. Non déclarée ici, la
      // provenance est perdue pour toujours, et la feuille de partage qui
      // proposera de PUBLIER cette note vocale des jours plus tard n'aura plus
      // rien à quoi demander confirmation.
      // @see packages/shared/utils/forward-to-publication.ts
      await onAudioReady([audioFile], [{ ...(metadata ?? {}), capturedInApp: true }]);
    }
  }, [onAudioReady]);

  // Handler pour supprimer l'enregistrement
  const handleRemoveAudioRecording = useCallback(() => {
    setShowAudioRecorder(false);
    setCurrentAudioBlob(null);
    currentAudioBlobRef.current = null;
    setIsRecording(false);
    shouldUploadAfterStopRef.current = false;
  }, []);

  // Handler appelé AVANT l'arrêt
  const handleBeforeStop = useCallback(() => {
    shouldUploadAfterStopRef.current = true;
  }, []);

  // Handler pour le clic sur le bouton micro
  const handleMicrophoneClick = useCallback(async () => {
    // Si un enregistrement est EN COURS
    if (showAudioRecorder && isRecording) {
      shouldUploadAfterStopRef.current = true;
      audioRecorderRef.current?.stopRecording();
      return;
    }

    // Si pas d'enregistrement en cours mais recorder ouvert (mode lecture)
    if (showAudioRecorder && currentAudioBlobRef.current) {
      const cleanMimeType = currentAudioBlobRef.current.blob.type.split(';')[0].trim();
      const extension = getAudioFileExtension(currentAudioBlobRef.current.blob.type);
      const filename = `audio_${Date.now()}.${extension}`;

      const audioFile = await createSafariSafeFile(currentAudioBlobRef.current.blob, filename, cleanMimeType);

      await onAudioReady([audioFile]);

      currentAudioBlobRef.current = null;
      setCurrentAudioBlob(null);
      setShowAudioRecorder(false);
      setIsRecording(false);
      return;
    }

    // Sinon, ouvrir le recorder
    if (!showAudioRecorder) {
      setShowAudioRecorder(true);
      setAudioRecorderKey(prev => prev + 1);
    }
  }, [showAudioRecorder, isRecording, onAudioReady]);

  // Reset complet de l'état audio
  const resetAudioState = useCallback(() => {
    setShowAudioRecorder(false);
    setCurrentAudioBlob(null);
    currentAudioBlobRef.current = null;
    setAudioRecorderKey(0);
    setIsRecording(false);
    shouldUploadAfterStopRef.current = false;
  }, []);

  return {
    showAudioRecorder,
    currentAudioBlob,
    audioRecorderKey,
    isRecording,
    audioRecorderRef,
    handleRecordingStateChange,
    handleAudioRecordingComplete,
    handleRemoveAudioRecording,
    handleBeforeStop,
    handleMicrophoneClick,
    resetAudioState,
  };
}
