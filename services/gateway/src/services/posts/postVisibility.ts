/**
 * Post visibility ACL helper
 *
 * Shared between CommentReactionHandler and PostReactionHandler (and any future
 * handler that needs to gate access by post visibility).
 */

import { PrismaClient, PostType, PostVisibility } from '@meeshy/shared/prisma/client';
import { doUsersShareCommunity } from './communityVisibility';
import { doUsersShareDirectConversation } from './directContactVisibility';
import { verdictFor } from './referenceAccess';
import { NOT_DELETED } from './softDelete';
import { amitieAcceptee } from '../friendship';

export type PostVisibilityRecord = {
  /**
   * L'id du post lui-même. Il fait partie de la tranche ACL depuis que le
   * verdict de CONSOMMATION interroge les références (`includeReferenced`) :
   * sans lui, la branche chercherait une référence sur `undefined` et
   * refuserait tout le monde en silence.
   */
  id: string;
  authorId: string;
  visibility: PostVisibility;
  visibilityUserIds: string[];
  /**
   * L'échéance du contenu, `null` quand il est permanent. Elle fait partie de
   * la tranche ACL depuis que la branche des RÉFÉRENCES lit un droit QUI SE
   * DÉPENSE : passée l'expiration, être nommé ne vaut plus qu'une fenêtre de
   * 24 h, et sans cette date la branche ne saurait pas que le décompte a
   * commencé.
   *
   * REQUISE, et non optionnelle par défaut `null` : une garde qu'on désarme en
   * oubliant un champ n'est pas une garde — l'oubli ferait passer tout contenu
   * pour perpétuel, donc tout droit éteint pour intact.
   */
  expiresAt: Date | null;
};

/**
 * Les seuls délégués Prisma qu'une décision d'ACL touche. `Pick` plutôt que
 * `PrismaClient` entier, pour la raison écrite dans `postAudience.ts` : un
 * appelant qui ne porte qu'une tranche du client doit pouvoir la passer sans
 * `as PrismaClient` — l'assertion sur un sous-type structurel est exactement ce
 * que ce dépôt refuse.
 */
export type PostAclPrisma = Pick<
  PrismaClient,
  'post' | 'postComment' | 'friendRequest' | 'communityMember' | 'participant' | 'postMention'
>;

/**
 * G5 — canonical Prisma OR-filter for post visibility, the single source both
 * PostFeedService and PostService import (they used to carry private copies;
 * drift between them = documented leak/hole risk).
 *
 * `audienceIds` is the FRIENDS/EXCEPT audience and is intentionally a
 * parameter. Both call sites — `PostFeedService.buildVisibilityFilter` (feed)
 * and `PostService.buildVisibilityFilter` (single-post fetch + view recording)
 * — now pass friends ∪ DM-contacts, so what a viewer can SEE and what they can
 * be RECORDED as having viewed are one audience (story-sota §4 divergence
 * resolved: a DM-contact who can open a story now also registers as a viewer).
 *
 * ASYMÉTRIE VOLONTAIRE voir ⊇ interagir : ce filtre (ce qu'un viewer peut VOIR
 * / dont la vue est ENREGISTRÉE) admet friends ∪ DM-contacts, tandis que
 * l'audience d'INTERACTION (RÉAGIR / COMMENTER) reste amis stricts. Un
 * DM-contact peut donc ouvrir une story FRIENDS et compter comme viewer, mais
 * pas y réagir. C'est un choix produit (décision 2026-07-08) — les deux ne sont
 * PAS identiques ; ne pas « réaligner » l'un sur l'autre sans re-décider l'ACL
 * d'interaction.
 *
 * Les deux côtés de l'asymétrie ont chacun leur verdict unitaire en bas de
 * fichier — `canUserConsumePost` et `canUserInteractWithPost` — et c'est par
 * eux que passent les points d'entrée. Ce filtre ne sert qu'aux requêtes de
 * LISTE (feed, post unique) qui ne peuvent pas trancher post par post.
 *
 * Le côté CONSOMMATION a une troisième forme, pour juger un LOT de candidats
 * arbitraires en une requête bornée : `filterPostConsumers` (`postAudience.ts`),
 * qui garde les notifications de mention. Trois formes, une seule audience —
 * l'accord des deux formes unitaire/lot est verrouillé cas par cas dans
 * `__tests__/unit/services/posts/postAudienceConsumption.test.ts`.
 */
export function buildPostVisibilityOrFilter(
  viewerId: string,
  audienceIds: string[],
  communityCoMemberIds: string[] = []
) {
  return {
    OR: [
      { authorId: viewerId },
      { visibility: PostVisibility.PUBLIC },
      { visibility: PostVisibility.COMMUNITY, authorId: { in: communityCoMemberIds } },
      { visibility: PostVisibility.FRIENDS, authorId: { in: audienceIds } },
      { visibility: PostVisibility.EXCEPT, authorId: { in: audienceIds }, NOT: { visibilityUserIds: { has: viewerId } } },
      { visibility: PostVisibility.ONLY, visibilityUserIds: { has: viewerId } },
    ],
  };
}

/**
 * Checks whether `userId` is allowed to see `post` based on its visibility setting.
 *
 * PUBLIC    → everyone
 * COMMUNITY → author + members sharing at least one community with the author
 * FRIENDS   → post author + accepted friends of author
 * PRIVATE   → author only
 * ONLY      → userId must be in visibilityUserIds
 * EXCEPT    → userId must NOT be in visibilityUserIds, AND must be a friend
 *
 * `options.includeDirectContacts` élargit la seule branche FRIENDS/EXCEPT à
 * l'audience de CONSOMMATION du feed (amis ∪ contacts DM). C'est le paramètre
 * qui rend EXÉCUTABLE l'asymétrie « voir ⊇ interagir » documentée en tête de
 * fichier, au lieu de la laisser en prose : les deux verdicts nommés
 * ci-dessous (`canUserConsumePost` / `canUserInteractWithPost`) ne diffèrent
 * que par lui. Ne pas l'appeler directement depuis un point d'entrée — passer
 * par le verdict nommé d'après ce qu'il autorise.
 *
 * `options.includeReferenced` garde de la même façon la branche des
 * RÉFÉRENCES : être nommé dans un contenu l'ouvre, mais ne donne pas le droit
 * d'y réagir ni d'y commenter.
 *
 * ORDRE DES TROIS QUESTIONS, et il porte tout le sens :
 *
 *  1. l'auteur — gratuit, aucune requête ;
 *  2. l'audience ORDINAIRE — celle que le post déclare ;
 *  3. la RÉFÉRENCE — la voie de secours, et elle seule.
 *
 * La référence en DERNIER, pas en premier. La consulter d'abord faisait payer
 * une lecture de `PostMention` à chaque lecteur légitime de chaque fil de
 * commentaires — jusque sur un post PUBLIC, où aucune référence ne peut
 * changer le verdict. Elle ne coûte désormais une requête qu'à qui l'audience
 * vient de refuser, c'est-à-dire à la population qu'elle existe pour admettre.
 */
export async function canUserViewPost(
  prisma: PostAclPrisma,
  post: PostVisibilityRecord,
  userId: string,
  options: {
    includeDirectContacts?: boolean;
    includeReferenced?: boolean;
    /** Horloge de la fenêtre de référence — injectable pour la border au test. */
    now?: Date;
  } = {}
): Promise<boolean> {
  if (post.authorId === userId) return true;

  if (await matchesPostAudience(prisma, post, userId, options)) return true;

  // PRIVATE l'emporte sur la référence — et c'est la SEULE visibilité dans ce
  // cas. La branche traverse FRIENDS, EXCEPT, ONLY et COMMUNITY parce que
  // l'auteur vient précisément d'y nommer quelqu'un ; PRIVATE dit autre chose,
  // et le dit après : « moi seul ». Basculer un contenu en archive personnelle
  // doit le refermer sur tout le monde, y compris sur les personnes qu'il
  // continue de nommer.
  if (post.visibility === PostVisibility.PRIVATE) return false;

  if (options.includeReferenced !== true) return false;
  return isReferenceStillOpen(prisma, post, userId, options.now ?? new Date());
}

/**
 * L'audience que le post DÉCLARE — sans la voie des références.
 *
 * Extraite pour que l'ordre des trois questions se lise dans
 * {@link canUserViewPost} plutôt que de se deviner entre un `if` et un
 * `switch` qui rendent tous deux un verdict final.
 */
async function matchesPostAudience(
  prisma: PostAclPrisma,
  post: PostVisibilityRecord,
  userId: string,
  options: { includeDirectContacts?: boolean }
): Promise<boolean> {
  switch (post.visibility) {
    case PostVisibility.PUBLIC:
      return true;

    case PostVisibility.PRIVATE:
      return false;

    case PostVisibility.ONLY:
      return post.visibilityUserIds.includes(userId);

    case PostVisibility.COMMUNITY:
      return doUsersShareCommunity(prisma, post.authorId, userId);

    case PostVisibility.FRIENDS:
    case PostVisibility.EXCEPT: {
      // EXCEPT exclut nommément AVANT toute lecture du graphe : un utilisateur
      // sur la liste noire est refusé quelle que soit la relation, donc
      // interroger l'amitié (puis les DM) ne changerait pas le verdict.
      if (post.visibility === PostVisibility.EXCEPT && post.visibilityUserIds.includes(userId)) {
        return false;
      }
      if (await amitieAcceptee(prisma, post.authorId, userId)) return true;
      // Le contact DM n'est consulté qu'en second — l'amitié est le cas
      // dominant et coûte une seule requête bornée.
      return options.includeDirectContacts === true
        && doUsersShareDirectConversation(prisma, post.authorId, userId);
    }

    default:
      return false;
  }
}

/**
 * Le lecteur est-il nommé dans ce post, ET son droit vaut-il encore ?
 *
 * Les deux questions n'en font qu'une, et une seule requête : tester
 * l'EXISTENCE de la ligne ouvrait tout ce que ce fichier garde à un droit déjà
 * dépensé. La consommation ne détruit pas la ligne — la détruire fausserait
 * l'inbox `/mentions`, les compteurs et l'affinité de recommandation — elle
 * pose `expiredViewAt`, donc l'existence ne prouve plus rien. Alice, nommée
 * dans une story FRIENDS expirée depuis deux jours, recevait `consumed` sur
 * `GET /posts/:id` et le fil ENTIER sur `GET /posts/:id/comments`.
 *
 * La règle de fenêtre elle-même n'est pas recopiée ici : `verdictFor`
 * (`referenceAccess.ts`) en est la seule écriture, partagée avec le verdict
 * unitaire de la charge utile et avec la résolution groupée du tray.
 *
 * Une lecture en échec rend `false` — jamais une ouverture. Le `try` couvre
 * l'accès au délégué lui-même, pas seulement la promesse : un appelant qui ne
 * porte qu'une tranche du client Prisma ne doit pas transformer un refus
 * d'audience en erreur.
 */
async function isReferenceStillOpen(
  prisma: PostAclPrisma,
  post: PostVisibilityRecord,
  userId: string,
  now: Date,
): Promise<boolean> {
  try {
    const reference = await prisma.postMention.findUnique({
      where: { post_user_mention_unique: { postId: post.id, mentionedUserId: userId } },
      select: { expiredViewAt: true },
    });
    if (reference === null) return false;
    return verdictFor(post.expiresAt, reference.expiredViewAt, now) === 'granted';
  } catch {
    return false;
  }
}

/**
 * La tranche minimale d'un post qui suffit à trancher son ACL. Le `deletedAt`
 * vit dans le `where` des chargeurs ci-dessous, pas dans le verdict : un post
 * supprimé n'a pas d'audience, il n'existe pas.
 */
const POST_ACL_SELECT = {
  id: true,
  authorId: true,
  visibility: true,
  visibilityUserIds: true,
  expiresAt: true,
} as const;

/**
 * Charge la tranche ACL d'un post. `null` si le post est absent OU supprimé —
 * les deux cas sont volontairement indiscernables, comme dans
 * `PostService.recordMediaDownloads` : distinguer révélerait l'existence d'un
 * post que l'appelant n'a pas le droit de voir.
 */
export async function loadPostAcl(
  prisma: PostAclPrisma,
  postId: string,
): Promise<PostVisibilityRecord | null> {
  const post = await prisma.post.findFirst({
    where: { id: postId, deletedAt: NOT_DELETED },
    select: POST_ACL_SELECT,
  });
  return post ?? null;
}

/**
 * Charge la tranche ACL du post PORTANT `commentId`, et rend son identifiant
 * réel.
 *
 * Les routes du fil sont montées sous `/posts/:postId/comments/:commentId/…`
 * mais n'adressent le commentaire que par `commentId` — un appelant peut donc
 * annoncer le `postId` d'un post public tout en visant le commentaire d'un post
 * privé. Résoudre le post DEPUIS le commentaire ferme cet écart : l'id d'URL
 * n'est jamais cru, il n'est plus qu'un segment de chemin.
 */
export async function loadCommentPostAcl(
  prisma: PostAclPrisma,
  commentId: string,
): Promise<{ postId: string; post: PostVisibilityRecord } | null> {
  const comment = await prisma.postComment.findFirst({
    where: { id: commentId, deletedAt: NOT_DELETED },
    select: { postId: true, post: { select: POST_ACL_SELECT } },
  });
  if (!comment?.post) return null;
  return { postId: comment.postId, post: comment.post };
}

/**
 * A-t-il le droit de CONSOMMER ce post et le contenu qui y est attaché (lire
 * le fil de commentaires, les réponses) ?
 *
 * Audience = amis ∪ contacts DM, celle de `buildPostVisibilityOrFilter` — donc
 * exactement ce que le feed lui montre. Un contact DM non-ami qui voit une
 * story `FRIENDS` dans son feed doit pouvoir en lire les commentaires ; le
 * verdict d'interaction (amis stricts) le refuserait et transformerait un
 * lecteur légitime en 404.
 *
 * `userId` absent = visiteur non identifié : seul un post `PUBLIC` lui est
 * ouvert, et aucune requête de graphe n'est émise pour l'établir.
 */
export async function canUserConsumePost(
  prisma: PostAclPrisma,
  post: PostVisibilityRecord,
  userId?: string,
): Promise<boolean> {
  if (!userId) return post.visibility === PostVisibility.PUBLIC;
  return canUserViewPost(prisma, post, userId, {
    includeDirectContacts: true,
    includeReferenced: true,
  });
}

/**
 * A-t-il le droit d'INTERAGIR avec ce post (commenter, liker un commentaire,
 * réagir) ?
 *
 * Audience = amis stricts. C'est la règle que ce fichier documente depuis
 * toujours — « `canUserViewPost` (amis stricts) garde RÉAGIR / COMMENTER » —
 * mais qu'aucune route du fil n'appliquait. L'asymétrie voir ⊇ interagir est un
 * choix produit (décision 2026-07-08) : ne pas réaligner l'un sur l'autre sans
 * re-décider l'ACL.
 */
export async function canUserInteractWithPost(
  prisma: PostAclPrisma,
  post: PostVisibilityRecord,
  userId?: string,
): Promise<boolean> {
  if (!userId) return false;
  return canUserViewPost(prisma, post, userId);
}

/**
 * Tranche ACL + redirection d'un post CANDIDAT à une interaction sociale
 * (like/réaction, commentaire). Porte, en plus de `PostVisibilityRecord`, les
 * champs qui décident SI ce post redirige vers sa racine.
 */
export type PostRedirectRecord = PostVisibilityRecord & {
  id: string;
  type: PostType;
  isQuote: boolean;
  repostOfId: string | null;
  originalRepostOfId: string | null;
};

const POST_REDIRECT_SELECT = {
  id: true,
  authorId: true,
  visibility: true,
  visibilityUserIds: true,
  expiresAt: true,
  type: true,
  isQuote: true,
  repostOfId: true,
  originalRepostOfId: true,
} as const;

async function loadPostRedirectRecord(
  prisma: PostAclPrisma,
  postId: string,
): Promise<PostRedirectRecord | null> {
  const post = await prisma.post.findFirst({
    where: { id: postId, deletedAt: NOT_DELETED },
    select: POST_REDIRECT_SELECT,
  });
  return post ?? null;
}

/**
 * Charge la racine SANS filtrer `deletedAt` en `where` : décider si elle est
 * ÉPHÉMÈRE (`type`) doit rester possible même une fois soft-supprimée par
 * `ExpiredStoriesCleanupService` (~7j après l'expiry d'une STORY/STATUS) —
 * sinon un repost qui la source redeviendrait socialement mort au moment
 * précis où l'exclusion éphémère (voir `resolveRedirectTarget`) doit
 * continuer de s'appliquer (review task-9, critique #1). `deletedAt` est donc
 * vérifié manuellement plus bas, uniquement pour une racine qui s'avère NON
 * éphémère.
 */
async function loadPostRedirectRoot(
  prisma: PostAclPrisma,
  postId: string,
): Promise<(PostRedirectRecord & { deletedAt: Date | null }) | null> {
  const post = await prisma.post.findFirst({
    where: { id: postId },
    select: { ...POST_REDIRECT_SELECT, deletedAt: true },
  });
  return post ?? null;
}

/** STORY (21h) et STATUS (1h) : les deux types éphémères de `PostType`. */
export function isEphemeralPostType(type: PostType): boolean {
  return type === PostType.STORY || type === PostType.STATUS;
}

/**
 * Résout la cible RÉELLE d'une interaction sociale portée par `postId` : un
 * repost SIMPLE (`isQuote:false`, `repostOfId` renseigné) n'a pas de vie
 * sociale propre — sa cible est sa RACINE (`originalRepostOfId ??
 * repostOfId`), jamais le parent intermédiaire d'une chaîne de reposts. Une
 * CITATION (`isQuote:true`) ou un post qui n'est pas un repost garde sa
 * propre cible.
 *
 * POINT UNIQUE de cette redirection (chantier reposts cohérents & watermark,
 * tâche 9) : REST (`routes/posts/interactions.ts`, `routes/posts/comments.ts`)
 * et socket (`PostReactionHandler`) l'appellent tous les deux au lieu de
 * dupliquer la règle chacun de leur côté — un seul endroit décide qui gagne
 * un like/commentaire quand plusieurs reposts du même original coexistent.
 *
 * `verdict` sélectionne l'audience appliquée (`canUserInteractWithPost` pour
 * écrire/réagir, `canUserConsumePost` pour lire) — c'est la SEULE différence
 * entre `resolveInteractionTarget` et `resolveConsumptionTarget` ci-dessous.
 *
 * Renvoie `null` — refus indistinct, comme `loadPostAcl` — quand : le post
 * visé est absent/supprimé/invisible pour l'acteur, OU quand la racine d'un
 * repost simple est elle-même absente/supprimée/invisible pour lui. La
 * redirection ne doit JAMAIS outrepasser la visibilité de la racine : pas de
 * crédit silencieux sur un post que l'acteur ne peut pas voir.
 *
 * EXCLUSION ÉPHÉMÈRE (review task-9, critique #1) : quand la racine est une
 * STORY/STATUS, la redirection NE S'APPLIQUE PAS — le repost porte son propre
 * instantané (média/audio/storyEffects dupliqués à la création,
 * `PostService.repostPost` § isEphemeralSourceRepost, car la source expire
 * puis est nettoyée) et garde donc SA PROPRE vie sociale, jamais celle de la
 * racine. Sans cette exclusion : (a) chaque like/commentaire d'un repost de
 * story misroutait tant que la story vivait encore (broadcast
 * `story:reacted`/notifications typées story pour une action sur une carte de
 * FEED), et (b) le repost — pourtant PERMANENT et toujours affiché —
 * devenait socialement mort dès qu'`ExpiredStoriesCleanupService`
 * soft-supprimait la racine (~7j après expiry) : like/unlike/commentaire 404
 * pour toujours sur une carte encore visible côté client.
 */
async function resolveRedirectTarget(
  prisma: PostAclPrisma,
  postId: string,
  userId: string | undefined,
  verdict: (prisma: PostAclPrisma, post: PostVisibilityRecord, userId?: string) => Promise<boolean>,
): Promise<PostRedirectRecord | null> {
  const post = await loadPostRedirectRecord(prisma, postId);
  if (!post || !(await verdict(prisma, post, userId))) return null;

  const isSimpleRepost = !post.isQuote && Boolean(post.repostOfId);
  if (!isSimpleRepost) return post;

  const rootId = post.originalRepostOfId ?? post.repostOfId!;
  if (rootId === post.id) return post;

  const root = await loadPostRedirectRoot(prisma, rootId);
  if (!root) return null;
  if (isEphemeralPostType(root.type)) return post;

  if (root.deletedAt != null || !(await verdict(prisma, root, userId))) return null;
  return root;
}

/** Redirection pour ÉCRIRE/RÉAGIR (like, réaction, commentaire) — amis stricts. */
export function resolveInteractionTarget(
  prisma: PostAclPrisma,
  postId: string,
  userId: string,
): Promise<PostRedirectRecord | null> {
  return resolveRedirectTarget(prisma, postId, userId, canUserInteractWithPost);
}

/** Redirection pour LIRE (fil de commentaires) — amis ∪ contacts DM. */
export function resolveConsumptionTarget(
  prisma: PostAclPrisma,
  postId: string,
  userId?: string,
): Promise<PostRedirectRecord | null> {
  return resolveRedirectTarget(prisma, postId, userId, canUserConsumePost);
}
