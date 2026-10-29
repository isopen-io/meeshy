/**
 * #13802 — dans une conversation chiffrée de bout en bout, une réaction en clair
 * à une PIÈCE JOINTE est refusée comme celle d'un message (#13142) : ni l'ajout
 * ni le retrait n'écrivent en base ni ne diffusent l'emoji, et l'accusé socket
 * porte le même code stable que `reaction:add`. Hors bout en bout (clair,
 * `server`, `hybrid`), rien ne change.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { E2EE_ERROR_CODES, E2EE_SIGNAL_CHANNEL_REQUIRED_MESSAGE } from '@meeshy/shared/types/e2ee-directory';

const mockResolveParticipantFromMessage = jest.fn<any>();

jest.mock('../../../socketio/utils/participant-resolver', () => ({
  resolveParticipantFromMessage: (...args: unknown[]) => mockResolveParticipantFromMessage(...args),
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
  },
}));

import { AttachmentReactionService } from '../../../services/AttachmentReactionService';
import { AttachmentReactionHandler } from '../../../socketio/handlers/AttachmentReactionHandler';
import { E2eeSignalChannelRequiredError } from '../../../services/e2ee/e2ee-signal-channel';

const SOCKET_ID = 'socket-13802';
const USER_ID = '507f1f77bcf86cd799439010';
const MESSAGE_ID = '507f1f77bcf86cd799439011';
const ATTACHMENT_ID = '507f1f77bcf86cd799439012';
const CONVERSATION_ID = '507f1f77bcf86cd799439013';
const PARTICIPANT_ID = '507f1f77bcf86cd799439014';
const EMOJI = '🙈';

const PLAIN_MODES: readonly (string | null)[] = [null, 'server', 'hybrid'];

function attachmentReactionPrisma(encryptionMode: string | null) {
  const conversation = { id: CONVERSATION_ID, isActive: true, closedAt: null, encryptionMode };
  return {
    message: {
      findUnique: jest.fn<any>().mockResolvedValue({ conversationId: CONVERSATION_ID, conversation }),
    },
    messageAttachment: {
      findUnique: jest.fn<any>().mockResolvedValue({ messageId: MESSAGE_ID, message: { conversationId: CONVERSATION_ID, conversation } }),
    },
    attachmentReaction: {
      findUnique: jest.fn<any>().mockResolvedValue(null),
      findMany: jest.fn<any>().mockResolvedValue([{ emoji: EMOJI }]),
      count: jest.fn<any>().mockResolvedValue(0),
      upsert: jest.fn<any>().mockResolvedValue({}),
      deleteMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
    },
    participant: { findMany: jest.fn<any>().mockResolvedValue([]) },
  };
}

const addOptions = { attachmentId: ATTACHMENT_ID, messageId: MESSAGE_ID, participantId: PARTICIPANT_ID, emoji: EMOJI };
const removeOptions = { attachmentId: ATTACHMENT_ID, participantId: PARTICIPANT_ID, emoji: EMOJI };

describe('une réaction en clair à une pièce jointe (#13802) — le service', () => {
  it("refuse l'ajout dans une conversation e2ee, et aucun emoji n'est rangé", async () => {
    const prisma = attachmentReactionPrisma('e2ee');
    const service = new AttachmentReactionService(prisma as never);

    const refusal = await service.addAttachmentReaction(addOptions).catch((error: unknown) => error);

    expect(refusal).toBeInstanceOf(E2eeSignalChannelRequiredError);
    expect(prisma.attachmentReaction.findUnique).not.toHaveBeenCalled();
    expect(prisma.attachmentReaction.upsert).not.toHaveBeenCalled();
  });

  it('refuse le retrait dans une conversation e2ee, et aucune ligne ne part', async () => {
    const prisma = attachmentReactionPrisma('e2ee');
    const service = new AttachmentReactionService(prisma as never);

    const refusal = await service.removeAttachmentReaction(removeOptions).catch((error: unknown) => error);

    expect(refusal).toBeInstanceOf(E2eeSignalChannelRequiredError);
    expect(prisma.attachmentReaction.deleteMany).not.toHaveBeenCalled();
  });

  it('juge le retrait sur la conversation de la PIÈCE elle-même, lue par son identifiant', async () => {
    const prisma = attachmentReactionPrisma('e2ee');
    const service = new AttachmentReactionService(prisma as never);

    await service.removeAttachmentReaction(removeOptions).catch(() => undefined);

    expect(prisma.messageAttachment.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: ATTACHMENT_ID } }),
    );
  });

  it("refuse le retrait quand la lecture du régime échoue : rien n'est effacé sur un doute", async () => {
    const prisma = attachmentReactionPrisma('server');
    prisma.messageAttachment.findUnique.mockRejectedValueOnce(new Error('base illisible'));
    const service = new AttachmentReactionService(prisma as never);

    await expect(service.removeAttachmentReaction(removeOptions)).rejects.toThrow();
    expect(prisma.attachmentReaction.deleteMany).not.toHaveBeenCalled();
  });

  it.each(PLAIN_MODES)("laisse l'ajout et le retrait inchangés hors bout en bout (%s)", async (mode) => {
    const prisma = attachmentReactionPrisma(mode);
    const service = new AttachmentReactionService(prisma as never);

    await expect(service.addAttachmentReaction(addOptions)).resolves.toEqual({ changed: true });
    await expect(service.removeAttachmentReaction(removeOptions)).resolves.toBe(true);
    expect(prisma.attachmentReaction.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.attachmentReaction.deleteMany).toHaveBeenCalledTimes(1);
  });

  it("garde l'ajout à une seule lecture : le régime se lit avec l'état terminal", async () => {
    const prisma = attachmentReactionPrisma('e2ee');
    const service = new AttachmentReactionService(prisma as never);

    await service.addAttachmentReaction(addOptions).catch(() => undefined);

    expect(prisma.message.findUnique).toHaveBeenCalledTimes(1);
  });
});

function makeIo() {
  const room = { emit: jest.fn() };
  return { to: jest.fn<any>().mockReturnValue(room), room };
}

function makeHandler(encryptionMode: string | null) {
  const prisma = attachmentReactionPrisma(encryptionMode);
  const io = makeIo();
  const deliveryQueue = { enqueue: jest.fn<any>().mockResolvedValue(1) };
  const connectedUsers = new Map([[USER_ID, { id: USER_ID, socketId: SOCKET_ID, isAnonymous: false, language: 'fr', resolvedLanguages: [] }]]);
  const handler = new AttachmentReactionHandler({
    io: io as never,
    prisma: prisma as never,
    service: new AttachmentReactionService(prisma as never),
    connectedUsers: connectedUsers as never,
    socketToUser: new Map([[SOCKET_ID, USER_ID]]),
  });
  handler.setDeliveryQueue(deliveryQueue as never);
  return { handler, prisma, io, deliveryQueue };
}

const socket = { id: SOCKET_ID, emit: jest.fn() } as never;
const payload = { attachmentId: ATTACHMENT_ID, messageId: MESSAGE_ID, emoji: EMOJI };

describe('une réaction en clair à une pièce jointe (#13802) — le socket', () => {
  beforeEach(() => {
    mockResolveParticipantFromMessage.mockReset();
    mockResolveParticipantFromMessage.mockResolvedValue({ participantId: PARTICIPANT_ID, userId: USER_ID, isAnonymous: false });
  });

  it.each(['add', 'remove'] as const)(
    "refuse attachment:reaction-%s en e2ee avec le code des réactions de message, sans rien diffuser",
    async (action) => {
      const { handler, prisma, io, deliveryQueue } = makeHandler('e2ee');
      const ack = jest.fn();

      await (action === 'add' ? handler.handleAdd(socket, payload, ack) : handler.handleRemove(socket, payload, ack));

      expect(ack).toHaveBeenCalledWith({
        success: false,
        error: E2EE_SIGNAL_CHANNEL_REQUIRED_MESSAGE,
        code: E2EE_ERROR_CODES.SIGNAL_CHANNEL_REQUIRED,
      });
      expect(io.to).not.toHaveBeenCalled();
      expect(deliveryQueue.enqueue).not.toHaveBeenCalled();
      expect(prisma.attachmentReaction.upsert).not.toHaveBeenCalled();
      expect(prisma.attachmentReaction.deleteMany).not.toHaveBeenCalled();
    },
  );

  it('refuse un non-membre comme non-membre : le refus ne lui dit pas le régime', async () => {
    mockResolveParticipantFromMessage.mockResolvedValue(null);
    const { handler } = makeHandler('e2ee');
    const ack = jest.fn();

    await handler.handleAdd(socket, payload, ack);

    expect(ack).toHaveBeenCalledWith({ success: false, error: 'Could not resolve participant' });
  });

  it.each(PLAIN_MODES)('accepte et diffuse comme avant hors bout en bout (%s)', async (mode) => {
    const { handler, io } = makeHandler(mode);
    const addAck = jest.fn();
    const removeAck = jest.fn();

    await handler.handleAdd(socket, payload, addAck);
    await handler.handleRemove(socket, payload, removeAck);

    expect(addAck).toHaveBeenCalledWith({ success: true });
    expect(removeAck).toHaveBeenCalledWith({ success: true });
    expect(io.to).toHaveBeenCalledTimes(2);
  });
});
