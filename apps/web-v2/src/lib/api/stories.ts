import { unwrap } from './client';
import type { DataSource } from './config';
import type { ApiResult, HttpTransport } from './http';

/**
 * **LE PORT DU RAIL DE STORIES** (#6080) — motif EXISTANT `loadConversations`
 * (`conversations.ts:33-41`) : `source` résolue ICI, jamais dans le hook ni
 * dans l'écran, et les fixtures passent par le MÊME chemin.
 *
 * `GET /api/v1/social/posts?scope=stories&projection=tray` (#6249 — successeur
 * de l'alias déprécié `GET /posts/feed/stories?projection=tray`,
 * `services/gateway/src/routes/posts/feed.ts:801-813`, authentification
 * REQUISE — 401 `UNAUTHORIZED` sans session). La lecture — `chargerStories`,
 * donc `trayStorySelect` — est INCHANGÉE : l'alias et la route cible
 * délèguent à la MÊME fonction (`feed.ts:450-457` vs `:801-813`), seule
 * l'adresse a bougé. La projection `tray` reste une whitelist stricte côté
 * serveur : toute autre valeur est ignorée et sert la charge complète, d'où
 * l'envoi de la chaîne exacte.
 *
 * Ce que le serveur renvoie est un POST par story (`trayStorySelect`,
 * `postIncludes.ts:275-296`), pas un auteur : `{ id, type, createdAt,
 * expiresAt, viewCount, author, media, repostOf }`. **Le groupement par auteur
 * est un travail de VUE** — un rail montre un cercle par auteur, jamais un par
 * story —, et il vit dans `lib/view/story-tray.ts` avec sa règle de tri.
 *
 * `limit` est plafonné à 50 côté serveur (`LimiteSchema`) : le demander plus
 * haut ne sert à rien, et le demander plus bas priverait le rail d'auteurs
 * sans que rien ne le dise.
 */
/**
 * `STORIES_QUERY_PREFIX` (#6195) — le préfixe COMMUN aux deux corpus de ce
 * fichier : le tirer-pour-rafraîchir de la Lentille (`refreshListAction`,
 * `query.ts`) invalide CE préfixe, une fois, plutôt que d'énumérer les clés —
 * un troisième corpus qui rejoindrait ce module n'aurait qu'à en DÉRIVER sa
 * clé pour être rafraîchi avec les deux premiers, jamais une ligne de plus à
 * ajouter au tirer.
 */
export const STORIES_QUERY_PREFIX = ['stories'] as const;
export const STORY_TRAY_QUERY_KEY = [...STORIES_QUERY_PREFIX, 'tray'] as const;

/** Un média de story, réduit à ce que le rail PEINT. */
export type StoryTrayMedia = {
  readonly id: string;
  readonly url?: string;
  readonly thumbnailUrl?: string;
  readonly mimeType?: string;
};

/** L'auteur, tel que `storyAuthorSelect` le sert. */
export type StoryTrayAuthor = {
  readonly id: string;
  readonly username?: string;
  readonly displayName?: string;
  readonly firstName?: string;
  readonly lastName?: string;
  readonly avatar?: string;
};

/** Une story du plateau — la forme EXACTE de `trayStorySelect`, rien de plus.
 *
 * `isViewedByMe` (#5817, correctif du défaut relevé § 2 de la spécification)
 * — SERVI par la passerelle sur les DEUX projections (`PostFeedService.ts`,
 * commentaire « isViewedByMe (anneau vu/non-vu) reste servi dans les deux »),
 * jamais absent du plateau contrairement à ce qu'affirmait le doc-comment de
 * `groupStoriesByAuthor` avant ce lot. */
export type StoryTrayPost = {
  readonly id: string;
  readonly type: string;
  readonly createdAt: string | Date;
  readonly expiresAt?: string | Date;
  readonly viewCount?: number;
  readonly isViewedByMe?: boolean;
  readonly author?: StoryTrayAuthor;
  readonly media?: readonly StoryTrayMedia[];
};

export type StoriesDeps = {
  readonly source: DataSource;
  readonly transport: HttpTransport;
};

export async function loadStoryTray(
  params: StoriesDeps & { readonly signal?: AbortSignal },
): Promise<ApiResult<readonly StoryTrayPost[]>> {
  if (__FIXTURES__ && params.source === 'fixtures') {
    const { STORY_TRAY } = await import('./fixtures-stories');
    return { ok: true, data: STORY_TRAY };
  }
  return params.transport.request<readonly StoryTrayPost[]>({
    method: 'GET',
    path: '/api/v1/social/posts?scope=stories&projection=tray&limit=50',
    ...(params.signal !== undefined ? { signal: params.signal } : {}),
  });
}

export function storyTrayQueryOptions(deps: StoriesDeps) {
  return {
    queryKey: STORY_TRAY_QUERY_KEY,
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      loadStoryTray({ ...deps, signal }).then(unwrap),
  };
}

/**
 * **LE CORPUS DES HUMEURS** (#5652) — `GET /social/posts?scope=statuses`
 * (`services/gateway/src/routes/posts/feed.ts:823-831`, requiredAuth ; le
 * même endroit qui sert `/posts/feed/stories` sous `?scope=stories`). Chaque
 * ligne est un `Post` complet dont seuls `moodEmoji` et `author` intéressent
 * le rail — les autres champs (contenu, réactions…) ne sont pas de son
 * ressort, `withMoods()` (`lib/view/story-tray.ts`) ne lit que ces deux-là.
 */
export const STATUS_MOODS_QUERY_KEY = [...STORIES_QUERY_PREFIX, 'moods'] as const;

/** Une humeur, réduite à ce que le rail LIT — `Post.moodEmoji`
 * (`schema.prisma`, « Emoji mood (ex: "😴", "🎉", "💪", "☕") »). */
export type StatusMoodPost = {
  readonly id: string;
  readonly authorId?: string;
  readonly moodEmoji?: string | null;
  readonly author?: StoryTrayAuthor;
};

export async function loadStatusMoods(
  params: StoriesDeps & { readonly signal?: AbortSignal },
): Promise<ApiResult<readonly StatusMoodPost[]>> {
  if (__FIXTURES__ && params.source === 'fixtures') {
    const { STATUS_MOODS } = await import('./fixtures-stories');
    return { ok: true, data: STATUS_MOODS };
  }
  return params.transport.request<readonly StatusMoodPost[]>({
    method: 'GET',
    path: '/api/v1/social/posts?scope=statuses&limit=50',
    ...(params.signal !== undefined ? { signal: params.signal } : {}),
  });
}

export function statusMoodsQueryOptions(deps: StoriesDeps) {
  return {
    queryKey: STATUS_MOODS_QUERY_KEY,
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      loadStatusMoods({ ...deps, signal }).then(unwrap),
  };
}

/**
 * **LE CORPUS COMPLET DU LECTEUR** (#5817) — LE MÊME ENDPOINT que
 * `loadStoryTray` (#6249, `GET /api/v1/social/posts?scope=stories`), SANS
 * `?projection=tray` : `chargerStories`
 * (`services/gateway/src/routes/posts/feed.ts:801-813`) sert alors
 * `storyPostInclude` (`postIncludes.ts:382-385`) — contenu, langue
 * d'origine, traductions, effets de fond, media, auteur — tout ce que
 * `lib/stories/playback.ts` a besoin de LIRE pour jouer une story, quand le
 * plateau (`trayStorySelect`) ne sert que l'anneau et la miniature.
 *
 * `STORY_FEED_QUERY_KEY` est un troisième corpus SOUS le même préfixe
 * (`STORIES_QUERY_PREFIX`) : `refreshListAction`/le socket (`api/socket.ts`)
 * invalident le préfixe entier et couvrent donc ce corpus SANS ligne de plus
 * (doc-comment `STORIES_QUERY_PREFIX` ci-dessus).
 */
export const STORY_FEED_QUERY_KEY = [...STORIES_QUERY_PREFIX, 'feed'] as const;

/** Un fond d'effet de story — `StoryEffects.background`
 * (`"RRGGBB"` ou `"gradient:RRGGBB:RRGGBB"`, `schema.prisma`). */
export type StoryFeedEffects = { readonly background?: string | null };

/** Une story du corpus COMPLET — la forme que `storyPostInclude` sert,
 * réduite à ce que le lecteur (#5817, périmètre TEXTE + IMAGE) consomme. */
export type StoryFeedPost = {
  readonly id: string;
  readonly type: string;
  readonly createdAt: string | Date;
  readonly expiresAt?: string | Date | null;
  readonly viewCount?: number;
  readonly isViewedByMe?: boolean;
  readonly author?: StoryTrayAuthor;
  readonly media?: readonly StoryTrayMedia[];
  readonly content?: string | null;
  readonly originalLanguage?: string | null;
  /** La carte `langue → { text, … }` que `postScalarSelect.translations`
   * sert (`schema.prisma:911`) — dépouillée par `lib/api/prism.ts`, JAMAIS
   * relue ici telle quelle (D-14, cycle 122 du CLAUDE.md racine). */
  readonly translations?: unknown;
  readonly storyEffects?: StoryFeedEffects | null;
};

export async function loadStoryFeed(
  params: StoriesDeps & { readonly signal?: AbortSignal },
): Promise<ApiResult<readonly StoryFeedPost[]>> {
  if (__FIXTURES__ && params.source === 'fixtures') {
    const { STORY_FEED } = await import('./fixtures-stories');
    return { ok: true, data: STORY_FEED };
  }
  return params.transport.request<readonly StoryFeedPost[]>({
    method: 'GET',
    path: '/api/v1/social/posts?scope=stories&limit=50',
    ...(params.signal !== undefined ? { signal: params.signal } : {}),
  });
}

export function storyFeedQueryOptions(deps: StoriesDeps) {
  return {
    queryKey: STORY_FEED_QUERY_KEY,
    queryFn: ({ signal }: { signal: AbortSignal }) => loadStoryFeed({ ...deps, signal }).then(unwrap),
  };
}

/**
 * **LA TROISIÈME MARCHE DE LA CASCADE** (#5817, revue-correction, défaut 4)
 * — miroir de `StoryViewerContainer.swift:297-352` : cache → groupe déjà là
 * → `GET /posts/:id` UNITAIRE → `loadStories(forceNetwork:)` → 2,5 s →
 * `timedOut`. `loadStoryFeed` ne sert que les 50 stories les plus récentes
 * (`limit=50`, plafond serveur) ; une story partagée par LIEN mais plus
 * ancienne que ces 50-là (ou publiée par un auteur dont aucune autre story
 * ne figure dans la fenêtre) reste pourtant une adresse « partageable
 * publiquement » (`parity.md:310`). Cette marche la retrouve À LA DEMANDE,
 * sans jamais élargir la fenêtre du corpus principal.
 *
 * `GET /posts/:postId` (`services/gateway/src/routes/posts/core.ts:475-500`,
 * requiredAuth) applique déjà l'ACL de `getPostById` — un lecteur qui n'a
 * pas le droit de voir cette story reçoit le MÊME 404 `POST_NOT_FOUND`
 * qu'une story qui n'existe pas (D-6 : aucun oracle d'existence). Le corps
 * servi n'est PAS `trayStorySelect` (le plateau) : c'est le post complet,
 * une projection plus large que `StoryFeedPost` mais qui la CONTIENT — le
 * même contrat de champs (`content`, `translations`, `storyEffects`,
 * `media`, `author`…) que `storyPostInclude` sert déjà à `loadStoryFeed`.
 */
/** `timedOut` (`StoryViewerContainer.swift:297-352`) — le délai de garde de
 * la cascade DE REPLI, jamais celui d'un appel ordinaire (`DEFAULT_TIMEOUT_MS`,
 * 15 s, `http.ts`) : la 3ᵉ marche n'a de raison d'exister que pour dire vite
 * « introuvable », pas pour attendre une passerelle lente aussi longtemps
 * qu'un chargement normal. */
export const STORY_POST_FALLBACK_TIMEOUT_MS = 2500;

export async function loadStoryPost(
  params: StoriesDeps & { readonly postId: string; readonly signal?: AbortSignal },
): Promise<ApiResult<StoryFeedPost>> {
  if (__FIXTURES__ && params.source === 'fixtures') {
    const { STORY_FEED } = await import('./fixtures-stories');
    const found = STORY_FEED.find((story) => story.id === params.postId);
    if (found === undefined) {
      return { ok: false, status: 404, error: 'Post not found', code: 'POST_NOT_FOUND' };
    }
    return { ok: true, data: found };
  }
  return params.transport.request<StoryFeedPost>({
    method: 'GET',
    path: `/api/v1/posts/${encodeURIComponent(params.postId)}`,
    timeoutMs: STORY_POST_FALLBACK_TIMEOUT_MS,
    ...(params.signal !== undefined ? { signal: params.signal } : {}),
  });
}

export function storyPostQueryOptions(deps: StoriesDeps & { readonly postId: string }) {
  return {
    queryKey: [...STORIES_QUERY_PREFIX, 'post', deps.postId] as const,
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      loadStoryPost({ ...deps, signal }).then(unwrap),
  };
}

/**
 * **MARQUER UNE STORY VUE** (#5817, migré #6249) — `POST /api/v1/social/events`
 * (`services/gateway/src/routes/social/events.ts:670-696`, successeur de
 * l'alias déprécié `POST /posts/:postId/view`), corps
 * `{ events: [{ type: 'view', postId, durationMs? }] }` (`SocialEventSchema`,
 * `events.ts:163-171` — `durationMs`, pas `duration` : le nom dit son unité).
 *
 * Le serveur y répond `{ recorded, rejected }`, jamais `{ viewed }` — cette
 * fonction retombe donc sur `{ viewed: true }` en cas de succès, quel que soit
 * le verdict serveur (« ni oracle d'existence ni témoin d'audience », même
 * comportement que l'alias historique) : l'appelant n'attend de cette réponse
 * qu'un accusé, jamais une donnée à afficher.
 */
export async function markStoryViewed(
  params: StoriesDeps & { readonly postId: string; readonly durationMs?: number },
): Promise<ApiResult<{ readonly viewed: boolean }>> {
  if (__FIXTURES__ && params.source === 'fixtures') {
    return { ok: true, data: { viewed: true } };
  }
  const result = await params.transport.request<{ readonly recorded: number; readonly rejected: number }>({
    method: 'POST',
    path: '/api/v1/social/events',
    body: { events: [{ type: 'view', postId: params.postId, ...(params.durationMs === undefined ? {} : { durationMs: params.durationMs }) }] },
  });
  if (!result.ok) return result;
  return { ok: true, data: { viewed: true } };
}
