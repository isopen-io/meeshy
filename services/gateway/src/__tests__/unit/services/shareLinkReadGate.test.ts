/**
 * `services/shareLinkReadGate.ts` — la PORTE d'un lien de partage échu, extraite
 * du fil pour que toute surface qui lit une conversation la tienne (#7377).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../utils/logger', () => ({ logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() } }));

import { loadExpiredShareLinkConversationIds, shareLinkHasExpired } from '../../../services/shareLinkReadGate';

const NOW = new Date('2026-09-21T12:00:00.000Z');

describe('shareLinkHasExpired — la règle du fil, à l’identique', () => {
  it('ferme sur une expiration passée, sous forme Date comme sous forme chaîne', () => {
    expect(shareLinkHasExpired({ expiresAt: new Date('2026-09-21T11:59:59.000Z') }, NOW)).toBe(true);
    expect(shareLinkHasExpired({ expiresAt: '2026-09-21T11:59:59.000Z' }, NOW)).toBe(true);
  });

  it('laisse ouvert un lien sans expiration, un lien encore valide et un lien introuvable', () => {
    expect(shareLinkHasExpired({ expiresAt: null }, NOW)).toBe(false);
    expect(shareLinkHasExpired({ expiresAt: new Date('2026-09-22T00:00:00.000Z') }, NOW)).toBe(false);
    expect(shareLinkHasExpired(null, NOW)).toBe(false);
  });
});

describe('loadExpiredShareLinkConversationIds — forme ensembliste', () => {
  const participations = [
    { conversationId: 'conv-expired', shareLinkId: 'link-expired' },
    { conversationId: 'conv-valid', shareLinkId: 'link-valid' },
    { conversationId: 'conv-no-link', shareLinkId: null },
  ];

  it('ne ferme que les conversations dont le lien a expiré', async () => {
    const prisma = {
      conversationShareLink: {
        findMany: jest.fn<() => Promise<Array<{ id: string; expiresAt: Date | null }>>>().mockResolvedValue([
          { id: 'link-expired', expiresAt: new Date('2026-09-20T00:00:00.000Z') },
          { id: 'link-valid', expiresAt: new Date('2026-12-31T00:00:00.000Z') },
        ]),
      },
    };

    const closed = await loadExpiredShareLinkConversationIds(prisma as never, participations, NOW);

    expect([...closed]).toEqual(['conv-expired']);
  });

  it('une lecture de liens en PANNE ferme toutes les conversations qu’un lien décide, jamais celles sans lien', async () => {
    const prisma = {
      conversationShareLink: { findMany: jest.fn<() => Promise<never>>().mockRejectedValue(new Error('db down')) },
    };

    const closed = await loadExpiredShareLinkConversationIds(prisma as never, participations, NOW);

    expect([...closed].sort()).toEqual(['conv-expired', 'conv-valid']);
  });

  it('ne lit rien quand aucune participation ne vient d’un lien', async () => {
    const findMany = jest.fn();
    const closed = await loadExpiredShareLinkConversationIds(
      { conversationShareLink: { findMany } } as never,
      [{ conversationId: 'conv-no-link', shareLinkId: null }],
      NOW,
    );

    expect(closed.size).toBe(0);
    expect(findMany).not.toHaveBeenCalled();
  });
});
