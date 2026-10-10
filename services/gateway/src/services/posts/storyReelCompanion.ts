/**
 * « Publier AUSSI en réel » (#9476) — une story qui qualifie pour un réel part
 * en story ET en réel d'un seul geste.
 *
 * ## Le défaut
 *
 * Le porteur a publié une story (photo, texte, son emprunté de 238 s) qu'il
 * voulait aussi en réel. Un seul `POST /posts` `type: STORY` est parti : le
 * schéma n'accepte qu'un `type`, et un `PostMedia` rattaché ne se réclame plus
 * (`mediaOwnership.ts`) — un second appel n'aurait rien trouvé à attacher.
 *
 * ## La conception retenue : option `alsoAsReel`, réel servi par COPIE
 *
 * - **Un `PostMedia` n'a qu'un propriétaire.** Le réel reçoit ses PROPRES
 *   lignes, et ses propres OCTETS : une story est éphémère (21 h) et son
 *   expiration détruit les octets de ses médias (`reclaimMediaRowBytes`). Deux
 *   lignes sur un même fichier laisseraient le réel muet au lendemain. C'est
 *   la garantie que la republication d'une story tient déjà (`repostPost`,
 *   `trackedDuplicate`) ; elle est rejouée ici AVANT la publication, sur les
 *   médias encore en attente.
 * - **Tout ou rien.** La règle du réel est jugée AVANT toute écriture, sur ce
 *   que la story réclamera (médias de l'auteur + sons empruntés autorisés) :
 *   un réel qui ne qualifie pas refuse le geste entier (`REEL_NOT_QUALIFIED`),
 *   rien n'est publié. Les deux publications passent ensuite par
 *   `createPost` — la MÊME porte, donc les mêmes effets (Prisme, sons,
 *   liens) — et un échec du second retire le premier.
 * - **Les copies se nettoient seules.** Ce sont des médias EN ATTENTE de
 *   l'auteur : non réclamées (échec, crash), le balayage des 24 h
 *   (`sweepPendingPostMedia`) les détruit, octets compris.
 * - **Rétrocompatible.** Un client qui n'envoie que `type` ne passe jamais ici.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { qualifiesAsReel, type ReelMediaLike } from '@meeshy/shared/utils/reel-composition';
import type { MediaStorage } from '../storage/MediaStorage';
import { claimableMediaWhere, unclaimedMediaWhere } from './mediaOwnership';
import { withCanvasMedia } from './canvasMediaClaims';
import { extractCaptureTracks } from './captureTracks';
import { remapStoryEffectsMediaIds } from './storyEffectsMediaRemap';

export const REEL_NOT_QUALIFIED = 'REEL_NOT_QUALIFIED';
export const ALSO_AS_REEL_REQUIRES_STORY = 'ALSO_AS_REEL_REQUIRES_STORY';

/** Le geste refusé AVANT toute écriture : le réel demandé ne qualifie pas. */
export class ReelCompanionNotQualifiedError extends Error {
  readonly code = REEL_NOT_QUALIFIED;
  constructor() {
    super('alsoAsReel: the composition does not qualify as a reel');
  }
}

export type ReelCompanionPrisma = {
  postMedia: Pick<PrismaClient['postMedia'], 'findMany' | 'create' | 'deleteMany'>;
  sound: Pick<PrismaClient['sound'], 'findMany'>;
};

/**
 * Entrées « audio » synthétiques pour `qualifiesAsReel` : les sons EMPRUNTÉS
 * du blob (pistes `soundId`), avec la même garde d'autorisation que
 * `recordBorrowed` — un son privé d'autrui ou coupé ne qualifie pas plus un
 * réel qu'il ne se laisse emprunter.
 */
export async function borrowedSoundReelEntries(
  prisma: Pick<ReelCompanionPrisma, 'sound'>,
  storyEffects: Record<string, unknown> | undefined,
  authorId: string,
): Promise<Array<{ mimeType: string; duration: number | null }>> {
  const soundIds = extractCaptureTracks(storyEffects)
    .map((t) => t.soundId)
    .filter((id): id is string => Boolean(id));
  if (soundIds.length === 0) return [];
  const sounds = await prisma.sound.findMany({
    where: { id: { in: soundIds } },
    select: { durationMs: true, isPublic: true, uploaderId: true, mutedAt: true, deletedAt: true },
  });
  // #9848 — un son retiré de la bibliothèque ne s'emprunte plus : il ne
  // qualifie pas davantage un réel.
  return sounds
    .filter((s) => !s.mutedAt && !s.deletedAt && (s.isPublic || s.uploaderId === authorId))
    .map((s) => ({ mimeType: 'audio/mp4', duration: s.durationMs ?? null }));
}

/** La règle du réel sur des médias DÉJÀ lus, complétée des sons empruntés. */
export async function qualifiesAsReelWithBorrowedSounds(
  prisma: Pick<ReelCompanionPrisma, 'sound'>,
  media: ReadonlyArray<ReelMediaLike>,
  storyEffects: Record<string, unknown> | undefined,
  authorId: string,
): Promise<boolean> {
  if (qualifiesAsReel(media)) return true;
  const borrowed = await borrowedSoundReelEntries(prisma, storyEffects, authorId);
  return qualifiesAsReel([...media, ...borrowed]);
}

const SOURCE_SELECT = {
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
} as const;

type SourceMedia = {
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
};

/** Les copies écrites : la carte source → copie, et ce qu'il faut défaire. */
export type ReelCompanionCopies = {
  readonly idMap: Readonly<Record<string, string>>;
  readonly rowIds: readonly string[];
  readonly fileUrls: readonly string[];
};

/**
 * Juge le réel puis COPIE les médias que la story réclamera. Rien n'est écrit
 * si le réel ne qualifie pas. Les copies naissent EN ATTENTE, au nom de
 * l'auteur — c'est `createPost`, sous la garde de propriété ordinaire, qui les
 * rattachera au réel.
 */
export async function prepareReelCompanion(params: {
  readonly prisma: ReelCompanionPrisma;
  readonly storage: Pick<MediaStorage, 'duplicate' | 'delete'>;
  readonly authorId: string;
  readonly mediaIds: readonly string[] | undefined;
  readonly storyEffects: Record<string, unknown> | undefined;
}): Promise<ReelCompanionCopies> {
  const { prisma, storage, authorId, storyEffects } = params;
  const requested = withCanvasMedia(params.mediaIds, storyEffects) ?? [];
  const found = requested.length === 0
    ? []
    : (await prisma.postMedia.findMany({
        where: { id: { in: requested }, ...claimableMediaWhere(authorId) },
        select: SOURCE_SELECT,
      })) as SourceMedia[];
  const sources = requested
    .map((id) => found.find((m) => m.id === id))
    .filter((m): m is SourceMedia => m !== undefined);

  if (!(await qualifiesAsReelWithBorrowedSounds(prisma, sources, storyEffects, authorId))) {
    throw new ReelCompanionNotQualifiedError();
  }

  const written: { rowIds: string[]; fileUrls: string[]; idMap: Record<string, string> } = {
    rowIds: [], fileUrls: [], idMap: {},
  };
  try {
    for (const source of sources) {
      const copy = await storage.duplicate(source.fileUrl);
      written.fileUrls.push(copy.fileUrl);
      const thumb = source.thumbnailUrl ? await storage.duplicate(source.thumbnailUrl) : undefined;
      if (thumb) written.fileUrls.push(thumb.fileUrl);
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
          uploaderId: authorId,
        },
        select: { id: true },
      });
      written.rowIds.push(row.id);
      written.idMap[source.id] = row.id;
    }
  } catch (error) {
    await discardReelCompanion({ prisma, storage, copies: written });
    throw error;
  }
  return written;
}

/** Défait les copies d'un geste qui n'a pas abouti — au mieux ; le balayage reste le filet. */
export async function discardReelCompanion(params: {
  readonly prisma: Pick<ReelCompanionPrisma, 'postMedia'>;
  readonly storage: Pick<MediaStorage, 'delete'>;
  readonly copies: Pick<ReelCompanionCopies, 'rowIds' | 'fileUrls'>;
}): Promise<void> {
  const { prisma, storage, copies } = params;
  await Promise.all(copies.fileUrls.map((url) => storage.delete(url).catch(() => undefined)));
  if (copies.rowIds.length === 0) return;
  await prisma.postMedia
    .deleteMany({ where: { id: { in: [...copies.rowIds] }, ...unclaimedMediaWhere() } })
    .catch(() => undefined);
}

/** Les entrées de `createPost` que le réel reprend de la story, ids réécrits. */
export type ReelCompanionSource = {
  readonly mediaIds?: string[];
  readonly mediaAlt?: Record<string, string>;
  readonly mediaCaption?: Record<string, string>;
  readonly storyEffects?: Record<string, unknown>;
};

function rekeyed(
  map: Record<string, string> | undefined,
  idMap: Readonly<Record<string, string>>,
): Record<string, string> | undefined {
  if (!map) return undefined;
  return Object.fromEntries(
    Object.entries(map).flatMap(([id, text]) => (idMap[id] ? [[idMap[id], text]] : [])),
  );
}

/**
 * Ce que le RÉEL publie : la story, réécrite sur ses copies. Les ids que la
 * carte ne connaît pas (média d'autrui, déjà rattaché) ne sont PAS repris —
 * le réel ne réclame jamais ce que la story elle-même n'aurait pas eu.
 */
export function reelCompanionInput<T extends ReelCompanionSource>(
  story: T,
  idMap: Readonly<Record<string, string>>,
): T & { type: 'REEL' } {
  const requested = withCanvasMedia(story.mediaIds, story.storyEffects) ?? [];
  const mediaIds = requested.flatMap((id) => (idMap[id] ? [idMap[id]] : []));
  const remapped = remapStoryEffectsMediaIds(
    story.storyEffects as Parameters<typeof remapStoryEffectsMediaIds>[0],
    { ...idMap },
  );
  return {
    ...story,
    type: 'REEL',
    mediaIds: mediaIds.length > 0 ? mediaIds : undefined,
    mediaAlt: rekeyed(story.mediaAlt, idMap),
    mediaCaption: rekeyed(story.mediaCaption, idMap),
    storyEffects: remapped.effects as Record<string, unknown> | undefined,
  };
}

type CreatedPost = { readonly id: string; readonly type?: unknown };

export type PublishStoryAlsoAsReelDeps<TInput extends ReelCompanionSource, TPost extends CreatedPost> = {
  readonly prisma: ReelCompanionPrisma;
  readonly storage: Pick<MediaStorage, 'duplicate' | 'delete'>;
  readonly createPost: (input: TInput, authorId: string) => Promise<TPost>;
  readonly retractPost: (postId: string, authorId: string) => Promise<unknown>;
};

/**
 * Le geste entier : juger, copier, publier la story, publier le réel. Un échec
 * à n'importe quelle étape ne laisse RIEN de publié — ni story seule, ni réel
 * seul : l'auteur a demandé les deux, et l'interface dit ce qui est parti.
 */
export async function publishStoryAlsoAsReel<TInput extends ReelCompanionSource & { type: string }, TPost extends CreatedPost>(
  deps: PublishStoryAlsoAsReelDeps<TInput, TPost>,
  input: TInput,
  authorId: string,
): Promise<{ story: TPost; reel: TPost }> {
  const { prisma, storage, createPost, retractPost } = deps;
  const copies = await prepareReelCompanion({
    prisma, storage, authorId, mediaIds: input.mediaIds, storyEffects: input.storyEffects,
  });

  let story: TPost;
  try {
    story = await createPost({ ...input, type: 'STORY' }, authorId);
  } catch (error) {
    await discardReelCompanion({ prisma, storage, copies });
    throw error;
  }

  try {
    const reel = await createPost(reelCompanionInput(input, copies.idMap) as TInput, authorId);
    if (reel.type !== 'REEL') {
      await retractPost(reel.id, authorId);
      throw new ReelCompanionNotQualifiedError();
    }
    return { story, reel };
  } catch (error) {
    await retractPost(story.id, authorId).catch(() => undefined);
    await discardReelCompanion({ prisma, storage, copies });
    throw error;
  }
}
