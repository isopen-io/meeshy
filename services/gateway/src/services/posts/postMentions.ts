import type { PrismaClient } from '@meeshy/shared/prisma/client';

/**
 * Le contenu mentionnant, tel que la résolution le lit. Structural et minimal :
 * les routes tiennent un post Prisma complet, mais rien ici n'a besoin de plus
 * que ces trois champs.
 *
 * `authorId` est un `User.id` — le même espace que les mentionnés, ce qui permet
 * à la notification de filtrer l'auto-mention.
 */
export interface MentionTargetPost {
  readonly id: string;
  readonly authorId: string;
  /** Discriminant d'entité → surface ouverte au tap côté client. */
  readonly type?: PostMentionType;
  /**
   * `Post.visibility`, transmise telle quelle au lot de notification qui décide
   * qui a le droit d'être prévenu. Requise, et non optionnelle par défaut
   * `PUBLIC` : une garde de confidentialité qu'on peut désarmer en oubliant un
   * champ n'est pas une garde.
   *
   * Elle ne filtre PAS les lignes `PostMention` — celles-ci consignent un FAIT
   * sur le texte (« ce post nomme Carol »), vrai quelle que soit l'audience, et
   * l'affinité de recommandation qui les lit (`PostFeedService.getMentionsByPost`)
   * ne classe que des candidats déjà filtrés par le feed. Seule la LIVRAISON
   * est conditionnée.
   */
  readonly visibility: string | null | undefined;
  /** `Post.visibilityUserIds` — liste blanche en ONLY, liste noire en EXCEPT. */
  readonly visibilityUserIds?: readonly string[];
}

export type PostMentionType = 'POST' | 'STORY' | 'MOOD' | 'STATUS' | 'REEL';

/**
 * La seule surface Prisma que la réconciliation touche. `Pick<PrismaClient, …>`
 * plutôt qu'une interface maison, même raison que dans `messageMentions` : les
 * délégués générés portent des surcharges que rien de recopié à la main ne
 * satisfait.
 */
export type PostMentionPrisma = Pick<PrismaClient, 'postMention'>;

/**
 * Les trois méthodes de `MentionService` que la résolution appelle, en
 * structural pour que le double de test reste trivial.
 */
export interface PostMentionResolver {
  extractMentions(content: string): string[];
  resolveUsernames(usernames: string[]): Promise<Map<string, { id: string }>>;
  createPostMentions(postId: string, mentionedUserIds: string[]): Promise<void>;
}

/**
 * Le seul créateur que la notification de mention de post appelle.
 */
export interface PostMentionNotifier {
  createPostMentionNotificationsBatch(params: {
    postId: string;
    posterId: string;
    mentionedUserIds: string[];
    postExcerpt?: string;
    postType?: PostMentionType;
    visibility: string | null | undefined;
    visibilityUserIds?: readonly string[];
  }): Promise<unknown>;
}

export interface ResolvedPostMentions {
  /** Tout ce que le post nomme APRÈS l'opération — le lot qu'un éventail de notifications concurrent doit exclure. */
  readonly mentionedUserIds: readonly string[];
  /**
   * Ceux qui n'étaient PAS déjà mentionnés — le seul lot qu'une notification
   * doit atteindre. À la création, c'est l'ensemble complet ; à l'édition, la
   * différence avec les lignes `PostMention` déjà en base.
   */
  readonly newlyMentionedUserIds: readonly string[];
  /**
   * `true` quand `mentionedUserIds` DÉCRIT l'état du post — y compris lorsqu'il
   * est vide parce que plus rien n'y est mentionné. `false` quand rien n'a pu
   * être établi : service absent, ensemble précédent illisible, résolution en
   * échec. L'appelant qui exclut `mentionedUserIds` d'un autre éventail doit
   * savoir distinguer « personne n'est mentionné » de « on ne sait pas ».
   */
  readonly reconciled: boolean;
}

/** Rien à dire sur ce post : l'appelant garde ce que la base porte déjà. */
const UNRESOLVED: ResolvedPostMentions = {
  mentionedUserIds: [],
  newlyMentionedUserIds: [],
  reconciled: false,
};

/** Établi, et vide : ce post ne nomme personne. */
const NO_MENTIONS: ResolvedPostMentions = { ...UNRESOLVED, reconciled: true };

/** Longueur de l'extrait embarqué dans la notification — parité avec les routes. */
const EXCERPT_LENGTH = 100;

export interface PostMentionParams {
  prisma: PostMentionPrisma;
  mentionService: PostMentionResolver | null | undefined;
  notificationService: PostMentionNotifier | null | undefined;
  post: MentionTargetPost;
  content: string | null | undefined;
  onError?: (error: unknown) => void;
}

/**
 * Ce qu'un post neuf doit à ceux qu'il nomme : une ligne `PostMention` par
 * mentionné, et une notification à chacun.
 *
 * Le court-circuit vit ICI, pas chez l'appelant : un post sans `@` ne doit
 * coûter aucune requête, et c'est une garde qu'un nouvel écrivain oublierait.
 *
 * Une création n'a pas d'ensemble précédent — d'où l'absence totale de lecture
 * de `PostMention` : tous ses mentionnés sont des entrants par construction.
 *
 * Best-effort de bout en bout — ne lève jamais. Une mention perdue ne doit pas
 * transformer une publication réussie en 500 ; `onError` laisse l'appelant
 * journaliser dans le contexte de sa requête.
 */
export async function resolvePostMentions(params: PostMentionParams): Promise<ResolvedPostMentions> {
  const { mentionService, content } = params;

  if (!mentionService) return UNRESOLVED;
  if (!content || !content.includes('@')) return NO_MENTIONS;

  try {
    const mentionedUserIds = await resolveMentionedUserIds(mentionService, content);
    if (mentionedUserIds.length === 0) return NO_MENTIONS;

    await mentionService.createPostMentions(params.post.id, mentionedUserIds);
    notifyNewlyMentioned(params, mentionedUserIds);

    return { mentionedUserIds, newlyMentionedUserIds: mentionedUserIds, reconciled: true };
  } catch (error) {
    params.onError?.(error);
    return UNRESOLVED;
  }
}

/**
 * La même résolution, mais pour un post qui portait DÉJÀ des mentions :
 * l'édition.
 *
 * Une édition n'est pas une re-publication : elle RÉCONCILIE. Trois différences
 * avec {@link resolvePostMentions}, et chacune répare un défaut distinct du bloc
 * qui vivait dans la route :
 *
 *  1. **Pas de court-circuit « pas de `@` ».** Un contenu édité qui ne nomme
 *     plus personne doit EFFACER ses lignes, là où une création sans `@` ne
 *     doit rien écrire. La route ne supprimait jamais : éditer « bravo @alice »
 *     en « bravo » laissait Alice mentionnée à vie — dans l'affinité de
 *     recommandation des réels (`PostFeedService.getMentionsByPost`) comme dans
 *     toute lecture future de `PostMention`.
 *  2. **On ne recrée pas ce qui n'a pas bougé.** Seuls les partants sont
 *     supprimés, seuls les entrants sont créés.
 *  3. **`newlyMentionedUserIds` isole les entrants**, qui sont exactement le lot
 *     à notifier. La route renotifiait l'ENSEMBLE COMPLET à chaque édition —
 *     son propre commentaire l'admettait (« re-fires all ») : la persistance
 *     était idempotente (P2002 avalé), la notification ne l'était pas. Dix
 *     corrections de frappe valaient dix pushes à quelqu'un nommé une seule
 *     fois, et changer la seule VISIBILITÉ d'un post repingait tous ses
 *     mentionnés. Le garde-fou de débit (`MAX_MENTIONS_PER_MINUTE`) n'y pouvait
 *     rien : il ne couvre qu'une fenêtre d'une minute.
 *
 * Comme pour les messages, tout écrit vit dans le chemin de succès : si
 * l'ensemble précédent est illisible ou si la résolution lève, la base reste
 * telle qu'elle était et `reconciled` vaut `false`. Préserver une mention
 * périmée vaut mieux que détruire une mention vivante : la première nomme
 * quelqu'un de trop le temps d'une édition, la seconde ne revient jamais.
 */
export async function reconcilePostMentions(params: PostMentionParams): Promise<ResolvedPostMentions> {
  const { prisma, mentionService, content } = params;

  // Sans service, rien n'est résolvable — donc rien n'est réconciliable. En
  // conclure que le post ne nomme plus personne effacerait les mentions d'un
  // texte qui les porte toujours.
  if (!mentionService) return UNRESOLVED;

  try {
    // L'ensemble précédent est la seule source de « qui est parti » et de « qui
    // est nouveau ». Sa lecture est DANS le try : en échec, la réconciliation
    // ne peut plus garantir qu'elle ne détruit rien, donc elle s'abstient.
    const previousUserIds = (
      await prisma.postMention.findMany({
        where: { postId: params.post.id },
        select: { mentionedUserId: true },
      })
    ).map((row) => row.mentionedUserId);

    const mentionedUserIds = content && content.includes('@')
      ? await resolveMentionedUserIds(mentionService, content)
      : [];

    const previous = new Set(previousUserIds);
    const retained = new Set(mentionedUserIds);
    const departedUserIds = previousUserIds.filter((id) => !retained.has(id));
    const newlyMentionedUserIds = mentionedUserIds.filter((id) => !previous.has(id));

    if (departedUserIds.length > 0) {
      await prisma.postMention.deleteMany({
        where: { postId: params.post.id, mentionedUserId: { in: departedUserIds } },
      });
    }

    // La garde du lot vide appartient à `createPostMentions`, qui la porte déjà.
    await mentionService.createPostMentions(params.post.id, newlyMentionedUserIds);
    notifyNewlyMentioned(params, newlyMentionedUserIds);

    return { mentionedUserIds, newlyMentionedUserIds, reconciled: true };
  } catch (error) {
    params.onError?.(error);
    return UNRESOLVED;
  }
}

/**
 * Les `User.id` que le contenu nomme, dédupliqués par la `Map` que
 * `resolveUsernames` rend (clé = username normalisé).
 */
async function resolveMentionedUserIds(
  mentionService: PostMentionResolver,
  content: string
): Promise<string[]> {
  const usernames = mentionService.extractMentions(content);
  if (usernames.length === 0) return [];

  const userMap = await mentionService.resolveUsernames(usernames);
  return Array.from(userMap.values()).map((user) => user.id);
}

/**
 * Le seul lot qu'un push doit atteindre : les ENTRANTS.
 *
 * DÉTACHÉ à dessein — la notification traverse push, socket et e-mail, et rien
 * de tout cela n'a à retarder la réponse d'une publication ou d'une édition.
 * L'appel lui-même est synchrone dans la continuation de l'appelant (donc
 * observable dès que celui-ci a rendu la main) ; seul son règlement est
 * détaché, et son échec ne défait pas une réconciliation déjà écrite.
 */
function notifyNewlyMentioned(
  params: PostMentionParams,
  newlyMentionedUserIds: readonly string[]
): void {
  const { notificationService, post, content, onError } = params;
  if (newlyMentionedUserIds.length === 0 || !notificationService) return;

  notificationService
    .createPostMentionNotificationsBatch({
      postId: post.id,
      posterId: post.authorId,
      mentionedUserIds: [...newlyMentionedUserIds],
      postExcerpt: content?.slice(0, EXCERPT_LENGTH),
      postType: post.type,
      visibility: post.visibility,
      visibilityUserIds: post.visibilityUserIds,
    })
    .catch((error: unknown) => onError?.(error));
}
