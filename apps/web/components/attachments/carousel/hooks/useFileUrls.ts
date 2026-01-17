/**
 * Hook pour gérer les URLs blob des fichiers (images, vidéos, PDFs, etc.)
 */

import { useState, useEffect } from 'react';
import { getAttachmentType } from '@meeshy/shared/types/attachment';

export function useFileUrls(files: File[]) {
  const [fileUrls, setFileUrls] = useState<Map<string, string>>(new Map());

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

  return fileUrls;
}
