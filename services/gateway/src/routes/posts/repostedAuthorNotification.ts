/**
 * Prévenir l'auteur d'un contenu qu'on vient de republier (#10525) — « Awa a
 * republié votre réel / story / humeur / publication ».
 *
 * Deux portes écrivent une republication : `POST /posts/:postId/repost` (le
 * bouton du fil) et `POST /posts` avec `repostOfId` (le composeur : story et
 * mood republiés). Seule la première prévenait l'auteur ; la seconde, celle
 * de la story et du mood, ne le faisait jamais. Ce module est leur site
 * UNIQUE : même relecture de la source, même notification, mêmes gardes.
 *
 * Ce qu'il ne fait PAS : décider si l'auteur a le droit d'apprendre la
 * republication. C'est le bâtisseur (`createPostRepostNotification`) qui le
 * tranche, fail-closed, sur l'audience de la republication elle-même.
 */
import type { NotificationService } from '../../services/notifications/NotificationService';

type RepostedKind = 'POST' | 'STORY' | 'MOOD' | 'STATUS' | 'REEL';

const REPOSTED_KINDS: ReadonlySet<string> = new Set<RepostedKind>(['POST', 'STORY', 'MOOD', 'STATUS', 'REEL']);

/** Ce que la notification dit de la SOURCE : son auteur, son type, ses dates. */
export type RepostedSource = {
  readonly authorId: string;
  readonly type?: RepostedKind;
  readonly createdAt?: Date | string;
  readonly expiresAt?: Date | string;
};

type SourceRow = { authorId?: unknown; type?: unknown; createdAt?: unknown; expiresAt?: unknown };

const asDate = (value: unknown): Date | string | undefined =>
  value instanceof Date || typeof value === 'string' ? value : undefined;

/**
 * Relit la source telle que l'ACTEUR la voit — le viewer est requis : sans
 * lui, le filtre anonyme ne retrouve pas une story réservée aux contacts, et
 * son auteur n'était jamais prévenu. Rend `null` sans auteur lisible.
 */
export async function readRepostedSource(
  readPost: (postId: string, viewerUserId: string) => Promise<unknown>,
  sourcePostId: string,
  actorId: string,
): Promise<RepostedSource | null> {
  const row = (await readPost(sourcePostId, actorId)) as SourceRow | null | undefined;
  if (!row || typeof row.authorId !== 'string') return null;
  const createdAt = asDate(row.createdAt);
  const expiresAt = asDate(row.expiresAt);
  return {
    authorId: row.authorId,
    ...(typeof row.type === 'string' && REPOSTED_KINDS.has(row.type) ? { type: row.type as RepostedKind } : {}),
    ...(createdAt !== undefined ? { createdAt } : {}),
    ...(expiresAt !== undefined ? { expiresAt } : {}),
  };
}

/** L'auteur à prévenir — jamais soi-même (republier son propre contenu). */
export function repostedAuthorToNotify(source: RepostedSource | null, actorId: string): string | null {
  return source !== null && source.authorId !== actorId ? source.authorId : null;
}

export async function notifyRepostedAuthor(
  notifier: Pick<NotificationService, 'createPostRepostNotification'> | null | undefined,
  params: { readonly actorId: string; readonly source: RepostedSource | null; readonly sourcePostId: string; readonly repostId: string },
): Promise<void> {
  const authorId = repostedAuthorToNotify(params.source, params.actorId);
  if (!notifier || authorId === null || params.source === null) return;
  await notifier.createPostRepostNotification({
    actorId: params.actorId,
    originalPostId: params.sourcePostId,
    postAuthorId: authorId,
    repostId: params.repostId,
    postType: params.source.type,
    postCreatedAt: params.source.createdAt,
    postExpiresAt: params.source.expiresAt,
  });
}
