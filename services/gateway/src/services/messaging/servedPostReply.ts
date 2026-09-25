import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { isValidMongoId } from '@meeshy/shared/utils/conversation-helpers';
import {
  buildPostReplyTo,
  normalizePostReplyTo,
  postReplyToFromMetadata,
  POST_REPLY_SNAPSHOT_SELECT,
  type PostReplyTo,
} from './postReplySnapshot';

/**
 * CE QU'UNE CITATION DE STORY A LE DROIT DE TRANSPORTER — site UNIQUE (#7950).
 *
 * `metadata.postReplyTo` est un instantané FIGÉ à la réponse (aperçu, vignette,
 * emoji, compteurs). Il existe pour survivre à l'EXPIRATION d'une story : c'est
 * sa fonctionnalité, et elle reste. Il ne doit pas survivre à son RETRAIT par
 * l'auteur — la passerelle servait encore la vignette d'une story supprimée à
 * tous les membres de la conversation, et les clients rendaient la carte pleine
 * et tapable.
 *
 * RETIRÉE = la ligne `Post` porte `deletedAt`, posé AVANT son échéance (ou sans
 * échéance). La date seule ne suffit pas : le balayage des STATUS
 * (`ExpiredStoriesCleanupService`) masque aussi par `deletedAt`, mais toujours
 * APRÈS `expiresAt` — ce masquage-là est une expiration, pas un retrait. Une
 * ligne INTROUVABLE n'est pas prouvée retirée : les seuls effacements physiques
 * sont ceux du balayage d'échéance ; l'instantané reste.
 *
 * Retirée ⇒ la citation garde ce qui la situe (`id`, `type`, auteur, date de
 * publication) et perd TOUT ce qui décrit le contenu (aperçu, vignette, emoji,
 * compteurs) ; `deletedAt` dit au client de rendre « Story indisponible ». Même
 * nom que `replyTo.deletedAt` (#7927 / #7941), déclaré au schéma partagé
 * (`packages/shared/types/api-schemas/message.ts`).
 *
 * La réécriture porte sur la racine `postReplyTo` ET sur `metadata.postReplyTo`
 * — `metadata` est servi en `additionalProperties: true`, retirer la racine
 * seule laissait la vignette partir à côté —, et descend dans `replyTo` et
 * `forwardedFrom`, qui chargent aussi `metadata`. UNE requête par page.
 */

export type CitedPostPrisma = Pick<PrismaClient, 'post'>;

export type CitedPostLiveness = {
  readonly id: string;
  readonly type?: string | null;
  readonly createdAt?: Date | null;
  readonly deletedAt?: Date | null;
  readonly expiresAt?: Date | null;
};

export type ServedPostReplyTo = PostReplyTo & { readonly deletedAt?: string };

type Withdrawal = { readonly at: Date; readonly post: CitedPostLiveness };
export type WithdrawnCitations = ReadonlyMap<string, Withdrawal>;

const NESTED_MESSAGE_KEYS = ['replyTo', 'forwardedFrom'] as const;

export const CITED_POST_LIVENESS_SELECT = Object.freeze({
  id: true,
  type: true,
  createdAt: true,
  deletedAt: true,
  expiresAt: true,
});

export function citedPostWithdrawnAt(post: CitedPostLiveness | null | undefined): Date | null {
  const deletedAt = post?.deletedAt ?? null;
  if (!deletedAt) return null;
  const expiresAt = post?.expiresAt ?? null;
  if (expiresAt && deletedAt.getTime() >= expiresAt.getTime()) return null;
  return deletedAt;
}

function withdrawnPostReplyTo(snapshot: PostReplyTo, at: Date): ServedPostReplyTo {
  return {
    ...snapshot,
    moodEmoji: null,
    previewText: '',
    thumbnailUrl: null,
    reactionCount: 0,
    commentCount: 0,
    shareCount: 0,
    deletedAt: at.toISOString(),
  };
}

function minimalSnapshot(id: string, post: CitedPostLiveness): PostReplyTo {
  return {
    id,
    type: post.type ?? 'STORY',
    moodEmoji: null,
    previewText: '',
    thumbnailUrl: null,
    reactionCount: 0,
    commentCount: 0,
    shareCount: 0,
    createdAt: (post.createdAt ?? new Date(0)).toISOString(),
    authorId: null,
    authorName: '',
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function metadataSnapshotOf(row: Record<string, unknown>): PostReplyTo | null {
  const metadata = row['metadata'];
  return isRecord(metadata) ? normalizePostReplyTo(metadata['postReplyTo']) : null;
}

function citedPostIdOf(row: Record<string, unknown>): string | null {
  const direct = row['storyReplyToId'];
  if (typeof direct === 'string' && direct.length > 0) return direct;
  return normalizePostReplyTo(row['postReplyTo'])?.id ?? metadataSnapshotOf(row)?.id ?? null;
}

function collectCitedPostIds(row: unknown): readonly string[] {
  if (!isRecord(row)) return [];
  const own = citedPostIdOf(row);
  const nested = NESTED_MESSAGE_KEYS.flatMap((key) => collectCitedPostIds(row[key]));
  return own ? [own, ...nested] : nested;
}

export function citedPostIdsOf(rows: readonly unknown[]): readonly string[] {
  return [...new Set(rows.flatMap(collectCitedPostIds))].filter(isValidMongoId);
}

export function withdrawnCitationsOf(posts: readonly CitedPostLiveness[]): WithdrawnCitations {
  return new Map(
    posts.flatMap((post) => {
      const at = citedPostWithdrawnAt(post);
      return at ? [[post.id, { at, post }] as const] : [];
    }),
  );
}

export async function loadWithdrawnCitations(
  prisma: CitedPostPrisma,
  rows: readonly unknown[],
): Promise<WithdrawnCitations> {
  const ids = citedPostIdsOf(rows);
  if (ids.length === 0) return new Map();
  const posts = await prisma.post.findMany({
    where: { id: { in: [...ids] } },
    select: CITED_POST_LIVENESS_SELECT,
  });
  return withdrawnCitationsOf(posts);
}

function withNestedServed<T extends Record<string, unknown>>(row: T, withdrawn: WithdrawnCitations): T {
  return NESTED_MESSAGE_KEYS.reduce<T>((acc, key) => {
    const nested = acc[key];
    return isRecord(nested) ? { ...acc, [key]: servePostReplyCitation(nested, withdrawn) } : acc;
  }, row);
}

export function servePostReplyCitation<T>(row: T, withdrawn: WithdrawnCitations): T {
  if (!isRecord(row) || withdrawn.size === 0) return row;
  const served = withNestedServed(row, withdrawn);
  const id = citedPostIdOf(served);
  const withdrawal = id ? withdrawn.get(id) : undefined;
  if (!id || !withdrawal) return served as T;

  const snapshot = normalizePostReplyTo(served['postReplyTo']) ?? metadataSnapshotOf(served) ?? minimalSnapshot(id, withdrawal.post);
  const redacted = withdrawnPostReplyTo(snapshot, withdrawal.at);
  const metadata = served['metadata'];
  const servesRoot = 'postReplyTo' in served || typeof served['storyReplyToId'] === 'string';

  return {
    ...served,
    ...(servesRoot ? { postReplyTo: redacted } : {}),
    ...(isRecord(metadata) && 'postReplyTo' in metadata ? { metadata: { ...metadata, postReplyTo: redacted } } : {}),
  } as T;
}

export async function servePostReplyCitations<T>(prisma: CitedPostPrisma, rows: readonly T[]): Promise<T[]> {
  const withdrawn = await loadWithdrawnCitations(prisma, rows);
  return rows.map((row) => servePostReplyCitation(row, withdrawn));
}

/**
 * UN message NEUF (`message:new`). Il naît d'un envoi que `admitStoryReply`
 * vient d'admettre sur une story VIVANTE : son snapshot se hisse sans relire le
 * post. Seule une réponse legacy, sans snapshot, relit la ligne — et la même
 * loi que la liste l'expurge si la story est retirée. Un échec de lecture ne
 * gate pas la délivrance.
 */
export async function serveNewMessagePostReply(
  prisma: CitedPostPrisma,
  message: { readonly storyReplyToId?: string | null; readonly metadata?: unknown },
): Promise<{ postReplyTo?: ServedPostReplyTo }> {
  const storyReplyToId = message.storyReplyToId;
  if (!storyReplyToId) return {};
  const fromSnapshot = postReplyToFromMetadata(message.metadata);
  if (fromSnapshot) return { postReplyTo: fromSnapshot };
  const post = await prisma.post.findUnique({
    where: { id: storyReplyToId },
    select: { ...POST_REPLY_SNAPSHOT_SELECT, ...CITED_POST_LIVENESS_SELECT },
  }).catch(() => null);
  if (!post) return {};
  const served = servePostReplyCitation(
    { storyReplyToId, postReplyTo: buildPostReplyTo(post) },
    withdrawnCitationsOf([post]),
  );
  return { postReplyTo: served.postReplyTo };
}
