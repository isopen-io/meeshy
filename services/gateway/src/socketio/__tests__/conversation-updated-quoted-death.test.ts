/**
 * #8686 — `conversation:updated` est émis PAR LECTEUR (room personnelle) pour
 * une réponse neuve, mais servait à tous la même ligne de liste. Un lecteur
 * pour qui la chaîne citée est déjà morte (#8630) recevait donc, en aperçu de
 * liste, le TEXTE d'une réponse qui est morte pour lui, et le gardait jusqu'au
 * prochain chargement — quand `GET /conversations` lui sert « expiré ». Les
 * DEUX producteurs (socket `MessageHandler.broadcastNewMessage`, REST/ZMQ
 * `MeeshySocketIOManager._broadcastNewMessage`) lui servent désormais la
 * variante « expirée » : aucun texte, aucune traduction, l'échéance de la mort.
 *
 * @jest-environment node
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

import { getIoState } from './helpers/message-new-parity-mocks';
import { MeeshySocketIOManager } from '../MeeshySocketIOManager';
import {
  makeTranslationService,
  makePrisma,
  makeContractMessage,
  seedParticipantsAlways,
  CONVERSATION_ID,
} from './helpers/message-new-parity-fixtures';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

const CONSUMED = new Date(Date.now() - 60_000);
const RAW_DESTRUCTION = new Date(Date.now() + 7 * 24 * 3600_000);
const DEAD_READER = { participantId: 'peer-participantId', userId: 'peer-userId' };
const SENDER_ROOM = ROOMS.user('sender-userId');
const DEAD_READER_ROOM = ROOMS.user(DEAD_READER.userId);

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

type Emission = { room: unknown; event: unknown; payload: any };

describe('conversation:updated — l’aperçu d’une réponse morte pour un lecteur lui part « expiré » (#8686)', () => {
  let manager: any;
  let prisma: any;
  let ioState: ReturnType<typeof getIoState>;
  let emissions: Emission[];
  let deadEntries: unknown[];

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

  const updatedFor = (room: string) =>
    emissions.filter((e) => e.event === SERVER_EVENTS.CONVERSATION_UPDATED && e.room === room);

  beforeEach(async () => {
    jest.clearAllMocks();
    ioState = getIoState();
    emissions = [];
    (ioState.to as any).mockImplementation((room: unknown) => {
      const chain: Record<string, unknown> = {};
      chain.except = () => chain;
      chain.to = () => chain;
      chain.emit = (event: unknown, payload: unknown) => {
        emissions.push({ room, event, payload });
        return true;
      };
      return chain;
    });
    prisma = makePrisma();
    seedParticipantsAlways(prisma);
    const pageFindMany = prisma.message?.findMany;
    prisma.message = {
      ...(prisma.message ?? {}),
      findMany: jest.fn(async (args: any) =>
        args?.where?.id?.in?.includes(flamme.id)
          ? [{ id: flamme.id, replyToId: null, senderId: flamme.senderId, ephemeralDuration: null, effectFlags: flamme.effectFlags, expiresAt: RAW_DESTRUCTION }]
          : pageFindMany ? pageFindMany(args) : [],
      ),
    };
    deadEntries = [
      { messageId: flamme.id, participantId: DEAD_READER.participantId, ephemeralExpiresAt: CONSUMED, participant: { userId: DEAD_READER.userId } },
    ];
    prisma.messageStatusEntry = {
      findMany: jest.fn(async () => deadEntries),
    };
    manager = new MeeshySocketIOManager({} as any, prisma, makeTranslationService() as any);
    await manager.initialize();
  });

  afterEach(() => {
    (ioState.to as any).mockReturnValue(ioState.toChain);
  });

  const assertExpiredFor = () => {
    const toDead = updatedFor(DEAD_READER_ROOM);
    expect(toDead).toHaveLength(1);
    expect(toDead[0].payload.lastMessageId).toBeDefined();
    expect(toDead[0].payload.lastMessagePreview).toBe('');
    expect(toDead[0].payload.lastMessageTranslations).toBeNull();
    expect(toDead[0].payload.lastMessageExpiresAt).toBe(CONSUMED.toISOString());
    expect(JSON.stringify(toDead[0].payload)).not.toContain('je réponds');

    const toSender = updatedFor(SENDER_ROOM);
    expect(toSender).toHaveLength(1);
    expect(toSender[0].payload.lastMessagePreview).toBe('je réponds');
  };

  it('transport REST/ZMQ', async () => {
    await manager.broadcastMessage(reply(), CONVERSATION_ID);
    assertExpiredFor();
  });

  it('transport socket', async () => {
    await manager.messageHandler.broadcastNewMessage(reply(), CONVERSATION_ID);
    assertExpiredFor();
  });

  it('un lecteur pour qui la chaîne citée vit encore reçoit la réponse en aperçu', async () => {
    deadEntries = [];
    await manager.broadcastMessage(reply(), CONVERSATION_ID);
    const toPeer = updatedFor(DEAD_READER_ROOM);
    expect(toPeer).toHaveLength(1);
    expect(toPeer[0].payload.lastMessagePreview).toBe('je réponds');
  });
});
