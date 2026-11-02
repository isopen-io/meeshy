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
 * plus. La garde de propriété ne s'élargit pas : seul l'auteur copie, et
 * seulement depuis une publication SŒUR (`gestureSiblingWhere`) — jamais le
 * média d'autrui, jamais celui d'un commentaire, jamais celui d'un contenu
 * supprimé, retiré par la modération, expiré ou republié (un repost copie
 * les médias d'autrui sous le nom de celui qui republie : les copier encore
 * en ferait une publication ORIGINALE), et jamais au-delà du geste.
 *
 * Une copie se paie comme un téléversement (quota journalier d'envoi), et un
 * id répété ne se copie qu'une fois : sans quoi un seul fichier téléversé
 * se multipliait sans limite sur le disque.
 */

import type { PostType, Prisma, PrismaClient } from '@meeshy/shared/prisma/client';
import { qualifiesAsReel } from '@meeshy/shared/utils/reel-composition';
import type { MediaStorage } from '../storage/MediaStorage';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { claimableMediaWhere, describeClaimShortfall, uploaderIdOrNull } from './mediaOwnership';
import { NOT_DELETED } from './softDelete';
import { copyPostMedia, expectedCopyBytes, POST_MEDIA_COPY_SELECT, type PostMediaCopies, type PostMediaCopySource } from './postMediaCopy';
import { remapStoryEffectsMediaIds } from './storyEffectsMediaRemap';
import { fillBackgroundMediaUrls } from './storyBackgroundMediaUrl';
import { publicationCopyQuota, reservedCopy, type PublicationCopyQuota } from './publicationCopyQuota';
import { borrowedSoundReelEntries } from './storyReelCompanion';

const log = enhancedLogger.child({ module: 'siblingPublicationMedia' });

export type SiblingPublicationPrisma = {
  postMedia: Pick<PrismaClient['postMedia'], 'updateMany' | 'findMany' | 'create' | 'deleteMany'>;
  post: Pick<PrismaClient['post'], 'findMany' | 'update'>;
  sound?: Pick<PrismaClient['sound'], 'findMany'>;
};

export type PublicationMediaInput = {
  mediaIds?: string[];
  mediaAlt?: Record<string, string>;
  mediaCaption?: Record<string, string>;
  storyEffects?: Record<string, unknown>;
};

type SiblingMedia = PostMediaCopySource & { postId: string | null; createdAt: Date | null };

/**
 * Le geste : Story, Post et Réel partent ensemble (moins d'une seconde
 * d'écart mesuré en recette, #14305), mais une file d'envoi qui échoue
 * réessaie — WorkManager Android double son attente depuis 10 s, sa sixième
 * tentative part 630 s après la première. Quinze minutes couvrent ces
 * reprises ; au-delà, une publication ne prête plus ses médias.
 */
export const GESTURE_WINDOW_MS = 15 * 60 * 1000;

/**
 * Une publication SŒUR : de l'auteur, ORIGINALE (aucune des trois marques
 * d'une republication — `repostOfId` est remis à `null` quand la source
 * expire, l'instantané `snapshotAuthorId` survit), visible (ni supprimée, ni
 * retirée par la modération, ni expirée), créée pendant le geste, et d'un
 * AUTRE format qu'une Story ou un Réel qui demande : le geste publie une
 * Story, un Post, un Réel — une seconde story est une reprise (une réponse
 * perdue, une file qui réessaie), pas une sœur. Un POST n'exclut aucun
 * format : sa sœur stockée POST peut être un réel non qualifiant dégradé
 * (`createPost`), dont il reste la publication sœur.
 */
function gestureSiblingWhere(owner: string, postIds: readonly string[], now: Date, exceptType?: PostType): Prisma.PostWhereInput {
  return {
    id: { in: [...postIds] },
    authorId: owner,
    deletedAt: NOT_DELETED,
    ...(exceptType ? { NOT: [{ type: exceptType }] } : {}),
    createdAt: { gte: new Date(now.getTime() - GESTURE_WINDOW_MS) },
    AND: [
      { OR: [{ moderationHiddenAt: null }, { moderationHiddenAt: { isSet: false } }] },
      { OR: [{ repostOfId: null }, { repostOfId: { isSet: false } }] },
      { OR: [{ originalRepostOfId: null }, { originalRepostOfId: { isSet: false } }] },
      { OR: [{ snapshotAuthorId: null }, { snapshotAuthorId: { isSet: false } }] },
      { OR: [{ expiresAt: null }, { expiresAt: { isSet: false } }, { expiresAt: { gte: now } }] },
    ],
  };
}

/**
 * Les médias demandés que l'auteur a téléversés et rattachés à une de ses
 * publications SŒURS, dans l'ordre demandé. Un média né APRÈS sa publication
 * n'est pas prêté : c'est une copie, et la prêter prolongerait le geste de
 * copie en copie au-delà de sa fenêtre — un téléversement, lui, précède
 * toujours la publication qui le réclame.
 */
async function siblingMedia(
  prisma: Pick<SiblingPublicationPrisma, 'postMedia' | 'post'>,
  params: { readonly authorId: string; readonly ids: readonly string[]; readonly exceptPostId?: string; readonly exceptType?: PostType },
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
    select: { ...POST_MEDIA_COPY_SELECT, postId: true, createdAt: true },
  })) as SiblingMedia[];
  const attached = rows.filter((row) => typeof row.postId === 'string' && row.postId !== params.exceptPostId);
  if (attached.length === 0) return [];
  const live = await prisma.post.findMany({
    where: gestureSiblingWhere(owner, [...new Set(attached.map((row) => row.postId as string))], new Date(), params.exceptType),
    select: { id: true, createdAt: true },
  });
  const createdAtOf = new Map(live.map((post) => [post.id, post.createdAt] as const));
  const lent = (row: SiblingMedia): boolean => {
    const postCreatedAt = createdAtOf.get(row.postId as string);
    return postCreatedAt instanceof Date && row.createdAt instanceof Date && row.createdAt < postCreatedAt;
  };
  return params.ids
    .map((id) => attached.find((row) => row.id === id))
    .filter((row): row is SiblingMedia => row !== undefined && lent(row));
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
  requestedIds: readonly string[],
  authorId: string,
): Promise<PublishableMedia[]> {
  const ids = [...new Set(requestedIds)];
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
  readonly quota?: PublicationCopyQuota;
  readonly authorId: string;
  readonly post: { readonly id: string; readonly type?: PostType; readonly storyEffects?: unknown };
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
  const { prisma, authorId, post } = params;
  const requested = [...new Set(params.input.mediaIds ?? [])];
  if (requested.length === 0) return params.input;
  const input = requested.length === params.input.mediaIds?.length ? params.input : { ...params.input, mediaIds: requested };
  const claimed = await prisma.postMedia.updateMany({
    where: { id: { in: requested }, ...claimableMediaWhere(authorId) },
    data: { postId: post.id },
  });
  if (describeClaimShortfall(requested, claimed.count) === null) return input;
  const adopted = await adoptSiblingMedia({ ...params, input }, requested).catch((error: unknown) => {
    log.warn(`[PostService] createPost: ${describeClaimShortfall(requested, claimed.count)}`, {
      postId: post.id, authorId, requested: requested.length, error,
    });
    return input;
  });
  await keepReelQualified(params, adopted).catch((error: unknown) => {
    log.warn('[PostService] createPost: rejugement du réel impossible', { postId: post.id, authorId, error });
  });
  return adopted;
}

/**
 * La règle du réel a été jugée AVANT la publication, sur ce qu'elle devait
 * posséder (`publishableMedia`). Une copie refusée (quota) ou ratée (disque)
 * en retire : le réel est rejugé sur ce qu'il possède VRAIMENT, et dégradé en
 * post s'il ne qualifie plus — jamais un réel sans média.
 */
async function keepReelQualified<T extends PublicationMediaInput>(
  { prisma, authorId, post }: ClaimParams<T>,
  adopted: T,
): Promise<void> {
  if (post.type !== 'REEL') return;
  const owned = await prisma.postMedia.findMany({
    where: { postId: post.id },
    select: { mimeType: true, duration: true },
  });
  if (qualifiesAsReel(owned)) return;
  const borrowed = prisma.sound ? await borrowedSoundReelEntries({ sound: prisma.sound }, adopted.storyEffects, authorId) : [];
  if (qualifiesAsReel([...owned, ...borrowed])) return;
  await prisma.post.update({ where: { id: post.id }, data: { type: 'POST' } });
  log.info('createPost: REEL dont la copie des médias n’a pas eu lieu dégradé en POST', { postId: post.id, authorId });
}

/** Le format dont une sœur serait une REPRISE de la demande — aucun pour un POST (voir `gestureSiblingWhere`). */
const repeatedFormat = (type: PostType | undefined): PostType | undefined => (type === 'POST' ? undefined : type);

async function adoptSiblingMedia<T extends PublicationMediaInput>(
  { prisma, storage, quota = publicationCopyQuota(), authorId, post, input }: ClaimParams<T>,
  requested: readonly string[],
): Promise<T> {
  const owned = await prisma.postMedia.findMany({ where: { id: { in: [...requested] }, postId: post.id }, select: { id: true } });
  const ownedIds = new Set(owned.map((row) => row.id));
  const sources = await siblingMedia(prisma, {
    authorId, ids: requested.filter((id) => !ownedIds.has(id)), exceptPostId: post.id, exceptType: repeatedFormat(post.type),
  });
  const copies = sources.length === 0
    ? null
    : await reservedCopy({
      quota,
      userId: authorId,
      expectedBytes: sources.reduce((sum, source) => sum + expectedCopyBytes(source), 0),
      copy: () => copyPostMedia({ prisma, storage, authorId, sources, postId: post.id }),
    });
  const shortfall = describeClaimShortfall(requested, ownedIds.size + (copies?.rowIds.length ?? 0));
  if (shortfall) {
    log.warn(`[PostService] createPost: ${shortfall}`, { postId: post.id, authorId, requested: requested.length });
  }
  if (copies === null) return input;

  const stored = sceneOnCopies(post.storyEffects, copies);
  if (stored.changed) {
    await prisma.post.update({ where: { id: post.id }, data: { storyEffects: stored.effects } });
  }
  return {
    ...input,
    mediaIds: requested.map((id) => copies.idMap[id] ?? id),
    mediaAlt: rekeyed(input.mediaAlt, copies.idMap),
    mediaCaption: rekeyed(input.mediaCaption, copies.idMap),
    storyEffects: sceneOnCopies(input.storyEffects, copies).effects as Record<string, unknown> | undefined,
  };
}

/**
 * La scène réécrite sur les copies : chaque référence (id et adresse), puis
 * le fond que la scène ne désigne que par son id (#13607) — sa source était
 * prise par la sœur, `withBackgroundMediaUrls` n'a donc pas pu le compléter
 * avant la copie.
 */
function sceneOnCopies(effects: unknown, copies: PostMediaCopies): { effects: Prisma.InputJsonValue | undefined; changed: boolean } {
  const remapped = remapStoryEffectsMediaIds(effects as Prisma.InputJsonValue | undefined, { ...copies.idMap }, { ...copies.urlMap });
  const filled = fillBackgroundMediaUrls(remapped.effects, new Map(Object.entries(copies.urlById)));
  return { effects: filled, changed: remapped.changed || filled !== remapped.effects };
}
