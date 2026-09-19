import type { InfiniteData, QueryClient } from '@tanstack/react-query';

import { applyCommentCount, shiftedCount, withCommentCount } from '@/lib/feed/interactions';

import { newClientMessageId } from './client-message-id';
import type { DataSource } from './config';
import { FEED_QUERY_KEY } from './feed';
import type { FeedAuthor, FeedInfiniteData, FeedMedia, FeedPost } from './feed-pages';
import type { ApiResult, HttpTransport } from './http';
import { outcomeOf } from './outcome';
import { postQueryKey } from './publication-detail';
import { REELS_QUERY_ROOT } from './reels';
import { STORY_FEED_QUERY_KEY, type StoryFeedPost } from './stories';

/**
 * **LE PORT DES COMMENTAIRES D'UNE PUBLICATION** — le fil de commentaires que
 * la v3.1 n'avait pas, et dont DEUX surfaces dépendent : la liste de
 * `/post/$post` et le rail du lecteur de stories (une story EST une
 * publication éphémère, elle porte le même fil).
 *
 * Routes RÉELLES, lues avant d'être appelées :
 *
 *  - `GET /api/v1/posts/:postId/comments?limit=&cursor=`
 *    (`services/gateway/src/routes/posts/comments.ts:66`, `requiredAuth`).
 *    Sert les commentaires de PREMIER NIVEAU seuls (`parentId: null`,
 *    `PostCommentService.ts:402-447`), `createdAt desc, id desc`, curseur
 *    OPAQUE rendu dans `pagination.nextCursor`. Une requête MALFORMÉE est
 *    refusée en 400, jamais remplacée par des défauts (`:76-82`) — donc on
 *    transmet le curseur TEL QUEL, sans jamais le reconstruire.
 *    Hors audience ⇒ 404 `POST_NOT_FOUND`, indistinct de « n'existe pas »
 *    (D-6, et le commentaire de la route le dit : « distinguer révélerait
 *    l'existence du post »).
 *  - `POST /api/v1/posts/:postId/comments`
 *    (`:179`, `requiredAuth` + `registeredUser` obligatoire ⇒ 401 anonyme).
 *    Corps `CreateCommentSchema` (`routes/posts/types.ts:428`) :
 *    `content` (≤ 2000, peut être vide SI un média est joint — ce port
 *    n'envoie pas de média, donc il exige du texte), `parentId?`,
 *    `effectFlags?`, `originalLanguage?`, `attachmentIds?`.
 *    Refus propres à cette route : 403 `COMMENTS_DISABLED` (réglage auteur,
 *    `:214-216`), 404 `POST_NOT_FOUND` (hors audience d'INTERACTION — amis
 *    stricts, plus étroite que la lecture : « un contact DM non-ami peut lire
 *    le fil d'une story FRIENDS sans pouvoir y écrire », `:190-196`).
 *    Idempotent par `X-Client-Mutation-Id` (`withMutationLog`, `replayCost:
 *    'diverges'`) : sans cet en-tête, un rejeu INSÉRERAIT une seconde ligne.
 *
 * **Le Prisme ne descend PAS ici.** `PostComment.translations` porte la forme
 * `{ langue: { text, … } }` d'un POST, que `resolveFeedText`
 * (`lib/feed/text.ts` → `served()`, `lib/api/prism.ts`) dépouille déjà — le
 * rendu l'appelle, ce port ne réécrit aucune boucle (D-14, et la leçon des
 * trois familles divergentes du CLAUDE.md racine).
 */

export type PostComment = {
  readonly id: string;
  readonly content: string;
  readonly createdAt: string;
  readonly author: FeedAuthor;
  readonly parentId?: string | null;
  readonly originalLanguage?: string | null;
  /** `{ langue: { text, translationModel, confidenceScore?, createdAt } }` —
   * la forme d'un POST, jamais celle (tableau) d'un message. */
  readonly translations?: unknown;
  readonly likeCount?: number | null;
  /**
   * SERVI EXPLICITEMENT PAR LA PASSERELLE, `false` compris — dérivé des
   * `CommentReaction` du lecteur (`PostCommentService.ts:471-483`, qui dit
   * pourquoi : « c'est l'ABSENCE du champ qui faisait mentir le client »).
   * Un champ absent vaut donc « pas aimé », jamais « on ne sait pas ».
   */
  readonly isLikedByMe?: boolean;
  readonly replyCount?: number | null;
  readonly effectFlags?: number | null;
  readonly currentUserReactions?: readonly string[] | null;
  readonly media?: readonly FeedMedia[] | null;
  /**
   * **LOCAL SEULEMENT** — vrai tant que la passerelle n'a pas confirmé. Aucun
   * champ de ce nom ne voyage sur le fil : c'est la marque qui permet au rendu
   * de dire « pas encore parti » sans inventer un second cache à côté de
   * celui de la liste.
   */
  readonly pending?: boolean;
};

export type CommentPage = {
  readonly comments: readonly PostComment[];
  readonly pagination: { readonly limit: number; readonly hasMore: boolean; readonly nextCursor: string | null };
};

export type CommentPageParam = string | undefined;
export type CommentInfiniteData = InfiniteData<CommentPage, CommentPageParam>;

/** Le défaut de `FeedQuerySchema` côté serveur ; même valeur que le fil. */
export const COMMENTS_PAGE_SIZE = 20;

/** Sous la clé de la publication — invalider une publication emporte donc son
 * fil, et le fil ne relance jamais le Flux entier. */
export const commentsQueryKey = (postId: string) => [...postQueryKey(postId), 'comments'] as const;

export type CommentDeps = { readonly source: DataSource; readonly transport: HttpTransport };

type RawCommentPagination = { readonly limit?: number; readonly hasMore?: boolean; readonly nextCursor?: string | null };

export async function loadCommentsPage(
  params: CommentDeps & { readonly postId: string; readonly cursor?: CommentPageParam; readonly signal?: AbortSignal },
): Promise<ApiResult<CommentPage>> {
  if (__FIXTURES__ && params.source === 'fixtures') {
    const { pageOfComments } = await import('./fixtures-comments');
    return { ok: true, data: pageOfComments(params.postId, params.cursor) };
  }
  const query = new URLSearchParams({
    limit: String(COMMENTS_PAGE_SIZE),
    ...(params.cursor !== undefined ? { cursor: params.cursor } : {}),
  });
  const result = await params.transport.request<readonly PostComment[]>({
    method: 'GET',
    path: `/api/v1/posts/${encodeURIComponent(params.postId)}/comments?${query.toString()}`,
    ...(params.signal !== undefined ? { signal: params.signal } : {}),
  });
  if (!result.ok) return result;
  const raw = result.pagination as unknown as RawCommentPagination | undefined;
  return {
    ok: true,
    data: {
      comments: result.data,
      pagination: { limit: COMMENTS_PAGE_SIZE, hasMore: raw?.hasMore ?? false, nextCursor: raw?.nextCursor ?? null },
    },
  };
}

/** LA PAGE SUIVANTE EXIGE LES DEUX — `hasMore` ET un curseur. La passerelle
 * ne rend un curseur QUE lorsqu'il reste quelque chose (`:452-454`) ; lire le
 * seul curseur redemanderait sans fin la dernière page le jour où la forme
 * changerait. */
export function nextCommentCursor(page: CommentPage): CommentPageParam {
  const { hasMore, nextCursor } = page.pagination;
  return hasMore && typeof nextCursor === 'string' && nextCursor !== '' ? nextCursor : undefined;
}

/** Les pages aplaties, PREMIÈRE occurrence gardée : deux pages dont les
 * curseurs se chevauchent servent le même commentaire deux fois, et une clé
 * React dupliquée est une rangée qui disparaît. Même discipline que
 * `flattenFeedPages`. */
export function flattenCommentPages(data: CommentInfiniteData | undefined): readonly PostComment[] {
  if (data === undefined) return [];
  const seen = new Set<string>();
  const out: PostComment[] = [];
  for (const page of data.pages) {
    for (const c of page.comments) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      out.push(c);
    }
  }
  return out;
}

const mapFirstPage = (
  data: CommentInfiniteData | undefined,
  update: (comments: readonly PostComment[]) => readonly PostComment[],
): CommentInfiniteData | undefined => {
  if (data === undefined) return data;
  const first = data.pages[0];
  if (first === undefined) return data;
  const comments = update(first.comments);
  if (comments === first.comments) return data;
  /* Seule la page 0 est recopiée — les suivantes gardent leur IDENTITÉ, donc
     aucune rangée déjà peinte ne se re-rend. */
  return { ...data, pages: [{ ...first, comments }, ...data.pages.slice(1)] };
};

/** EN TÊTE, parce que la passerelle sert `createdAt desc` : un commentaire
 * qu'on vient d'écrire est le plus récent. */
export function insertComment(data: CommentInfiniteData | undefined, comment: PostComment): CommentInfiniteData | undefined {
  return mapFirstPage(data, (comments) => [comment, ...comments]);
}

/** Le servi prend LA PLACE du provisoire — jamais une seconde ligne à côté. */
export function replaceComment(
  data: CommentInfiniteData | undefined,
  tempId: string,
  served: PostComment,
): CommentInfiniteData | undefined {
  return mapFirstPage(data, (comments) =>
    comments.some((c) => c.id === tempId) ? comments.map((c) => (c.id === tempId ? served : c)) : comments,
  );
}

export function dropComment(data: CommentInfiniteData | undefined, tempId: string): CommentInfiniteData | undefined {
  return mapFirstPage(data, (comments) => {
    const kept = comments.filter((c) => c.id !== tempId);
    return kept.length === comments.length ? comments : kept;
  });
}

/**
 * Le compteur de la PUBLICATION — le rail d'une story et la rangée d'une
 * carte le lisent sans jamais ouvrir la liste. Il bouge donc AVEC le
 * commentaire, et revient avec lui : sans cela, un refus laisserait un
 * compteur menteur derrière un fil vide.
 *
 * **IL Y A QUATRE CAISSES, ET LE DOC-COMMENT N'EN A CONNU QU'UNE, PUIS DEUX.**
 * Chacune a été trouvée en demandant, non pas « qui calcule ce compte ? », mais
 * **« qui l'AFFICHE ? »** — et la réponse a changé trois fois :
 *
 *  1. `postQueryKey(postId)` — la fiche `/post/$post` ;
 *  2. `STORY_FEED_QUERY_KEY` — la pastille du rail du lecteur de stories
 *     (#7112 : on commentait une story, la ligne apparaissait, la pastille
 *     restait au chiffre d'avant) ;
 *  3. `FEED_QUERY_KEY` — la rangée de statistiques d'une carte du Flux
 *     (`feed-post-card.tsx:75`) ;
 *  4. `REELS_QUERY_ROOT` — la MÊME carte servie par un fil de Réels, qui peint
 *     depuis ses propres pages (#6457).
 *
 * Les deux dernières manquaient (#7135) : on supprimait son commentaire depuis
 * la fiche, on revenait au fil, et la carte affichait toujours l'ancien compte.
 * `feed-gestures.ts` avait déjà tranché pour le cœur — « la même publication ne
 * peut pas porter deux cœurs selon l'écran qui la montre » — et le compteur de
 * commentaires n'avait pas suivi.
 *
 * **La règle elle-même vit dans `lib/feed/interactions.ts`**, à côté de
 * `applyPostToggle` : c'est le site unique de « comment une page de fil
 * bascule », et la borne basse (`shiftedCount`) y est écrite une seule fois —
 * la leçon que `PostLikeMutation.swift` a coûtée à iOS. Ici, seule
 * l'énumération des caisses. Un post absent d'une racine y est laissé tel quel.
 */
export function shiftCommentCount(queryClient: QueryClient, postId: string, delta: 1 | -1): void {
  const change = { postId, delta };
  queryClient.setQueryData<FeedInfiniteData>(FEED_QUERY_KEY, (data) => applyCommentCount(data, change));
  queryClient.setQueriesData<FeedInfiniteData>({ queryKey: REELS_QUERY_ROOT }, (data) => applyCommentCount(data, change));
  queryClient.setQueryData<FeedPost>(postQueryKey(postId), (post) =>
    post === undefined ? post : withCommentCount(post, change),
  );
  queryClient.setQueryData<readonly StoryFeedPost[]>(STORY_FEED_QUERY_KEY, (stories) => {
    if (stories === undefined) return stories;
    if (!stories.some((s) => s.id === postId)) return stories;
    return stories.map((s) => (s.id === postId ? { ...s, commentCount: shiftedCount(s.commentCount, delta) } : s));
  });
}

/** Une CLÉ de catalogue, jamais un texte déjà traduit — seule la surface qui
 * annonce connaît la langue d'interface (même patron que `feed-gestures.ts`). */
type CommentMessageKey = 'comment.send.error' | 'comment.send.pending' | 'comment.send.empty' | 'comment.gesture.unconfirmed';

export const COMMENT_FAILED_MESSAGE: CommentMessageKey = 'comment.send.error';
export const COMMENT_PENDING_MESSAGE: CommentMessageKey = 'comment.send.pending';
export const COMMENT_EMPTY_MESSAGE: CommentMessageKey = 'comment.send.empty';
/** UNE PANNE DE PASSERELLE N'EST PAS UNE COUPURE RÉSEAU (revue-correction
 * #7135, défaut majeur 4) — `comment.send.pending` NOMME le réseau, donc ne
 * se sert que sur une absence de réponse alors que le lecteur est hors ligne.
 * Un 5xx annoncé « hors ligne » envoie l'utilisateur vérifier son wifi. */
export const COMMENT_UNCONFIRMED_MESSAGE: CommentMessageKey = 'comment.gesture.unconfirmed';

const readerIsOffline = (): boolean => typeof navigator !== 'undefined' && navigator.onLine === false;

export type CommentResult =
  | { readonly ok: true; readonly notice?: CommentMessageKey }
  | { readonly ok: false; readonly message: CommentMessageKey };

/**
 * LA BORNE D'UN CONTENU DE COMMENTAIRE, SITE UNIQUE — `2000`, parce que la
 * passerelle n'en a qu'une : `CreateCommentSchema.content.max(2000)` ET
 * `UpdateCommentSchema.content.max(2000)` (`routes/posts/types.ts:428,466`).
 * Refuser ICI, avant l'appel, plutôt que d'encaisser un 400 qui ne dirait rien
 * de précis au lecteur.
 *
 * **Elle a été déclarée DEUX fois** (#7135) — ici et dans `comment-gestures.ts`
 * —, chacune exportée, chacune consommée : le composeur et le champ d'édition
 * lisaient l'une, le port des gestes l'autre. Les deux valaient 2000, donc rien
 * ne se voyait. Le jour où l'une aurait bougé, « Enregistrer » serait resté
 * ACTIF sur un texte que le port refuse — un refus que le lecteur ne peut pas
 * comprendre. Le compilateur n'aurait rien dit : deux modules ont le droit
 * d'exporter le même nom.
 */
export const COMMENT_MAX_LENGTH = 2000;

const newClientMutationId = (): string => newClientMessageId().replace(/^cid_/, 'cmid_');

/**
 * L'ENVOI — optimiste, puis l'issue, exactement la forme de
 * `performPostGesture` :
 *
 *  - texte vide ou trop long : AUCUN appel, aucun optimiste ;
 *  - succès : le servi remplace le provisoire, le compteur reste monté ;
 *  - panne PASSAGÈRE (réseau, 5xx, 408/425/429 — `outcomeOf`) : l'optimiste
 *    RESTE, marqué `pending`, et l'appelant l'ANNONCE. Aucune promesse de
 *    rejeu : la file de reprise est #5868, et promettre ce qu'on ne fait pas
 *    est le défaut que `REACTION_PENDING_MESSAGE` a déjà payé ;
 *  - refus PERMANENT (403 commentaires fermés, 404 hors audience, 401) : le
 *    texte ET le compteur sont défaits.
 */
export async function performComment(params: {
  readonly postId: string;
  readonly content: string;
  readonly author: FeedAuthor;
  readonly originalLanguage?: string | undefined;
  readonly deps: CommentDeps & { readonly queryClient: QueryClient };
}): Promise<CommentResult> {
  const { postId, author, deps } = params;
  const content = params.content.trim();
  if (content === '' || content.length > COMMENT_MAX_LENGTH) return { ok: false, message: COMMENT_EMPTY_MESSAGE };

  const tempId = newClientMessageId();
  const optimistic: PostComment = {
    id: tempId,
    content,
    createdAt: new Date().toISOString(),
    author,
    pending: true,
    ...(params.originalLanguage === undefined ? {} : { originalLanguage: params.originalLanguage }),
  };

  const key = commentsQueryKey(postId);
  deps.queryClient.setQueryData<CommentInfiniteData>(key, (data) => insertComment(data, optimistic));
  shiftCommentCount(deps.queryClient, postId, 1);

  const body = {
    content,
    ...(params.originalLanguage === undefined ? {} : { originalLanguage: params.originalLanguage }),
  };

  const result = await sendComment(deps, { postId, body }).catch(() => null);

  if (result === null) {
    return { ok: true, notice: readerIsOffline() ? COMMENT_PENDING_MESSAGE : COMMENT_UNCONFIRMED_MESSAGE };
  }

  if (result.ok) {
    const served = result.data;
    /* Une passerelle qui rend autre chose qu'un commentaire ne doit pas
       effacer le provisoire : on garde ce qu'on a écrit, et la liste se
       réconciliera à sa prochaine lecture. */
    if (served !== null && typeof served === 'object' && typeof (served as PostComment).id === 'string') {
      deps.queryClient.setQueryData<CommentInfiniteData>(key, (data) => replaceComment(data, tempId, served as PostComment));
    }
    return { ok: true };
  }

  /* Un STATUT servi est un fait de PASSERELLE, jamais de réseau. */
  if (outcomeOf(result) !== 'permanent') return { ok: true, notice: COMMENT_UNCONFIRMED_MESSAGE };

  deps.queryClient.setQueryData<CommentInfiniteData>(key, (data) => dropComment(data, tempId));
  shiftCommentCount(deps.queryClient, postId, -1);
  return { ok: false, message: COMMENT_FAILED_MESSAGE };
}

function sendComment(
  deps: CommentDeps,
  params: { readonly postId: string; readonly body: Readonly<Record<string, unknown>> },
): Promise<ApiResult<PostComment>> {
  if (__FIXTURES__ && deps.source === 'fixtures') {
    return import('./fixtures-comments').then(({ fixtureAddComment }) => fixtureAddComment(params.postId, params.body));
  }
  return deps.transport.request<PostComment>({
    method: 'POST',
    path: `/api/v1/posts/${encodeURIComponent(params.postId)}/comments`,
    body: params.body,
    headers: { 'X-Client-Mutation-Id': newClientMutationId() },
  });
}

/** FABRIQUE — `{ queryKey, queryFn, getNextPageParam }`, SANS `select`
 * (même motif que `feedInfiniteOptions`) : un appelant qui veut les pages
 * brutes (l'insertion optimiste) les a, celui qui veut la liste aplatie
 * compose `flattenCommentPages`. */
export function commentsInfiniteOptions(deps: CommentDeps & { readonly postId: string }) {
  return {
    queryKey: commentsQueryKey(deps.postId),
    queryFn: async ({ pageParam, signal }: { readonly pageParam?: CommentPageParam; readonly signal?: AbortSignal }) => {
      const result = await loadCommentsPage({
        source: deps.source,
        transport: deps.transport,
        postId: deps.postId,
        ...(pageParam !== undefined ? { cursor: pageParam } : {}),
        ...(signal !== undefined ? { signal } : {}),
      });
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    initialPageParam: undefined as CommentPageParam,
    getNextPageParam: nextCommentCursor,
  };
}
