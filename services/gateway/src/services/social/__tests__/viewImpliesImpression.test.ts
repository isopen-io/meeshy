/**
 * @jest-environment node
 *
 * #10732 — une vue implique son impression. `recordView` la déduit pour une
 * vue SANS clé qu'il vient de COMPTER : jamais pour un post hors audience ou
 * supprimé (la lecture filtrée ne le rend pas), jamais pour l'auteur, jamais
 * quand le lecteur a déjà une impression du post.
 */
import { describe, it, expect, jest } from '@jest/globals';
import { recordView } from '../../posts/postReach';
import { postCounterWritesOf } from '../../../__tests__/helpers/posts-counter-writes';

const POST = '507f1f77bcf86cd799439022';
const READER = '507f1f77bcf86cd799439011';
const AUTHOR = '507f1f77bcf86cd7994390aa';

const buildDeps = (opts: { visible?: boolean; authorId?: string; alreadyShown?: boolean } = {}) => {
  const { visible = true, authorId = AUTHOR, alreadyShown = false } = opts;
  const row = { id: POST, authorId, repostOfId: null, originalRepostOfId: null, type: 'STORY', expiresAt: null };
  const prisma = {
    // La lecture FILTRÉE (audience + non supprimé) et la relecture sans filtre
    // (référence) : un post invisible ou supprimé ne sort d'aucune des deux.
    post: { findFirst: jest.fn(async () => (visible ? row : null)) },
    postMention: { findUnique: jest.fn(async () => null) },
    postView: {
      findUnique: jest.fn(async () => null),
      create: jest.fn(async () => ({})),
      update: jest.fn(async () => ({})),
    },
    postImpression: {
      findFirst: jest.fn(async () => (alreadyShown ? { id: 'deja-la' } : null)),
      createMany: jest.fn(async (_args: { data: unknown[] }) => ({ count: 1 })),
    },
    $runCommandRaw: jest.fn(async (_command: Record<string, unknown>) => ({ ok: 1 })),
  };
  return { prisma, deps: { prisma: prisma as never, visibilityFilter: async () => ({}) } };
};

const impressionCredits = (prisma: ReturnType<typeof buildDeps>['prisma']) =>
  postCounterWritesOf(prisma.$runCommandRaw).filter((write) => 'impressionCount' in write.data);

describe('recordView — la vue sans clé implique son impression (#10732)', () => {
  it('un lecteur sans impression du post en reçoit une, déduite, et le compteur monte d’un', async () => {
    const { prisma, deps } = buildDeps();
    await recordView(deps, POST, READER, undefined, { surface: 'story', impliesImpression: true });

    expect(prisma.postImpression.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ postId: POST, userId: READER, source: 'view', surface: 'story' })],
    });
    expect(impressionCredits(prisma).map((w) => [w.ids, w.data])).toEqual([[[POST], { impressionCount: { increment: 1 } }]]);
  });

  it('un lecteur qui a déjà une impression du post n’en reçoit pas d’autre', async () => {
    const { prisma, deps } = buildDeps({ alreadyShown: true });
    await recordView(deps, POST, READER, undefined, { impliesImpression: true });
    expect(prisma.postImpression.createMany).not.toHaveBeenCalled();
    expect(impressionCredits(prisma)).toEqual([]);
  });

  it('un post invisible ou supprimé pour ce lecteur ne déduit aucune impression', async () => {
    const { prisma, deps } = buildDeps({ visible: false });
    await recordView(deps, POST, READER, undefined, { impliesImpression: true });
    expect(prisma.postImpression.findFirst).not.toHaveBeenCalled();
    expect(prisma.postImpression.createMany).not.toHaveBeenCalled();
    expect(impressionCredits(prisma)).toEqual([]);
  });

  it('l’auteur qui regarde son propre post ne déduit aucune impression', async () => {
    const { prisma, deps } = buildDeps({ authorId: READER });
    await recordView(deps, POST, READER, undefined, { impliesImpression: true });
    expect(prisma.postImpression.createMany).not.toHaveBeenCalled();
  });

  it('sans la demande (vue qui porte sa clé, ou impression dans le même lot), rien n’est déduit', async () => {
    const { prisma, deps } = buildDeps();
    await recordView(deps, POST, READER, undefined, { impliesImpression: false });
    expect(prisma.postImpression.findFirst).not.toHaveBeenCalled();
  });
});
