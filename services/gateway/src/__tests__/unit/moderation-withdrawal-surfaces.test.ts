/**
 * @jest-environment node
 *
 * #10315 — ce qu'une publication mise en privé ou hors ligne par la modération ne
 * sert plus, et ce que son auteur ne rouvre plus, même en COURSE avec le geste :
 *
 * - l'écriture d'une édition d'audience porte la condition « pas hors ligne » dans
 *   la MÊME requête (revue de sécurité : lire-puis-écrire laissait passer un PUT
 *   lancé pendant la mise hors ligne) ;
 * - l'original imbriqué d'une republication ne voyage plus ;
 * - une citation de la publication dans un message se dit retirée.
 */
import { describe, it, expect, jest } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { PostService } from '../../services/PostService';
import { MediaService } from '../../services/MediaService';
import { withMentions } from '../../services/posts/postReferences';
import { citedPostWithdrawnAt } from '../../services/messaging/servedPostReply';

jest.mock('../../services/posts/PostAudioService', () => ({
  PostAudioService: { shared: { processPostAudio: jest.fn().mockReturnValue(Promise.resolve()) }, init: jest.fn() },
}));

function prismaFor(existing: Record<string, unknown>) {
  const prisma = {
    post: {
      findFirst: jest.fn<any>().mockResolvedValue(existing),
      update: jest.fn<any>(async (args: { data: Record<string, unknown> }) => ({ ...existing, ...args.data })),
    },
    postMedia: {
      updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
      findFirst: jest.fn<any>().mockResolvedValue(null),
      findMany: jest.fn<any>().mockResolvedValue([]),
      deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
    sound: { findMany: jest.fn<any>().mockResolvedValue([]) },
    postView: { deleteMany: jest.fn<any>() },
    postReaction: { deleteMany: jest.fn<any>() },
    postImpression: { deleteMany: jest.fn<any>() },
    $transaction: jest.fn<any>(),
  };
  prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma));
  return prisma;
}

const existing = { id: 'post-1', authorId: 'user-1', type: 'POST', visibility: 'PRIVATE', repostOfId: null, content: 'x', metadata: null, originalLanguage: 'fr', storyEffects: null, allowSoundExtraction: false, media: [] };

describe("l'édition d'audience porte sa condition dans l'écriture", () => {
  it("rouvrir l'audience n'écrit que sur une publication qui n'est pas hors ligne", async () => {
    const prisma = prismaFor(existing);
    await new PostService(prisma as unknown as PrismaClient, new MediaService()).updatePost('post-1', 'user-1', { visibility: 'PUBLIC' });
    expect((prisma.post.update.mock.calls[0]?.[0] as any).where).toEqual({
      id: 'post-1',
      OR: [{ moderationHiddenAt: null }, { moderationHiddenAt: { isSet: false } }],
    });
  });

  it("une édition qui ne rouvre rien n'ajoute aucune condition", async () => {
    const prisma = prismaFor(existing);
    await new PostService(prisma as unknown as PrismaClient, new MediaService()).updatePost('post-1', 'user-1', { content: 'y' });
    expect((prisma.post.update.mock.calls[0]?.[0] as any).where).toEqual({ id: 'post-1' });
  });
});

describe("l'original d'une republication", () => {
  const repost = (original: Record<string, unknown>) => ({ id: 'r-1', postMentions: [] as unknown[], repostOf: { id: 'o-1', content: 'secret', ...original } });

  it('ne voyage plus quand il est hors ligne', () => {
    expect(withMentions(repost({ visibility: 'PRIVATE', moderationHiddenAt: new Date() })).repostOf).toBeNull();
  });

  it('ne voyage plus quand il est privé', () => {
    expect(withMentions(repost({ visibility: 'PRIVATE', moderationHiddenAt: null })).repostOf).toBeNull();
  });

  it('voyage sinon, sans ses deux colonnes de décision', () => {
    const served = withMentions(repost({ visibility: 'PUBLIC', moderationHiddenAt: null })).repostOf as Record<string, unknown>;
    expect(served.content).toBe('secret');
    expect('visibility' in served).toBe(false);
    expect('moderationHiddenAt' in served).toBe(false);
  });
});

describe('la citation dans un message', () => {
  it('se dit retirée tant que la publication est hors ligne', () => {
    const at = new Date('2026-10-11T00:00:00Z');
    expect(citedPostWithdrawnAt({ id: 'o-1', moderationHiddenAt: at, deletedAt: null, expiresAt: null })).toEqual(at);
    expect(citedPostWithdrawnAt({ id: 'o-1', moderationHiddenAt: null, deletedAt: null, expiresAt: null })).toBeNull();
  });
});
