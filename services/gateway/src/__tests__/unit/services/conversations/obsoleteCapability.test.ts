/**
 * #14690 — la décision groupée : une page qui mêle plusieurs conversations
 * rattache chaque demande en attente et chaque effectif à SA conversation, et
 * une lecture impossible ne fabrique aucune capacité.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import {
  loadObsoleteVerdicts,
  loadViewerCapabilities,
  type ObsoleteViewer,
} from '../../../../services/conversations/obsoleteCapability';

const ALICE = '507f1f77bcf86cd799439c11';
const BOB = '507f1f77bcf86cd799439c22';
const PENDING = '507f1f77bcf86cd799439d01';
const ACCEPTED = '507f1f77bcf86cd799439d02';
const CROWDED = '507f1f77bcf86cd799439d03';
const GROUP = '507f1f77bcf86cd799439d04';

const alice: ObsoleteViewer = { userId: ALICE, isAnonymous: false, hasRegisteredUser: true, platformRole: 'USER' };

const membership = (conversationId: string, type: string, role = 'creator') => ({
  conversationId, userId: ALICE, role, type: 'user', leftAt: null, bannedAt: null,
  conversation: { type, identifier: `mshy_${conversationId.slice(-2)}` },
});

const pageDouble = () => ({
  participant: {
    findMany: jest.fn<any>(async (args: any) => {
      if (args.where.OR) return [{ conversationId: PENDING, userId: BOB }, { conversationId: ACCEPTED, userId: ALICE }];
      return [
        membership(PENDING, 'direct'),
        membership(ACCEPTED, 'direct', 'member'),
        membership(CROWDED, 'direct', 'member'),
        membership(GROUP, 'group', 'member'),
      ];
    }),
    groupBy: jest.fn<any>().mockResolvedValue([
      { conversationId: PENDING, _count: { _all: 2 } },
      { conversationId: ACCEPTED, _count: { _all: 2 } },
      { conversationId: CROWDED, _count: { _all: 3 } },
    ]),
  },
});

describe('loadObsoleteVerdicts — une page de plusieurs conversations', () => {
  it('chaque demande et chaque effectif restent à leur conversation', async () => {
    const prisma = pageDouble();
    const verdictOf = await loadObsoleteVerdicts(prisma as never, { viewers: [alice], conversationIds: [PENDING, ACCEPTED, CROWDED, GROUP] });
    expect(verdictOf(ALICE, PENDING)).toBe('pending-request-sender');
    expect(verdictOf(ALICE, ACCEPTED)).toBe('allowed');
    expect(verdictOf(ALICE, CROWDED)).toBe('forbidden');
    expect(verdictOf(ALICE, GROUP)).toBe('forbidden');
  });

  it('trois lectures au plus pour toute la page, et seulement les directes pour la demande et l’effectif', async () => {
    const prisma = pageDouble();
    await loadObsoleteVerdicts(prisma as never, { viewers: [alice], conversationIds: [PENDING, ACCEPTED, CROWDED, GROUP] });
    expect(prisma.participant.findMany).toHaveBeenCalledTimes(2);
    expect(prisma.participant.groupBy).toHaveBeenCalledTimes(1);
    expect((prisma.participant.groupBy.mock.calls[0][0] as any).where.conversationId.in.sort()).toEqual([PENDING, ACCEPTED, CROWDED].sort());
  });

  it('des participations déjà lues évitent la lecture de membership', async () => {
    const prisma = pageDouble();
    const verdictOf = await loadObsoleteVerdicts(prisma as never, {
      viewers: [alice],
      conversationIds: [GROUP],
      memberships: [membership(GROUP, 'group', 'admin')],
    });
    expect(verdictOf(ALICE, GROUP)).toBe('allowed');
    expect(prisma.participant.findMany).not.toHaveBeenCalled();
  });

  it('un lecteur anonyme ne lit rien et ne peut rien', async () => {
    const prisma = pageDouble();
    const guest: ObsoleteViewer = { userId: 'session-token', isAnonymous: true, hasRegisteredUser: false };
    const verdictOf = await loadObsoleteVerdicts(prisma as never, { viewers: [guest], conversationIds: [GROUP] });
    expect(verdictOf('session-token', GROUP)).toBe('forbidden');
    expect(prisma.participant.findMany).not.toHaveBeenCalled();
  });

  it('la conversation globale est protégée, même pour son administrateur', async () => {
    const prisma = { participant: { findMany: jest.fn<any>().mockResolvedValue([{ ...membership(GROUP, 'global', 'creator') }]), groupBy: jest.fn<any>() } };
    const verdictOf = await loadObsoleteVerdicts(prisma as never, { viewers: [{ ...alice, platformRole: 'BIGBOSS' }], conversationIds: [GROUP] });
    expect(verdictOf(ALICE, GROUP)).toBe('protected');
  });
});

describe('loadViewerCapabilities — une lecture impossible', () => {
  it('ne sert aucune capacité et signale l’erreur', async () => {
    const onError = jest.fn();
    const prisma = { participant: { findMany: jest.fn<any>().mockRejectedValue(new Error('mongo down')), groupBy: jest.fn<any>() } };
    const capabilitiesOf = await loadViewerCapabilities(prisma as never, { viewers: [alice], conversationIds: [GROUP], onError });
    expect(capabilitiesOf(ALICE, GROUP)).toBeUndefined();
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
