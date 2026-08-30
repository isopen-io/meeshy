/**
 * Utilitaires pour construire les URLs d'attachements
 * Transforme les chemins relatifs en URLs complètes selon l'environnement
 */
import { getBackendUrl } from '@/lib/config';
import { apiPath } from '@meeshy/shared/api/prefix';

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

  // Origine API dérivée au runtime (SSOT : `getBackendUrl()` dans `lib/config.ts`).
  // Ne JAMAIS lire `process.env.NEXT_PUBLIC_*` directement ici : en prod, la valeur
  // n'est fiable qu'après le remplacement `__RUNTIME_*__` par docker-entrypoint.sh ;
  // `getBackendUrl()` retombe sur `window.location` (gate.{hostname}) sinon, au lieu
  // d'un `localhost:3000` qui casserait les médias sur meeshy.me en cas de config absente.
  const backendUrl = getBackendUrl();

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
        // #4324 — recomposer, c'est POSER une route : elle est versionnée.
        // (Un chemin qui portait DÉJÀ `/api/attachments/file/` passe plus bas
        // sans être touché : une adresse héritée qui fonctionne le reste.)
        return `${backendUrl}${apiPath(`/attachments/file${pathname}`)}`;
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

  // Si c'est un chemin relatif avec /api/v1/attachments/file/ ou /api/attachments/file/, construire l'URL complète
  if (relativePath.startsWith('/api/v1/attachments/file/') || relativePath.startsWith('/api/attachments/file/')) {
    return `${backendUrl}${relativePath}`;
  }

  // Si c'est un chemin relatif commençant par /, ajouter le préfixe API
  if (relativePath.startsWith('/')) {
    // Vérifier si c'est un chemin de date (YYYY/MM/)
    const isDatePath = /^\/\d{4}\/\d{2}\//.test(relativePath);
    if (isDatePath) {
      // #4324 — la route est VERSIONNÉE : la passerelle réclame la version, et
      // `apiPath` la tient d'une seule source configurée.
      return `${backendUrl}${apiPath(`/attachments/file${relativePath}`)}`;
    }
    return `${backendUrl}${relativePath}`;
  }

  // Ce qui reste sans barre initiale est une CLÉ DE STOCKAGE — la seule forme
  // que la base porte depuis #4324 (migration 013). Le test précédent ne
  // reconnaissait qu'un chemin de DATE (`^\d{4}/\d{2}/`) : un avatar migré
  // (`avatars/user/<id>.jpg`) tombait dans le cas « format inattendu » et était
  // rendu tel quel, donc illisible. Une clé n'a pas de forme imposée ; ce qui la
  // distingue est de n'être ni une URL ni un chemin absolu, ce que les branches
  // précédentes ont déjà écarté.
  //
  // Une clé vit toujours DANS un répertoire — `2025/12/<id>/f.pdf`,
  // `avatars/user/<id>.jpg`, `snapshots/<f>.jpg` : elle porte au moins une barre
  // oblique. Ce qui n'en a aucune n'est pas une clé, et composer une route
  // par-dessus fabriquerait une adresse qui n'existe pas.
  if (relativePath.includes('/')) {
    return `${backendUrl}${apiPath(`/attachments/file/${relativePath}`)}`;
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
