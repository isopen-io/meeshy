import type { QueryClient } from '@tanstack/react-query';

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
 * LES ISSUES, identiques aux trois autres ports du chantier :
 *  - succès : l'optimiste reflète déjà la réalité ; une valeur servie le
 *    remplace ;
 *  - panne PASSAGÈRE (réseau, 5xx, 408/425/429 — `outcomeOf`) : l'optimiste
 *    RESTE, ANNONCÉ. Aucune promesse de rejeu — la file de reprise est #5868 ;
 *  - refus PERMANENT : l'optimiste est DÉFAIT **à l'identique** (le compteur
 *    retrouve sa valeur, la rangée sa PLACE) et l'échec est annoncé.
 *
 * UN GESTE À LA FOIS PAR RANGÉE ET PAR SENS — miroir `commentHeartInFlightIds`
 * (`PostDetailViewModel.swift:494`) : un second tap pendant l'appel enverrait
 * un `DELETE` qui croiserait le `POST` encore en route.
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
  | 'comment.gesture.pending';

export const COMMENT_LIKE_FAILED_MESSAGE: CommentGestureMessageKey = 'comment.like.error';
export const COMMENT_EDIT_FAILED_MESSAGE: CommentGestureMessageKey = 'comment.edit.error';
export const COMMENT_DELETE_FAILED_MESSAGE: CommentGestureMessageKey = 'comment.delete.error';
export const COMMENT_GESTURE_PENDING_MESSAGE: CommentGestureMessageKey = 'comment.gesture.pending';

export type CommentGestureResult =
  | { readonly ok: true; readonly notice?: CommentGestureMessageKey }
  | { readonly ok: false; readonly message: CommentGestureMessageKey };

const inFlight = new Set<string>();

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

export async function performCommentLike(params: GestureParams): Promise<CommentGestureResult> {
  const { postId, commentId, deps } = params;
  const flightKey = `like:${commentId}`;
  if (inFlight.has(flightKey)) return { ok: true };

  const site = readSite(deps, postId, commentId);
  if (site === undefined) return { ok: false, message: COMMENT_LIKE_FAILED_MESSAGE };

  const on = site.comment.isLikedByMe !== true;
  writeComments(deps, postId, (data) => replaceCommentAt(data, site, on ? liked(site.comment) : unliked(site.comment)));

  inFlight.add(flightKey);
  try {
    const result = await sendCommentRequest(deps, {
      method: on ? 'POST' : 'DELETE',
      path: `/api/v1/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}/like`,
      idempotent: false,
      fixture: { liked: on, likeCount: countOf(on ? liked(site.comment).likeCount : unliked(site.comment).likeCount) },
    }).catch(() => null);

    if (result === null) return { ok: true, notice: COMMENT_GESTURE_PENDING_MESSAGE };

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

    if (outcomeOf(result) !== 'permanent') return { ok: true, notice: COMMENT_GESTURE_PENDING_MESSAGE };

    /* LE RETOUR EXACT — la rangée LUE au départ, pas une soustraction : entre
       le tap et le refus, l'écho socket d'un autre lecteur a pu bouger le
       compte, et re-soustraire 1 ferait dériver le compteur.
       `409` (plafond des cinq réactions par personne, `ConflictError`) est un
       refus permanent comme un autre ici — le lecteur a bien tapé, rien n'a
       pris : le taire serait le contrôle inerte de la loi 4. Le fil est
       INVALIDÉ en plus, le cache étant par construction périmé. */
    writeComments(deps, postId, (data) => {
      const current = siteOf(data, commentId);
      return current === undefined ? data : replaceCommentAt(data, current, site.comment);
    });
    if (result.status === 409) void deps.queryClient.invalidateQueries({ queryKey: commentsQueryKey(postId) });
    return { ok: false, message: COMMENT_LIKE_FAILED_MESSAGE };
  } finally {
    inFlight.delete(flightKey);
  }
}

export async function performCommentEdit(
  params: GestureParams & { readonly content: string; readonly originalLanguage?: string | undefined },
): Promise<CommentGestureResult> {
  const { postId, commentId, deps } = params;
  const content = params.content.trim();
  if (content === '' || content.length > COMMENT_MAX_LENGTH) return { ok: false, message: COMMENT_EDIT_FAILED_MESSAGE };

  const flightKey = `edit:${commentId}`;
  if (inFlight.has(flightKey)) return { ok: true };

  const site = readSite(deps, postId, commentId);
  if (site === undefined) return { ok: false, message: COMMENT_EDIT_FAILED_MESSAGE };
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
      body: { content, ...(params.originalLanguage === undefined ? {} : { originalLanguage: params.originalLanguage }) },
      fixture: { ...site.comment, content },
    }).catch(() => null);

    if (result === null) return { ok: true, notice: COMMENT_GESTURE_PENDING_MESSAGE };

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

    if (outcomeOf(result) !== 'permanent') return { ok: true, notice: COMMENT_GESTURE_PENDING_MESSAGE };

    writeComments(deps, postId, (data) => {
      const current = siteOf(data, commentId);
      return current === undefined ? data : replaceCommentAt(data, current, site.comment);
    });
    return { ok: false, message: COMMENT_EDIT_FAILED_MESSAGE };
  } finally {
    inFlight.delete(flightKey);
  }
}

export async function performCommentDelete(params: GestureParams): Promise<CommentGestureResult> {
  const { postId, commentId, deps } = params;
  const flightKey = `delete:${commentId}`;
  if (inFlight.has(flightKey)) return { ok: true };

  const site = readSite(deps, postId, commentId);
  if (site === undefined) return { ok: false, message: COMMENT_DELETE_FAILED_MESSAGE };

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

    /* PANNE PASSAGÈRE : la rangée RESTE partie, annoncée. C'est la même
       doctrine que l'envoi (`performComment`) — l'optimiste tient, sans
       promesse de rejeu — et la prochaine lecture du fil tranchera. La
       REMETTRE ici ferait clignoter une rangée que l'utilisateur vient de
       retirer, pour une panne qui se résout seule le plus souvent. */
    if (result === null || outcomeOf(result) === 'transient') {
      return { ok: true, notice: COMMENT_GESTURE_PENDING_MESSAGE };
    }

    if (result.ok) return { ok: true };

    writeComments(deps, postId, (data) => insertCommentAt(data, site));
    shiftCommentCount(deps.queryClient, postId, 1);
    return { ok: false, message: COMMENT_DELETE_FAILED_MESSAGE };
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
  | { readonly kind: 'like'; readonly postId: string; readonly commentId: string }
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
  if (request.kind === 'like') return performCommentLike({ postId: request.postId, commentId: request.commentId, deps });
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
