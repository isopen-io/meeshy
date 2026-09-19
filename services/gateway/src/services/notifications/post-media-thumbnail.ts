/**
 * Résolution du 1er média d'un post pour enrichir une notification — extrait
 * de `NotificationService.ts` (#7093).
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { publicMediaUrlFromEnv } from '../attachments/publicMediaUrl';

/**
 * Résout le 1er média d'un post → nature + miniature pour enrichir la
 * notification : la ligne in-app rend la vignette, le push iOS l'attache
 * (UNNotificationAttachment). Pour image on attache le fichier lui-même ;
 * pour vidéo/audio on attache la miniature générée (toujours une image).
 *
 * Défensif : retourne `null` (au lieu de jeter) si le modèle `postMedia`
 * est absent (tests) ou si le post n'a pas de média visuel — l'appelant
 * retombe alors sur le rendu texte seul.
 */
export async function resolvePostMedia(prisma: PrismaClient, postId: string): Promise<{
  mediaType: 'image' | 'video' | 'audio';
  thumbnailUrl?: string;
  thumbnailMimeType?: string;
} | null> {
  try {
    const media = await prisma.postMedia.findFirst({
      where: { postId },
      orderBy: { order: 'asc' },
      select: { mimeType: true, fileUrl: true, thumbnailUrl: true },
    });
    if (!media) return null;

    const mime = (media.mimeType ?? '').toLowerCase();
    const mediaType = mime.startsWith('image/') ? 'image'
      : mime.startsWith('video/') ? 'video'
        : mime.startsWith('audio/') ? 'audio'
          : null;
    if (!mediaType) return null;

    // Vignette poussée au client/iOS : toujours une image téléchargeable.
    // Image → le fichier ; vidéo/audio → la miniature générée (si présente).
    const rawThumb = mediaType === 'image'
      ? (media.fileUrl || media.thumbnailUrl || undefined)
      : (media.thumbnailUrl || undefined);
    const thumbnailUrl = rawThumb ? publicMediaUrlFromEnv(rawThumb) : undefined;
    const thumbnailMimeType = thumbnailUrl
      ? (mediaType === 'image' ? (media.mimeType ?? 'image/jpeg') : 'image/jpeg')
      : undefined;

    return { mediaType, thumbnailUrl, thumbnailMimeType };
  } catch {
    return null;
  }
}
