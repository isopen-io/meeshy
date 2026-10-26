/**
 * #13142 — dans une conversation chiffrée de bout en bout, les routes EN CLAIR
 * des signaux sont refusées (fail-closed, #9229) : la passerelle ne range ni
 * l'emoji d'une réaction, ni le fait qu'un message a été supprimé, ouvert ou
 * épinglé. Le refus porte un code stable et une phrase lisible pour un client
 * antérieur (#9223). Hors bout en bout, rien ne change ; un message écrit en
 * clair avant l'activation se supprime toujours en clair.
 */
import { describe, it, expect, jest } from '@jest/globals';
import { E2EE_ERROR_CODES, E2EE_SIGNAL_CHANNEL_REQUIRED_MESSAGE } from '@meeshy/shared/types/e2ee-directory';
import { ReactionService } from '../../../services/ReactionService';
import {
  conversationRefusesPlainSignal,
  createEndToEndRegimeReader,
  E2eeSignalChannelRequiredError,
  messageRefusesPlainErasure,
} from '../../../services/e2ee/e2ee-signal-channel';
import { ConflictError } from '../../../errors/custom-errors';

const MESSAGE_ID = '507f1f77bcf86cd799439011';
const PARTICIPANT_ID = '507f1f77bcf86cd799439012';
const CONVERSATION_ID = '507f1f77bcf86cd799439013';

const conversationReader = (...modes: (string | null | Error)[]) => {
  const findUnique = jest.fn<any>();
  modes.forEach((mode) =>
    findUnique.mockImplementationOnce(async () => {
      if (mode instanceof Error) throw mode;
      return { encryptionMode: mode };
    }),
  );
  return { conversation: { findUnique } };
};

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('la garde des signaux en clair', () => {
  it("juge la réaction, l'épingle et la frappe sur le régime de la conversation", () => {
    expect(conversationRefusesPlainSignal({ encryptionMode: 'e2ee' })).toBe(true);
    expect(conversationRefusesPlainSignal({ encryptionMode: 'E2EE' })).toBe(true);
    expect(conversationRefusesPlainSignal({ encryptionMode: 'hybrid' })).toBe(false);
    expect(conversationRefusesPlainSignal({ encryptionMode: null })).toBe(false);
  });

  it("juge l'effacement sur la LIGNE : un message scellé est refusé, un message d'avant l'activation passe", () => {
    expect(messageRefusesPlainErasure({ isEncrypted: true, encryptionMode: 'e2ee' })).toBe(true);
    expect(messageRefusesPlainErasure({ isEncrypted: true, encryptionMode: null })).toBe(true);
    expect(messageRefusesPlainErasure({ isEncrypted: false, encryptionMode: null })).toBe(false);
    expect(messageRefusesPlainErasure({ isEncrypted: true, encryptionMode: 'server' })).toBe(false);
  });

  it('refuse en 409 avec un code stable et une phrase lisible', () => {
    const refusal = new E2eeSignalChannelRequiredError();

    expect(refusal).toBeInstanceOf(ConflictError);
    expect(refusal).toMatchObject({ statusCode: 409, code: E2EE_ERROR_CODES.SIGNAL_CHANNEL_REQUIRED, message: E2EE_SIGNAL_CHANNEL_REQUIRED_MESSAGE });
  });
});

describe('le régime lu pour la frappe (#13142)', () => {
  it('lit une seule fois une conversation chiffrée : le passage en bout en bout est irréversible', async () => {
    const prisma = conversationReader('e2ee', 'server');
    const isEndToEnd = createEndToEndRegimeReader(prisma as never);

    expect(await isEndToEnd(CONVERSATION_ID)).toBe(true);
    expect(await isEndToEnd(CONVERSATION_ID)).toBe(true);
    expect(prisma.conversation.findUnique).toHaveBeenCalledTimes(1);
  });

  it("relit une conversation en clair une fois sa courte durée passée : l'activation se voit", async () => {
    const prisma = conversationReader('server', 'e2ee');
    const isEndToEnd = createEndToEndRegimeReader(prisma as never, { negativeTtlMs: 5 });

    expect(await isEndToEnd(CONVERSATION_ID)).toBe(false);
    await pause(20);
    expect(await isEndToEnd(CONVERSATION_ID)).toBe(true);
  });

  it('se tait sur une lecture illisible, sans garder ce doute', async () => {
    const prisma = conversationReader(new Error('base illisible'), 'server');
    const isEndToEnd = createEndToEndRegimeReader(prisma as never);

    expect(await isEndToEnd(CONVERSATION_ID)).toBe(true);
    expect(await isEndToEnd(CONVERSATION_ID)).toBe(false);
  });
});

function reactionPrisma(encryptionMode: string | null, participantIds: readonly string[] = [PARTICIPANT_ID]) {
  return {
    message: {
      findUnique: jest.fn<any>().mockResolvedValue({
        id: MESSAGE_ID,
        conversationId: CONVERSATION_ID,
        deletedAt: null,
        messageType: 'text',
        conversation: { encryptionMode, participants: participantIds.map((id) => ({ id })) },
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

  it("refuse un non-membre comme non-membre : le refus ne lui dit pas le régime", async () => {
    const prisma = reactionPrisma('e2ee', ['507f1f77bcf86cd799439099']);
    const service = new ReactionService(prisma as never, null);

    const refusal = await service.addReaction({ messageId: MESSAGE_ID, participantId: PARTICIPANT_ID, emoji: '🙈' }).catch((error: unknown) => error);

    expect(refusal).not.toBeInstanceOf(E2eeSignalChannelRequiredError);
    expect(prisma.reaction.upsert).not.toHaveBeenCalled();
  });
});
