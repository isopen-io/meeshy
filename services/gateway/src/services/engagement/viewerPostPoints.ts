/**
 * CE QU'UN POST A RAPPORTÉ À SON LECTEUR (#9569) — la LECTURE, et la seule.
 *
 * `viewerPoints` est la somme des points que le barème a RÉELLEMENT crédités à
 * un lecteur pour un post. Ces points vivent à deux endroits, et un crédit
 * n'est jamais aux deux :
 *
 * - le CUMUL (`EngagementPostPoints`) — ses gestes : réaction, commentaire,
 *   republication, signet, partage, vue de story, réponse à un sondage, et tout
 *   crédit de publication que la mémoire ci-dessous n'a pas gardé ;
 * - la MÉMOIRE DE PUBLICATION (`EngagementQuota`, seau `content:<postId>`,
 *   champ `points`) — ce que la publication d'un contenu lourd a rapporté à son
 *   AUTEUR. `EngagementQuotas.remember` l'y pose, `reclaim` la remet à zéro
 *   quand le contenu est retiré dans la fenêtre du barème : la reprise se lit
 *   donc ici sans qu'aucune seconde écriture ait à la suivre.
 *
 * `creditLivesInPublicationMemory` est le SEUL prédicat qui dit où un crédit
 * s'écrit ; cette lecture additionne les deux. Un post publié avant ce lot n'a
 * pas de ligne de cumul : la publication d'un contenu LOURD s'y lit dans sa
 * mémoire, exactement comme pour un post neuf, et un geste ultérieur de son
 * auteur ouvre une ligne de cumul qui ne la contient pas — elle ne peut donc
 * jamais compter deux fois. Ce qui n'a JAMAIS été gardé n'est pas retrouvable,
 * et rien ne le fabrique : la publication d'un contenu non lourd (visibilité
 * amis), l'axe outil qui l'accompagnait, et tout post d'avant la mémoire par
 * contenu (#8959). Ces posts-là montrent leurs seuls gestes d'après ce lot.
 *
 * ## Coût : une lecture du cumul par PAGE
 *
 * Un `findMany … { in: ids }` pour la page entière, jamais un par post. La
 * mémoire de publication ne se lit — une fois, en parallèle — que si la page
 * porte des posts du lecteur (ou dont l'auteur n'est pas connu de l'appelant).
 *
 * ## Ce qui part À CÔTÉ
 *
 * Les deux requêtes sont filtrées par `userId` = le LECTEUR, qui est un
 * paramètre REQUIS : les points d'un autre ne sont jamais lus, donc jamais
 * servis. Le modèle n'a aucune relation vers `Post` : aucun `include` ne peut
 * le ramener avec une page. Sans lecteur, aucune requête et aucun champ.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { EngagementOperationKey } from '@meeshy/shared/types/engagement-operations';
import type { Post } from '@meeshy/shared/types/post';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { contentBucket } from './EngagementQuotas';

const log = enhancedLogger.child({ module: 'viewerPostPoints' });

/** L'opération de publication que la suppression d'un contenu peut reprendre, par type de post. */
export const PUBLICATION_OPERATION_BY_TYPE: ReadonlyMap<string, EngagementOperationKey> = new Map([
  ['POST', 'content.post'],
  ['STORY', 'content.story'],
  ['REEL', 'content.reel'],
]);

export const PUBLICATION_OPERATIONS: readonly EngagementOperationKey[] = [...PUBLICATION_OPERATION_BY_TYPE.values()];

/**
 * Où vit un crédit de post. `true` ⇒ dans la mémoire de publication : c'est la
 * publication de CE post, et `EngagementQuotas.remember` vient de la garder
 * (`rememberedTargetId`). `false` ⇒ dans le cumul.
 */
export function creditLivesInPublicationMemory(credit: {
  readonly operationKey: EngagementOperationKey;
  readonly postId: string;
  readonly rememberedTargetId: string | undefined;
}): boolean {
  return credit.rememberedTargetId === credit.postId && PUBLICATION_OPERATIONS.includes(credit.operationKey);
}

export type ViewerPointsSubject = {
  readonly id: string;
  /** Absent ⇒ l'auteur n'est pas connu de l'appelant : la mémoire de publication est lue. */
  readonly authorId?: string | null;
};

export type ViewerPointsReader = Pick<PrismaClient, 'engagementPostPoints' | 'engagementQuota'>;

const mayBePublishedBy = (viewerId: string) => (post: ViewerPointsSubject): boolean =>
  post.authorId === undefined || post.authorId === null || post.authorId === viewerId;

const postIdOfBucket = (bucket: string): string => bucket.slice(contentBucket('').length);

/** Ce que chaque post de la page a rapporté à `viewerId` — une entrée par post, zéro compris. */
export async function loadViewerPostPoints(
  prisma: ViewerPointsReader,
  viewerId: string,
  posts: readonly ViewerPointsSubject[],
): Promise<ReadonlyMap<string, number>> {
  const postIds = [...new Set(posts.map((post) => post.id))];
  if (postIds.length === 0) return new Map();
  const publishedIds = [...new Set(posts.filter(mayBePublishedBy(viewerId)).map((post) => post.id))];

  const [gestures, publications] = await Promise.all([
    prisma.engagementPostPoints.findMany({
      where: { userId: viewerId, postId: { in: postIds } },
      select: { postId: true, totalPoints: true },
    }),
    publishedIds.length === 0
      ? Promise.resolve([])
      : prisma.engagementQuota.findMany({
          where: {
            userId: viewerId,
            operationKey: { in: [...PUBLICATION_OPERATIONS] },
            bucket: { in: publishedIds.map(contentBucket) },
          },
          select: { bucket: true, points: true },
        }),
  ]);

  const credited = [
    ...gestures.map((row) => [row.postId, row.totalPoints] as const),
    ...publications.map((row) => [postIdOfBucket(row.bucket), row.points] as const),
  ].reduce(
    (byPost, [postId, points]) => byPost.set(postId, (byPost.get(postId) ?? 0) + (points ?? 0)),
    new Map<string, number>(),
  );
  return new Map(postIds.map((postId) => [postId, Math.max(0, credited.get(postId) ?? 0)] as const));
}

/**
 * La même lecture, pour une page SERVIE : `null` sans lecteur (aucune requête)
 * et quand le cumul ne se lit pas — un état d'engagement illisible ne fait pas
 * tomber un fil, il n'est simplement pas servi.
 */
export async function loadViewerPostPointsOrNone(
  prisma: ViewerPointsReader,
  viewerId: string | undefined,
  posts: readonly ViewerPointsSubject[],
): Promise<ReadonlyMap<string, number> | null> {
  if (!viewerId) return null;
  try {
    return await loadViewerPostPoints(prisma, viewerId, posts);
  } catch (error) {
    log.warn('viewerPoints not served', { error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

/** Le champ tel qu'il part : absent quand rien n'a été résolu, sinon la valeur — zéro compris. */
export const servedViewerPoints = (
  points: ReadonlyMap<string, number> | null,
  postId: string,
): Pick<Post, 'viewerPoints'> => (points ? { viewerPoints: points.get(postId) ?? 0 } : {});

/**
 * Ce qu'une page DÉJÀ COMPOSÉE laisse lire d'un de ses éléments. Une page de
 * stories sort de `withMentions` sous sa forme de fil, sans type nommé :
 * l'identifiant se VÉRIFIE donc à l'exécution plutôt que de s'affirmer.
 */
const subjectOf = (post: object): ViewerPointsSubject | null => {
  const id: unknown = Reflect.get(post, 'id');
  const authorId: unknown = Reflect.get(post, 'authorId');
  if (typeof id !== 'string') return null;
  return typeof authorId === 'string' ? { id, authorId } : { id };
};

/**
 * Pose `viewerPoints` sur une page déjà composée — les lectures qui ne passent
 * pas par `withViewerPostState`. Un élément sans identifiant part tel quel.
 */
export async function withViewerPoints<T extends object>(
  prisma: ViewerPointsReader,
  viewerId: string | undefined,
  posts: readonly T[],
): Promise<Array<T & Pick<Post, 'viewerPoints'>>> {
  const subjects = posts.map(subjectOf);
  const points = await loadViewerPostPointsOrNone(
    prisma,
    viewerId,
    subjects.flatMap((subject) => (subject ? [subject] : [])),
  );
  return posts.map((post, index) => {
    const subject = subjects[index];
    return { ...post, ...(subject ? servedViewerPoints(points, subject.id) : {}) };
  });
}
