/**
 * Un Prisma en mémoire pour la PORTÉE d'un post (#10483) : posts et leurs
 * compteurs (loi MongoDB du `$add`, via `mongo-post-counter-store`), lignes
 * `AnonymousPostOpen` (unicité `(postId, sessionKey)` → P2002), `PostView`,
 * `PostImpression`, invités (`Participant.sessionTokenHash`).
 *
 * Chaque écriture est JOURNALISÉE en entier (`writes`) : les témoins de
 * confidentialité y cherchent ce qui ne doit jamais être écrit — une valeur
 * brute de X-Session-Token, une empreinte d'adresse.
 */
import { jest } from '@jest/globals';
import { hashSessionToken } from '../../utils/session-token';
import { makeMongoPostCounterStore, type StoredPost } from './mongo-post-counter-store';

export type ReachPost = {
  readonly id: string;
  readonly authorId?: string;
  readonly type?: string;
  readonly visibility?: string;
  readonly deletedAt?: Date | null;
  readonly expiresAt?: Date | null;
  readonly repostOfId?: string | null;
  readonly originalRepostOfId?: string | null;
  readonly author?: { isActive: boolean; deletedAt: Date | null; deactivatedAt: Date | null };
} & Record<string, unknown>;

export type ReachGuest = { readonly id: string; readonly sessionTokens: readonly string[] };

type Open = { postId: string; sessionKey: string; durationMs?: number; expiresAt?: Date };

const ACTIVE_AUTHOR = { isActive: true, deletedAt: null, deactivatedAt: null };

export function makeReachPrisma(posts: readonly ReachPost[], guests: readonly ReachGuest[] = []) {
  const store = makeMongoPostCounterStore(posts.map((post) => ({
    authorId: 'author',
    visibility: 'PUBLIC',
    deletedAt: null,
    expiresAt: null,
    repostOfId: null,
    originalRepostOfId: null,
    type: 'POST',
    ...post,
  }) as StoredPost));
  const writes: unknown[] = [];
  const opens: Open[] = [];
  const postViews: { postId: string; userId: string; duration?: number }[] = [];
  const impressions: Record<string, unknown>[] = [];

  const record = (model: string, op: string, args: unknown) => writes.push({ model, op, args });
  const row = (id: string) => store.read(id) as (Record<string, unknown> & { id: string }) | undefined;

  const project = (post: Record<string, unknown> & { id: string }) => {
    const parent = typeof post.repostOfId === 'string' ? row(post.repostOfId) : undefined;
    return {
      ...post,
      visibilityUserIds: [] as string[],
      author: (post.author as object | undefined) ?? ACTIVE_AUTHOR,
      repostOf: parent
        ? { visibility: parent.visibility, deletedAt: parent.deletedAt ?? null, expiresAt: parent.expiresAt ?? null }
        : null,
    };
  };

  const prisma = {
    post: {
      findMany: jest.fn(async ({ where }: { where: { id?: { in?: string[] }; repostOfId?: unknown } }) => {
        const ids = where.id?.in ?? [];
        const alive = ids.map(row).filter((p): p is Record<string, unknown> & { id: string } =>
          p !== undefined && (p.deletedAt === null || p.deletedAt === undefined));
        if (where.repostOfId !== undefined) return alive.filter((p) => p.repostOfId !== null && p.repostOfId !== undefined);
        return alive.map(project);
      }),
      findFirst: jest.fn(async ({ where }: { where: { id: string } }) => {
        const post = row(where.id);
        return post ? project(post) : null;
      }),
      update: store.update,
      updateMany: store.updateMany,
    },
    anonymousPostOpen: {
      create: jest.fn(async ({ data }: { data: Open }) => {
        record('anonymousPostOpen', 'create', data);
        if (opens.some((o) => o.postId === data.postId && o.sessionKey === data.sessionKey)) {
          throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
        }
        opens.push({ ...data });
        return data;
      }),
      updateMany: jest.fn(async (args: { where: { postId: string; sessionKey: string }; data: { durationMs: number } }) => {
        record('anonymousPostOpen', 'updateMany', args);
        const target = opens.find((o) => o.postId === args.where.postId && o.sessionKey === args.where.sessionKey);
        if (!target || (target.durationMs !== undefined && target.durationMs >= args.data.durationMs)) return { count: 0 };
        target.durationMs = args.data.durationMs;
        return { count: 1 };
      }),
    },
    postView: {
      findUnique: jest.fn(async ({ where }: { where: { postId_userId: { postId: string; userId: string } } }) =>
        postViews.find((v) => v.postId === where.postId_userId.postId && v.userId === where.postId_userId.userId) ?? null),
      create: jest.fn(async ({ data }: { data: { postId: string; userId: string; duration?: number } }) => {
        record('postView', 'create', data);
        postViews.push(data);
        return data;
      }),
      update: jest.fn(async (args: unknown) => { record('postView', 'update', args); return {}; }),
    },
    postImpression: {
      createMany: jest.fn(async (args: { data: Record<string, unknown>[] }) => {
        record('postImpression', 'createMany', args);
        impressions.push(...args.data);
        return { count: args.data.length };
      }),
    },
    participant: {
      findFirst: jest.fn(async ({ where }: { where: { sessionTokenHash: string } }) => {
        const guest = guests.find((g) => g.sessionTokens.some((t) => hashSessionToken(t) === where.sessionTokenHash));
        return guest ? { id: guest.id } : null;
      }),
    },
    friendRequest: { findFirst: jest.fn(async () => null) },
    postMention: { findFirst: jest.fn(async () => null) },
    $runCommandRaw: jest.fn(async (command: Record<string, unknown>) => {
      record('post', 'runCommandRaw', command);
      return store.runCommandRaw(command);
    }),
  };

  return { prisma, store, writes, opens, postViews, impressions };
}
