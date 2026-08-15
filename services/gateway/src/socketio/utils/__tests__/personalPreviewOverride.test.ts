import { describe, it, expect, jest } from '@jest/globals';
import { resolvePersonalPreviewOverrides } from '../personalPreviewOverride';

/**
 * `resolvePersonalPreviewOverrides` — l'aperçu poussé, rendu au masquage
 * personnel de chaque lecteur.
 *
 * Les témoins portent sur les deux propriétés qui font le module : la CARTE
 * (qui est dedans, avec quelle valeur) et le COÛT (ce qui n'est pas demandé
 * quand personne ne masque rien).
 */

const LATEST = { id: 'msg-latest', createdAt: new Date('2026-08-01T12:00:00Z') };

function makePrisma(opts: {
  hiddenBy?: Array<{ userId: string; messageId: string }>;
  clearedBy?: Array<{ userId: string; clearHistoryBefore?: Date }>;
  fallback?: unknown;
}) {
  return {
    message: { findFirst: jest.fn(async () => opts.fallback ?? null) },
    userMessageDeletion: { findMany: jest.fn(async () => opts.hiddenBy ?? []) },
    userConversationPreferences: {
      findMany: jest.fn(async () =>
        (opts.clearedBy ?? []).map((row) => ({
          userId: row.userId,
          clearHistoryBefore: row.clearHistoryBefore ?? new Date('2030-01-01T00:00:00Z'),
        })),
      ),
    },
  } as any;
}

const call = (prisma: any, userIds: string[], latest: typeof LATEST | null = LATEST) =>
  resolvePersonalPreviewOverrides<{ id: string }>(prisma, {
    conversationId: 'conv-1',
    latest,
    userIds,
    select: { id: true },
  });

describe('resolvePersonalPreviewOverrides', () => {
  it('rend une carte VIDE quand personne n a masqué l aperçu', async () => {
    const prisma = makePrisma({});
    const out = await call(prisma, ['user-A', 'user-B']);

    expect(out.size).toBe(0);
    // Personne n'est concerné : aucun repli n'est calculé.
    expect(prisma.message.findFirst).not.toHaveBeenCalled();
  });

  it('ne sonde rien quand la conversation n a plus de dernier message', async () => {
    const prisma = makePrisma({ hiddenBy: [{ userId: 'user-A', messageId: 'msg-latest' }] });
    const out = await call(prisma, ['user-A'], null);

    expect(out.size).toBe(0);
    expect(prisma.userMessageDeletion.findMany).not.toHaveBeenCalled();
    expect(prisma.userConversationPreferences.findMany).not.toHaveBeenCalled();
  });

  it('ne sonde rien quand la conversation n a que des participants anonymes', async () => {
    const prisma = makePrisma({});
    const out = await call(prisma, []);

    expect(out.size).toBe(0);
    expect(prisma.userMessageDeletion.findMany).not.toHaveBeenCalled();
  });

  it('rend le dernier message visible du lecteur qui a masqué l aperçu', async () => {
    const prisma = makePrisma({
      hiddenBy: [{ userId: 'user-A', messageId: 'msg-latest' }],
      fallback: { id: 'msg-previous' },
    });
    const out = await call(prisma, ['user-A', 'user-B']);

    expect([...out.keys()]).toEqual(['user-A']);
    expect(out.get('user-A')).toEqual({ id: 'msg-previous' });
    // Le lecteur qui n'a rien masqué reste absent — l'appelant lui sert le global.
    expect(out.has('user-B')).toBe(false);
  });

  it('distingue « aucun message visible » de « rien de masqué » par la présence de la clé', async () => {
    const prisma = makePrisma({
      clearedBy: [{ userId: 'user-A' }],
      fallback: null,
    });
    const out = await call(prisma, ['user-A']);

    expect(out.has('user-A')).toBe(true);
    expect(out.get('user-A')).toBeNull();
  });

  it('ne retient qu un seuil d effacement POSTÉRIEUR au message d aperçu', async () => {
    const prisma = makePrisma({});
    await call(prisma, ['user-A']);

    expect(prisma.userConversationPreferences.findMany.mock.calls[0][0]).toMatchObject({
      where: {
        conversationId: 'conv-1',
        userId: { in: ['user-A'] },
        clearHistoryBefore: { gt: LATEST.createdAt },
      },
    });
  });

  it('interroge la clé unique (userId, messageId), jamais l historique entier du lecteur', async () => {
    const prisma = makePrisma({});
    await call(prisma, ['user-A', 'user-A', 'user-B']);

    expect(prisma.userMessageDeletion.findMany.mock.calls[0][0]).toMatchObject({
      where: { messageId: 'msg-latest', userId: { in: ['user-A', 'user-B'] } },
    });
  });

  it('calcule le repli sous le masquage COMPLET du lecteur, pas sous le seul message sondé', async () => {
    // Le lecteur a masqué les DEUX derniers messages : un repli calculé sur le
    // seul message sondé rendrait le suivant, masqué lui aussi.
    const prisma = makePrisma({
      hiddenBy: [
        { userId: 'user-A', messageId: 'msg-latest' },
        { userId: 'user-A', messageId: 'msg-previous' },
      ],
      fallback: { id: 'msg-older' },
    });
    await call(prisma, ['user-A']);

    const where = prisma.message.findFirst.mock.calls[0][0].where;
    expect(where.id.notIn).toEqual(expect.arrayContaining(['msg-latest', 'msg-previous']));
    expect(where).toMatchObject({ conversationId: 'conv-1', deletedAt: null });
  });

  it('sert l aperçu global — et ne lève pas — quand la sonde échoue', async () => {
    const prisma = {
      message: { findFirst: jest.fn() },
      userMessageDeletion: {
        findMany: jest.fn(async () => {
          throw new Error('mongo down');
        }),
      },
      userConversationPreferences: { findMany: jest.fn(async () => []) },
    } as any;

    const out = await call(prisma, ['user-A']);

    expect(out.size).toBe(0);
    expect(prisma.message.findFirst).not.toHaveBeenCalled();
  });
});
