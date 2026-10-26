/**
 * #13142 — dans une conversation chiffrée de bout en bout, les routes EN CLAIR
 * des signaux sont refusées (fail-closed, #9229) : la passerelle ne range ni
 * l'emoji d'une réaction, ni le fait qu'un message a été supprimé, ouvert ou
 * épinglé. Le refus porte un code stable et une phrase lisible pour un client
 * antérieur (#9223). Hors bout en bout, rien ne change.
 */
import { describe, it, expect, jest } from '@jest/globals';
import { E2EE_ERROR_CODES, E2EE_SIGNAL_CHANNEL_REQUIRED_MESSAGE } from '@meeshy/shared/types/e2ee-directory';
import { ReactionService } from '../../../services/ReactionService';
import {
  assertPlainSignalAdmitted,
  E2eeSignalChannelRequiredError,
  isEndToEndConversation,
} from '../../../services/e2ee/e2ee-signal-channel';
import { ConflictError } from '../../../errors/custom-errors';

const MESSAGE_ID = '507f1f77bcf86cd799439011';
const PARTICIPANT_ID = '507f1f77bcf86cd799439012';
const CONVERSATION_ID = '507f1f77bcf86cd799439013';

const conversationReader = (encryptionMode: string | null | Error) => ({
  conversation: {
    findUnique: jest.fn<any>().mockImplementation(async () => {
      if (encryptionMode instanceof Error) throw encryptionMode;
      return { encryptionMode };
    }),
  },
});

describe('la garde des signaux en clair', () => {
  it('reconnaît une conversation e2ee, et tient pour chiffrée une conversation illisible', async () => {
    expect(await isEndToEndConversation(conversationReader('e2ee') as never, CONVERSATION_ID)).toBe(true);
    expect(await isEndToEndConversation(conversationReader('server') as never, CONVERSATION_ID)).toBe(false);
    expect(await isEndToEndConversation(conversationReader(null) as never, CONVERSATION_ID)).toBe(false);
    expect(await isEndToEndConversation(conversationReader(new Error('base illisible')) as never, CONVERSATION_ID)).toBe(true);
  });

  it('refuse en 409 avec un code stable et une phrase lisible', async () => {
    const refusal = await assertPlainSignalAdmitted(conversationReader('e2ee') as never, CONVERSATION_ID).catch((error: unknown) => error);

    expect(refusal).toBeInstanceOf(ConflictError);
    expect(refusal).toMatchObject({ statusCode: 409, code: E2EE_ERROR_CODES.SIGNAL_CHANNEL_REQUIRED, message: E2EE_SIGNAL_CHANNEL_REQUIRED_MESSAGE });
    await expect(assertPlainSignalAdmitted(conversationReader('hybrid') as never, CONVERSATION_ID)).resolves.toBeUndefined();
  });
});

function reactionPrisma(encryptionMode: string | null) {
  return {
    message: {
      findUnique: jest.fn<any>().mockResolvedValue({
        id: MESSAGE_ID,
        conversationId: CONVERSATION_ID,
        deletedAt: null,
        messageType: 'text',
        conversation: { encryptionMode, participants: [{ id: PARTICIPANT_ID }] },
      }),
    },
    reaction: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
      count: jest.fn<any>().mockResolvedValue(0),
      upsert: jest.fn<any>(),
      groupBy: jest.fn<any>().mockResolvedValue([]),
    },
  };
}

describe('une réaction en clair (#13142)', () => {
  it("est refusée dans une conversation e2ee, et aucun emoji n'est rangé", async () => {
    const prisma = reactionPrisma('e2ee');
    const service = new ReactionService(prisma as never, null);

    const refusal = await service.addReaction({ messageId: MESSAGE_ID, participantId: PARTICIPANT_ID, emoji: '🙈' }).catch((error: unknown) => error);

    expect(refusal).toBeInstanceOf(E2eeSignalChannelRequiredError);
    expect(prisma.reaction.upsert).not.toHaveBeenCalled();
    expect(prisma.reaction.findFirst).not.toHaveBeenCalled();
  });
});
