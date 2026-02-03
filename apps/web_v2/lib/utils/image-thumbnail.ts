/**
 * Utilitaire pour créer des miniatures optimisées d'images
 * Utilise Canvas pour réduire la taille et améliorer les performances
 */

interface ThumbnailOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  useWebWorker?: boolean;
}

/**
 * Crée une miniature optimisée d'une image
 * Cette méthode est BEAUCOUP plus rapide que URL.createObjectURL
 * car elle réduit la résolution et la qualité
 */
export async function createImageThumbnail(
  file: File,
  options: ThumbnailOptions = {}
): Promise<string> {
  const {
    maxWidth = 120,
    maxHeight = 120,
    quality = 0.7,
  } = options;

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const img = new Image();
      
      img.onload = () => {
        // Calculer les dimensions de la miniature en conservant le ratio
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        // Créer un canvas pour la miniature
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Impossible de créer le contexte canvas'));
          return;
        }

        // Désactiver le lissage pour de meilleures performances
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'low';

        // Dessiner l'image redimensionnée
        ctx.drawImage(img, 0, 0, width, height);

        // Convertir en blob URL avec compression
        canvas.toBlob(
          (blob) => {
            if (blob) {
              const thumbnailUrl = URL.createObjectURL(blob);
              resolve(thumbnailUrl);
            } else {
              reject(new Error('Échec de création du blob'));
            }
          },
          file.type,
          quality
        );
      };

      img.onerror = () => {
        reject(new Error('Échec de chargement de l\'image'));
      };

      img.src = e.target?.result as string;
    };

    reader.onerror = () => {
      reject(new Error('Échec de lecture du fichier'));
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Crée plusieurs miniatures en batch de manière asynchrone
 * Pour éviter de bloquer l'UI
 */
export async function createThumbnailsBatch(
  files: File[],
  options: ThumbnailOptions = {}
): Promise<Map<string, string>> {
  const thumbnails = new Map<string, string>();
  
  // Traiter les fichiers par lots de 2 pour ne pas surcharger
  const batchSize = 2;
  
  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);
    
    // Traiter le batch en parallèle
    const promises = batch.map(async (file) => {
      const fileKey = `${file.name}-${file.size}-${file.lastModified}`;
      
      if (file.type.startsWith('image/')) {
        try {
          const thumbnailUrl = await createImageThumbnail(file, options);
          return { fileKey, thumbnailUrl };
        } catch (error) {
          console.warn('Erreur création miniature:', error);
          return null;
        }
      }
      return null;
    });
    
    const results = await Promise.all(promises);
    
    // Ajouter les résultats réussis
    results.forEach(result => {
      if (result) {
        thumbnails.set(result.fileKey, result.thumbnailUrl);
      }
    });
    
    // Laisser respirer le thread principal entre les batches
    if (i + batchSize < files.length) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  
  return thumbnails;
}

/**
 * Vérifie si l'appareil est probablement un mobile bas de gamme
 * Pour adapter les performances
 */
export function isLowEndDevice(): boolean {
  // Vérifier la mémoire disponible
  const memory = (navigator as any).deviceMemory;
  if (memory && memory < 4) return true;
  
  // Vérifier le nombre de CPU
  const cpuCores = navigator.hardwareConcurrency;
  if (cpuCores && cpuCores < 4) return true;
  
  // Vérifier si c'est un mobile
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  
  return isMobile;
}

