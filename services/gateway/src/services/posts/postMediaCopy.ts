/**
 * Copier un `PostMedia` — sa LIGNE et ses OCTETS.
 *
 * Un `PostMedia` n'a qu'un propriétaire (`mediaOwnership.ts`), et une story
 * détruit les octets de ses médias à son expiration (`reclaimMediaRowBytes`).
 * Une seconde publication qui veut le même média en reçoit donc une copie
 * entière, vignette comprise : deux lignes sur un même fichier laisseraient la
 * seconde muette au lendemain.
 *
 * Deux sites copient : le réel compagnon d'une story (`storyReelCompanion.ts`,
 * copies EN ATTENTE, réclamées ensuite par `createPost`) et la publication
 * sœur d'un même geste (`siblingPublicationMedia.ts`, copies rattachées
 * d'emblée au post qui les reçoit).
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { MediaStorage } from '../storage/MediaStorage';

export const POST_MEDIA_COPY_SELECT = {
  id: true,
  fileName: true,
  originalName: true,
  mimeType: true,
  fileSize: true,
  filePath: true,
  fileUrl: true,
  width: true,
  height: true,
  thumbnailUrl: true,
  thumbHash: true,
  duration: true,
  codec: true,
  lensSlug: true,
} as const;

export type PostMediaCopySource = {
  id: string;
  fileName: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  filePath: string;
  fileUrl: string;
  width: number | null;
  height: number | null;
  thumbnailUrl: string | null;
  thumbHash: string | null;
  duration: number | null;
  codec: string | null;
  lensSlug: string | null;
};

/**
 * Les copies écrites : source → copie pour les ids (`idMap`) et pour les
 * adresses, vignettes comprises (`urlMap`) — une scène désigne ses médias par
 * les deux —, et ce qu'il faut défaire si le geste n'aboutit pas.
 */
export type PostMediaCopies = {
  readonly idMap: Readonly<Record<string, string>>;
  readonly urlMap: Readonly<Record<string, string>>;
  readonly rowIds: readonly string[];
  readonly fileUrls: readonly string[];
};

export type PostMediaCopyPrisma = {
  postMedia: Pick<PrismaClient['postMedia'], 'create' | 'deleteMany'>;
};

/**
 * Copie chaque source. Tout ou rien : une copie qui échoue défait celles déjà
 * écrites — octets puis lignes — avant de relancer l'erreur.
 */
export async function copyPostMedia(params: {
  readonly prisma: PostMediaCopyPrisma;
  readonly storage: Pick<MediaStorage, 'duplicate' | 'delete'>;
  readonly authorId: string;
  readonly sources: readonly PostMediaCopySource[];
  readonly postId?: string;
}): Promise<PostMediaCopies> {
  const { prisma, storage, authorId, sources, postId } = params;
  const written = {
    rowIds: [] as string[],
    fileUrls: [] as string[],
    idMap: {} as Record<string, string>,
    urlMap: {} as Record<string, string>,
  };
  try {
    for (const source of sources) {
      const copy = await storage.duplicate(source.fileUrl);
      written.fileUrls.push(copy.fileUrl);
      written.urlMap[source.fileUrl] = copy.fileUrl;
      const thumb = source.thumbnailUrl ? await storage.duplicate(source.thumbnailUrl) : undefined;
      if (thumb && source.thumbnailUrl) {
        written.fileUrls.push(thumb.fileUrl);
        written.urlMap[source.thumbnailUrl] = thumb.fileUrl;
      }
      const row = await prisma.postMedia.create({
        data: {
          fileName: copy.fileName,
          originalName: source.originalName,
          mimeType: source.mimeType,
          fileSize: copy.fileSize,
          filePath: copy.filePath,
          fileUrl: copy.fileUrl,
          width: source.width ?? undefined,
          height: source.height ?? undefined,
          thumbnailUrl: thumb?.fileUrl,
          thumbnailPath: thumb?.filePath,
          thumbHash: source.thumbHash ?? undefined,
          duration: source.duration ?? undefined,
          codec: source.codec ?? undefined,
          ...(source.lensSlug ? { lensSlug: source.lensSlug } : {}),
          ...(postId ? { postId } : {}),
          uploaderId: authorId,
        },
        select: { id: true },
      });
      written.rowIds.push(row.id);
      written.idMap[source.id] = row.id;
    }
  } catch (error) {
    await Promise.all(written.fileUrls.map((url) => storage.delete(url).catch(() => undefined)));
    if (written.rowIds.length > 0) {
      await prisma.postMedia.deleteMany({ where: { id: { in: written.rowIds } } }).catch(() => undefined);
    }
    throw error;
  }
  return written;
}
