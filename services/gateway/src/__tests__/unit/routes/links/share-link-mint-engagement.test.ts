/**
 * `social.conversation_link_created` (#8959) — fabriquer un lien de partage
 * paie son auteur, une fois le lien écrit. Un refus (conversation inconnue,
 * non-membre) ne paie rien. Le cœur est partagé par `POST /links` et
 * `POST /conversations/:id/new-link` : le crédit vit donc dans le cœur.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import type { FastifyReply } from 'fastify';

jest.mock('../../../../routes/links/utils/link-helpers', () => ({
  ...(jest.requireActual('../../../../routes/links/utils/link-helpers') as object),
  generateUniqueShareLinkId: jest.fn(async () => 'mshy_TestLnk1'),
  ensureUniqueShareLinkIdentifier: jest.fn(async () => 'mshy_unique'),
}));

import { mintConversationShareLink } from '../../../../routes/links/utils/share-link-mint';
import type { EngagementService } from '../../../../services/engagement/EngagementService';

type RecordActivity = EngagementService['recordActivity'];

const MOI = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439033';

const prismaDouble = () => ({
  conversation: {
    create: jest.fn(async () => ({ id: CONV_ID, title: 'Neuve' })),
    findUnique: jest.fn(async () => null),
    findFirst: jest.fn(async () => null),
  },
  conversationShareLink: {
    create: jest.fn(async (args: { data: Record<string, unknown> }) => ({ id: 'lnk', ...args.data })),
  },
  participant: { findMany: jest.fn(async () => []), findFirst: jest.fn(async () => null) },
  user: { findUnique: jest.fn(async () => ({ displayName: 'Moi', username: 'moi' })) },
});

const replyDouble = (): FastifyReply => {
  const reply = { status: jest.fn(), code: jest.fn(), send: jest.fn() };
  reply.status.mockReturnValue(reply);
  reply.code.mockReturnValue(reply);
  reply.send.mockReturnValue(reply);
  return reply as unknown as FastifyReply;
};

async function mint(input: Record<string, unknown>) {
  const recordActivity = jest.fn<RecordActivity>(async () => undefined);
  const minted = await mintConversationShareLink({
    prisma: prismaDouble() as never,
    reply: replyDouble(),
    log: { error: jest.fn() },
    notificationService: undefined,
    socketIOHandler: undefined,
    userId: MOI,
    userRole: 'USER',
    input: input as never,
    engagement: { recordActivity },
  });
  return { minted, recordActivity };
}

describe('fabrication d’un lien de partage — crédit de l’auteur', () => {
  it('crédite social.conversation_link_created quand le lien est écrit', async () => {
    const { minted, recordActivity } = await mint({ name: 'Lien' });

    expect(minted).not.toBeNull();
    expect(recordActivity).toHaveBeenCalledWith(MOI, 'social.conversation_link_created');
  });

  it('ne crédite rien quand la fabrication est refusée', async () => {
    const { minted, recordActivity } = await mint({ conversationId: 'inconnue' });

    expect(minted).toBeNull();
    expect(recordActivity).not.toHaveBeenCalled();
  });
});
