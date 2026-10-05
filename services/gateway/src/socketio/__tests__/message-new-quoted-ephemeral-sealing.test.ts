/**
 * #8562 — `message:new` est une diffusion de ROOM : une charge pour tous. La
 * citation d'un éphémère a pourtant une échéance PAR LECTEUR. Les DEUX
 * producteurs (socket `MessageHandler.broadcastNewMessage`, REST/ZMQ
 * `MeeshySocketIOManager._broadcastNewMessage`) excluent donc de la room les
 * lecteurs pour qui le message cité est déjà échu, et leur servent la
 * citation SCELLÉE sur leur room personnelle — exactement UN `message:new`
 * chacun. Personne ne reçoit l'heure brute de destruction.
 *
 * @jest-environment node
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

import { getIoState } from './helpers/message-new-parity-mocks';
import { MeeshySocketIOManager } from '../MeeshySocketIOManager';
import { makeTranslationService, makePrisma, makeContractMessage, CONVERSATION_ID } from './helpers/message-new-parity-fixtures';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

const CONSUMED = new Date(Date.now() - 60_000);
const RAW_DESTRUCTION = new Date(Date.now() + 7 * 24 * 3600_000);
const READER_B = { participantId: 'participant-B', userId: 'user-B' };

const flamme = {
  id: 'quoted-flame-0001',
  senderId: 'author-participant',
  content: 'le code du coffre est 4271',
  originalLanguage: 'fr',
  messageType: 'text',
  effectFlags: 8,
  ephemeralDuration: null,
  expiresAt: RAW_DESTRUCTION,
  deletedAt: null,
  createdAt: new Date('2026-09-29T09:00:00.000Z'),
  attachments: [],
  sender: { id: 'author-participant', userId: 'user-author', displayName: 'Ada', user: { username: 'ada' } },
};

type Emission = { room: unknown; excepted: unknown[]; event: unknown; payload: any };

describe('message:new — la citation d’un éphémère échu POUR UN LECTEUR lui part scellée (#8562)', () => {
  let manager: any;
  let prisma: any;
  let ioState: ReturnType<typeof getIoState>;
  let emissions: Emission[];
  let quotedFlags = flamme.effectFlags;

  const reply = () =>
    makeContractMessage({
      isEncrypted: false,
      encryptionMode: null,
      encryptedContent: null,
      encryptionMetadata: null,
      isViewOnce: false,
      maxViewOnceCount: null,
      forwardedFromId: null,
      forwardedFromConversationId: null,
      storyReplyToId: null,
      content: 'je réponds',
      replyToId: flamme.id,
      replyTo: flamme,
    });

  const messageNew = () => emissions.filter((e) => e.event === SERVER_EVENTS.MESSAGE_NEW);

  beforeEach(async () => {
    jest.clearAllMocks();
    ioState = getIoState();
    emissions = [];
    (ioState.to as any).mockImplementation((room: unknown) => {
      const excepted: unknown[] = [];
      const chain: Record<string, unknown> = {};
      chain.except = (rooms: unknown) => {
        excepted.push(...(Array.isArray(rooms) ? rooms : [rooms]));
        return chain;
      };
      chain.to = () => chain;
      chain.emit = (event: unknown, payload: unknown) => {
        emissions.push({ room, excepted, event, payload });
        return true;
      };
      return chain;
    });
    prisma = makePrisma();
    quotedFlags = flamme.effectFlags;
    // #8630 — l'audience remonte la chaîne citée EN BASE : la ligne qui fait foi
    // est celle que la base rend, jamais la copie embarquée dans la charge.
    const pageFindMany = prisma.message?.findMany;
    prisma.message = {
      ...(prisma.message ?? {}),
      findMany: jest.fn(async (args: any) =>
        args?.where?.id?.in?.includes(flamme.id)
          ? [{ id: flamme.id, replyToId: null, senderId: flamme.senderId, ephemeralDuration: null, effectFlags: quotedFlags, expiresAt: RAW_DESTRUCTION }]
          : pageFindMany ? pageFindMany(args) : [],
      ),
    };
    prisma.messageStatusEntry = {
      findMany: (jest.fn() as any).mockResolvedValue([
        { participantId: READER_B.participantId, ephemeralExpiresAt: CONSUMED, participant: { userId: READER_B.userId } },
      ]),
    };
    manager = new MeeshySocketIOManager({} as any, prisma, makeTranslationService() as any);
    await manager.initialize();
  });

  afterEach(() => {
    (ioState.to as any).mockReturnValue(ioState.toChain);
  });

  const assertSealedFor = () => {
    const toRoom = messageNew().find((e) => e.room === ROOMS.conversation(CONVERSATION_ID));
    expect(toRoom).toBeDefined();
    expect(toRoom!.excepted).toContain(ROOMS.user(READER_B.userId));
    expect(toRoom!.payload.replyTo.content).toBe('le code du coffre est 4271');
    expect(toRoom!.payload.replyTo.expiresAt).toBeUndefined();

    const toB = messageNew().filter((e) => e.room === ROOMS.user(READER_B.userId));
    expect(toB).toHaveLength(1);
    expect(toB[0].payload.replyTo.content).toBe('');
    expect(toB[0].payload.replyTo.deletedAt).toEqual(CONSUMED);
    expect(toB[0].payload.replyTo.attachments).toEqual([]);
    expect(JSON.stringify(toB[0].payload)).not.toContain('4271');
    // #8630 — la réponse meurt avec ce qu'elle cite, pour B : vidée, datée.
    expect(toB[0].payload.content).toBe('');
    expect(toB[0].payload.expiresAt).toEqual(CONSUMED);
    expect(JSON.stringify(toB[0].payload)).not.toContain('je réponds');
  };

  it('transport REST/ZMQ', async () => {
    await manager.broadcastMessage(reply(), CONVERSATION_ID);
    assertSealedFor();
  });

  it('transport socket', async () => {
    await manager.messageHandler.broadcastNewMessage(reply(), CONVERSATION_ID);
    assertSealedFor();
  });

  it('une citation ordinaire ne coûte aucune lecture d’échéance', async () => {
    quotedFlags = 0;
    await manager.broadcastMessage({ ...reply(), replyTo: { ...flamme, effectFlags: 0 } }, CONVERSATION_ID);
    expect(prisma.messageStatusEntry.findMany).not.toHaveBeenCalled();
    expect(messageNew().filter((e) => e.room === ROOMS.user(READER_B.userId))).toHaveLength(0);
  });
});
