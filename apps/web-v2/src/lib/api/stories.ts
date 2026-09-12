import type { Post } from '@meeshy/shared/types/post';

import { unwrap } from './client';
import { toDate } from './decode';
import { STORY_TRAY_POSTS, STATUS_POSTS } from './fixtures-stories';
import type { ApiResult, HttpTransport } from './http';
import type { DataSource } from './config';

/**
 * LE PORT DES STORIES ET DES STATUTS DU RAIL (#5652, bloc A) — miroir
 * `PostFeedService.getStories` / `getStatuses`
 * (`services/gateway/src/services/posts/PostFeedService.ts`), servis par
 * `GET /api/v1/social/posts?scope=stories&projection=tray` et
 * `?scope=statuses` (`services/gateway/src/routes/posts/feed.ts:801-831`).
 *
 * Motif EXISTANT `conversations.ts` (§ doc-comment) : `source` résolue par
 * l'APPELANT (`api/query.ts`), jamais relue ici ; les fixtures traversent le
 * MÊME chemin que le réseau.
 *
 * `updatedSince`/`cursor` sont HORS LOT (une page de 50 suffit à 6 pastilles
 * + moi, § 3.1 de la spécification) — une issue compagnon les portera avec la
 * pagination générale de la Lentille.
 */

export type StoriesDeps = {
  readonly source: DataSource;
  readonly transport: HttpTransport;
};

/** Miroir `StoryItem` (`StoryModels.swift`) — le peu que le rail consomme. */
export type StoryItem = {
  readonly id: string;
  readonly createdAt: Date;
  /** `null` = jamais expirée (ne devrait pas arriver sur une story, gardé
   * pour ne jamais faire planter le décodage sur un champ absent). */
  readonly expiresAt: Date | null;
  readonly isViewed: boolean;
  readonly previewUrl?: string;
};

/**
 * Miroir `StoryGroup` (`StoryModels.swift:1824-1855`) : `id` = l'AUTEUR,
 * `stories` en ordre CROISSANT (le décodeur RENVERSE l'ordre `createdAt desc`
 * servi par la passerelle, § 3.1 de la spécification — `latestStoryOf` peut
 * alors lire `.at(-1)` comme `StoryGroup.latestStory = stories.last` côté
 * Swift).
 */
export type StoryGroup = {
  readonly id: string;
  readonly displayName: string;
  readonly avatarUrl?: string;
  readonly stories: readonly StoryItem[];
};

export function latestStoryOf(group: StoryGroup): StoryItem | undefined {
  return group.stories.at(-1);
}

export function hasUnviewedStories(group: StoryGroup): boolean {
  return group.stories.some((story) => !story.isViewed);
}

/** Miroir `StoryGroup.isFullyExpired(at:)` (`StoryModels.swift:1847-1849`). */
export function isGroupFullyExpired(group: StoryGroup, at: Date): boolean {
  return group.stories.every((story) => story.expiresAt !== null && story.expiresAt.getTime() <= at.getTime());
}

function authorIdOf(raw: Post): string {
  return raw.author?.id ?? raw.authorId;
}

function authorDisplayNameOf(raw: Post): string {
  return raw.author?.displayName ?? raw.author?.username ?? authorIdOf(raw);
}

/**
 * UNE CHAÎNE VIDE N'EST PAS UNE URL — c'est une ABSENCE (revue #5652). La
 * colonne `MessageAttachment.thumbnailUrl` est nullable et `fileUrl` peut
 * arriver vide d'un média encore en traitement : `?? undefined` ne l'attrape
 * pas, et `<img src="">` RECHARGE le document courant (comportement HTML) —
 * une requête de plus, et un carré cassé par-dessus les initiales. Même
 * raisonnement que `declaredOverride` (`api/config.ts`) sur `VITE_API_BASE`.
 */
function nonEmpty(...candidats: readonly (string | null | undefined)[]): string | undefined {
  for (const candidat of candidats) {
    if (typeof candidat === 'string' && candidat.trim() !== '') return candidat;
  }
  return undefined;
}

function toStoryItem(raw: Post): StoryItem {
  const cover = raw.media?.[0];
  const rawExpiresAt = raw.expiresAt;
  const previewUrl = nonEmpty(cover?.thumbnailUrl, cover?.fileUrl);
  const isViewed = (raw as { readonly isViewedByMe?: unknown }).isViewedByMe === true;
  return {
    id: raw.id,
    createdAt: toDate(raw.createdAt),
    expiresAt: rawExpiresAt === undefined || rawExpiresAt === null ? null : toDate(rawExpiresAt),
    isViewed,
    ...(previewUrl === undefined ? {} : { previewUrl }),
  };
}

/**
 * `decodeStoryGroups` — LE DÉCODEUR (D-26). La passerelle sert les stories
 * `createdAt desc, id desc` (`PostFeedService.ts:430,438`), globalement
 * mélangées entre auteurs : la PREMIÈRE rencontre d'un auteur porte donc sa
 * story la plus RÉCENTE, ce qui ordonne les GROUPES par activité récente
 * d'auteur — sans second tri. À L'INTÉRIEUR d'un groupe, l'ordre est RENVERSÉ
 * en croissant (§ 3.1) : `latestStoryOf` lit alors le dernier élément, comme
 * `StoryGroup.latestStory = stories.last` côté Swift.
 *
 * Erreur avalée en VIDE = vide légitime (leçon du dépôt) : ce décodeur ne
 * masque JAMAIS une erreur réseau — c'est `ApiResult` qui la porte, jamais un
 * `[]` de repli silencieux.
 */
export function decodeStoryGroups(raw: readonly Post[]): readonly StoryGroup[] {
  const byAuthor = new Map<string, StoryItem[]>();
  const meta = new Map<string, { readonly displayName: string; readonly avatarUrl?: string }>();
  const order: string[] = [];

  for (const post of raw) {
    const authorId = authorIdOf(post);
    if (!byAuthor.has(authorId)) {
      byAuthor.set(authorId, []);
      const avatarUrl = nonEmpty(post.author?.avatar);
      meta.set(authorId, { displayName: authorDisplayNameOf(post), ...(avatarUrl === undefined ? {} : { avatarUrl }) });
      order.push(authorId);
    }
    byAuthor.get(authorId)!.push(toStoryItem(post));
  }

  return order.map((id) => {
    const m = meta.get(id)!;
    return {
      id,
      displayName: m.displayName,
      ...(m.avatarUrl === undefined ? {} : { avatarUrl: m.avatarUrl }),
      stories: [...byAuthor.get(id)!].reverse(),
    };
  });
}

/**
 * `decodeStatusMoods` — le peu que le rail lit du scope `statuses` :
 * `moodEmoji` par auteur, le PLUS RÉCENT (la passerelle sert `createdAt
 * desc` : le premier rencontré gagne, § 3.2 de la spécification).
 */
export type StatusMoodsByAuthor = Readonly<Record<string, string>>;

export function decodeStatusMoods(raw: readonly Post[]): StatusMoodsByAuthor {
  const result: Record<string, string> = {};
  for (const post of raw) {
    const authorId = authorIdOf(post);
    if (authorId in result) continue;
    if (typeof post.moodEmoji === 'string' && post.moodEmoji.length > 0) result[authorId] = post.moodEmoji;
  }
  return result;
}

export async function loadStoryTray(
  params: StoriesDeps & { readonly signal?: AbortSignal },
): Promise<ApiResult<readonly Post[]>> {
  if (__FIXTURES__ && params.source === 'fixtures') return { ok: true, data: STORY_TRAY_POSTS };
  return params.transport.request<readonly Post[]>({
    method: 'GET',
    path: '/api/v1/social/posts?scope=stories&projection=tray',
    ...(params.signal !== undefined ? { signal: params.signal } : {}),
  });
}

export async function loadStatuses(
  params: StoriesDeps & { readonly signal?: AbortSignal },
): Promise<ApiResult<readonly Post[]>> {
  if (__FIXTURES__ && params.source === 'fixtures') return { ok: true, data: STATUS_POSTS };
  return params.transport.request<readonly Post[]>({
    method: 'GET',
    path: '/api/v1/social/posts?scope=statuses',
    ...(params.signal !== undefined ? { signal: params.signal } : {}),
  });
}

export const STORY_TRAY_QUERY_KEY = ['social', 'posts', 'stories', 'tray'] as const;
export const STATUSES_QUERY_KEY = ['social', 'posts', 'statuses'] as const;

/** FABRIQUE — motif `conversationsQuery` (`conversations.ts:62-69`). */
export function storyTrayQuery(deps: StoriesDeps) {
  return {
    queryKey: STORY_TRAY_QUERY_KEY,
    queryFn: async ({ signal }: { readonly signal?: AbortSignal }) =>
      unwrap(await loadStoryTray({ ...deps, ...(signal !== undefined ? { signal } : {}) })),
    select: decodeStoryGroups,
  };
}

export function statusesQuery(deps: StoriesDeps) {
  return {
    queryKey: STATUSES_QUERY_KEY,
    queryFn: async ({ signal }: { readonly signal?: AbortSignal }) =>
      unwrap(await loadStatuses({ ...deps, ...(signal !== undefined ? { signal } : {}) })),
    select: decodeStatusMoods,
  };
}
