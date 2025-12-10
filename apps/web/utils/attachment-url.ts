/**
 * Utilitaires pour construire les URLs d'attachements
 * Transforme les chemins relatifs en URLs complètes selon l'environnement
 */

/**
 * Construit l'URL complète d'un attachement à partir d'un chemin relatif ou absolu
 *
 * Exemples:
 * - Input: "/api/attachments/file/2024/11/userId/photo.jpg"
 *   Output: "https://gate.meeshy.me/api/attachments/file/2024/11/userId/photo.jpg"
 *
 * - Input: "2024/11/userId/photo.jpg" (chemin relatif sans slash)
 *   Output: "https://gate.meeshy.me/api/attachments/file/2024/11/userId/photo.jpg"
 *
 * - Input: "http://localhost:3000/api/attachments/file/..."
 *   Output: "http://localhost:3000/api/attachments/file/..." (passthrough pour compatibilité)
 *
 * - Input: "https://meeshy.me/2024/11/userId/photo.jpg" (URL incorrecte ancienne)
 *   Output: "https://gate.meeshy.me/api/attachments/file/2024/11/userId/photo.jpg" (corrigée)
 *
 * @param relativePath - Chemin relatif ou URL absolue
 * @returns URL complète
 */
export function buildAttachmentUrl(relativePath: string | null | undefined): string | null {
  // Retourner null si le chemin est vide
  if (!relativePath) {
    return null;
  }

  // Récupérer l'URL du backend depuis les variables d'environnement
  const backendUrl =
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://localhost:3000'; // Fallback

  // Si c'est déjà une URL complète (http:// ou https://)
  if (relativePath.startsWith('http://') || relativePath.startsWith('https://')) {
    try {
      const url = new URL(relativePath);
      const pathname = url.pathname;

      // Détecter les URLs mal formées qui n'ont pas le préfixe /api/attachments/file/
      // mais qui pointent vers un chemin de fichier (pattern: /YYYY/MM/userId/filename)
      const isDatePath = /^\/\d{4}\/\d{2}\//.test(pathname);
      const hasCorrectPrefix = pathname.startsWith('/api/attachments/file/');

      if (isDatePath && !hasCorrectPrefix) {
        // URL mal formée, reconstruire avec le bon préfixe et le bon domaine
        const correctedPath = `/api/attachments/file${pathname}`;
        return `${backendUrl}${correctedPath}`;
      }

      // Si l'URL a le bon préfixe mais pointe vers le mauvais domaine (meeshy.me au lieu de gate.meeshy.me)
      if (hasCorrectPrefix && url.hostname === 'meeshy.me') {
        return `${backendUrl}${pathname}`;
      }

      // URL déjà correcte, la retourner telle quelle
      return relativePath;
    } catch (e) {
      // URL invalide, retourner telle quelle
      return relativePath;
    }
  }

  // Si c'est un chemin relatif avec /api/attachments/file/, construire l'URL complète
  if (relativePath.startsWith('/api/attachments/file/')) {
    return `${backendUrl}${relativePath}`;
  }

  // Si c'est un chemin relatif commençant par /, ajouter le préfixe API
  if (relativePath.startsWith('/')) {
    // Vérifier si c'est un chemin de date (YYYY/MM/)
    const isDatePath = /^\/\d{4}\/\d{2}\//.test(relativePath);
    if (isDatePath) {
      return `${backendUrl}/api/attachments/file${relativePath}`;
    }
    return `${backendUrl}${relativePath}`;
  }

  // Si c'est un chemin relatif sans slash (ex: "2024/11/userId/photo.jpg")
  // Pattern: YYYY/MM/userId/filename
  const isDatePath = /^\d{4}\/\d{2}\//.test(relativePath);
  if (isDatePath) {
    return `${backendUrl}/api/attachments/file/${relativePath}`;
  }

  // Cas improbable - retourner tel quel avec un warning
  console.warn('[AttachmentURL] Format de chemin inattendu:', relativePath);
  return relativePath;
}

/**
 * Construit les URLs pour un attachement (fileUrl et thumbnailUrl)
 *
 * @param attachment - Objet attachement avec fileUrl et thumbnailUrl
 * @returns Objet avec fileUrl et thumbnailUrl construites
 */
export function buildAttachmentUrls<T extends { fileUrl?: string | null; thumbnailUrl?: string | null }>(
  attachment: T
): T & { fileUrl: string | null; thumbnailUrl: string | null } {
  return {
    ...attachment,
    fileUrl: buildAttachmentUrl(attachment.fileUrl),
    thumbnailUrl: buildAttachmentUrl(attachment.thumbnailUrl),
  };
}

/**
 * Construit les URLs pour un tableau d'attachements
 *
 * @param attachments - Tableau d'attachements
 * @returns Tableau avec URLs construites
 */
export function buildAttachmentsUrls<T extends { fileUrl?: string | null; thumbnailUrl?: string | null }>(
  attachments: T[]
): Array<T & { fileUrl: string | null; thumbnailUrl: string | null }> {
  return attachments.map(buildAttachmentUrls);
}

/**
 * Vérifie si une URL d'attachement est relative ou absolue
 *
 * @param url - URL à vérifier
 * @returns true si l'URL est relative, false si elle est absolue
 */
export function isRelativeUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return url.startsWith('/') && !url.startsWith('//');
}

/**
 * Extrait le chemin relatif d'une URL absolue
 * Utile pour la migration inverse si nécessaire
 *
 * @param absoluteUrl - URL absolue
 * @returns Chemin relatif
 */
export function extractRelativePath(absoluteUrl: string | null | undefined): string | null {
  if (!absoluteUrl) return null;

  try {
    const url = new URL(absoluteUrl);
    return url.pathname;
  } catch (e) {
    // Si ce n'est pas une URL valide, vérifier si c'est déjà un chemin relatif
    if (absoluteUrl.startsWith('/')) {
      return absoluteUrl;
    }
    console.warn('[AttachmentURL] Impossible d\'extraire le chemin relatif:', absoluteUrl);
    return absoluteUrl;
  }
}
