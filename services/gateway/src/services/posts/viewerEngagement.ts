import { PostVisibility, type PrismaClient } from '@meeshy/shared/prisma/client';
import type { PostViewerEngagement, PostViewersPage } from '@meeshy/shared/types/publication-viewers';
import { isGlobalAdmin } from '@meeshy/shared/types/role-types';
import {
  activityDisclosureFloor,
  isAuthorListedViewerType,
  viewerActivityDisclosedSince,
} from '../../config/viewer-activity-disclosure';
import { authorSelect } from './postIncludes';
import { NOT_DELETED } from './softDelete';
import { filterConsumablePostIds, type PostConsumptionPrisma } from '../../routes/posts/postConsumptionGate';
import { getBlockedUserIdsAmong } from '../../utils/blocking';
import { enhancedLogger } from '../../utils/logger-enhanced';

const logger = enhancedLogger.child({ module: 'viewerEngagement' });

/**
 * La liste des vues d'un contenu, enrichie de ce que CHAQUE personne y a fait
 * (#9727) — réactions, partages par lien, republications, commentaires,
 * réponses. Extrait de `PostService` (hors budget de taille) : le service n'y
 * garde qu'un appel.
 *
 * **Le favori n'y figure pas, et ne s'y lit pas** (décision porteur
 * 2026-10-09 : « ne jamais montrer les favoris ») : mettre un contenu de côté
 * reste un geste PRIVÉ, la table `PostBookmark` est hors de ce module.
 *
 * **Une lecture agrégée par source, jamais une requête par personne.** Les six
 * lectures partent en parallèle, bornées aux identifiants de la PAGE servie
 * (`in: viewerIds`) : le coût suit le nombre de sources, pas la taille de la
 * page, et une page vide ne déclenche aucune lecture.
 *
 * **Un compteur à zéro n'est pas servi.** Chaque champ d'engagement est absent
 * quand il vaut zéro : le client n'a rien à filtrer, et un ancien client
 * continue de lire `reaction`.
 *
 * **Qui la lit** (décision porteur 2026-10-09 : « seuls les administrateurs
 * peuvent voir qui a vu les posts ») : l'auteur d'une STORY ou d'un statut ;
 * pour un POST ou un RÉEL, l'auteur ne voit que des NOMBRES (`viewCount`…),
 * comme avant #9727. ADMIN/BIGBOSS lisent toute liste, et chacune de leurs
 * lectures écrit d'abord sa ligne d'`AdminAuditLog` (#9733) — `viewerListAccess`.
 *
 * **Un post ou un réel ne montre que ce qui suit la mise en service** (décision
 * porteur 2026-10-09 : « seulement à partir de maintenant ») : ses vues et ses
 * partages par lien antérieurs à `VIEWER_ACTIVITY_DISCLOSED_SINCE` ne sortent
 * pas, et le `total` les ignore aussi. Une story garde tout son historique.
 */
export type ViewerEngagementPrisma = Pick<
  PrismaClient,
  'post' | 'postView' | 'postReaction' | 'trackingLink' | 'postComment' | 'user' | 'adminAuditLog'
> &
  PostConsumptionPrisma;

/**
 * Ce que l'AUTEUR du contenu a le droit de voir de l'activité d'autrui (#9727,
 * revue de sécurité) — deux questions que les sources ne posent pas d'elles-mêmes :
 *
 * - **une republication n'existe pour lui que s'il peut la LIRE.** Republier en
 *   « amis » ou en « restreint » crée un post dont l'audience n'inclut pas
 *   forcément l'auteur de l'original : le compter lui révélerait un contenu
 *   qu'aucune autre surface ne lui sert (`filterConsumablePostIds`, la même loi
 *   que le fil et le partage) ;
 * - **un blocage, dans un sens ou dans l'autre, coupe l'activité.** La personne
 *   reste dans la liste des vues (comme avant ce lot), mais rien de ce qu'elle a
 *   fait n'est servi (`getBlockedUserIdsAmong`, la loi bidirectionnelle du dépôt).
 *
 * Les deux se calculent pour l'auteur du contenu, jamais pour qui demande la
 * page : c'est son audience et ses blocages que la liste reflète.
 */
export type ViewerEngagementGates = {
  readonly consumablePostIds: (postIds: readonly string[], authorId: string) => Promise<ReadonlySet<string>>;
  readonly blockRelatedIds: (authorId: string, viewerIds: readonly string[]) => Promise<ReadonlySet<string>>;
};

export function viewerEngagementGates(prisma: ViewerEngagementPrisma): ViewerEngagementGates {
  return {
    consumablePostIds: (postIds, authorId) => filterConsumablePostIds(prisma, postIds, authorId),
    blockRelatedIds: (authorId, viewerIds) => getBlockedUserIdsAmong(prisma, authorId, [...viewerIds]),
  };
}

/**
 * Combien de republications RESTREINTES (tout sauf `PUBLIC`) une page inspecte
 * au plus, par personne puis au total (#9727, revue de sécurité). Chacune
 * passe par la loi de consommation — une lecture d'ACL par republication — et
 * rien n'empêche un compte d'en publier des centaines d'un même contenu.
 *
 * - **Par personne** : la base ne rend que les dix plus récentes de chacun
 *   (`$firstN`) ; une personne ne fixe donc ni le coût de la page ni la part
 *   des autres.
 * - **Au total** : les parts se prennent rang par rang (la plus récente de
 *   chacun, puis la deuxième…), si bien que chaque personne de la page en
 *   garde au moins une sous la borne.
 *
 * Une republication PUBLIQUE ne coûte rien : la loi la sert à tout lecteur, elle
 * se compte en base, sans borne. Au-delà des bornes, le compteur d'une
 * personne est un PLANCHER, jamais un excès.
 */
export const REPOSTS_INSPECTED_PER_PERSON = 10;
export const REPOSTS_INSPECTED_PER_PAGE = 100;

/**
 * Qui demande la liste : son identifiant, son rôle GLOBAL, et ce que la trace
 * d'audit retient de sa requête quand c'est son rôle qui lui ouvre la porte.
 */
export type InteractionsReader = {
  readonly id: string;
  readonly role?: string | null;
  readonly ipAddress?: string | null;
  readonly userAgent?: string | null;
};

/** Ce que la route transmet d'une requête, l'identifiant mis à part. */
export type ViewerListRequest = Omit<InteractionsReader, 'id'>;

export type ViewerInteractionRow = {
  readonly id: string;
  readonly username: string;
  readonly displayName: string | null;
  readonly avatarUrl: string | null;
  readonly viewedAt: Date;
  readonly reaction: string | null;
} & PostViewerEngagement;

export type ViewerInteractionsPage = {
  readonly viewers: readonly ViewerInteractionRow[];
  readonly total: number;
  readonly hasMore: boolean;
  readonly engagement?: PostViewersPage['engagement'];
};

/**
 * Comment la liste s'ouvre à ce lecteur :
 *
 * - `'author'` — l'auteur d'une story ou d'un statut lit SES spectateurs, sans
 *   trace (la liste « Vu par » existait avant #9727) ;
 * - `'admin'` — ADMIN/BIGBOSS, pour tout contenu, PAR LEUR RÔLE : la lecture
 *   écrit sa ligne d'audit avant de rien lire. Un administrateur auteur d'un
 *   post y passe aussi — comme auteur, il n'y aurait pas droit ;
 * - `'denied'` — tout le reste : l'auteur d'un post ou d'un réel (il n'en voit
 *   que les nombres), MODERATOR, AUDIT, ANALYST, et tout autre lecteur.
 */
export type ViewerListAccess = 'author' | 'admin' | 'denied';

export function viewerListAccess(
  post: { readonly authorId: string; readonly type?: string | null },
  reader: InteractionsReader,
): ViewerListAccess {
  if (post.authorId === reader.id && isAuthorListedViewerType(post.type)) return 'author';
  if (typeof reader.role === 'string' && isGlobalAdmin(reader.role)) return 'admin';
  return 'denied';
}

/**
 * La trace qu'écrit chaque lecture administrateur d'une liste des vues. Le code
 * est écrit en littéral `action: '…'` : c'est la forme que le vocabulaire du
 * journal (`apps/web/src/lib/admin/audit-vocabulary.test.ts`) reconnaît.
 */
const ADMIN_VIEWER_LIST_AUDIT = { action: 'ADMIN_POST_VIEWERS_VIEWED', entity: 'Post' } as const;
export const ADMIN_VIEWER_LIST_AUDIT_ACTION = ADMIN_VIEWER_LIST_AUDIT.action;

type ViewerListPost = { readonly id: string; readonly authorId: string; readonly type?: string | null };

/**
 * Ouvre la liste ou lève : `FORBIDDEN` pour un lecteur refusé ;
 * `AUDIT_UNAVAILABLE` quand la trace d'une lecture administrateur ne s'écrit
 * pas — la lecture est alors REFUSÉE (fail-closed), jamais servie sans trace.
 * La trace s'écrit AVANT la lecture : aucune ligne ne sort sans elle.
 */
async function openViewerList(
  prisma: Pick<PrismaClient, 'adminAuditLog'>,
  post: ViewerListPost,
  reader: InteractionsReader,
  list: 'interactions' | 'views',
  page: { readonly limit: number; readonly offset: number },
): Promise<void> {
  const access = viewerListAccess(post, reader);
  if (access === 'denied') throw new Error('FORBIDDEN');
  if (access === 'author') return;
  try {
    await prisma.adminAuditLog.create({
      data: {
        userId: post.authorId,
        adminId: reader.id,
        ...ADMIN_VIEWER_LIST_AUDIT,
        entityId: post.id,
        metadata: JSON.stringify({ type: post.type ?? null, list, limit: page.limit, offset: page.offset }),
        ipAddress: reader.ipAddress ?? null,
        userAgent: reader.userAgent ?? null,
      },
    });
  } catch (error: unknown) {
    logger.error('[viewerEngagement] trace d’audit non écrite — lecture administrateur refusée', {
      postId: post.id,
      adminId: reader.id,
      error,
    });
    throw new Error('AUDIT_UNAVAILABLE');
  }
}

type Counts = ReadonlyMap<string, number>;

const countsBy = <K extends string>(
  rows: ReadonlyArray<Record<K, string | null> & { readonly _count: { readonly _all: number } }>,
  key: K,
): Counts =>
  new Map(
    rows.flatMap((row) => {
      const id = row[key];
      return id === null ? [] : [[id, row._count._all] as const];
    }),
  );

const positive = (value: number | undefined): number | undefined =>
  value !== undefined && value > 0 ? value : undefined;

/** Projette les sources d'UNE personne ; tout ce qui vaut zéro disparaît. */
export function engagementOf(input: {
  readonly reactions: readonly string[];
  readonly shares?: number;
  readonly reposts?: number;
  readonly comments?: number;
  readonly replies?: number;
}): PostViewerEngagement {
  const shareCount = positive(input.shares);
  const repostCount = positive(input.reposts);
  const commentCount = positive(input.comments);
  const replyCount = positive(input.replies);
  return {
    ...(input.reactions.length > 0 ? { reactions: input.reactions } : {}),
    ...(shareCount !== undefined ? { shareCount } : {}),
    ...(repostCount !== undefined ? { repostCount } : {}),
    ...(commentCount !== undefined ? { commentCount } : {}),
    ...(replyCount !== undefined ? { replyCount } : {}),
  };
}

type RestrictedRepost = { readonly id: string; readonly authorId: string };

/** `aggregateRaw` rend les ObjectId en Extended JSON (`{ $oid }`). */
const objectIdOf = (value: unknown): string | null => {
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null && '$oid' in value && typeof value.$oid === 'string') return value.$oid;
  return null;
};

const restrictedRepostsOf = (rows: unknown): ReadonlyArray<readonly RestrictedRepost[]> =>
  (Array.isArray(rows) ? rows : []).flatMap((row: unknown) => {
    if (typeof row !== 'object' || row === null || !('_id' in row) || !('ids' in row) || !Array.isArray(row.ids)) return [];
    const authorId = objectIdOf(row._id);
    if (authorId === null) return [];
    const reposts = row.ids.flatMap((raw: unknown) => {
      const id = objectIdOf(raw);
      return id === null ? [] : [{ id, authorId }];
    });
    return [reposts.slice(0, REPOSTS_INSPECTED_PER_PERSON)];
  });

/** Rang par rang : la plus récente de chacun, puis la deuxième… jusqu'à la borne. */
const takeByRank = (groups: ReadonlyArray<readonly RestrictedRepost[]>): readonly RestrictedRepost[] => {
  const depth = groups.reduce((deepest, group) => Math.max(deepest, group.length), 0);
  return Array.from({ length: depth }, (_, rank) => groups.flatMap((group) => (rank < group.length ? [group[rank]] : [])))
    .flat()
    .slice(0, REPOSTS_INSPECTED_PER_PAGE);
};

/**
 * Les republications RESTREINTES que l'auteur peut lire, comptées par
 * personne. Une lecture qui ne conclut pas — l'agrégation ou la loi de
 * consommation — retire ces republications, et elles seules : le reste de la
 * page n'a pas à payer pour elles.
 */
async function visibleRestrictedReposts(
  prisma: ViewerEngagementPrisma,
  postId: string,
  ids: readonly string[],
  authorId: string,
  gates: ViewerEngagementGates,
): Promise<Counts> {
  try {
    const rows = await prisma.post.aggregateRaw({
      pipeline: [
        {
          $match: {
            repostOfId: { $oid: postId },
            authorId: { $in: ids.map((id) => ({ $oid: id })) },
            visibility: { $ne: PostVisibility.PUBLIC },
            deletedAt: { $exists: false },
          },
        },
        { $sort: { createdAt: -1 } },
        { $group: { _id: '$authorId', ids: { $firstN: { input: '$_id', n: REPOSTS_INSPECTED_PER_PERSON } } } },
      ],
    });
    const inspected = takeByRank(restrictedRepostsOf(rows));
    if (inspected.length === 0) return new Map();
    const visible = await gates.consumablePostIds(inspected.map((repost) => repost.id), authorId);
    return inspected
      .filter((repost) => visible.has(repost.id))
      .reduce<Counts>((acc, repost) => new Map(acc).set(repost.authorId, (acc.get(repost.authorId) ?? 0) + 1), new Map());
  } catch (error: unknown) {
    logger.warn('[viewerEngagement] republications restreintes non conclues — non comptées', { postId, error });
    return new Map();
  }
}

/**
 * Les engagements des personnes nommées, sur UN contenu, tels que son AUTEUR
 * a le droit de les voir. Six lectures groupées, en parallèle, quel que soit
 * le nombre de personnes. `disclosedFrom` borne les partages par lien (`null`
 * ⇒ tout l'historique).
 */
export async function loadViewerEngagement(
  prisma: ViewerEngagementPrisma,
  postId: string,
  viewerIds: readonly string[],
  authorId: string,
  gates: ViewerEngagementGates,
  disclosedFrom: Date | null = null,
): Promise<ReadonlyMap<string, PostViewerEngagement & { readonly reaction: string | null }>> {
  if (viewerIds.length === 0) return new Map();
  const blocked = await gates.blockRelatedIds(authorId, viewerIds);
  const ids = viewerIds.filter((id) => !blocked.has(id));
  if (ids.length === 0) return new Map();

  const [reactionRows, shareRows, publicRepostRows, restrictedReposts, commentRows, replyRows] =
    await Promise.all([
      prisma.postReaction.findMany({
        where: { postId, userId: { in: ids } },
        select: { userId: true, emoji: true },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.trackingLink.groupBy({
        by: ['createdBy'],
        where: {
          targetId: postId,
          createdBy: { in: ids },
          ...(disclosedFrom !== null ? { createdAt: { gte: disclosedFrom } } : {}),
        },
        _count: { _all: true },
      }),
      prisma.post.groupBy({
        by: ['authorId'],
        where: { repostOfId: postId, authorId: { in: ids }, deletedAt: NOT_DELETED, visibility: PostVisibility.PUBLIC },
        _count: { _all: true },
      }),
      visibleRestrictedReposts(prisma, postId, ids, authorId, gates),
      prisma.postComment.groupBy({
        by: ['authorId'],
        where: { postId, authorId: { in: ids }, deletedAt: NOT_DELETED },
        _count: { _all: true },
      }),
      // Une RÉPONSE porte un `parentId` présent et non nul — le complément exact
      // du filtre « premier niveau » de `PostCommentService` (`parentId: null`
      // OU absent). Les commentaires de premier niveau se déduisent par
      // différence : une lecture de moins.
      prisma.postComment.groupBy({
        by: ['authorId'],
        where: {
          postId,
          authorId: { in: ids },
          deletedAt: NOT_DELETED,
          AND: [{ parentId: { isSet: true } }, { NOT: { parentId: null } }],
        },
        _count: { _all: true },
      }),
    ]);

  const reactionsByUser = reactionRows.reduce<ReadonlyMap<string, readonly string[]>>(
    (acc, row) => new Map(acc).set(row.userId, [...(acc.get(row.userId) ?? []), row.emoji]),
    new Map(),
  );
  const shares = countsBy(shareRows, 'createdBy');
  const publicReposts = countsBy(publicRepostRows, 'authorId');
  const allComments = countsBy(commentRows, 'authorId');
  const replies = countsBy(replyRows, 'authorId');

  return new Map(
    ids.map((id) => {
      const reactions = reactionsByUser.get(id) ?? [];
      const replyCount = replies.get(id) ?? 0;
      return [
        id,
        {
          reaction: reactions.length > 0 ? reactions[reactions.length - 1] : null,
          ...engagementOf({
            reactions,
            shares: shares.get(id),
            reposts: (publicReposts.get(id) ?? 0) + (restrictedReposts.get(id) ?? 0),
            comments: Math.max(0, (allComments.get(id) ?? 0) - replyCount),
            replies: replyCount,
          }),
        },
      ] as const;
    }),
  );
}

/**
 * Ce qu'une liste des vues lit de `PostView` : le contenu, et pour un post ou
 * un réel, les seules vues postérieures à la mise en service. Partagé par la
 * liste enrichie et par l'ancienne `GET /posts/:postId/views`, pour que les
 * deux et leurs `total` disent la même chose.
 */
export function disclosedViewsWhere(
  post: { readonly id: string; readonly type?: string | null },
  disclosedSince: Date = viewerActivityDisclosedSince(),
): { readonly postId: string; readonly viewedAt?: { readonly gte: Date } } {
  const floor = activityDisclosureFloor(post.type, disclosedSince);
  return floor === null ? { postId: post.id } : { postId: post.id, viewedAt: { gte: floor } };
}

/**
 * La page des vues d'un contenu DONT LA PORTE EST DÉJÀ PASSÉE — ordre et
 * pagination inchangés, chaque ligne enrichie. Elle ne connaît pas le lecteur :
 * tout ce qu'elle filtre l'est pour l'AUTEUR du contenu, quel que soit celui
 * qui la demande — un administrateur voit la page telle que l'auteur la verrait.
 *
 * Une lecture d'engagement qui ne conclut pas ferme : la page part SANS aucun
 * engagement, jamais avec un engagement non filtré, et le DIT
 * (`engagement: 'unavailable'`) — sans quoi elle affirmerait que personne n'a
 * rien fait.
 */
export async function readViewerEngagementPage(
  prisma: ViewerEngagementPrisma,
  post: { readonly id: string; readonly authorId: string; readonly type?: string | null },
  limit: number,
  offset: number,
  gates: ViewerEngagementGates = viewerEngagementGates(prisma),
  disclosedSince: Date = viewerActivityDisclosedSince(),
): Promise<ViewerInteractionsPage> {
  const where = disclosedViewsWhere(post, disclosedSince);
  const [views, total] = await Promise.all([
    prisma.postView.findMany({
      where,
      include: { user: { select: authorSelect } },
      orderBy: { viewedAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.postView.count({ where }),
  ]);

  const engagement = await loadViewerEngagement(
    prisma,
    post.id,
    views.map((view) => view.user.id),
    post.authorId,
    gates,
    activityDisclosureFloor(post.type, disclosedSince),
  ).catch((error: unknown) => {
    logger.warn('[viewerEngagement] lecture des engagements refusée faute de conclure', { postId: post.id, error });
    return null;
  });

  const viewers = views.map((view) => ({
    id: view.user.id,
    username: view.user.username,
    displayName: view.user.displayName,
    avatarUrl: view.user.avatar,
    viewedAt: view.viewedAt,
    reaction: null,
    ...engagement?.get(view.user.id),
  }));

  return {
    viewers,
    total,
    hasMore: offset + limit < total,
    ...(engagement === null ? { engagement: 'unavailable' as const } : {}),
  };
}

/**
 * `GET /posts/:postId/interactions` — `null` ⇒ contenu introuvable ; lève
 * `FORBIDDEN` pour tout lecteur que la porte refuse, `AUDIT_UNAVAILABLE` quand
 * la trace d'une lecture administrateur ne s'écrit pas.
 */
export async function readViewerInteractions(
  prisma: ViewerEngagementPrisma,
  postId: string,
  reader: InteractionsReader,
  limit: number,
  offset: number,
  gates: ViewerEngagementGates = viewerEngagementGates(prisma),
  disclosedSince: Date = viewerActivityDisclosedSince(),
): Promise<ViewerInteractionsPage | null> {
  const post = await prisma.post.findFirst({
    where: { id: postId, deletedAt: NOT_DELETED },
    select: { id: true, authorId: true, type: true },
  });
  if (!post) return null;
  await openViewerList(prisma, post, reader, 'interactions', { limit, offset });
  return readViewerEngagementPage(prisma, post, limit, offset, gates, disclosedSince);
}

/**
 * `GET /posts/:postId/views` — l'ancienne liste « Vu par », sous la MÊME porte
 * que la liste enrichie (`viewerListAccess`, trace comprise). `null` ⇒ contenu
 * introuvable. Un post ou un réel n'y montre que les vues postérieures à la
 * mise en service (même borne que la liste enrichie) ; une story garde tout son
 * historique.
 */
export async function readPostViews(
  prisma: Pick<PrismaClient, 'post' | 'postView' | 'adminAuditLog'>,
  postId: string,
  reader: InteractionsReader,
  limit: number,
  offset: number,
  disclosedSince: Date = viewerActivityDisclosedSince(),
) {
  const post = await prisma.post.findFirst({
    where: { id: postId, deletedAt: NOT_DELETED },
    select: { id: true, authorId: true, type: true },
  });
  if (!post) return null;
  await openViewerList(prisma, post, reader, 'views', { limit, offset });

  const where = disclosedViewsWhere(post, disclosedSince);
  const [items, total] = await Promise.all([
    prisma.postView.findMany({
      where,
      include: { user: { select: authorSelect } },
      orderBy: { viewedAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.postView.count({ where }),
  ]);
  return { items, total, hasMore: offset + limit < total };
}
