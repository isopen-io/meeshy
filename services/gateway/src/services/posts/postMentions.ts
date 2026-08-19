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
  createPostMentions(
    postId: string,
    mentionedUserIds: string[],
    display?: PostMentionDisplayValue
  ): Promise<void>;
}

/**
 * Miroir de l'enum Prisma `PostMentionDisplay`. Deux familles, deux
 * réconciliations : INLINE est relu dans le texte à chaque édition, les trois
 * autres ne bougent que si le client renvoie leur liste.
 */
export type PostMentionDisplayValue = 'INLINE' | 'PINNED' | 'NOTE' | 'SILENT';

/** Les seuls modes qu'un client a le droit de DÉCLARER. INLINE est dérivé. */
export type DeclarablePostMentionDisplay = Exclude<PostMentionDisplayValue, 'INLINE'>;

/**
 * Le mode d'une ligne déjà en base. `null` comme `undefined` se lisent INLINE :
 * c'était la seule voie qui existait avant le discriminant, et c'est ce que
 * faisait la réconciliation d'alors.
 */
export function readDisplay(
  display: PostMentionDisplayValue | null | undefined
): PostMentionDisplayValue {
  return display ?? 'INLINE';
}

/**
 * Une personne que le post nomme SANS que son texte le dise : pastille posée
 * sur le canevas d'une story, choix dans un sélecteur.
 *
 * `userId` OU `username`. Les deux existent parce que les deux appelants sont
 * réels — un sélecteur rend un `User.id`, un canevas ne porte que le `@handle`
 * qu'il affiche (et c'est lui qui survit à un brouillon repris trois jours plus
 * tard, là où un id devrait être persisté en parallèle des effets). Les pseudos
 * passent par la MÊME résolution que l'extraction de texte, donc les deux voies
 * ne peuvent pas diverger.
 */
export interface DeclaredPostMention {
  readonly userId?: string;
  readonly username?: string;
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
  /**
   * Mentions déclarées hors texte. TRI-ÉTAT à l'édition, comme `location` :
   * `undefined` = le client n'en parle pas, les lignes `PINNED` existantes
   * survivent ; `[]` = il n'en déclare plus aucune, elles partent ; une liste
   * remplace l'ensemble déclaré. À la création, `undefined` et `[]` reviennent
   * au même — il n'y a rien à préserver.
   */
  declared?: readonly DeclaredPostMention[];
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
  const { mentionService, content, declared } = params;

  if (!mentionService) return UNRESOLVED;

  // Le court-circuit couvre désormais les DEUX voies : un post sans `@` ET sans
  // mention déclarée ne doit coûter aucune requête. Le tester sur le seul
  // contenu aurait silencieusement jeté toute pastille de canevas — le défaut
  // même que la voie déclarée existe pour corriger.
  const namesInContent = Boolean(content && content.includes('@'));
  const namesDeclared = Boolean(declared && declared.length > 0);
  if (!namesInContent && !namesDeclared) return NO_MENTIONS;

  try {
    const contentUserIds = namesInContent
      ? await resolveMentionedUserIds(mentionService, content as string)
      : [];
    const declaredUserIds = await resolveDeclaredUserIds(mentionService, declared);
    // Nommée des DEUX côtés, la personne compte comme mention de TEXTE : c'est
    // la voie que l'édition relit, donc celle qui doit gouverner sa survie.
    const canvasOnlyUserIds = declaredUserIds.filter((id) => !contentUserIds.includes(id));
    const mentionedUserIds = [...contentUserIds, ...canvasOnlyUserIds];
    if (mentionedUserIds.length === 0) return NO_MENTIONS;

    await persistBySource(mentionService, params.post.id, contentUserIds, canvasOnlyUserIds);
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
    const previousRows = await prisma.postMention.findMany({
      where: { postId: params.post.id },
      select: { mentionedUserId: true, display: true },
    });
    const previousUserIds = previousRows.map((row) => row.mentionedUserId);
    // Un `display` absent se lit INLINE (`readDisplay`) : c'était la seule voie
    // qui existait avant le discriminant, et la relire dans le texte est
    // exactement ce que faisait la réconciliation d'avant.
    const previousCanvasUserIds = previousRows
      .filter((row) => readDisplay(row.display) === 'PINNED')
      .map((row) => row.mentionedUserId);

    const contentUserIds = content && content.includes('@')
      ? await resolveMentionedUserIds(mentionService, content)
      : [];

    // TRI-ÉTAT : sans liste, les pastilles du canevas SURVIVENT. Les déduire du
    // texte les effacerait à la première correction de frappe — elles n'y sont
    // pas, c'est leur raison d'être.
    const canvasUserIds = params.declared === undefined
      ? previousCanvasUserIds
      : await resolveDeclaredUserIds(mentionService, params.declared);

    const canvasOnlyUserIds = canvasUserIds.filter((id) => !contentUserIds.includes(id));
    const mentionedUserIds = [...contentUserIds, ...canvasOnlyUserIds];

    const previous = new Set(previousUserIds);
    const retained = new Set(mentionedUserIds);
    const departedUserIds = previousUserIds.filter((id) => !retained.has(id));
    const newlyMentionedUserIds = mentionedUserIds.filter((id) => !previous.has(id));

    if (departedUserIds.length > 0) {
      await prisma.postMention.deleteMany({
        where: { postId: params.post.id, mentionedUserId: { in: departedUserIds } },
      });
    }

    await persistBySource(
      mentionService,
      params.post.id,
      newlyMentionedUserIds.filter((id) => contentUserIds.includes(id)),
      newlyMentionedUserIds.filter((id) => !contentUserIds.includes(id))
    );
    notifyNewlyMentioned(params, newlyMentionedUserIds);

    return { mentionedUserIds, newlyMentionedUserIds, reconciled: true };
  } catch (error) {
    params.onError?.(error);
    return UNRESOLVED;
  }
}

/**
 * Écrit chaque lot sous SA source. Deux appels et non un : c'est le
 * discriminant qui dit, à l'édition suivante, laquelle relire dans le texte —
 * un lot fusionné les rendrait toutes relisibles, et la première correction de
 * frappe effacerait les pastilles du canevas.
 *
 * La garde du lot vide vit ici plutôt que dans `createPostMentions` : lui la
 * porte déjà, mais l'appeler pour rien brouillerait le compte d'appels que
 * lisent les tests — et une écriture qu'on n'a pas à faire ne se demande pas.
 */
async function persistBySource(
  mentionService: PostMentionResolver,
  postId: string,
  contentUserIds: readonly string[],
  canvasUserIds: readonly string[]
): Promise<void> {
  if (contentUserIds.length > 0) {
    await mentionService.createPostMentions(postId, [...contentUserIds], 'INLINE');
  }
  if (canvasUserIds.length > 0) {
    await mentionService.createPostMentions(postId, [...canvasUserIds], 'PINNED');
  }
}

/**
 * Les `User.id` des mentions DÉCLARÉES. Un `userId` fourni est pris tel quel ;
 * un `username` passe par la même résolution que le texte. Dédupliqué en
 * préservant l'ordre de déclaration — c'est celui du canevas, donc celui que
 * l'auteur a posé.
 */
async function resolveDeclaredUserIds(
  mentionService: PostMentionResolver,
  declared: readonly DeclaredPostMention[] | undefined
): Promise<string[]> {
  if (!declared || declared.length === 0) return [];

  const usernames = declared
    .filter((mention) => !mention.userId)
    .map((mention) => mention.username)
    .filter((username): username is string => Boolean(username));

  const resolvedByName = usernames.length > 0
    ? await mentionService.resolveUsernames(usernames)
    : new Map<string, { id: string }>();
  const fromNames = Array.from(resolvedByName.values()).map((user) => user.id);

  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const id of [...declared.map((m) => m.userId), ...fromNames]) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ordered.push(id);
  }
  return ordered;
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
