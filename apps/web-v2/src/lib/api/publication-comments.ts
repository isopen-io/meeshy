import type { InfiniteData, QueryClient } from '@tanstack/react-query';

import type {
  CommentAddedEventData,
  CommentDeletedEventData,
  CommentLikedEventData,
  CommentUnlikedEventData,
  CommentUpdatedEventData,
  PostComment as SharedPostComment,
} from '@meeshy/shared/types/post';

import { shiftedCount, withCommentCount } from '@/lib/feed/interactions';

import { updateCardPost } from './card-caches';
import { newClientMessageId } from './client-message-id';
import type { DataSource } from './config';
import type { FeedAuthor, FeedMedia } from './feed-pages';
import type { ApiResult, HttpTransport } from './http';
import { outcomeOf } from './outcome';
import { postQueryKey } from './publication-detail';
import { STORY_FEED_QUERY_KEY, storyPostQueryKey, type StoryFeedPost } from './stories';

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

/**
 * **TOUTES LES PAGES**, contrairement à `mapFirstPage` — nécessaire dès
 * qu'un événement en temps réel (édition, suppression, réaction) peut viser
 * une ligne posée par une page PLUS ANCIENNE que la première (#7227, W8) :
 * `mapFirstPage` sert exclusivement l'insertion d'une rangée NEUVE, toujours
 * la plus récente, donc toujours en tête. Chaque page dont rien ne change
 * garde son IDENTITÉ — aucune rangée déjà peinte ne se re-rend.
 */
const mapAllPages = (
  data: CommentInfiniteData | undefined,
  update: (comments: readonly PostComment[]) => readonly PostComment[],
): CommentInfiniteData | undefined => {
  if (data === undefined) return data;
  const pages = data.pages.map((page) => {
    const comments = update(page.comments);
    return comments === page.comments ? page : { ...page, comments };
  });
  return pages.every((page, i) => page === data.pages[i]) ? data : { ...data, pages };
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
 * **DEUX FAMILLES DE CAISSES — et leur énumération a cédé à chaque écran
 * NOUVEAU.** Chacune a été trouvée en demandant, non pas « qui calcule ce
 * compte ? », mais **« qui l'AFFICHE ? »** :
 *
 *  - **les caisses qui peignent une CARTE de publication** — le Flux, les
 *    Réels, les enregistrées, la page d'un hashtag, les publications d'un
 *    profil, la fiche `/post/$post`. Elles ne sont plus nommées ici : le
 *    registre `card-caches.ts` les tient (#7341), et `updateCardPost` les
 *    parcourt. Cette énumération les RECOPIAIT, et la recopie a perdu tour à
 *    tour le Flux et les Réels (#7135), puis n'a jamais connu les
 *    enregistrées, le hashtag ni le profil (#7341) : on commentait depuis la
 *    fiche, on revenait à l'écran, et la carte affichait l'ancien compte ;
 *  - **les caisses du lecteur de STORIES**, d'une autre forme
 *    (`StoryFeedPost`, pas de pages) et qu'aucune carte de publication ne
 *    lit : `STORY_FEED_QUERY_KEY` — la pastille du rail (#7112) — et
 *    `storyPostQueryKey(postId)`, la TROISIÈME MARCHE du lecteur (#7120) : une
 *    story ouverte par LIEN, hors des 50 plus récentes, n'est QUE là, et
 *    `postQueryKey` vaut `['posts', id]` quand celle-ci vaut
 *    `['stories', 'post', id]`.
 *
 * **L'énumération porte DEUX affirmations, et c'est la seconde qui a cédé** :
 * « ces caisses appliquent la règle » se vérifie ; « ce sont les caisses où la
 * règle s'applique » ne se vérifie qu'en demandant, pour un ÉCRAN de plus,
 * d'où il lit son compte.
 *
 * **La règle elle-même vit dans `lib/feed/interactions.ts`** (`withCommentCount`,
 * `shiftedCount`) : la borne basse y est écrite une seule fois — la leçon que
 * `PostLikeMutation.swift` a coûtée à iOS. Un post absent d'une caisse y est
 * laissé tel quel.
 */
export function shiftCommentCount(queryClient: QueryClient, postId: string, delta: 1 | -1): void {
  const change = { postId, delta };
  updateCardPost(queryClient, postId, (post) => withCommentCount(post, change));
  queryClient.setQueryData<readonly StoryFeedPost[]>(STORY_FEED_QUERY_KEY, (stories) => {
    if (stories === undefined) return stories;
    if (!stories.some((s) => s.id === postId)) return stories;
    return stories.map((s) => (s.id === postId ? { ...s, commentCount: shiftedCount(s.commentCount, delta) } : s));
  });
  queryClient.setQueryData<StoryFeedPost>(storyPostQueryKey(postId), (story) =>
    story === undefined ? story : { ...story, commentCount: shiftedCount(story.commentCount, delta) },
  );
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

/**
 * **LE CMID DÉRIVE DU `tempId`, IL NE S'EN INVENTE PAS UN SECOND** (#7151).
 *
 * La forme précédente appelait `newClientMessageId()` une SECONDE fois : le
 * cmid envoyé à la passerelle n'avait alors AUCUN lien avec l'id de la rangée
 * provisoire. L'écho `comment:added` revenait avec ce cmid, et le client ne
 * pouvait retrouver aucune rangée à réconcilier — la ligne s'insérait une
 * seconde fois, sous l'id serveur.
 *
 * `CommentAddedEventData.clientMutationId` était pourtant écrit POUR cet usage
 * (« insérée sous cet id local »). Ce qui manquait n'était pas le champ : c'est
 * que les deux identifiants ne se correspondaient pas. Un seul identifiant,
 * deux préfixes — et `optimisticIdOf` (`realtime-apply.ts`) refait le chemin
 * inverse.
 */
const mutationIdOf = (tempId: string): string => tempId.replace(/^cid_/, 'cmid_');

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

  const result = await sendComment(deps, { postId, body, clientMutationId: mutationIdOf(tempId) }).catch(() => null);

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
  params: {
    readonly postId: string;
    readonly body: Readonly<Record<string, unknown>>;
    /** DÉRIVÉ du `tempId` de la rangée provisoire — voir `mutationIdOf`. */
    readonly clientMutationId: string;
  },
): Promise<ApiResult<PostComment>> {
  if (__FIXTURES__ && deps.source === 'fixtures') {
    return import('./fixtures-comments').then(({ fixtureAddComment }) => fixtureAddComment(params.postId, params.body));
  }
  return deps.transport.request<PostComment>({
    method: 'POST',
    path: `/api/v1/posts/${encodeURIComponent(params.postId)}/comments`,
    body: params.body,
    headers: { 'X-Client-Mutation-Id': params.clientMutationId },
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


/**
 * **LA GARDE DE FORME VIT AVEC CE QU'ELLE GARDE** (#7151) — `comment:added`, l'événement que la
 * passerelle émet depuis toujours (`event-names.ts:423`) et que personne
 * n'écoutait : mesuré avant ce lot, `grep -rn "comment:added"` sur `src/`
 * rendait VIDE. Il fallait recharger pour voir le commentaire d'un tiers.
 */
export function isCommentAdded(payload: unknown): payload is CommentAddedEventData {
  if (typeof payload !== 'object' || payload === null) return false;
  const p = payload as Record<string, unknown>;
  if (typeof p.postId !== 'string' || typeof p.commentCount !== 'number') return false;
  if (p.clientMutationId !== undefined && typeof p.clientMutationId !== 'string') return false;
  const comment = p.comment;
  if (typeof comment !== 'object' || comment === null) return false;
  const c = comment as Record<string, unknown>;
  return typeof c.id === 'string' && typeof c.content === 'string' && typeof c.createdAt === 'string';
}

/* ------------------------------------------------------------------ #7151 --
 * **L'APPLICATION DE `comment:added` VIT ICI, PAS DANS `realtime-apply.ts`.**
 *
 * D-98 l'exige : « un écouteur temps réel n'IMPORTE pas le cache qu'il met à
 * jour — le chunk `realtime` ne doit tirer aucun cache de route ». Mesuré : y
 * importer ce module faisait passer `realtime` de 4,8 à **5,05 Ko**, au-dessus
 * de son plafond de 5. Ce n'était pas `shiftCommentCount` (0,01 Ko) mais le
 * module ENTIER — transport, fixtures, messages de catalogue.
 *
 * La garde de FORME (`isCommentAdded`) reste dans le site unique : elle est
 * pure et n'importe rien. Seule l'APPLICATION descend ici, et `socket.ts` la
 * rejoint par un `import()` — le motif que ce fichier emploie déjà pour
 * `fixtures-comments`.
 * -------------------------------------------------------------------------- */
/**
 * LA RANGÉE PROVISOIRE QUE CET ÉCHO RÉCONCILIE.
 *
 * `CommentAddedEventData.clientMutationId` existe pour ça — son doc-comment le
 * dit : « ré-émis dans l'écho pour que l'ÉMETTEUR réconcilie sa ligne optimiste
 * (insérée sous cet id local) ». Encore faut-il que les deux identifiants se
 * correspondent : le cmid DÉRIVE désormais du `tempId` de la rangée
 * (`publication-comments.ts`), un seul identifiant sous deux préfixes.
 */
/**
 * **LA CHARGE SOCKET SE PROJETTE DANS LA FORME QUE LE CACHE TIENT** (D-26,
 * « cache = forme du fil ») — le même geste que `rawMessageFromSocket` vingt
 * lignes plus haut, pour la même raison.
 *
 * `PostComment` du fil déclare `createdAt: string | Date` ; le cache de
 * web-v2 ne tient que des CHAÎNES, et `decodeCommentsPage` est seul à les
 * revivre. La garde a déjà vérifié le type à l'exécution ; cette projection le
 * dit au typage, sans second décodage.
 */
const commentFromSocket = (comment: SharedPostComment): PostComment =>
  ({
    ...comment,
    createdAt: typeof comment.createdAt === 'string' ? comment.createdAt : comment.createdAt.toISOString(),
  }) as PostComment;

const optimisticIdOf = (clientMutationId: string | undefined): string | undefined =>
  clientMutationId === undefined || !clientMutationId.startsWith('cmid_')
    ? undefined
    : `cid_${clientMutationId.slice('cmid_'.length)}`;

/**
 * **TROIS CHEMINS, ET UN SEUL BOUGE LE COMPTEUR.**
 *
 * 1. l'id est DÉJÀ dans la liste ⇒ rien. Un rejeu (reconnexion, double
 *    abonnement) ne dédouble ni la rangée ni le compte — `insertComment` pose
 *    en tête SANS regarder l'id, la garde est donc ici.
 * 2. l'écho porte le cmid d'une rangée PROVISOIRE locale ⇒ elle prend sa place.
 *    Le compteur a déjà été bougé quand on l'a posée : le toucher une seconde
 *    fois le ferait dériver.
 * 3. sinon ⇒ insertion, et le compteur suit (`shiftCommentCount`, le site
 *    unique qui tient TOUTES les caisses qui l'affichent).
 *
 * Un post dont aucune liste n'est ouverte n'a rien à mettre à jour — ce n'est
 * pas une erreur, et lever y casserait l'écran d'à côté.
 */
export function applyCommentAdded(queryClient: QueryClient, payload: unknown): void {
  /* LA GARDE EST ICI, plus chez l'appelant : `socket.ts` route, il ne juge
     pas. Une charge inattendue sort SANS lever — un événement d'une version
     voisine ne casse pas l'écran. */
  if (!isCommentAdded(payload)) return;
  const data = payload;
  const key = commentsQueryKey(data.postId);
  const cached = queryClient.getQueryData<CommentInfiniteData>(key);
  if (cached === undefined) return;

  const present = flattenCommentPages(cached);
  const servi = commentFromSocket(data.comment);
  if (present.some((c) => c.id === servi.id)) return;

  const tempId = optimisticIdOf(data.clientMutationId);
  if (tempId !== undefined && present.some((c) => c.id === tempId)) {
    queryClient.setQueryData<CommentInfiniteData>(key, (d) => replaceComment(d, tempId, servi));
    return;
  }

  queryClient.setQueryData<CommentInfiniteData>(key, (d) => insertComment(d, servi));
  shiftCommentCount(queryClient, data.postId, 1);
}

/* ------------------------------------------------------------------ #7227 --
 * **W8 — `comment:updated` / `comment:deleted` / `comment:liked` /
 * `comment:unliked` : LE FIL DE COMMENTAIRES SUIT LA PASSERELLE EN DIRECT.**
 *
 * Les quatre événements existent depuis toujours côté passerelle
 * (`SocialEventsHandler.ts:554,565,569,590,591`) ; `socket.ts` n'en écoutait
 * AUCUN — mesuré avant ce lot, comme pour `comment:added` (#7151).
 * -------------------------------------------------------------------------- */

/** LA GARDE DE `comment:updated` — même discipline que `isCommentAdded`. */
export function isCommentUpdated(payload: unknown): payload is CommentUpdatedEventData {
  if (typeof payload !== 'object' || payload === null) return false;
  const p = payload as Record<string, unknown>;
  if (typeof p.postId !== 'string') return false;
  const comment = p.comment;
  if (typeof comment !== 'object' || comment === null) return false;
  const c = comment as Record<string, unknown>;
  return typeof c.id === 'string' && typeof c.content === 'string' && typeof c.createdAt === 'string';
}

/**
 * **CE QUI APPARTIENT AU LECTEUR NE VIENT PAS DU SERVEUR** — jumelle EXACTE
 * de `feed-realtime.ts#merged` pour les PUBLICATIONS, et pour la même raison :
 * `comment:updated` est diffusé à TOUT le fil, donc sa charge ne peut pas
 * porter juste pour chacun ce qui se lit PAR LECTEUR. C'est mesuré, pas
 * supposé — `PostCommentService.getCommentAsUpdateResult`
 * (`services/gateway/src/services/PostCommentService.ts:375-399`, la relecture
 * que la route PATCH diffuse) sélectionne `likeCount` mais NI `isLikedByMe`
 * NI `currentUserReactions`.
 *
 * Sans cette préservation, un auteur corrigeant une faute de frappe vidait le
 * cœur de tous ceux qui avaient aimé son commentaire.
 *
 * Spread CONDITIONNEL, jamais `a ?? b` : sous `exactOptionalPropertyTypes`,
 * poser explicitement `undefined` sur une propriété optionnelle est un défaut
 * de type. La comparaison est `== null` pour couvrir les deux formes
 * d'absence ; un `false` TENU est une réponse du lecteur (« je n'aime pas »),
 * pas une absence, et il survit. Les COMPTEURS, eux, ne sont pas préservés —
 * `likeCount` est un agrégat que le serveur tient mieux que nous.
 */
const mergedComment = (incoming: PostComment, held: PostComment): PostComment => ({
  ...incoming,
  ...(held.isLikedByMe == null ? {} : { isLikedByMe: held.isLikedByMe }),
  ...(held.currentUserReactions == null ? {} : { currentUserReactions: held.currentUserReactions }),
});

/** L'ÉDITION REMPLACE LA LIGNE EN PLACE, sur TOUTES les pages — une
 * publication éditée ne trie rien, `mapAllPages` suffit là où `mapFirstPage`
 * ne visait que l'insertion. Une page qui ne PORTE pas la ligne éditée garde
 * son IDENTITÉ (la liste ne se re-rend pas en entier) ; une liste jamais
 * ouverte n'est pas fabriquée. */
export function applyCommentUpdated(queryClient: QueryClient, payload: unknown): void {
  if (!isCommentUpdated(payload)) return;
  const key = commentsQueryKey(payload.postId);
  if (queryClient.getQueryData<CommentInfiniteData>(key) === undefined) return;
  const updated = commentFromSocket(payload.comment);
  queryClient.setQueryData<CommentInfiniteData>(key, (d) =>
    mapAllPages(d, (comments) =>
      comments.some((c) => c.id === updated.id)
        ? comments.map((c) => (c.id === updated.id ? mergedComment(updated, c) : c))
        : comments,
    ),
  );
}

/** LA GARDE DE `comment:deleted` — `commentCount` est l'agrégat ABSOLU de la
 * publication après retrait, jamais un delta (miroir de `comment:added`). */
export function isCommentDeleted(payload: unknown): payload is CommentDeletedEventData {
  if (typeof payload !== 'object' || payload === null) return false;
  const p = payload as Record<string, unknown>;
  if (typeof p.postId !== 'string' || typeof p.commentId !== 'string' || typeof p.commentCount !== 'number') return false;
  /* CE QU'ELLE DÉPLIE, ELLE LE VÉRIFIE (revue-correction W8) : `applyCommentDeleted`
     fait `[...deletedCommentIds ?? []]`, et un champ qui n'est pas itérable y
     levait un `TypeError` — dans un `import().then()`, un rejet non intercepté,
     alors que ce module promet qu'une charge invalide « ne change rien et ne
     lève pas ». Le champ est OPTIONNEL (additif, cf. son doc-comment partagé) :
     absent ⇒ conforme ; présent ⇒ tableau de chaînes, ou rien. */
  if (p.deletedCommentIds === undefined) return true;
  return Array.isArray(p.deletedCommentIds) && p.deletedCommentIds.every((id) => typeof id === 'string');
}

/**
 * **LE JUMEAU ABSOLU DE `shiftCommentCount`** — celui-ci REÇOIT le compte
 * plutôt que de le calculer par delta : un `comment:deleted` porte déjà le
 * total serveur, et un client qui redériverait un delta depuis une liste
 * PARTIELLE (page non chargée) diverge.
 *
 * **LES MÊMES CAISSES que son jumeau DELTA**, sans exception — les caisses
 * de CARTES par le registre (`updateCardPost`), puis les deux du lecteur de
 * stories. `storyPostQueryKey` est justement celle qu'aucune autre n'atteint :
 * une story ouverte par LIEN, hors des 50 plus récentes, n'est QUE là. Sans
 * elle (revue-correction W8, #7227), quelqu'un supprimait son commentaire sous
 * la story qu'on regarde par lien, la ligne quittait le fil, **et la pastille
 * du rail restait au chiffre d'avant** — le défaut que #7120 avait payé sur la
 * voie ADDITIVE, rejoué sur la voie SERVIE.
 */
export function setCommentCountServed(queryClient: QueryClient, postId: string, count: number): void {
  updateCardPost(queryClient, postId, (post) => (post.commentCount === count ? post : { ...post, commentCount: count }));
  queryClient.setQueryData<readonly StoryFeedPost[]>(STORY_FEED_QUERY_KEY, (stories) => {
    if (stories === undefined) return stories;
    if (!stories.some((s) => s.id === postId)) return stories;
    return stories.map((s) => (s.id === postId ? { ...s, commentCount: count } : s));
  });
  queryClient.setQueryData<StoryFeedPost>(storyPostQueryKey(postId), (story) =>
    story === undefined || story.commentCount === count ? story : { ...story, commentCount: count },
  );
}

/**
 * LA CIBLE ET SES DESCENDANTS NOMMÉS QUITTENT LE FIL, sur TOUTES les pages ;
 * le compte SERVI se pose à chaque caisse qui l'affiche INCONDITIONNELLEMENT
 * (`setCommentCountServed`) — même si la liste de commentaires n'est pas
 * ouverte, la carte de chaque écran et la pastille du rail doivent rester
 * justes. `deletedCommentIds` porte le
 * sous-arbre entier (soft-delete côté serveur) ; web n'a pas de réponses
 * imbriquées (pas de route `replies`), donc un id de réponse n'y trouve
 * simplement rien à retirer — sans effet, jamais une erreur.
 */
export function applyCommentDeleted(queryClient: QueryClient, payload: unknown): void {
  if (!isCommentDeleted(payload)) return;
  const ids = new Set<string>([payload.commentId, ...(payload.deletedCommentIds ?? [])]);
  const key = commentsQueryKey(payload.postId);
  if (queryClient.getQueryData<CommentInfiniteData>(key) !== undefined) {
    queryClient.setQueryData<CommentInfiniteData>(key, (d) => mapAllPages(d, (comments) => comments.filter((c) => !ids.has(c.id))));
  }
  setCommentCountServed(queryClient, payload.postId, payload.commentCount);
}

/** LA GARDE PARTAGÉE de `comment:liked` / `comment:unliked` — même forme
 * (`CommentLikedEventData`/`CommentUnlikedEventData`), même garantie de
 * `likeCount` ABSOLU (doc-comment du couple dans `@meeshy/shared/types/post`). */
export function isCommentLikeEvent(payload: unknown): payload is CommentLikedEventData | CommentUnlikedEventData {
  if (typeof payload !== 'object' || payload === null) return false;
  const p = payload as Record<string, unknown>;
  return (
    typeof p.postId === 'string' &&
    typeof p.commentId === 'string' &&
    typeof p.userId === 'string' &&
    typeof p.emoji === 'string' &&
    typeof p.likeCount === 'number'
  );
}

/**
 * `likeCount` ABSOLU remplace l'estimation, sur TOUTES les pages. `liked`
 * (posé par l'appelant — `true` pour `comment:liked`, `false` pour
 * `comment:unliked`) ne pose `isLikedByMe` QUE pour le geste du LECTEUR (un
 * autre de SES appareils) : le cœur d'un AUTRE ne remplit jamais le mien —
 * même garde que `post:liked` (`socket.ts#onPostLikeChanged`).
 */
export function applyCommentLikeEvent(queryClient: QueryClient, payload: unknown, viewerId: string, liked: boolean): void {
  if (!isCommentLikeEvent(payload)) return;
  const key = commentsQueryKey(payload.postId);
  if (queryClient.getQueryData<CommentInfiniteData>(key) === undefined) return;
  const byViewer = payload.userId === viewerId;
  const { commentId, likeCount } = payload;
  queryClient.setQueryData<CommentInfiniteData>(key, (d) =>
    mapAllPages(d, (comments) =>
      comments.map((c) => (c.id === commentId ? { ...c, likeCount, ...(byViewer ? { isLikedByMe: liked } : {}) } : c)),
    ),
  );
}
