import type { InfiniteData } from '@tanstack/react-query';

/**
 * LE VOCABULAIRE DU FIL DES PUBLICATIONS (#5893) — la forme EXACTE que
 * `GET /api/v1/social/posts?scope=home` sert (`postInclude`,
 * `services/gateway/src/services/posts/postIncludes.ts:367-374`), réduite à
 * ce que `FeedPostCard` (v3.1) LIT — voir § 3.1 de la spécification pour la
 * liste complète des champs retenus et de ceux laissés de côté (menu,
 * transcription, réactions du lecteur autres que `isLiked`…).
 *
 * FONCTION DE MODULE, jamais une projection locale : les champs viennent
 * directement de la forme du wire, aucun renommage (`sender` → `author` etc.)
 * — la leçon du Prisme (CLAUDE.md, cycles 118-120) est qu'une projection qui
 * ne rougit jamais dérive en silence dès que la passerelle ajoute un champ.
 */
/**
 * `null` N'EST PAS `undefined`, ET C'EST LA PASSERELLE QUI TRANCHE (défaut
 * BLOQUANT relevé en revue-correction #5893, mesuré sur
 * `gate.staging.meeshy.me` le 2026-09-13).
 *
 * Prisma sérialise une colonne OPTIONNELLE en `null`, jamais en clé absente :
 * `User.avatar String?`, `PostMedia.{width,height,thumbnailUrl,thumbHash,
 * duration,caption,alt} String?/Int?` (`schema.prisma:3585-3620`) partent
 * TOUS en `null` sur le fil. Ces types déclaraient `?: string`, donc
 * `avatar !== undefined` était VRAI pour un `null` et `avatar.trim()` levait
 * `TypeError: Cannot read properties of null` — l'écran restait figé sur son
 * squelette, sans état d'erreur, dès le premier auteur sans photo (mesuré :
 * le compte `demo-test-stagin` du fil de recette). Les fixtures ne portaient
 * aucun `null` : aucun témoin ne pouvait rougir.
 *
 * La règle, ici et pour tout port qui suivra : **un champ OPTIONNEL de la
 * passerelle se déclare `?: T | null`**, et le site qui le consomme teste le
 * TYPE (`typeof x === 'string'`), jamais l'absence.
 */
export type FeedAuthor = {
  readonly id: string;
  readonly username?: string | null;
  readonly displayName?: string | null;
  readonly avatar?: string | null;
};

export type FeedMedia = {
  readonly id: string;
  readonly mimeType?: string | null;
  readonly fileUrl: string;
  readonly thumbnailUrl?: string | null;
  readonly thumbHash?: string | null;
  readonly width?: number | null;
  readonly height?: number | null;
  /** MILLISECONDES — `PostMedia.duration Int? // ms` (`schema.prisma:3610`),
   * que iOS formate en `formatDuration(milliseconds:)`
   * (`MeeshyVideoThumbnail.swift:50`). Le nom porte l'unité jusqu'au modèle
   * de carte (`FeedCardMedia.durationMs`) : une seconde lue pour une
   * milliseconde donne une pastille « 0:28 » sur un clip de 28 ms. */
  readonly duration?: number | null;
  readonly caption?: string | null;
  readonly alt?: string | null;
  readonly order?: number | null;
};

export type FeedRepostOf = { readonly author?: { readonly username?: string | null } | null };

export type FeedPost = {
  readonly id: string;
  /** `'POST' | 'REEL' | …` — l'union complète vit côté serveur
   * (`PostType`, `schema.prisma`) ; ce client ne distingue que REEL du reste. */
  readonly type: string;
  readonly createdAt: string | Date;
  readonly content?: string | null;
  readonly originalLanguage?: string | null;
  /** La carte `langue → { text, … }` d'UN POST (`schema.prisma:911`) —
   * dépouillée par `lib/feed/text.ts#resolveFeedText`, jamais relue ici
   * telle quelle (D-14). */
  readonly translations?: unknown;
  readonly author?: FeedAuthor | null;
  readonly media?: readonly FeedMedia[] | null;
  readonly repostOf?: FeedRepostOf | null;
  readonly likeCount?: number | null;
  readonly commentCount?: number | null;
  readonly repostCount?: number | null;
  readonly bookmarkCount?: number | null;
  readonly shareCount?: number | null;
  readonly isLiked?: boolean | null;
  readonly isBookmarkedByMe?: boolean | null;
  readonly isRepostedByMe?: boolean | null;
};

/**
 * `FeedPagination` — la forme RÉELLE que `envoyerFeedUnifie` sert sous
 * `pagination` (`services/gateway/src/routes/posts/feed.ts:299-305` :
 * `{ limit, hasMore, nextCursor, form: 'keyset' }`), PAS `PaginationMeta`
 * (`total`/`offset`) malgré le typage large de `ApiSuccess.pagination` —
 * cette route-là ne sert jamais de compte total, son curseur est OPAQUE.
 */
export type FeedPagination = { readonly limit: number; readonly hasMore: boolean; readonly nextCursor: string | null };
export type FeedPage = { readonly posts: readonly FeedPost[]; readonly pagination: FeedPagination };
export type FeedPageParam = string | undefined;
export type FeedInfiniteData = InfiniteData<FeedPage, FeedPageParam>;

/**
 * `flattenFeedPages` — même loi que `flattenConversationPages`
 * (`conversations-pages.ts`) : DÉDOUBLONNE par id, la PREMIÈRE occurrence
 * gagne. FONCTION DE MODULE — `select` doit rester la MÊME référence entre
 * deux fabriques pour que `QueryObserver` la mémorise.
 */
export function flattenFeedPages(data: FeedInfiniteData): readonly FeedPost[] {
  const seen = new Set<string>();
  const result: FeedPost[] = [];
  for (const page of data.pages) {
    for (const post of page.posts) {
      if (seen.has(post.id)) continue;
      seen.add(post.id);
      result.push(post);
    }
  }
  return result;
}

/**
 * `nextFeedCursor` — `getNextPageParam` de `useInfiniteQuery`, MÊME garde
 * « zéro progrès » que `nextConversationsCursor` (`conversations-pages.ts`) :
 * `hasMore` faux, `nextCursor` absent, curseur STAGNANT, page VIDE, et AUCUN
 * id neuf dans la page qui vient d'arriver ⇒ pas de curseur suivant, jamais
 * une boucle sans fin.
 */
export function nextFeedCursor(
  lastPage: FeedPage,
  allPages: readonly FeedPage[],
  lastPageParam: FeedPageParam,
): FeedPageParam {
  if (lastPage.pagination.hasMore !== true) return undefined;
  const { nextCursor } = lastPage.pagination;
  if (nextCursor === null) return undefined;
  if (nextCursor === lastPageParam) return undefined;
  if (lastPage.posts.length === 0) return undefined;

  const priorIds = new Set<string>();
  for (const page of allPages) {
    if (page === lastPage) continue;
    for (const post of page.posts) priorIds.add(post.id);
  }
  const hasNewRow = lastPage.posts.some((p) => !priorIds.has(p.id));
  return hasNewRow ? nextCursor : undefined;
}
