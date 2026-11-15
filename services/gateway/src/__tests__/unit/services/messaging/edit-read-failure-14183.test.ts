/** @jest-environment node */
import { describe, it, expect, jest } from '@jest/globals';
import { replaceMessageMentions } from '../../../../services/messaging/messageMentions';

const CONV = '6a00000000000000000000c1';
const ALICE = '507f1f77bcf86cd799439001';

describe('audit #14183 — une lecture en échec de l’expéditeur, à l’ÉDITION', () => {
  it('ne détruit pas les mentions déjà établies (contrat de replaceMessageMentions)', async () => {
    const deleteMany = jest.fn(async (_a: unknown) => ({ count: 1 }));
    const update = jest.fn(async (_a: unknown) => undefined);
    const prisma = {
      mention: { findMany: jest.fn(async () => [{ mentionedUserId: ALICE }]), deleteMany },
      participant: {
        findUnique: jest.fn(async () => { throw new Error('ECONNRESET'); }),
        findMany: jest.fn(async () => []),
      },
      message: { update },
      user: { findMany: jest.fn(async () => [{ id: ALICE, username: 'alice' }]) },
    } as never;
    const result = await replaceMessageMentions({
      prisma,
      mentionService: {
        extractMentionsWithParticipants: () => [],
        resolveUsernames: async () => new Map(),
        validateMentionPermissions: async () => ({ validUserIds: [ALICE] }),
        createMentions: async () => undefined,
      } as never,
      message: { id: 'm1', conversationId: CONV, senderId: 'p-author' },
      content: 'salut @alice',
      explicitMentionedUserIds: [ALICE],
    });
    expect(deleteMany).not.toHaveBeenCalled();
    expect(result.reconciled).toBe(false);
  });
});
