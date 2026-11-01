/**
 * Copier un `PostMedia` — sa LIGNE et ses OCTETS.
 *
 * Un `PostMedia` n'a qu'un propriétaire (`mediaOwnership.ts`), et une story
 * détruit les octets de ses médias à son expiration (`reclaimMediaRowBytes`),
 * vignette, variantes et rendus compris. Une seconde publication qui veut le
 * même média en reçoit donc une copie entière : chaque fichier dérivé est
 * dupliqué avec lui, sans quoi la copie servirait au lendemain des adresses
 * mortes.
 *
 * Une source dont le rendu différé n'est pas fini (`processingState:
 * 'pending'`, #11264) ne prête aucun dérivé : sa copie naît `pending` avec ses
 * seuls octets, et le balayage des pièces en attente la rend sur ses propres
 * octets — copier une vignette que ce rendu remplacerait laisserait un
 * fichier orphelin.
 *
 * Deux sites copient : le réel compagnon d'une story (`storyReelCompanion.ts`,
 * copies EN ATTENTE, réclamées ensuite par `createPost`) et la publication
 * sœur d'un même geste (`siblingPublicationMedia.ts`, copies rattachées
 * d'emblée au post qui les reçoit).
 */

import type { Prisma, PrismaClient } from '@meeshy/shared/prisma/client';
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
  imageVariants: true,
  avifVariants: true,
  renditions: true,
  processingState: true,
  duration: true,
  codec: true,
  videoCodec: true,
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
  imageVariants?: Prisma.JsonValue | null;
  avifVariants?: Prisma.JsonValue | null;
  renditions?: Prisma.JsonValue | null;
  processingState?: string | null;
  duration: number | null;
  codec: string | null;
  videoCodec?: string | null;
  lensSlug: string | null;
};

/**
 * Les copies écrites : source → copie pour les ids (`idMap`) et pour les
 * adresses, dérivés compris (`urlMap`) — une scène désigne ses médias par les
 * deux —, l'adresse de chaque copie (`urlById`, pour la scène qui ne désigne
 * son fond que par l'id), les octets écrits (`bytes`, que le quota d'envoi
 * débite) et ce qu'il faut défaire si le geste n'aboutit pas.
 */
export type PostMediaCopies = {
  readonly idMap: Readonly<Record<string, string>>;
  readonly urlMap: Readonly<Record<string, string>>;
  readonly urlById: Readonly<Record<string, string>>;
  readonly bytes: number;
  readonly rowIds: readonly string[];
  readonly fileUrls: readonly string[];
};

export type PostMediaCopyPrisma = {
  postMedia: Pick<PrismaClient['postMedia'], 'create' | 'deleteMany'>;
};

type CopyStorage = Pick<MediaStorage, 'duplicate' | 'delete'>;

type Written = {
  rowIds: string[];
  fileUrls: string[];
  idMap: Record<string, string>;
  urlMap: Record<string, string>;
  urlById: Record<string, string>;
  bytes: number;
};

const PENDING = 'pending';

async function duplicateInto(storage: CopyStorage, written: Written, sourceUrl: string) {
  const copy = await storage.duplicate(sourceUrl);
  written.fileUrls.push(copy.fileUrl);
  written.urlMap[sourceUrl] = copy.fileUrl;
  written.bytes += copy.fileSize;
  return copy;
}

const isRecord = (value: unknown): value is Prisma.JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Une colonne de dérivés (`imageVariants`, `avifVariants`, `renditions`) recopiée sur ses propres fichiers. */
async function copiedDerivatives(
  storage: CopyStorage,
  written: Written,
  column: Prisma.JsonValue | null | undefined,
): Promise<Prisma.InputJsonArray | undefined> {
  if (!Array.isArray(column)) return undefined;
  const entries = column.filter(isRecord).filter((entry) => typeof entry.url === 'string');
  const copied: Prisma.InputJsonObject[] = [];
  for (const entry of entries) {
    const copy = await duplicateInto(storage, written, entry.url as string);
    copied.push({ ...(entry as Prisma.InputJsonObject), url: copy.fileUrl });
  }
  return copied.length > 0 ? copied : undefined;
}

async function copyOne(
  { prisma, storage, authorId, postId }: CopyParams,
  written: Written,
  source: PostMediaCopySource,
): Promise<void> {
  const pending = source.processingState === PENDING;
  const copy = await duplicateInto(storage, written, source.fileUrl);
  const thumb = !pending && source.thumbnailUrl ? await duplicateInto(storage, written, source.thumbnailUrl) : undefined;
  const imageVariants = pending ? undefined : await copiedDerivatives(storage, written, source.imageVariants);
  const avifVariants = pending ? undefined : await copiedDerivatives(storage, written, source.avifVariants);
  const renditions = pending ? undefined : await copiedDerivatives(storage, written, source.renditions);
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
      ...(imageVariants ? { imageVariants } : {}),
      ...(avifVariants ? { avifVariants } : {}),
      ...(renditions ? { renditions } : {}),
      ...(source.processingState ? { processingState: source.processingState } : {}),
      duration: source.duration ?? undefined,
      codec: source.codec ?? undefined,
      videoCodec: source.videoCodec ?? undefined,
      ...(source.lensSlug ? { lensSlug: source.lensSlug } : {}),
      ...(postId ? { postId } : {}),
      uploaderId: authorId,
    },
    select: { id: true },
  });
  written.rowIds.push(row.id);
  written.idMap[source.id] = row.id;
  written.urlById[row.id] = copy.fileUrl;
}

const declaredSizes = (column: Prisma.JsonValue | null | undefined): number =>
  Array.isArray(column)
    ? column.filter(isRecord).reduce((sum, entry) => sum + (typeof entry.size === 'number' && entry.size > 0 ? entry.size : 0), 0)
    : 0;

/**
 * Les octets qu'une copie de `source` écrira, tels que la ligne les déclare :
 * le fichier, et les dérivés qu'elle prête (une source `pending` n'en prête
 * aucun). La vignette n'a pas de taille en base : l'écart se règle une fois
 * la copie faite.
 */
export function expectedCopyBytes(source: PostMediaCopySource): number {
  if (source.processingState === PENDING) return source.fileSize;
  return source.fileSize + declaredSizes(source.imageVariants) + declaredSizes(source.avifVariants) + declaredSizes(source.renditions);
}

type CopyParams = {
  readonly prisma: PostMediaCopyPrisma;
  readonly storage: CopyStorage;
  readonly authorId: string;
  readonly sources: readonly PostMediaCopySource[];
  readonly postId?: string;
};

/**
 * Copie chaque source. Tout ou rien : une copie qui échoue défait celles déjà
 * écrites — octets puis lignes — avant de relancer l'erreur.
 */
export async function copyPostMedia(params: CopyParams): Promise<PostMediaCopies> {
  const { prisma, storage, sources } = params;
  const written: Written = { rowIds: [], fileUrls: [], idMap: {}, urlMap: {}, urlById: {}, bytes: 0 };
  try {
    for (const source of sources) {
      await copyOne(params, written, source);
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
