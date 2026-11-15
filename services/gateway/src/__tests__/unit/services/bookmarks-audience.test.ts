/**
 * Les favoris ne servent que les publications que le lecteur peut ENCORE lire (#17182).
 *
 * Un favori est posé une fois ; l'audience d'une publication, elle, bouge : on
 * quitte une communauté privée, un ami est retiré, une publication passe en
 * PRIVATE, un blocage tombe. `getBookmarks` relit donc la loi d'audience des
 * listes (`buildFeedVisibilityFilter`) dans la REQUÊTE des favoris — jamais
 * après coup, sans quoi une page pourrait sortir courte ou vide.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { PostFeedService } from '../../../services/PostFeedService';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { encodeCursor } from '../../../routes/posts/types';

const VIEWER = '507f1f77bcf86cd799439011';
const READABLE_COMMUNITY = '507f1f77bcf86cd7994390aa';
const BLOCKED_AUTHOR = '507f1f77bcf86cd7994390bb';

type Overrides = Record<string, Record<string, (...args: unknown[]) => unknown>>;

function makePrisma(overrides: Overrides = {}) {
  const bookmarkFindMany = jest.fn(async () => [] as unknown[]);
  const models = new Map<string, Record<string, unknown>>();
  const model = (name: string) => {
    if (!models.has(name)) {
      const base: Record<string, unknown> = {
        findMany: jest.fn(async () => []),
        findUnique: jest.fn(async () => null),
        findFirst: jest.fn(async () => null),
        count: jest.fn(async () => 0),
        groupBy: jest.fn(async () => []),
      };
      if (name === 'postBookmark') base.findMany = bookmarkFindMany;
      models.set(name, { ...base, ...(overrides[name] ?? {}) });
    }
    return models.get(name);
  };
  const prisma = new Proxy({}, { get: (_t, prop: string) => model(prop) }) as unknown as PrismaClient;
  return { prisma, bookmarkFindMany };
}

function bookmarkQuery(bookmarkFindMany: jest.Mock): { where: Record<string, unknown> } {
  return bookmarkFindMany.mock.calls[0][0] as { where: Record<string, unknown> };
}

function collectBranches(node: unknown, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(node)) {
    node.forEach((n) => collectBranches(n, out));
    return out;
  }
  if (node && typeof node === 'object') {
    out.push(node as Record<string, unknown>);
    Object.values(node as Record<string, unknown>).forEach((v) => collectBranches(v, out));
  }
  return out;
}

describe('PostFeedService.getBookmarks — audience du lecteur', () => {
  it('borne la requête des favoris par la loi d\'audience des listes', async () => {
    const { prisma, bookmarkFindMany } = makePrisma();

    await new PostFeedService(prisma).getBookmarks(VIEWER);

    const { where } = bookmarkQuery(bookmarkFindMany);
    expect(where.userId).toBe(VIEWER);
    const branches = collectBranches(where.post);
    expect(branches).toContainEqual({ authorId: VIEWER });
    expect(branches).toContainEqual({ visibility: 'PUBLIC' });
  });

  it('une publication COMMUNITY ne sort que des communautés que le lecteur peut lire', async () => {
    const { prisma, bookmarkFindMany } = makePrisma({
      community: { findMany: jest.fn(async () => [{ id: READABLE_COMMUNITY }]) },
    });

    await new PostFeedService(prisma).getBookmarks(VIEWER);

    const branches = collectBranches(bookmarkQuery(bookmarkFindMany).where.post);
    expect(branches).toContainEqual({ visibility: 'COMMUNITY', communityId: { in: [READABLE_COMMUNITY] } });
  });

  it('une publication d\'un auteur séparé par un blocage ne sort plus', async () => {
    const { prisma, bookmarkFindMany } = makePrisma({
      user: {
        findMany: jest.fn(async () => [{ id: BLOCKED_AUTHOR }]),
        findUnique: jest.fn(async () => ({ blockedUserIds: [] })),
      },
    });

    await new PostFeedService(prisma).getBookmarks(VIEWER);

    const branches = collectBranches(bookmarkQuery(bookmarkFindMany).where.post);
    expect(branches).toContainEqual({ authorId: { notIn: [BLOCKED_AUTHOR] } });
  });

  it('une publication supprimée ne sort pas, et le curseur reste sur la table des favoris', async () => {
    const { prisma, bookmarkFindMany } = makePrisma();
    const cursor = encodeCursor(new Date('2026-11-01T00:00:00.000Z'), '507f1f77bcf86cd799439022');

    await new PostFeedService(prisma).getBookmarks(VIEWER, cursor);

    const { where } = bookmarkQuery(bookmarkFindMany);
    expect(collectBranches(where.post)).toContainEqual(expect.objectContaining({ deletedAt: { isSet: false } }));
    expect(where.OR).toBeDefined();
  });
});
