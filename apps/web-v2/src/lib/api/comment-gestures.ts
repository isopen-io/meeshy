import type { QueryClient } from '@tanstack/react-query';

import { editedLanguage } from '@/lib/send/compose-language';

import { newClientMessageId } from './client-message-id';
import type { DataSource } from './config';
import type { ApiResult, HttpTransport } from './http';
import { outcomeOf } from './outcome';
import {
  COMMENT_MAX_LENGTH,
  commentsQueryKey,
  shiftCommentCount,
  type CommentInfiniteData,
  type PostComment,
} from './publication-comments';

/**
 * LES GESTES D'UNE RANGÉE DE COMMENTAIRE (#7133, première tranche de #7118) —
 * aimer, modifier, supprimer : plan → optimiste → appel → issue, la forme
 * EXACTE de `feed-gestures.ts` (`performPostGesture`), sur un autre objet.
 *
 * **POURQUOI UN MODULE NEUF.** `publication-comments.ts` tient déjà la
 * pagination, l'insertion optimiste et le compteur de la publication ; il est
 * à son budget. Et `comment-list.tsx` ne charge RIEN par contrat (son
 * doc-comment) : y poser du réseau ferait de la liste une surface non
 * éprouvable sans passerelle, ce qui est précisément ce qui la rend partageable
 * entre `/post/$post` et le lecteur de stories.
 *
 * ROUTES RÉELLES, lues avant d'être appelées :
 *
 *  - `POST|DELETE /api/v1/posts/:postId/comments/:commentId/like`
 *    (`services/gateway/src/routes/posts/comments.ts:679,774`, `requiredAuth`
 *    + `registeredUser`). Corps facultatif : `LikeSchema.emoji` a le DÉFAUT
 *    `'❤️'` (`routes/posts/types.ts:560`) et `UnlikeSchema` n'en a AUCUN
 *    (`:588`, « un défaut rendrait le repli inatteignable ») — donc rien
 *    n'est envoyé et le retrait vise la réaction la plus récente, ce que la
 *    règle produit appelle « la dernière posée ». La réponse rend
 *    `{ liked, likeCount, reactionSummary }` : le `likeCount` SERVI est
 *    absolu et remplace l'estimation. Hors audience d'INTERACTION ⇒ 404
 *    `COMMENT_NOT_FOUND`, jamais un 403 qui révélerait l'existence.
 *    **Cette route ne passe PAS par `withMutationLog`** : aucun
 *    `X-Client-Mutation-Id` n'est posé, poser l'en-tête annoncerait une
 *    idempotence que la passerelle n'offre pas ici.
 *  - `PATCH /api/v1/posts/:postId/comments/:commentId` (`:524`) — corps
 *    `UpdateCommentSchema` (`types.ts:466`) : `content` ≤ 2000, `effectFlags`,
 *    `originalLanguage`, avec un `.refine` « Nothing to update ». Rend le
 *    commentaire SERVI (auteur + média + `postId`). 403 `FORBIDDEN` hors
 *    auteur, 400 `EMPTY_CONTENT` sur un texte blanc. Idempotent par
 *    `X-Client-Mutation-Id` (`replayCost: 'converges'`).
 *  - `DELETE /api/v1/posts/:postId/comments/:commentId` (`:853`) — rend
 *    `{ deleted: true }`, idempotent par `X-Client-Mutation-Id`. Ni le PATCH
 *    ni le DELETE ne gardent l'audience du POST, DÉLIBÉRÉMENT (le
 *    doc-comment de la route l'écrit : « le droit de retirer ce qu'on a
 *    publié ne peut pas dépendre de quelqu'un d'autre ») — le contrôle
 *    d'AUTEUR du service est leur seule garde, et c'est lui que la rangée
 *    reflète en n'offrant ces deux gestes que sur ses propres commentaires.
 *
 * LES ISSUES — et elles se lisent sur DEUX axes, pas un (revue-correction
 * #7135, défauts majeurs 1 et 4) :
 *
 *  - succès : l'optimiste reflète déjà la réalité ; une valeur servie le
 *    remplace ;
 *  - refus PERMANENT (`issue: 'refused'`) : l'optimiste est DÉFAIT **à
 *    l'identique** (le compteur retrouve sa valeur, la rangée sa PLACE),
 *    l'échec est annoncé AVEC SA RAISON, et **aucun rejeu n'est offert** —
 *    rejouer un 403 rendrait la même alerte indéfiniment (`outcome.ts:40-55`) ;
 *  - issue PASSAGÈRE (`issue: 'unconfirmed'`) : le rejeu À L'IDENTIQUE peut
 *    aboutir, donc c'est LÀ que « Réessayer » se pose. Ce que devient
 *    l'optimiste dépend alors de la NATURE du geste :
 *      · un geste RÉVERSIBLE (le cœur) le GARDE — le défaire ferait clignoter
 *        un cœur que le lecteur vient d'allumer, pour une panne qui se résout
 *        seule le plus souvent, et le rejeu porte sa direction (voir `on`) ;
 *      · un geste DESTRUCTEUR (modifier, supprimer) le DÉFAIT comme un refus.
 *        Laisser une rangée SUPPRIMÉE partie sur un 5xx faisait affirmer à
 *        l'écran une suppression que la passerelle venait de refuser : elle
 *        revenait au prochain chargement, et aucune file ne la rejouait
 *        (#5868 n'existe pas encore). C'était le défaut majeur 4.
 *
 * ET LA CAUSE NE SE DEVINE PAS : `comment.gesture.pending` nomme le RÉSEAU,
 * donc ne se sert que sur une absence de réponse ALORS QUE le lecteur est hors
 * ligne. Un 5xx / 429 a sa propre phrase — annoncer « hors ligne » sur une
 * panne de passerelle envoie l'utilisateur vérifier son wifi.
 *
 * UN GESTE À LA FOIS PAR RANGÉE ET PAR SENS — miroir `commentHeartInFlightIds`
 * (`PostDetailViewModel.swift:494`) : un second tap pendant l'appel enverrait
 * un `DELETE` qui croiserait le `POST` encore en route. Ce verrou-ci est la
 * garde de CORRECTION ; l'indisponibilité s'ANNONCE une couche plus haut
 * (`comment-thread.tsx`, `busyOf`), sans quoi le second tap est avalé en
 * silence par un bouton qui a l'air disponible (défaut majeur 7).
 */
export type CommentGestureDeps = {
  readonly source: DataSource;
  readonly transport: HttpTransport;
  readonly queryClient: QueryClient;
};

/**
 * Une CLÉ de catalogue, jamais un texte déjà traduit — seule la surface qui
 * annonce connaît la langue d'interface (même patron que `feed-gestures.ts`).
 * Une union LITTÉRALE, jamais `InterfaceCatalogKey` : `translate()` distribue
 * ses paramètres sur chaque clé du type qu'on lui passe.
 */
export type CommentGestureMessageKey =
  | 'comment.like.error'
  | 'comment.edit.error'
  | 'comment.delete.error'
  | 'comment.gesture.pending'
  | 'comment.gesture.unconfirmed';

export const COMMENT_LIKE_FAILED_MESSAGE: CommentGestureMessageKey = 'comment.like.error';
export const COMMENT_EDIT_FAILED_MESSAGE: CommentGestureMessageKey = 'comment.edit.error';
export const COMMENT_DELETE_FAILED_MESSAGE: CommentGestureMessageKey = 'comment.delete.error';
export const COMMENT_GESTURE_PENDING_MESSAGE: CommentGestureMessageKey = 'comment.gesture.pending';
export const COMMENT_GESTURE_UNCONFIRMED_MESSAGE: CommentGestureMessageKey = 'comment.gesture.unconfirmed';

/**
 * LA RAISON D'UN REFUS PERMANENT — ce qui REMPLACE « Réessayer » quand aucun
 * rejeu ne peut aboutir (défaut majeur 1). Même métier que
 * `send/failure-reason.ts`, dont ce module reprend la loi : on ne sert JAMAIS
 * `failure.error` tel quel (la prose de la passerelle, écrite pour un
 * développeur et pas toujours en français) — le STATUT, lui, est un contrat.
 */
export type CommentGestureReasonKey =
  | 'comment.refused.session'
  | 'comment.refused.right'
  | 'comment.like.limit';

/**
 * `refused` ⇒ aucun rejeu ne peut aboutir sans que l'utilisateur agisse
 * D'ABORD ailleurs ; `unconfirmed` ⇒ le rejeu À L'IDENTIQUE peut aboutir. Le
 * booléen qu'on aurait écrit à la place (« a échoué ») ne distinguait pas les
 * deux, et la rangée offrait le rejeu exactement là où il ne servait à rien.
 */
export type CommentGestureIssue = 'refused' | 'unconfirmed';

export type CommentGestureFailure = {
  readonly ok: false;
  readonly message: CommentGestureMessageKey;
  readonly issue: CommentGestureIssue;
  readonly reason?: CommentGestureReasonKey | undefined;
};

export type CommentGestureResult = { readonly ok: true } | CommentGestureFailure;

const inFlight = new Set<string>();

/** `false` est FIABLE, `true` ne l'est pas (`net/online.ts`) : on s'en sert
 * pour NOMMER une coupure certaine, jamais pour en supposer une. */
const readerIsOffline = (): boolean => typeof navigator !== 'undefined' && navigator.onLine === false;

/** L'ABSENCE de réponse est un fait de RÉSEAU ; un statut servi est un fait de
 * PASSERELLE. Les confondre fait dire « hors ligne » à une panne serveur. */
const unconfirmedMessage = (result: ApiResult<unknown> | null): CommentGestureMessageKey =>
  result === null && readerIsOffline() ? COMMENT_GESTURE_PENDING_MESSAGE : COMMENT_GESTURE_UNCONFIRMED_MESSAGE;

const notConfirmed = (result: ApiResult<unknown> | null): CommentGestureFailure => ({
  ok: false,
  message: unconfirmedMessage(result),
  issue: 'unconfirmed',
});

/* 403 et 404 disent la MÊME chose au lecteur : ce geste ne lui est pas ouvert.
   La passerelle rend 404 hors audience d'interaction plutôt qu'un 403, pour ne
   pas révéler l'existence du commentaire — la distinction la regarde, elle,
   pas le lecteur. */
const REFUSAL_REASONS: ReadonlyMap<number, CommentGestureReasonKey> = new Map<number, CommentGestureReasonKey>([
  [401, 'comment.refused.session'],
  [403, 'comment.refused.right'],
  [404, 'comment.refused.right'],
]);

const refused = (
  message: CommentGestureMessageKey,
  reason?: CommentGestureReasonKey | undefined,
): CommentGestureFailure => ({ ok: false, message, issue: 'refused', ...(reason === undefined ? {} : { reason }) });

const refusalOf = (status: number, message: CommentGestureMessageKey): CommentGestureFailure =>
  refused(message, REFUSAL_REASONS.get(status));

const newClientMutationId = (): string => newClientMessageId().replace(/^cid_/, 'cmid_');

const countOf = (value: number | null | undefined): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

/**
 * L'ADRESSE EXACTE d'une rangée dans le corpus paginé — la page ET l'indice.
 * `publication-comments.ts` n'écrit QUE dans la page 0 (l'insertion optimiste
 * y est chez elle : la passerelle sert `createdAt desc`), mais un geste vise
 * une rangée DÉJÀ LUE, donc n'importe quelle page.
 */
type CommentSite = { readonly pageIndex: number; readonly index: number; readonly comment: PostComment };

function siteOf(data: CommentInfiniteData | undefined, commentId: string): CommentSite | undefined {
  if (data === undefined) return undefined;
  for (const [pageIndex, page] of data.pages.entries()) {
    const index = page.comments.findIndex((c) => c.id === commentId);
    const comment = page.comments[index];
    if (index >= 0 && comment !== undefined) return { pageIndex, index, comment };
  }
  return undefined;
}

/** Une SEULE page est recopiée — les autres gardent leur IDENTITÉ, donc aucune
 * rangée déjà peinte ne se re-rend (même discipline que `mapFirstPage`). */
function mapPage(
  data: CommentInfiniteData | undefined,
  pageIndex: number,
  update: (comments: readonly PostComment[]) => readonly PostComment[],
): CommentInfiniteData | undefined {
  if (data === undefined) return data;
  const page = data.pages[pageIndex];
  if (page === undefined) return data;
  const comments = update(page.comments);
  if (comments === page.comments) return data;
  return { ...data, pages: data.pages.map((p, i) => (i === pageIndex ? { ...p, comments } : p)) };
}

/** REMPLACE une rangée EN PLACE, jamais une seconde ligne à côté — miroir
 * `applyCommentUpdated` (`PostDetailViewModel+CommentEdit.swift:44-54`). */
export function replaceCommentAt(
  data: CommentInfiniteData | undefined,
  site: CommentSite,
  comment: PostComment,
): CommentInfiniteData | undefined {
  return mapPage(data, site.pageIndex, (comments) =>
    comments.map((c) => (c.id === site.comment.id ? comment : c)),
  );
}

export function removeCommentAt(data: CommentInfiniteData | undefined, site: CommentSite): CommentInfiniteData | undefined {
  return mapPage(data, site.pageIndex, (comments) => comments.filter((c) => c.id !== site.comment.id));
}

/**
 * RÉINSÈRE À SA PLACE — dans SA page, à SON indice. Une réinsertion « en
 * tête » passerait tous les témoins de rendu (la rangée est bien revenue) et
 * se verrait au premier usage : le commentaire d'il y a trois jours remonterait
 * au-dessus de celui de la minute. L'indice est BORNÉ par la longueur courante
 * : entre le retrait et le refus, un envoi optimiste a pu s'insérer en tête de
 * la page 0, et un indice hors bornes ferait un trou.
 */
export function insertCommentAt(data: CommentInfiniteData | undefined, site: CommentSite): CommentInfiniteData | undefined {
  return mapPage(data, site.pageIndex, (comments) => {
    if (comments.some((c) => c.id === site.comment.id)) return comments;
    const at = Math.min(site.index, comments.length);
    return [...comments.slice(0, at), site.comment, ...comments.slice(at)];
  });
}

type GestureParams = {
  readonly postId: string;
  readonly commentId: string;
  readonly deps: CommentGestureDeps;
};

const writeComments = (
  deps: CommentGestureDeps,
  postId: string,
  update: (data: CommentInfiniteData | undefined) => CommentInfiniteData | undefined,
): void => {
  deps.queryClient.setQueryData<CommentInfiniteData>(commentsQueryKey(postId), update);
};

const readSite = (deps: CommentGestureDeps, postId: string, commentId: string): CommentSite | undefined =>
  siteOf(deps.queryClient.getQueryData<CommentInfiniteData>(commentsQueryKey(postId)), commentId);

/** Le `likeCount` ABSOLU servi par la passerelle — jamais un delta. */
const servedLikeCount = (data: unknown): number | undefined => {
  const count = (data as { readonly likeCount?: unknown } | null)?.likeCount;
  return typeof count === 'number' && Number.isFinite(count) ? count : undefined;
};

/** REMET la rangée LUE AU DÉPART à SA place courante — jamais à l'indice de
 * départ : entre l'écriture et le refus, un envoi optimiste a pu s'insérer. */
const restore = (deps: CommentGestureDeps, postId: string, commentId: string, comment: PostComment): void => {
  writeComments(deps, postId, (data) => {
    const current = siteOf(data, commentId);
    return current === undefined ? data : replaceCommentAt(data, current, comment);
  });
};

const liked = (comment: PostComment): PostComment => ({
  ...comment,
  isLikedByMe: true,
  likeCount: countOf(comment.likeCount) + 1,
});

const unliked = (comment: PostComment): PostComment => ({
  ...comment,
  isLikedByMe: false,
  likeCount: Math.max(0, countOf(comment.likeCount) - 1),
});

/**
 * LA RANGÉE QUE LE TAP VEUT VOIR — IDEMPOTENTE, jamais différentielle
 * (seconde revue-correction #7135, défaut majeur 1). `liked` / `unliked`
 * comptent en DELTA sur la rangée telle qu'elle est DANS LE CACHE : juste tant
 * que le rejeu ne survenait qu'après un rollback (la rangée était alors revenue
 * à son état d'avant), faux depuis que l'optimiste du cœur RESTE POSÉ sur une
 * issue passagère. Le second tap partait d'un compte déjà incrémenté, et trois
 * rejeux affichaient « 6 » pour « 3 » — dans l'autre sens, le `Math.max(0, …)`
 * figeait le compte à 0 plutôt que de le faire dériver, ce qui le fausse
 * pareillement.
 *
 * `on` porte la direction VOULUE (défaut majeur 2) ; il manquait de savoir si
 * elle est DÉJÀ appliquée. Si elle l'est, l'optimiste du premier tap tient
 * toujours : ne rien réécrire. Le rollback permanent, lui, restaure
 * `site.comment` — l'état d'avant le PREMIER tap — et reste juste dans les deux
 * cas.
 *
 * `isLikedByMe` est FACULTATIF : `=== true` le normalise, sans quoi une rangée
 * qui n'a jamais été aimée (`undefined`) se verrait retirer un like qu'elle n'a
 * pas sur un `on: false`.
 */
const likeTarget = (comment: PostComment, on: boolean): PostComment =>
  (comment.isLikedByMe === true) === on ? comment : on ? liked(comment) : unliked(comment);

/**
 * LA DIRECTION VOYAGE AVEC LA REQUÊTE, elle ne se relit pas dans le cache
 * (revue-correction #7135, défaut majeur 2). Ce module la déduisait de
 * `site.comment.isLikedByMe` AU MOMENT DE L'APPEL : inoffensif tant que le
 * rejeu ne survenait qu'après un rollback, faux dès que le rejeu porte sur un
 * optimiste RESTÉ POSÉ — ce que le défaut majeur 1 vient précisément
 * d'introduire pour le cœur, et ce que l'écho socket de #7118 et la file de
 * reprise #5868 introduiront encore. Le cache dirait alors « déjà aimé » et le
 * rejeu enverrait un `DELETE` là où le lecteur demandait un `POST`.
 *
 * `on` est ÉLU UNE FOIS, au tap, par la surface qui voit l'état du cœur.
 */
export async function performCommentLike(params: GestureParams & { readonly on: boolean }): Promise<CommentGestureResult> {
  const { postId, commentId, on, deps } = params;
  const flightKey = `like:${commentId}`;
  if (inFlight.has(flightKey)) return { ok: true };

  const site = readSite(deps, postId, commentId);
  if (site === undefined) return refused(COMMENT_LIKE_FAILED_MESSAGE);

  const target = likeTarget(site.comment, on);
  writeComments(deps, postId, (data) => replaceCommentAt(data, site, target));

  inFlight.add(flightKey);
  try {
    const result = await sendCommentRequest(deps, {
      method: on ? 'POST' : 'DELETE',
      path: `/api/v1/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}/like`,
      idempotent: false,
      fixture: { liked: on, likeCount: countOf(target.likeCount) },
    }).catch(() => null);

    /* LE CŒUR EST RÉVERSIBLE : son optimiste RESTE sur une issue passagère, et
       c'est le rejeu — qui porte SA direction — qui tranchera. */
    if (result === null) return notConfirmed(result);

    if (result.ok) {
      const served = servedLikeCount(result.data);
      if (served !== undefined) {
        writeComments(deps, postId, (data) => {
          const current = siteOf(data, commentId);
          return current === undefined ? data : replaceCommentAt(data, current, { ...current.comment, likeCount: served });
        });
      }
      return { ok: true };
    }

    if (outcomeOf(result) !== 'permanent') return notConfirmed(result);

    /* LE RETOUR EXACT — la rangée LUE au départ, pas une soustraction : entre
       le tap et le refus, l'écho socket d'un autre lecteur a pu bouger le
       compte, et re-soustraire 1 ferait dériver le compteur.
       `409` (plafond des cinq réactions par personne, `ConflictError`) est un
       refus permanent comme un autre ici — le lecteur a bien tapé, rien n'a
       pris : le taire serait le contrôle inerte de la loi 4. Le fil est
       INVALIDÉ en plus, le cache étant par construction périmé. Et c'est le
       SEUL refus dont la raison soit propre au cœur : le lecteur ne peut pas
       deviner qu'il vient d'atteindre un plafond, donc on le NOMME. */
    writeComments(deps, postId, (data) => {
      const current = siteOf(data, commentId);
      return current === undefined ? data : replaceCommentAt(data, current, site.comment);
    });
    if (result.status === 409) {
      void deps.queryClient.invalidateQueries({ queryKey: commentsQueryKey(postId) });
      return refused(COMMENT_LIKE_FAILED_MESSAGE, 'comment.like.limit');
    }
    return refusalOf(result.status, COMMENT_LIKE_FAILED_MESSAGE);
  } finally {
    inFlight.delete(flightKey);
  }
}

export async function performCommentEdit(
  params: GestureParams & { readonly content: string; readonly originalLanguage?: string | undefined },
): Promise<CommentGestureResult> {
  const { postId, commentId, deps } = params;
  const content = params.content.trim();
  if (content === '' || content.length > COMMENT_MAX_LENGTH) return refused(COMMENT_EDIT_FAILED_MESSAGE);

  const flightKey = `edit:${commentId}`;
  if (inFlight.has(flightKey)) return { ok: true };

  const site = readSite(deps, postId, commentId);
  if (site === undefined) return refused(COMMENT_EDIT_FAILED_MESSAGE);
  /* LA LANGUE SE LIT SUR LE COMMENTAIRE, PAS SUR L'APPELANT — c'est ICI que
     la loi s'applique, parce que c'est le seul site qui tient ENSEMBLE le
     texte corrigé et la langue qu'il portait déjà. La faire appliquer par
     l'hôte demanderait à chaque surface de la connaître, et la surface qui
     l'oublierait relabelliserait le commentaire en silence (#6600). */
  const declared = editedLanguage(site.comment.originalLanguage, params.originalLanguage);
  /* `UpdateCommentSchema` refuse un corps qui ne change RIEN (« Nothing to
     update ») — et un aller-retour qui ne change rien n'a de toute façon
     aucune raison de partir. */
  if (content === site.comment.content) return { ok: true };

  writeComments(deps, postId, (data) => replaceCommentAt(data, site, { ...site.comment, content }));

  inFlight.add(flightKey);
  try {
    const result = await sendCommentRequest(deps, {
      method: 'PATCH',
      path: `/api/v1/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}`,
      idempotent: true,
      body: { content, ...(declared === undefined ? {} : { originalLanguage: declared }) },
      fixture: { ...site.comment, content },
    }).catch(() => null);

    /* UNE MODIFICATION NON CONFIRMÉE SE DÉFAIT (défaut majeur 4) — garder le
       nouveau texte à l'écran ferait affirmer à la rangée une correction que
       la passerelle n'a jamais acceptée, et le texte d'avant reviendrait au
       prochain chargement sans qu'un mot l'ait annoncé. Le rejeu est offert :
       c'est LUI qui porte la reprise, pas un optimiste laissé en l'air. */
    if (result === null) {
      restore(deps, postId, commentId, site.comment);
      return notConfirmed(result);
    }

    if (result.ok) {
      /* Une passerelle qui rend autre chose qu'un commentaire ne doit pas
         effacer ce qu'on vient d'écrire — même garde que `performComment`. */
      const served = result.data as PostComment | null;
      if (served !== null && typeof served === 'object' && typeof served.id === 'string') {
        writeComments(deps, postId, (data) => {
          const current = siteOf(data, commentId);
          return current === undefined ? data : replaceCommentAt(data, current, served);
        });
      }
      return { ok: true };
    }

    restore(deps, postId, commentId, site.comment);
    if (outcomeOf(result) !== 'permanent') return notConfirmed(result);
    return refusalOf(result.status, COMMENT_EDIT_FAILED_MESSAGE);
  } finally {
    inFlight.delete(flightKey);
  }
}

export async function performCommentDelete(params: GestureParams): Promise<CommentGestureResult> {
  const { postId, commentId, deps } = params;
  const flightKey = `delete:${commentId}`;
  if (inFlight.has(flightKey)) return { ok: true };

  const site = readSite(deps, postId, commentId);
  if (site === undefined) return refused(COMMENT_DELETE_FAILED_MESSAGE);

  writeComments(deps, postId, (data) => removeCommentAt(data, site));
  shiftCommentCount(deps.queryClient, postId, -1);

  inFlight.add(flightKey);
  try {
    const result = await sendCommentRequest(deps, {
      method: 'DELETE',
      path: `/api/v1/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}`,
      idempotent: true,
      fixture: { deleted: true },
    }).catch(() => null);

    if (result !== null && result.ok) return { ok: true };

    /* UNE SUPPRESSION NON CONFIRMÉE SE DÉFAIT (défaut majeur 4) — la doctrine
       « l'optimiste tient » vaut pour un geste RÉVERSIBLE, pas pour celui-ci.
       Laisser la rangée partie sur un 5xx, décrémenter le compteur de la
       publication et n'annoncer qu'une ligne grise faisait CROIRE la
       suppression faite : elle revenait au prochain chargement, et aucune file
       ne rejouait le geste. L'écran affirmait un fait que la passerelle venait
       de refuser — la pire des trois formes du cycle 122. */
    writeComments(deps, postId, (data) => insertCommentAt(data, site));
    shiftCommentCount(deps.queryClient, postId, 1);

    if (result === null || outcomeOf(result) !== 'permanent') return notConfirmed(result);
    return refusalOf(result.status, COMMENT_DELETE_FAILED_MESSAGE);
  } finally {
    inFlight.delete(flightKey);
  }
}

/**
 * UN GESTE, DÉCRIT — et c'est ce qui rend « Réessayer » possible sans que
 * l'hôte réécrive la branche : il garde la REQUÊTE qui a échoué et la rejoue
 * telle quelle. Sans cette forme, chaque surface aurait sa propre mémoire de
 * « quel geste a échoué sur quelle rangée », et deux d'entre elles auraient
 * fini par diverger.
 */
export type CommentGestureRequest =
  | {
      readonly kind: 'like';
      readonly postId: string;
      readonly commentId: string;
      /** LA DIRECTION, ÉLUE AU TAP — jamais relue dans le cache au moment de
       * l'appel : un rejeu porté sur un optimiste NON défait y lirait l'état
       * DÉJÀ basculé et enverrait le verbe INVERSE (défaut majeur 2). */
      readonly on: boolean;
    }
  | { readonly kind: 'delete'; readonly postId: string; readonly commentId: string }
  | {
      readonly kind: 'edit';
      readonly postId: string;
      readonly commentId: string;
      readonly content: string;
      readonly originalLanguage?: string | undefined;
    };

export function performCommentGesture(
  request: CommentGestureRequest,
  deps: CommentGestureDeps,
): Promise<CommentGestureResult> {
  if (request.kind === 'like')
    return performCommentLike({ postId: request.postId, commentId: request.commentId, on: request.on, deps });
  if (request.kind === 'delete') return performCommentDelete({ postId: request.postId, commentId: request.commentId, deps });
  return performCommentEdit({
    postId: request.postId,
    commentId: request.commentId,
    content: request.content,
    ...(request.originalLanguage === undefined ? {} : { originalLanguage: request.originalLanguage }),
    deps,
  });
}

/**
 * LE SEUL POINT DE SORTIE — une requête, son en-tête d'idempotence quand la
 * route la lit, et le bouchon `fixtures` à côté : deux chemins séparés
 * laisseraient l'un dériver de l'autre (la leçon des jumelles).
 */
function sendCommentRequest(
  deps: CommentGestureDeps,
  request: {
    readonly method: 'POST' | 'DELETE' | 'PATCH';
    readonly path: string;
    readonly idempotent: boolean;
    readonly body?: Readonly<Record<string, unknown>>;
    readonly fixture: unknown;
  },
): Promise<ApiResult<unknown>> {
  if (__FIXTURES__ && deps.source === 'fixtures') return Promise.resolve({ ok: true, data: request.fixture });
  return deps.transport.request<unknown>({
    method: request.method,
    path: request.path,
    ...(request.body === undefined ? {} : { body: request.body }),
    ...(request.idempotent ? { headers: { 'X-Client-Mutation-Id': newClientMutationId() } } : {}),
  });
}
