/**
 * Hook pour gérer la génération et le cleanup des miniatures d'images
 */

import { useState, useEffect, useRef } from 'react';
import { createThumbnailsBatch, isLowEndDevice } from '@/lib/utils/image-thumbnail';

export function useThumbnails(files: File[]) {
  const [thumbnails, setThumbnails] = useState<Map<string, string>>(new Map());
  const [isGeneratingThumbnails, setIsGeneratingThumbnails] = useState(false);
  const processedFilesRef = useRef<Set<string>>(new Set());
  const thumbnailsRef = useRef<Map<string, string>>(new Map());
  const isLowEnd = useRef(isLowEndDevice()).current;

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

  return {
    thumbnails,
    isGeneratingThumbnails,
  };
}
