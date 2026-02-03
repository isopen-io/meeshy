/**
 * Utilitaires pour la gestion des avatars
 */

/**
 * Génère un nom de fichier unique pour l'avatar
 */
export function generateAvatarFilename(originalName: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const extension = originalName.split('.').pop() || 'jpg';
  return `avatar_${timestamp}_${random}.${extension}`;
}

/**
 * Génère le chemin de dossier basé sur la date actuelle
 */
export function generateAvatarPath(): { year: string; month: string; fullPath: string } {
  const now = new Date();
  const year = now.getFullYear().toString();
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const fullPath = `u/i/${year}/${month}`;
  
  return { year, month, fullPath };
}

/**
 * Génère l'URL complète de l'avatar
 */
export function generateAvatarUrl(filename: string, year: string, month: string): string {
  const protocol = window.location.protocol;
  const hostname = window.location.hostname;
  const port = window.location.port;
  const baseUrl = port ? `${protocol}//${hostname}:${port}` : `${protocol}//${hostname}`;
  
  return `${baseUrl}/u/i/${year}/${month}/${filename}`;
}

/**
 * Sauvegarde un fichier avatar dans le système de fichiers local
 */
export async function saveAvatarFile(file: File): Promise<{ url: string; filename: string }> {
  const { year, month, fullPath } = generateAvatarPath();
  const filename = generateAvatarFilename(file.name);
  
  // Créer le dossier s'il n'existe pas
  const folderPath = `public/${fullPath}`;
  
  // Pour le moment, on simule la sauvegarde
  // Dans un vrai environnement, il faudrait une API pour sauvegarder le fichier
  const url = generateAvatarUrl(filename, year, month);
  
  return { url, filename };
}

/**
 * Convertit un fichier en base64 pour l'upload
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
  });
}

/**
 * Valide un fichier d'avatar
 */
export function validateAvatarFile(file: File): { valid: boolean; error?: string } {
  // Vérifier la taille (max 5MB)
  if (file.size > 5 * 1024 * 1024) {
    return { valid: false, error: 'La taille de l\'image ne doit pas dépasser 5MB' };
  }
  
  // Vérifier le type de fichier
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (!allowedTypes.includes(file.type)) {
    return { valid: false, error: 'Format d\'image non supporté. Utilisez JPEG, PNG ou WebP' };
  }
  
  return { valid: true };
}
