import type { PrismaClient } from '@meeshy/shared/prisma/client';

import { collectMentionableText } from './mentionableText';
import { retractMentionNotifications } from './retractMentionNotifications';

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
export type PostMentionPrisma = Pick<PrismaClient, 'postMention' | 'notification'>;

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
    display: PostMentionDisplayValue
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
 * Une personne que le post NOMME sans que son texte le dise.
 *
 * `userId` OU `username` — un sélecteur rend un `User.id`, un canevas ne porte
 * que le `@handle` qu'il affiche, et c'est LUI qui survit à un brouillon repris
 * trois jours plus tard. Les pseudos passent par la MÊME résolution que
 * l'extraction de texte, donc les deux voies ne peuvent pas diverger.
 *
 * `display` est REQUIS et ne peut pas valoir INLINE : le client ne déclare que
 * ce que le texte ne peut pas porter. INLINE est dérivé par le serveur.
 */
export interface DeclaredPostMention {
  readonly userId?: string;
  readonly username?: string;
  readonly display: DeclarablePostMentionDisplay;
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
   * Les effets du post, quand il en a. La dérivation INLINE y lit le texte des
   * objets de canevas — c'est là que vit le texte d'une story, pas dans
   * `content`. Voir `collectMentionableText`.
   */
  storyEffects?: unknown;
  /**
   * Références déclarées hors texte. TRI-ÉTAT à l'édition, comme `location` :
   * `undefined` = le client n'en parle pas, les lignes déclarées existantes
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
  const { mentionService, declared } = params;

  if (!mentionService) return UNRESOLVED;

  // Le court-circuit couvre les DEUX voies : un post sans `@` nulle part ET
  // sans référence déclarée ne doit coûter aucune requête. Le tester sur la
  // seule légende aurait silencieusement jeté tout badge de canevas — le défaut
  // même que la voie déclarée existe pour corriger.
  const fragments = collectMentionableText({
    content: params.content,
    storyEffects: params.storyEffects,
  });
  const namesInText = fragments.some((fragment) => fragment.includes('@'));
  const namesDeclared = Boolean(declared && declared.length > 0);
  if (!namesInText && !namesDeclared) return NO_MENTIONS;

  try {
    const textUserIds = namesInText ? await resolveTextUserIds(mentionService, params) : [];
    const declaredModes = await resolveDeclared(mentionService, declared);
    const modes = applyPrecedence(textUserIds, declaredModes);

    const mentionedUserIds = [...modes.keys()];
    if (mentionedUserIds.length === 0) return NO_MENTIONS;

    await persistByDisplay(mentionService, params.post.id, modes);
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
  const { prisma, mentionService } = params;

  // Sans service, rien n'est résolvable — donc rien n'est réconciliable. En
  // conclure que le post ne nomme plus personne effacerait les références d'un
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
    const previousModes = new Map<string, PostMentionDisplayValue>(
      previousRows.map((row) => [row.mentionedUserId, readDisplay(row.display)] as const)
    );
    const previousDeclared = new Map<string, DeclarablePostMentionDisplay>(
      [...previousModes.entries()].filter(
        (entry): entry is [string, DeclarablePostMentionDisplay] => entry[1] !== 'INLINE'
      )
    );

    const fragments = collectMentionableText({
      content: params.content,
      storyEffects: params.storyEffects,
    });
    const textUserIds = fragments.some((fragment) => fragment.includes('@'))
      ? await resolveTextUserIds(mentionService, params)
      : [];

    // TRI-ÉTAT : sans liste, les déclarées SURVIVENT. Les déduire du texte les
    // effacerait à la première correction de frappe — elles n'y sont pas,
    // c'est leur raison d'être.
    const declaredModes = params.declared === undefined
      ? previousDeclared
      : await resolveDeclared(mentionService, params.declared);

    const modes = applyPrecedence(textUserIds, declaredModes);
    const mentionedUserIds = [...modes.keys()];

    const previous = new Set(previousUserIds);
    const retained = new Set(mentionedUserIds);
    const departedUserIds = previousUserIds.filter((id) => !retained.has(id));
    const newlyMentionedUserIds = mentionedUserIds.filter((id) => !previous.has(id));

    if (departedUserIds.length > 0) {
      await prisma.postMention.deleteMany({
        where: { postId: params.post.id, mentionedUserId: { in: departedUserIds } },
      });
      // Le retrait de la ligne RÉVOQUE l'accès qu'elle ouvrait : sa notification
      // survivrait en pointant vers un contenu désormais fermé.
      await retractMentionNotifications({
        prisma,
        postId: params.post.id,
        departedUserIds,
        onError: params.onError,
      });
    }

    const newModes = new Map(
      [...modes.entries()].filter(([id]) => newlyMentionedUserIds.includes(id))
    );
    await persistByDisplay(mentionService, params.post.id, newModes);

    // Le mode de ceux qui RESTENT. `createPostMentions` ne peut pas le poser :
    // il `create` et avale le P2002 de la ligne déjà là, donc le nouveau mode
    // n'atteindrait jamais la base — « une liste remplace l'ensemble déclaré »
    // serait faux dès que la personne y figurait déjà, et un SILENT demandé sur
    // une ligne INLINE resterait visible de tous.
    const changedModes = new Map(
      [...modes.entries()].filter(([id, mode]) => previous.has(id) && previousModes.get(id) !== mode)
    );
    await updateChangedDisplays(prisma, params.post.id, changedModes);

    notifyNewlyMentioned(params, newlyMentionedUserIds);

    return { mentionedUserIds, newlyMentionedUserIds, reconciled: true };
  } catch (error) {
    params.onError?.(error);
    return UNRESOLVED;
  }
}

/**
 * Les `User.id` que le TEXTE nomme — légende et objets de canevas confondus,
 * badges exclus (`collectMentionableText`).
 */
async function resolveTextUserIds(
  mentionService: PostMentionResolver,
  params: PostMentionParams
): Promise<string[]> {
  const fragments = collectMentionableText({
    content: params.content,
    storyEffects: params.storyEffects,
  });
  const usernames = fragments.flatMap((fragment) => mentionService.extractMentions(fragment));
  if (usernames.length === 0) return [];

  const userMap = await mentionService.resolveUsernames(usernames);
  return Array.from(userMap.values()).map((user) => user.id);
}

/**
 * Les références DÉCLARÉES, résolues en `User.id` et gardant leur mode.
 * Dédupliqué en préservant l'ordre de déclaration — c'est celui du canevas,
 * donc celui que l'auteur a posé.
 */
async function resolveDeclared(
  mentionService: PostMentionResolver,
  declared: readonly DeclaredPostMention[] | undefined
): Promise<Map<string, DeclarablePostMentionDisplay>> {
  const resolved = new Map<string, DeclarablePostMentionDisplay>();
  if (!declared || declared.length === 0) return resolved;

  const byUsername = declared.filter((mention) => !mention.userId && mention.username);
  const usernameMap = byUsername.length > 0
    ? await mentionService.resolveUsernames(
        byUsername.map((mention) => mention.username as string)
      )
    : new Map<string, { id: string }>();

  for (const mention of declared) {
    const id = mention.userId
      ?? (mention.username ? usernameMap.get(mention.username.toLowerCase())?.id : undefined);
    if (!id || resolved.has(id)) continue;
    resolved.set(id, mention.display);
  }
  return resolved;
}

/**
 * Le mode FINAL de chaque personne, précédence appliquée.
 *
 * Une personne nommée des deux côtés garde son mode DÉCLARÉ — c'est un choix
 * explicite de l'auteur, là où INLINE n'est qu'un défaut dérivé ; faire gagner
 * le texte détruirait le badge dès que le pseudo apparaît aussi dans la
 * légende. SEUL SILENT perd contre le texte : on ne peut pas cacher ce qui est
 * écrit, et prétendre le contraire donnerait à l'auteur une discrétion que le
 * rendu contredit aussitôt.
 */
function applyPrecedence(
  textUserIds: readonly string[],
  declared: ReadonlyMap<string, DeclarablePostMentionDisplay>
): Map<string, PostMentionDisplayValue> {
  const final = new Map<string, PostMentionDisplayValue>();

  for (const id of textUserIds) {
    const declaredMode = declared.get(id);
    final.set(id, declaredMode && declaredMode !== 'SILENT' ? declaredMode : 'INLINE');
  }
  for (const [id, mode] of declared.entries()) {
    if (!final.has(id)) final.set(id, mode);
  }
  return final;
}

/**
 * Écrit chaque lot sous SON mode. Un appel par mode et non un seul : c'est le
 * discriminant qui dit, à l'édition suivante, laquelle relire dans le texte —
 * un lot fusionné les rendrait toutes relisibles, et la première correction de
 * frappe effacerait les badges du canevas.
 *
 * La garde du lot vide vit ici plutôt que dans `createPostMentions` : lui la
 * porte déjà, mais l'appeler pour rien brouillerait le compte d'appels que
 * lisent les tests.
 */
async function persistByDisplay(
  mentionService: PostMentionResolver,
  postId: string,
  modes: ReadonlyMap<string, PostMentionDisplayValue>
): Promise<void> {
  for (const mode of DISPLAY_ORDER) {
    const ids = idsForDisplay(modes, mode);
    if (ids.length > 0) {
      await mentionService.createPostMentions(postId, ids, mode);
    }
  }
}

/** L'ordre d'écriture des lots, un par mode. */
const DISPLAY_ORDER: readonly PostMentionDisplayValue[] = ['INLINE', 'PINNED', 'NOTE', 'SILENT'];

function idsForDisplay(
  modes: ReadonlyMap<string, PostMentionDisplayValue>,
  display: PostMentionDisplayValue
): string[] {
  return [...modes.entries()].filter(([, value]) => value === display).map(([id]) => id);
}

/**
 * Le mode d'une personne DÉJÀ référencée, quand il change.
 *
 * Un lot par mode, comme {@link persistByDisplay} : c'est le même discriminant,
 * écrit sous la même forme. Rien ne part quand rien ne change — une correction
 * de frappe ne doit pas réécrire toute la table des références du post.
 */
async function updateChangedDisplays(
  prisma: PostMentionPrisma,
  postId: string,
  changed: ReadonlyMap<string, PostMentionDisplayValue>
): Promise<void> {
  for (const mode of DISPLAY_ORDER) {
    const ids = idsForDisplay(changed, mode);
    if (ids.length > 0) {
      await prisma.postMention.updateMany({
        where: { postId, mentionedUserId: { in: ids } },
        data: { display: mode },
      });
    }
  }
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
