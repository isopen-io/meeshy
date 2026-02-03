/**
 * Utilitaires pour le recadrage d'images
 * Utilisé pour créer des avatars carrés à partir d'images uploadées
 */

import { Area } from 'react-easy-crop';

/**
 * Crée une image HTMLImageElement à partir d'une URL
 */
export const createImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', (error) => reject(error));
    image.setAttribute('crossOrigin', 'anonymous'); // Éviter les problèmes CORS
    image.src = url;
  });

/**
 * Obtient l'angle de rotation en radians
 */
export function getRadianAngle(degreeValue: number): number {
  return (degreeValue * Math.PI) / 180;
}

/**
 * Retourne la taille du canvas après rotation
 */
export function rotateSize(width: number, height: number, rotation: number) {
  const rotRad = getRadianAngle(rotation);

  return {
    width:
      Math.abs(Math.cos(rotRad) * width) + Math.abs(Math.sin(rotRad) * height),
    height:
      Math.abs(Math.sin(rotRad) * width) + Math.abs(Math.cos(rotRad) * height),
  };
}

/**
 * Interface pour les pixels recadrés
 */
export interface CroppedPixels {
  file: File;
  url: string;
}

/**
 * Génère l'image recadrée en tant que Blob/File
 * 
 * @param imageSrc - URL source de l'image
 * @param pixelCrop - Zone de recadrage en pixels
 * @param rotation - Angle de rotation en degrés
 * @param fileName - Nom du fichier de sortie
 * @returns Promise contenant le fichier recadré et son URL
 */
export async function getCroppedImg(
  imageSrc: string,
  pixelCrop: Area,
  rotation = 0,
  fileName = 'cropped-image.jpg'
): Promise<CroppedPixels> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Impossible de créer le contexte canvas');
  }

  const rotRad = getRadianAngle(rotation);

  // Calculer la taille du canvas après rotation
  const { width: bBoxWidth, height: bBoxHeight } = rotateSize(
    image.width,
    image.height,
    rotation
  );

  // Définir la taille du canvas pour contenir l'image tournée
  canvas.width = bBoxWidth;
  canvas.height = bBoxHeight;

  // Translater le canvas au centre avant de tourner
  ctx.translate(bBoxWidth / 2, bBoxHeight / 2);
  ctx.rotate(rotRad);
  ctx.translate(-image.width / 2, -image.height / 2);

  // Dessiner l'image tournée
  ctx.drawImage(image, 0, 0);

  // Récupérer les données du canvas
  const croppedCanvas = document.createElement('canvas');
  const croppedCtx = croppedCanvas.getContext('2d');

  if (!croppedCtx) {
    throw new Error('Impossible de créer le contexte canvas pour le recadrage');
  }

  // Définir la taille du canvas de sortie (carré)
  croppedCanvas.width = pixelCrop.width;
  croppedCanvas.height = pixelCrop.height;

  // Dessiner la partie recadrée
  croppedCtx.drawImage(
    canvas,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
  );

  // Convertir en Blob
  return new Promise((resolve, reject) => {
    croppedCanvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Échec de la création du blob'));
        return;
      }

      // Créer un File à partir du Blob
      const file = new File([blob], fileName, {
        type: 'image/jpeg',
        lastModified: Date.now(),
      });

      // Créer une URL pour la prévisualisation
      const url = URL.createObjectURL(blob);

      resolve({ file, url });
    }, 'image/jpeg', 0.95); // Qualité de 95%
  });
}

/**
 * Nettoie une URL d'objet blob
 */
export function cleanupObjectUrl(url: string | null): void {
  if (url && url.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
}

