/**
 * Composant carrousel compact pour afficher les attachments sous forme d'icônes
 * Optimisé pour mobile avec miniatures légères et traitement asynchrone
 */

'use client';

import React, { useMemo, useEffect, useState, useRef } from 'react';
import { X, File, Image, FileText, Video, Music, FileArchive, Loader2, CheckCircle, Play, Pause, Maximize } from 'lucide-react';
import { formatFileSize, getAttachmentType } from '@meeshy/shared/types/attachment';
import { Button } from '../ui/button';
import { CompactVideoPlayer } from '../video/VideoPlayer';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip';
import { createThumbnailsBatch, isLowEndDevice } from '@/lib/utils/image-thumbnail';
import { ImageLightbox } from '@/components/attachments/ImageLightbox';
import { VideoLightbox } from '@/components/video/VideoLightbox';
import dynamic from 'next/dynamic';

// Chargement dynamique des lightbox pour éviter les erreurs SSR et webpack
const PDFLightboxSimple = dynamic(
  () => import('@/components/pdf/PDFLightboxSimple').then(mod => mod.PDFLightboxSimple),
  { ssr: false }
);

const TextLightbox = dynamic(
  () => import('@/components/text/TextLightbox').then(mod => mod.TextLightbox),
  { ssr: false }
);

const PPTXLightbox = dynamic(
  () => import('@/components/pptx/PPTXLightbox').then(mod => mod.PPTXLightbox),
  { ssr: false }
);

const MarkdownLightbox = dynamic(
  () => import('@/components/markdown/MarkdownLightbox').then(mod => mod.MarkdownLightbox),
  { ssr: false }
);

interface AttachmentCarouselProps {
  files: File[];
  onRemove: (index: number) => void;
  uploadProgress?: { [key: number]: number };
  disabled?: boolean;
  audioRecorderSlot?: React.ReactNode; // Slot pour la carte d'enregistrement audio
}

/**
 * Composant séparé pour l'aperçu des fichiers audio
 * Utilise des hooks React qui doivent être appelés de manière stable
 */
const AudioFilePreview = React.memo(function AudioFilePreview({
  file,
  extension,
  isUploading,
  isUploaded,
  progress
}: {
  file: File;
  extension: string;
  isUploading: boolean;
  isUploaded: boolean;
  progress: number | undefined;
}) {
  const [audioUrl, setAudioUrl] = React.useState<string | null>(null);
  const [audioDuration, setAudioDuration] = React.useState<number>(0);
  const [currentTime, setCurrentTime] = React.useState<number>(0);
  const [isPlayingAudio, setIsPlayingAudio] = React.useState(false);
  const audioRef = React.useRef<HTMLAudioElement>(null);
  const blobUrlRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    // Créer le blob URL une seule fois et le stocker dans la ref
    const url = URL.createObjectURL(file);
    blobUrlRef.current = url;
    setAudioUrl(url);

    // Créer un audio element temporaire pour obtenir la durée
    const audio = new Audio(url);
    audio.addEventListener('loadedmetadata', () => {
      setAudioDuration(audio.duration || 0);
    });

    // Cleanup : révoquer le blob URL seulement au démontage du composant
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [file]);

  // Handler pour mettre à jour le temps actuel
  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const toggleAudioPlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (audioRef.current) {
      if (isPlayingAudio) {
        audioRef.current.pause();
        setIsPlayingAudio(false);
      } else {
        audioRef.current.play().catch(error => {
          console.error('Error playing audio:', error);
        });
        setIsPlayingAudio(true);
      }
    }
  };

  // Handler pour permettre de cliquer sur la barre de progression pour changer la position
  const handleProgressBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (audioRef.current && audioDuration > 0) {
      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const percentage = clickX / rect.width;
      const newTime = percentage * audioDuration;
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  const formatTime = (seconds: number): string => {
    if (!isFinite(seconds) || isNaN(seconds)) return '0:00.00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100); // Centièmes de seconde
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  if (!audioUrl) return null;

  return (
    <>
      {/* Audio element caché */}
      <audio
        ref={audioRef}
        src={audioUrl}
        preload="metadata"
        onTimeUpdate={handleTimeUpdate}
        onEnded={() => {
          setIsPlayingAudio(false);
          setCurrentTime(0);
        }}
        onPause={() => setIsPlayingAudio(false)}
        onPlay={() => setIsPlayingAudio(true)}
        className="hidden"
      />

      {/* Container flex-col pour infos et barre de progression */}
      <div className="flex flex-col gap-1 flex-1 min-w-0">
        {/* Countdown et format */}
        <div className="flex items-center justify-between">
          <div className="text-sm font-bold text-green-600 dark:text-green-400 font-mono">
            {formatTime(isPlayingAudio ? audioDuration - currentTime : audioDuration)}
          </div>
          <div className="text-[9px] text-green-600 dark:text-green-400 font-medium">
            {extension.toUpperCase()}
          </div>
        </div>

        {/* Barre de progression - Interactive */}
        <div
          className="relative w-full h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden cursor-pointer hover:h-1.5 transition-all"
          onClick={handleProgressBarClick}
        >
          <div
            className="absolute top-0 left-0 h-full bg-green-600 dark:bg-green-500 rounded-full transition-all duration-100 pointer-events-none"
            style={{
              width: `${audioDuration > 0 ? (currentTime / audioDuration) * 100 : 0}%`
            }}
          />
        </div>

        {/* Taille et status */}
        <div className="flex items-center justify-between text-[8px] text-gray-500 dark:text-gray-400">
          <span>{(file.size / 1024).toFixed(0)} KB</span>
          <span>{isPlayingAudio ? 'Playing...' : 'Ready'}</span>
        </div>
      </div>

      {/* Bouton Play/Pause */}
      <button
        onClick={toggleAudioPlay}
        className="flex-shrink-0 w-10 h-10 bg-green-600 hover:bg-green-700 text-white rounded-full flex items-center justify-center transition-colors ml-2"
        disabled={isUploading}
      >
        {isPlayingAudio ? (
          <Pause className="w-4 h-4 fill-current" />
        ) : (
          <Play className="w-4 h-4 fill-current ml-0.5" />
        )}
      </button>

      {/* Indicateur d'upload pour audio */}
      {isUploading && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-lg">
          <div className="text-center">
            <Loader2 className="w-4 h-4 text-white animate-spin mx-auto mb-1" />
            <div className="text-white text-[8px] font-medium">
              {Math.round(progress || 0)}%
            </div>
          </div>
        </div>
      )}

      {/* Indicateur d'upload terminé pour audio */}
      {isUploaded && (
        <div className="absolute top-1 right-1">
          <CheckCircle className="w-3 h-3 text-green-500 bg-white rounded-full" />
        </div>
      )}
    </>
  );
});

export const AttachmentCarousel = React.memo(function AttachmentCarousel({
  files,
  onRemove,
  uploadProgress = {},
  disabled = false,
  audioRecorderSlot
}: AttachmentCarouselProps) {
  // Mémoriser les miniatures d'images (beaucoup plus léger que les images complètes)
  const [thumbnails, setThumbnails] = useState<Map<string, string>>(new Map());
  const [isGeneratingThumbnails, setIsGeneratingThumbnails] = useState(false);
  const processedFilesRef = useRef<Set<string>>(new Set());
  const thumbnailsRef = useRef<Map<string, string>>(new Map());
  const [isMounted, setIsMounted] = useState(false);

  // S'assurer que le composant est monté avant de charger les lightbox
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // États pour les lightbox
  const [imageLightboxIndex, setImageLightboxIndex] = useState<number>(-1);
  const [videoLightboxIndex, setVideoLightboxIndex] = useState<number>(-1);
  const [pdfLightboxFile, setPdfLightboxFile] = useState<File | null>(null);
  const [textLightboxFile, setTextLightboxFile] = useState<File | null>(null);
  const [pptxLightboxFile, setPptxLightboxFile] = useState<File | null>(null);
  const [markdownLightboxFile, setMarkdownLightboxFile] = useState<File | null>(null);
  const [fileUrls, setFileUrls] = useState<Map<string, string>>(new Map());

  // Détecter si c'est un appareil bas de gamme pour adapter les performances
  const isLowEnd = useMemo(() => isLowEndDevice(), []);

  // Créer les URLs blob pour les fichiers (images, vidéos, PDFs, textes, PPTX, markdown)
  useEffect(() => {
    const newUrls = new Map<string, string>();

    files.forEach((file) => {
      const fileKey = `${file.name}-${file.size}-${file.lastModified}`;
      const type = getAttachmentType(file.type);

      // Déterminer si le fichier a besoin d'une URL blob pour la lightbox
      const isPDF = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      const isMarkdown = file.name.toLowerCase().endsWith('.md');
      const isPPTX = file.type === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
                    file.type === 'application/vnd.ms-powerpoint' ||
                    file.name.toLowerCase().endsWith('.pptx') ||
                    file.name.toLowerCase().endsWith('.ppt');
      const isText = file.type.startsWith('text/') ||
                    file.name.toLowerCase().endsWith('.txt') ||
                    file.name.toLowerCase().endsWith('.sh') ||
                    file.name.toLowerCase().endsWith('.js') ||
                    file.name.toLowerCase().endsWith('.ts') ||
                    file.name.toLowerCase().endsWith('.py');

      // Créer des URLs blob pour tous les types de fichiers qui ont une lightbox
      if ((type === 'image' || type === 'video' || isPDF || isText || isPPTX || isMarkdown) && !fileUrls.has(fileKey)) {
        const url = URL.createObjectURL(file);
        newUrls.set(fileKey, url);
      }
    });

    if (newUrls.size > 0) {
      setFileUrls((prev) => new Map([...prev, ...newUrls]));
    }

    // Cleanup: révoquer les URLs qui ne sont plus utilisées
    return () => {
      const currentFileKeys = new Set(
        files.map((f) => `${f.name}-${f.size}-${f.lastModified}`)
      );

      fileUrls.forEach((url, key) => {
        if (!currentFileKeys.has(key)) {
          URL.revokeObjectURL(url);
        }
      });
    };
  }, [files]);

  // Synchroniser la ref avec l'état pour le cleanup
  useEffect(() => {
    thumbnailsRef.current = thumbnails;
  }, [thumbnails]);

  // Créer les miniatures de manière asynchrone et optimisée
  useEffect(() => {
    let isCancelled = false;

    const generateThumbnails = async () => {
      // Identifier les nouveaux fichiers qui nécessitent des miniatures
      const newFiles = files.filter((file) => {
        const fileKey = `${file.name}-${file.size}-${file.lastModified}`;
        return file.type.startsWith('image/') && !processedFilesRef.current.has(fileKey);
      });

      if (newFiles.length === 0) return;

      // Mark files as being processed
      newFiles.forEach((file) => {
        const fileKey = `${file.name}-${file.size}-${file.lastModified}`;
        processedFilesRef.current.add(fileKey);
      });

      setIsGeneratingThumbnails(true);

      try {
        // Créer les miniatures par batch (non bloquant)
        const newThumbnails = await createThumbnailsBatch(newFiles, {
          maxWidth: isLowEnd ? 80 : 120,
          maxHeight: isLowEnd ? 80 : 120,
          quality: isLowEnd ? 0.6 : 0.7,
        });

        if (!isCancelled) {
          setThumbnails((prev) => {
            const updated = new Map(prev);
            newThumbnails.forEach((url, key) => {
              updated.set(key, url);
            });
            return updated;
          });
        }
      } catch (error) {
        console.error('Erreur génération miniatures:', error);
      } finally {
        if (!isCancelled) {
          setIsGeneratingThumbnails(false);
        }
      }
    };

    // Différer légèrement pour ne pas bloquer le rendu initial
    const timeoutId = setTimeout(() => {
      generateThumbnails();
    }, 0);

    return () => {
      isCancelled = true;
      clearTimeout(timeoutId);
    };
  }, [files, isLowEnd]);

  // Nettoyer les miniatures qui ne sont plus utilisées
  useEffect(() => {
    const currentFileKeys = new Set(
      files.map((file) => `${file.name}-${file.size}-${file.lastModified}`)
    );

    // Clean up thumbnails
    setThumbnails((prev) => {
      let hasChanges = false;
      const updated = new Map(prev);

      prev.forEach((url, key) => {
        if (!currentFileKeys.has(key)) {
          URL.revokeObjectURL(url);
          updated.delete(key);
          hasChanges = true;
        }
      });

      return hasChanges ? updated : prev;
    });

    // Clean up processedFilesRef
    const keysToRemove: string[] = [];
    processedFilesRef.current.forEach((key) => {
      if (!currentFileKeys.has(key)) {
        keysToRemove.push(key);
      }
    });
    keysToRemove.forEach((key) => processedFilesRef.current.delete(key));
  }, [files]);

  // Cleanup final : révoquer toutes les URLs au démontage
  useEffect(() => {
    return () => {
      // Utiliser la ref pour avoir la version la plus récente au démontage
      thumbnailsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  if (files.length === 0 && !audioRecorderSlot) return null;

  const getFileIcon = (file: File) => {
    const type = getAttachmentType(file.type);
    const iconClass = "w-5 h-5";
    
    switch (type) {
      case 'image':
        return <Image className={`${iconClass} text-blue-500`} />;
      case 'video':
        return <Video className={`${iconClass} text-purple-500`} />;
      case 'audio':
        return <Music className={`${iconClass} text-green-500`} />;
      case 'text':
        return <FileText className={`${iconClass} text-gray-600`} />;
      default:
        return <File className={`${iconClass} text-gray-500`} />;
    }
  };

  const getFileExtension = (filename: string): string => {
    const parts = filename.split('.');
    return parts.length > 1 ? `.${parts[parts.length - 1]}` : '';
  };

  const getFilePreview = (file: File, index: number) => {
    const type = getAttachmentType(file.type);
    const progress = uploadProgress[index];
    const isUploading = progress !== undefined && progress < 100;
    const isUploaded = progress === 100;
    const extension = getFileExtension(file.name);
    const fileKey = `${file.name}-${file.size}-${file.lastModified}`;
    const thumbnailUrl = thumbnails.get(fileKey);

    // Afficher un placeholder si la miniature est en cours de génération
    const isLoadingThumbnail = type === 'image' && !thumbnailUrl && isGeneratingThumbnails;

    // Audio files get wider size (160x80) to match AudioRecorderCard
    const isAudio = type === 'audio';
    // Video files get wider size for preview (200x140 pour accommoder CompactVideoPlayer + bouton lightbox)
    const isVideo = type === 'video';
    const cardSizeClass = isAudio ? 'w-40 h-20' : isVideo ? 'w-50 h-36' : 'w-20 h-20';

    return (
      <TooltipProvider key={`${file.name}-${index}`}>
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <div className="relative group pt-3 pb-2">
              <div className={`relative flex ${isAudio ? 'flex-row items-center justify-between px-3' : isVideo ? 'flex-col items-center justify-center' : 'flex-col items-center justify-center'} ${cardSizeClass} bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-600 rounded-lg hover:border-blue-400 dark:hover:border-blue-500 transition-all duration-200 hover:shadow-md dark:hover:shadow-blue-500/20 ${
                isUploading ? 'border-blue-400 dark:border-blue-500' : ''
              } ${isUploaded ? 'border-green-400 dark:border-green-500' : ''} ${
                isAudio ? 'bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/30 dark:to-emerald-900/30 border-green-400 dark:border-green-500' : ''
              } ${
                isVideo ? 'bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-900/30 dark:to-violet-900/30 border-purple-400 dark:border-purple-500 p-0' : ''
              }`}>
                {/* Image preview avec miniature optimisée OU image originale si pas de miniature */}
                {type === 'image' ? (
                  <div
                    className="absolute inset-0 rounded-lg overflow-hidden cursor-pointer hover:opacity-90 hover:scale-105 transition-all group-hover:ring-2 group-hover:ring-blue-400"
                    onClick={(e) => {
                      e.stopPropagation();
                      const imageFiles = files.filter(f => getAttachmentType(f.type) === 'image');
                      const imageIndex = imageFiles.findIndex(f => `${f.name}-${f.size}-${f.lastModified}` === fileKey);
                      setImageLightboxIndex(imageIndex);
                    }}
                    title="Cliquez pour voir en plein écran"
                  >
                    {thumbnailUrl || fileUrls.get(fileKey) ? (
                      <img
                        src={thumbnailUrl || fileUrls.get(fileKey) || ''}
                        alt={file.name}
                        className="w-full h-full object-contain"
                        loading="lazy"
                        decoding="async"
                        onError={(e) => {
                          console.error('Failed to load image:', file.name);
                        }}
                      />
                    ) : isLoadingThumbnail ? (
                      /* Placeholder pendant le chargement de la miniature */
                      <div className="flex flex-col items-center gap-1">
                        <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                        <div className="text-[9px] text-gray-500 dark:text-gray-400">
                          Aperçu...
                        </div>
                      </div>
                    ) : (
                      /* Icône par défaut si pas d'image disponible */
                      <Image className="w-5 h-5 text-blue-500" />
                    )}
                    {/* Overlay with extension */}
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-1 py-0.5">
                      <div className="text-white text-[10px] font-medium truncate">
                        {extension.toUpperCase()}
                      </div>
                    </div>

                    {/* Indicateur d'upload pour les images */}
                    {isUploading && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-lg">
                        <div className="text-center">
                          <Loader2 className="w-4 h-4 text-white animate-spin mx-auto mb-1" />
                          <div className="text-white text-[8px] font-medium">
                            {Math.round(progress)}%
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Indicateur d'upload terminé pour les images */}
                    {isUploaded && (
                      <div className="absolute top-1 right-1">
                        <CheckCircle className="w-3 h-3 text-green-500 bg-white rounded-full" />
                      </div>
                    )}
                  </div>
                ) : isLoadingThumbnail ? (
                  /* Placeholder pendant le chargement de la miniature */
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                    <div className="text-[9px] text-gray-500 dark:text-gray-400">
                      Aperçu...
                    </div>
                  </div>
                ) : isVideo ? (
                  /* Prévisualisation vidéo avec CompactVideoPlayer */
                  <>
                    <div className="w-full h-full p-2 flex flex-col items-stretch justify-center gap-2">
                      <CompactVideoPlayer
                        attachment={{
                          id: fileKey,
                          fileUrl: fileUrls.get(fileKey) || URL.createObjectURL(file),
                          fileName: file.name,
                          originalName: file.name,
                          mimeType: file.type,
                          fileSize: file.size,
                          duration: undefined, // La vidéo déterminera la durée
                          createdAt: new Date().toISOString(),
                        } as any}
                        className="w-full"
                      />

                      {/* Bouton pour ouvrir en lightbox */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const videoFiles = files.filter(f => getAttachmentType(f.type) === 'video');
                          const videoIndex = videoFiles.findIndex(f => `${f.name}-${f.size}-${f.lastModified}` === fileKey);
                          setVideoLightboxIndex(videoIndex);
                        }}
                        className="w-full py-1.5 px-3 rounded-md bg-purple-100 hover:bg-purple-200 dark:bg-purple-900/30 dark:hover:bg-purple-800/40 flex items-center justify-center gap-1.5 transition-all text-xs font-medium text-purple-700 dark:text-purple-300"
                        title="Ouvrir en plein écran"
                      >
                        <Maximize className="w-3.5 h-3.5" />
                        <span>Plein écran</span>
                      </button>
                    </div>

                    {/* Indicateur d'upload pour vidéo */}
                    {isUploading && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-lg z-10">
                        <div className="text-center">
                          <Loader2 className="w-4 h-4 text-white animate-spin mx-auto mb-1" />
                          <div className="text-white text-[8px] font-medium">
                            {Math.round(progress || 0)}%
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Indicateur d'upload terminé pour vidéo */}
                    {isUploaded && (
                      <div className="absolute top-1 right-1 z-10">
                        <CheckCircle className="w-3 h-3 text-green-500 bg-white rounded-full" />
                      </div>
                    )}
                  </>
                ) : isAudio ? (
                  /* Mini lecteur audio pour les fichiers audio */
                  <AudioFilePreview
                    file={file}
                    extension={extension}
                    isUploading={isUploading}
                    isUploaded={isUploaded}
                    progress={progress}
                  />
                ) : (
                  <>
                    {/* Icon pour les autres types - Rendre cliquable pour preview */}
                    <div
                      className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 cursor-pointer hover:opacity-90 transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation();
                        // Déterminer le type de fichier et ouvrir le bon lightbox
                        const isPDF = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
                        const isMarkdown = file.name.toLowerCase().endsWith('.md');
                        const isPPTX = file.type === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
                                      file.type === 'application/vnd.ms-powerpoint' ||
                                      file.name.toLowerCase().endsWith('.pptx') ||
                                      file.name.toLowerCase().endsWith('.ppt');
                        const isText = file.type.startsWith('text/') ||
                                      file.name.toLowerCase().endsWith('.txt') ||
                                      file.name.toLowerCase().endsWith('.sh') ||
                                      file.name.toLowerCase().endsWith('.js') ||
                                      file.name.toLowerCase().endsWith('.ts') ||
                                      file.name.toLowerCase().endsWith('.py');

                        if (isPDF) {
                          setPdfLightboxFile(file);
                        } else if (isPPTX) {
                          setPptxLightboxFile(file);
                        } else if (isMarkdown) {
                          setMarkdownLightboxFile(file);
                        } else if (isText) {
                          setTextLightboxFile(file);
                        }
                      }}
                      title="Cliquez pour voir en plein écran"
                    >
                      {getFileIcon(file)}
                      <div className="text-[10px] font-medium text-gray-600 dark:text-gray-300">
                        {extension.toUpperCase()}
                      </div>
                    </div>

                    {/* Indicateur d'upload pour les autres fichiers */}
                    {isUploading && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-lg">
                        <div className="text-center">
                          <Loader2 className="w-4 h-4 text-white animate-spin mx-auto mb-1" />
                          <div className="text-white text-[8px] font-medium">
                            {Math.round(progress)}%
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Indicateur d'upload terminé pour les autres fichiers */}
                    {isUploaded && (
                      <div className="absolute top-1 right-1">
                        <CheckCircle className="w-3 h-3 text-green-500 bg-white rounded-full" />
                      </div>
                    )}
                  </>
                )}


                {/* Remove button */}
                {!disabled && !isUploading && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(index);
                    }}
                    className="!absolute !-top-0.5 !-right-0.5 !w-[22px] !h-[22px] !min-w-[22px] !min-h-[22px] !max-w-[22px] !max-h-[22px] sm:!w-[29px] sm:!h-[29px] sm:!min-w-[29px] sm:!min-h-[29px] sm:!max-w-[29px] sm:!max-h-[29px] bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-md !z-[100] !p-0"
                  >
                    <X className="!w-[11px] !h-[11px] sm:!w-[14px] sm:!h-[14px]" />
                  </button>
                )}
              </div>

              {/* Size badge */}
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 bg-gray-700 dark:bg-gray-600 text-white text-[9px] px-1.5 py-0.5 rounded-full whitespace-nowrap shadow-sm">
                {formatFileSize(file.size)}
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            <div className="text-sm">
              <div className="font-medium truncate">{file.name}</div>
              <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                {formatFileSize(file.size)} • {getAttachmentType(file.type)}
              </div>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  return (
    <div
      className="w-full max-w-full bg-gradient-to-r from-gray-50 to-gray-100/50 dark:from-gray-800 dark:to-gray-700/50 border-t border-gray-200 dark:border-gray-600"
      role="region"
      aria-label="Attachments carousel"
    >
      <div
        className="flex items-center gap-3 px-3 py-3 overflow-x-auto overflow-y-hidden w-full min-w-0"
        style={{
          // Scrollbar styling pour tous les navigateurs
          scrollbarWidth: 'thin',
          scrollbarColor: '#9ca3af #f3f4f6',
          WebkitOverflowScrolling: 'touch',
          // Hauteur minimale pour accommoder les cartes
          minHeight: '100px',
        }}
        tabIndex={0}
        role="list"
        aria-label="Attached files"
      >
        {audioRecorderSlot && (
          <div className="flex-shrink-0" role="listitem">
            {audioRecorderSlot}
          </div>
        )}
        {files.slice().reverse().map((file, reversedIndex) => {
          const index = files.length - 1 - reversedIndex;
          return (
            <div key={`${file.name}-${index}`} className="flex-shrink-0" role="listitem">
              {getFilePreview(file, index)}
            </div>
          );
        })}
      </div>

      {/* Styles pour la scrollbar Webkit (Chrome, Safari, Edge) */}
      <style jsx>{`
        div[role="list"]::-webkit-scrollbar {
          height: 8px;
        }
        div[role="list"]::-webkit-scrollbar-track {
          background: #f3f4f6;
          border-radius: 4px;
        }
        div[role="list"]::-webkit-scrollbar-thumb {
          background: #9ca3af;
          border-radius: 4px;
        }
        div[role="list"]::-webkit-scrollbar-thumb:hover {
          background: #6b7280;
        }

        /* Dark mode scrollbar */
        :global(.dark) div[role="list"]::-webkit-scrollbar-track {
          background: #374151;
        }
        :global(.dark) div[role="list"]::-webkit-scrollbar-thumb {
          background: #6b7280;
        }
        :global(.dark) div[role="list"]::-webkit-scrollbar-thumb:hover {
          background: #9ca3af;
        }

        /* Améliorer la navigation clavier */
        div[role="list"]:focus {
          outline: 2px solid #3b82f6;
          outline-offset: -2px;
        }
      `}</style>

      {/* Lightbox pour les images */}
      {imageLightboxIndex >= 0 && (() => {
        const imageFiles = files.filter(f => getAttachmentType(f.type) === 'image');
        const imageAttachments = imageFiles.map((file, idx) => {
          const fileKey = `${file.name}-${file.size}-${file.lastModified}`;
          return {
            id: fileKey,
            fileUrl: fileUrls.get(fileKey) || URL.createObjectURL(file),
            originalName: file.name,
            mimeType: file.type,
            fileSize: file.size,
            createdAt: new Date().toISOString(),
          };
        });

        return (
          <ImageLightbox
            images={imageAttachments as any}
            initialIndex={imageLightboxIndex}
            isOpen={true}
            onClose={() => setImageLightboxIndex(-1)}
          />
        );
      })()}

      {/* Lightbox pour les vidéos */}
      {videoLightboxIndex >= 0 && (() => {
        const videoFiles = files.filter(f => getAttachmentType(f.type) === 'video');
        const videoAttachments = videoFiles.map((file, idx) => {
          const fileKey = `${file.name}-${file.size}-${file.lastModified}`;
          return {
            id: fileKey,
            fileUrl: fileUrls.get(fileKey) || URL.createObjectURL(file),
            originalName: file.name,
            mimeType: file.type,
            fileSize: file.size,
            createdAt: new Date().toISOString(),
          };
        });

        return (
          <VideoLightbox
            videos={videoAttachments as any}
            initialIndex={videoLightboxIndex}
            isOpen={true}
            onClose={() => setVideoLightboxIndex(-1)}
          />
        );
      })()}

      {/* Lightbox pour les PDFs */}
      {isMounted && pdfLightboxFile && (() => {
        const fileKey = `${pdfLightboxFile.name}-${pdfLightboxFile.size}-${pdfLightboxFile.lastModified}`;
        const attachment = {
          id: fileKey,
          fileUrl: fileUrls.get(fileKey) || URL.createObjectURL(pdfLightboxFile),
          originalName: pdfLightboxFile.name,
          mimeType: pdfLightboxFile.type,
          fileSize: pdfLightboxFile.size,
          createdAt: new Date().toISOString(),
        };

        return (
          <PDFLightboxSimple
            attachment={attachment as any}
            isOpen={true}
            onClose={() => setPdfLightboxFile(null)}
          />
        );
      })()}

      {/* Lightbox pour les fichiers texte */}
      {isMounted && textLightboxFile && (() => {
        const fileKey = `${textLightboxFile.name}-${textLightboxFile.size}-${textLightboxFile.lastModified}`;
        const attachment = {
          id: fileKey,
          fileUrl: fileUrls.get(fileKey) || URL.createObjectURL(textLightboxFile),
          originalName: textLightboxFile.name,
          mimeType: textLightboxFile.type,
          fileSize: textLightboxFile.size,
          createdAt: new Date().toISOString(),
        };

        return (
          <TextLightbox
            attachment={attachment as any}
            isOpen={true}
            onClose={() => setTextLightboxFile(null)}
          />
        );
      })()}

      {/* Lightbox pour les fichiers PPTX */}
      {isMounted && pptxLightboxFile && (() => {
        const fileKey = `${pptxLightboxFile.name}-${pptxLightboxFile.size}-${pptxLightboxFile.lastModified}`;
        const attachment = {
          id: fileKey,
          fileUrl: fileUrls.get(fileKey) || URL.createObjectURL(pptxLightboxFile),
          originalName: pptxLightboxFile.name,
          mimeType: pptxLightboxFile.type,
          fileSize: pptxLightboxFile.size,
          createdAt: new Date().toISOString(),
        };

        return (
          <PPTXLightbox
            attachment={attachment as any}
            isOpen={true}
            onClose={() => setPptxLightboxFile(null)}
          />
        );
      })()}

      {/* Lightbox pour les fichiers Markdown */}
      {isMounted && markdownLightboxFile && (() => {
        const fileKey = `${markdownLightboxFile.name}-${markdownLightboxFile.size}-${markdownLightboxFile.lastModified}`;
        const attachment = {
          id: fileKey,
          fileUrl: fileUrls.get(fileKey) || URL.createObjectURL(markdownLightboxFile),
          originalName: markdownLightboxFile.name,
          mimeType: markdownLightboxFile.type,
          fileSize: markdownLightboxFile.size,
          createdAt: new Date().toISOString(),
        };

        return (
          <MarkdownLightbox
            attachment={attachment as any}
            isOpen={true}
            onClose={() => setMarkdownLightboxFile(null)}
          />
        );
      })()}
    </div>
  );
}, (prevProps, nextProps) => {
  // Optimisation : ne re-rendre que si les fichiers, la progression, le statut disabled ou le slot audio changent
  return (
    prevProps.files.length === nextProps.files.length &&
    prevProps.files.every((file, i) =>
      file === nextProps.files[i] &&
      prevProps.uploadProgress?.[i] === nextProps.uploadProgress?.[i]
    ) &&
    prevProps.disabled === nextProps.disabled &&
    prevProps.audioRecorderSlot === nextProps.audioRecorderSlot
  );
});

