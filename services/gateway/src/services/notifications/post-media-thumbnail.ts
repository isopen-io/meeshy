/**
 * Résolution du 1er média d'un post pour enrichir une notification — extrait
 * de `NotificationService.ts` (#7093).
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { publicMediaUrlFromEnv } from '../attachments/publicMediaUrl';

/**
 * Résout le 1er média d'un post → nature + miniature pour enrichir la
 * notification : la ligne in-app rend la vignette, le push iOS l'attache
 * (UNNotificationAttachment). Seule la miniature générée voyage, jamais le
 * fichier en haute définition (#14318).
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
      select: { mimeType: true, thumbnailUrl: true },
    });
    if (!media) return null;

    const mime = (media.mimeType ?? '').toLowerCase();
    const mediaType = mime.startsWith('image/') ? 'image'
      : mime.startsWith('video/') ? 'video'
        : mime.startsWith('audio/') ? 'audio'
          : null;
    if (!mediaType) return null;

    // #14318 — seule la VIGNETTE voyage, jamais le fichier en haute
    // définition : une image sans vignette part sans image.
    const thumbnailUrl = media.thumbnailUrl ? publicMediaUrlFromEnv(media.thumbnailUrl) : undefined;
    const thumbnailMimeType = thumbnailUrl ? 'image/jpeg' : undefined;

    return { mediaType, thumbnailUrl, thumbnailMimeType };
  } catch {
    return null;
  }
}
