/**
 * #17022 — une séance « ensemble » s'arrête dans le geste qui ferme sa porte, pas au geste
 * suivant : chaque site UNIQUE qui ferme une porte demande la coupure de ce qu'il ferme.
 * - la fin d'une appartenance (départ, bannissement, retrait) : les séances du partant ;
 * - le retrait d'un message audio ou vidéo : les séances de sa conversation ;
 * - la désactivation ou la suppression d'un compte : ses séances.
 * Ce que la coupure rejuge et émet est prouvé par `togetherRelay.test.ts`.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const cutTogetherWhere = jest.fn(async (_scope: unknown) => undefined);
jest.mock('../../../../services/together/togetherDeps', () => ({
  ...(jest.requireActual('../../../../services/together/togetherDeps') as object),
  cutTogetherWhere: (scope: unknown) => cutTogetherWhere(scope),
}));
jest.mock('../../../../services/ConversationMessageStatsService', () => ({
  ...(jest.requireActual('../../../../services/ConversationMessageStatsService') as object),
  conversationMessageStatsService: { onMessageDeleted: jest.fn(async () => undefined) },
}));

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { applyMessageRemovalEffects } from '../../../../services/messaging/messageRemovalEffects';
import { endConversationMembership } from '../../../../socketio/endConversationMembership';
import { UserManagementService } from '../../../../services/admin/user-management.service';
import { makeUser } from '../admin/user-management-mocks';

const MESSAGE = '507f1f77bcf86cd799439011';
const CONVERSATION = '507f1f77bcf86cd799439022';
const USER = '507f1f77bcf86cd799439033';

const removalPrisma = () =>
  ({
    message: { findRaw: async () => [], findFirst: async () => null },
    conversation: { findUnique: async () => null, updateMany: async () => ({ count: 0 }) },
    trackingLink: { updateMany: async () => ({ count: 0 }) },
    notification: { findMany: async () => [], deleteMany: async () => ({ count: 0 }) },
    sharedTranslation: { deleteMany: async () => ({ count: 0 }) },
  }) as never;

const removed = (attachmentMimeTypes: readonly string[]) => ({
  id: MESSAGE,
  conversationId: CONVERSATION,
  senderId: 'p-1',
  senderUserId: null,
  messageType: 'text',
  attachmentMimeTypes: [...attachmentMimeTypes],
});

const userPrisma = () => ({ user: { update: async () => makeUser({ id: USER }) } }) as unknown as PrismaClient;

beforeEach(() => cutTogetherWhere.mockClear());

describe('le retrait d\'un message', () => {
  it.each([['une vidéo', 'video/mp4'], ['un audio', 'audio/aac']])('portant %s coupe les séances de sa conversation', async (_cas, mime) => {
    await applyMessageRemovalEffects(removalPrisma(), removed(['image/jpeg', mime]), undefined, { deliveryQueue: { purgeMessage: async () => 0 } });
    expect(cutTogetherWhere).toHaveBeenCalledWith({ conversationId: CONVERSATION });
  });

  it('sans pièce audio ni vidéo ne rejuge rien', async () => {
    await applyMessageRemovalEffects(removalPrisma(), removed(['image/jpeg']), undefined, { deliveryQueue: { purgeMessage: async () => 0 } });
    expect(cutTogetherWhere).not.toHaveBeenCalled();
  });
});

describe('la fin d\'une appartenance', () => {
  it('coupe les séances du partant, même sans socket ni gestionnaire', async () => {
    await endConversationMembership({ io: null, manager: null, conversationId: CONVERSATION, userId: USER });
    expect(cutTogetherWhere).toHaveBeenCalledWith({ userId: USER });
  });
});

describe('le compte désactivé ou supprimé par l\'administration', () => {
  it('une désactivation coupe ses séances', async () => {
    await new UserManagementService(userPrisma()).updateStatus(USER, { isActive: false });
    expect(cutTogetherWhere).toHaveBeenCalledWith({ userId: USER });
  });

  it('une réactivation ne rejuge rien', async () => {
    await new UserManagementService(userPrisma()).updateStatus(USER, { isActive: true });
    expect(cutTogetherWhere).not.toHaveBeenCalled();
  });

  it('une suppression coupe ses séances', async () => {
    await new UserManagementService(userPrisma()).deleteUser(USER, 'admin-1');
    expect(cutTogetherWhere).toHaveBeenCalledWith({ userId: USER });
  });
});
