/**
 * Un geste, plusieurs publications (#14305).
 *
 * Story, Post et Réel se cochent ensemble et partent d'un geste (#13919
 * Android, #13920 iOS) : une requête `POST /posts` par format, toutes avec les
 * MÊMES `mediaIds`, sur des files d'envoi indépendantes — l'ordre d'arrivée
 * n'est pas garanti, deux requêtes peuvent se croiser. Un `PostMedia` n'a
 * qu'un propriétaire : la première réclame le média, la seconde le trouvait
 * pris, publiait une liste `media` vide et une scène qui désignait le fichier
 * de l'autre, détruit à l'expiration de la story.
 *
 * La règle : une publication qui demande un média déjà rattaché à une AUTRE
 * publication VIVANTE de son propre auteur en reçoit une copie — ligne et
 * octets (`copyPostMedia`) — et sa scène enregistrée est réécrite sur elle.
 * La copie se décide APRÈS la réclamation atomique (`updateMany`) : c'est elle
 * qui départage deux requêtes croisées, et la perdante copie ce que la
 * gagnante a pris, quel que soit l'ordre.
 *
 * Rétrocompatible dans les deux sens : aucun champ ne change sur le fil, un
 * ancien client y gagne ses médias, un nouveau client n'a rien à envoyer de
 * plus. La garde de propriété ne s'élargit pas : seul l'auteur copie, depuis
 * ses propres publications non supprimées — jamais le média d'autrui, jamais
 * celui d'un commentaire, jamais celui d'un contenu retiré.
 */

import type { Prisma, PrismaClient } from '@meeshy/shared/prisma/client';
import type { MediaStorage } from '../storage/MediaStorage';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { claimableMediaWhere, describeClaimShortfall, uploaderIdOrNull } from './mediaOwnership';
import { NOT_DELETED } from './softDelete';
import { copyPostMedia, POST_MEDIA_COPY_SELECT, type PostMediaCopySource } from './postMediaCopy';
import { remapStoryEffectsMediaIds } from './storyEffectsMediaRemap';

const log = enhancedLogger.child({ module: 'siblingPublicationMedia' });

export type SiblingPublicationPrisma = {
  postMedia: Pick<PrismaClient['postMedia'], 'updateMany' | 'findMany' | 'create' | 'deleteMany'>;
  post: Pick<PrismaClient['post'], 'findMany' | 'update'>;
};

export type PublicationMediaInput = {
  mediaIds?: string[];
  mediaAlt?: Record<string, string>;
  mediaCaption?: Record<string, string>;
  storyEffects?: Record<string, unknown>;
};

type SiblingMedia = PostMediaCopySource & { postId: string | null };

/**
 * Les médias demandés que l'auteur a téléversés et rattachés à une AUTRE de
 * ses publications non supprimées, dans l'ordre demandé.
 */
async function siblingMedia(
  prisma: Pick<SiblingPublicationPrisma, 'postMedia' | 'post'>,
  params: { readonly authorId: string; readonly ids: readonly string[]; readonly exceptPostId?: string },
): Promise<SiblingMedia[]> {
  const owner = uploaderIdOrNull(params.authorId);
  if (owner === null || params.ids.length === 0) return [];
  const rows = (await prisma.postMedia.findMany({
    where: {
      id: { in: [...params.ids] },
      uploaderId: owner,
      postId: { not: null },
      OR: [{ commentId: null }, { commentId: { isSet: false } }],
    },
    select: { ...POST_MEDIA_COPY_SELECT, postId: true },
  })) as SiblingMedia[];
  const attached = rows.filter((row) => typeof row.postId === 'string' && row.postId !== params.exceptPostId);
  if (attached.length === 0) return [];
  const live = await prisma.post.findMany({
    where: { id: { in: [...new Set(attached.map((row) => row.postId as string))] }, authorId: owner, deletedAt: NOT_DELETED },
    select: { id: true },
  });
  const liveIds = new Set(live.map((post) => post.id));
  return params.ids
    .map((id) => attached.find((row) => row.id === id))
    .filter((row): row is SiblingMedia => row !== undefined && liveIds.has(row.postId as string));
}

export type PublishableMedia = { id: string; mimeType: string; duration: number | null };

/**
 * Ce que la publication POSSÉDERA une fois créée : ses médias libres, et ceux
 * de ses publications sœurs qu'elle recevra en copie. C'est sur eux que se
 * juge la règle du réel — un réel coché avec un post ne se dégrade plus en
 * post parce que le post a réclamé la vidéo le premier.
 */
export async function publishableMedia(
  prisma: Pick<SiblingPublicationPrisma, 'postMedia' | 'post'>,
  ids: readonly string[],
  authorId: string,
): Promise<PublishableMedia[]> {
  if (ids.length === 0) return [];
  const free = (await prisma.postMedia.findMany({
    where: { id: { in: [...ids] }, ...claimableMediaWhere(authorId) },
    select: { id: true, mimeType: true, duration: true },
  })) as PublishableMedia[];
  const freeIds = new Set(free.map((row) => row.id));
  const siblings = await siblingMedia(prisma, { authorId, ids: ids.filter((id) => !freeIds.has(id)) });
  return [...free, ...siblings].map((row) => ({ id: row.id, mimeType: row.mimeType, duration: row.duration }));
}

function rekeyed(
  map: Record<string, string> | undefined,
  idMap: Readonly<Record<string, string>>,
): Record<string, string> | undefined {
  if (!map) return undefined;
  return Object.fromEntries(Object.entries(map).map(([id, text]) => [idMap[id] ?? id, text]));
}

type ClaimParams<T> = {
  readonly prisma: SiblingPublicationPrisma;
  readonly storage: Pick<MediaStorage, 'duplicate' | 'delete'>;
  readonly authorId: string;
  readonly post: { readonly id: string; readonly storyEffects?: unknown };
  readonly input: T;
};

/**
 * Rattache à `post` les médias demandés : ceux qui sont libres sont réclamés,
 * ceux qu'une publication sœur a pris sont copiés. Rend l'entrée réécrite sur
 * les copies — ids, textes alternatifs, légendes, scène —, que la suite de
 * `createPost` (ordre, transcription, sons) lit à la place de l'originale.
 *
 * La copie ne fait jamais échouer la publication : en échec, elle part sans
 * ce média, comme avant, et l'écart est journalisé — jamais silencieux, sans
 * quoi le symptôme serait indiscernable d'un vol réussi.
 */
export async function claimPublicationMedia<T extends PublicationMediaInput>(params: ClaimParams<T>): Promise<T> {
  const { prisma, authorId, post, input } = params;
  const requested = input.mediaIds ?? [];
  if (requested.length === 0) return input;
  const claimed = await prisma.postMedia.updateMany({
    where: { id: { in: requested }, ...claimableMediaWhere(authorId) },
    data: { postId: post.id },
  });
  if (describeClaimShortfall(requested, claimed.count) === null) return input;
  return adoptSiblingMedia(params, requested).catch((error: unknown) => {
    log.warn(`[PostService] createPost: ${describeClaimShortfall(requested, claimed.count)}`, {
      postId: post.id, authorId, requested: requested.length, error,
    });
    return input;
  });
}

async function adoptSiblingMedia<T extends PublicationMediaInput>(
  { prisma, storage, authorId, post, input }: ClaimParams<T>,
  requested: readonly string[],
): Promise<T> {
  const owned = await prisma.postMedia.findMany({ where: { id: { in: [...requested] }, postId: post.id }, select: { id: true } });
  const ownedIds = new Set(owned.map((row) => row.id));
  const sources = await siblingMedia(prisma, {
    authorId, ids: requested.filter((id) => !ownedIds.has(id)), exceptPostId: post.id,
  });
  const copies = sources.length === 0
    ? null
    : await copyPostMedia({ prisma, storage, authorId, sources, postId: post.id });
  const shortfall = describeClaimShortfall(requested, ownedIds.size + (copies?.rowIds.length ?? 0));
  if (shortfall) {
    log.warn(`[PostService] createPost: ${shortfall}`, { postId: post.id, authorId, requested: requested.length });
  }
  if (copies === null) return input;

  const idMap = { ...copies.idMap };
  const urlMap = { ...copies.urlMap };
  const stored = remapStoryEffectsMediaIds(post.storyEffects as Prisma.InputJsonValue | undefined, idMap, urlMap);
  if (stored.changed) {
    await prisma.post.update({ where: { id: post.id }, data: { storyEffects: stored.effects } });
  }
  const effects = remapStoryEffectsMediaIds(input.storyEffects as Prisma.InputJsonValue | undefined, idMap, urlMap);
  return {
    ...input,
    mediaIds: requested.map((id) => idMap[id] ?? id),
    mediaAlt: rekeyed(input.mediaAlt, idMap),
    mediaCaption: rekeyed(input.mediaCaption, idMap),
    storyEffects: effects.effects as Record<string, unknown> | undefined,
  };
}
