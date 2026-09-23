/**
 * `conversation:updated` porte, en clés plates, ce que `GET /conversations`
 * sert sur `lastMessage` (#7594) : `lastMessageSticker`, le texte alternatif
 * de la première pièce jointe (`lastMessageAttachments[0].alt`) et
 * `lastMessageViewOnceConsumed`, par lecteur.
 *
 * Mesuré sur l'émetteur RÉEL (`emitConversationPreviewUpdate`, et l'émission
 * ciblée qui suit une consommation) et sur le groupe que les deux émetteurs
 * d'envoi composent (`resolveLastMessagePreviewGroup`).
 */
import { describe, it, expect, jest } from '@jest/globals';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import {
  emitConversationPreviewUpdate,
  emitViewOnceConsumedPreview,
} from '../emitConversationPreviewUpdate';
import { resolveLastMessagePreviewGroup } from '../utils/lastMessagePreviewGroup';

type Emitted = { room: string; event: string; payload: Record<string, unknown> };
type Row = Record<string, unknown>;
type StatusEntry = { messageId: string; participantId: string; viewedOnceAt?: Date | null };

const makeIo = (sink: Emitted[]) => ({
  to: (room: string) => ({
    emit: (event: string, payload: Record<string, unknown>) => {
      sink.push({ room, event, payload });
    },
  }),
});

const PARTICIPANTS = [
  { id: 'p-A', userId: 'user-A', user: { systemLanguage: 'fr' } },
  { id: 'p-B', userId: 'user-B', user: { systemLanguage: 'fr' } },
];

const makePrisma = (latest: Row, statusEntries: readonly StatusEntry[] = []) => ({
  participant: { findMany: jest.fn(async () => PARTICIPANTS) },
  message: { findFirst: jest.fn(async () => latest) },
  userMessageDeletion: { findMany: jest.fn(async () => []) },
  userConversationPreferences: { findMany: jest.fn(async () => []) },
  messageStatusEntry: {
    findMany: jest.fn(async (args: { where: { messageId: { in: string[] }; participantId: { in: string[] } } }) =>
      statusEntries.filter(
        (entry) => args.where.messageId.in.includes(entry.messageId) && args.where.participantId.in.includes(entry.participantId),
      ),
    ),
  },
});

const attachment = (overrides: Row = {}): Row => ({
  id: 'att-1',
  mimeType: 'image/png',
  thumbnailUrl: null,
  originalName: 'sticker.png',
  fileSize: 6000,
  duration: null,
  width: 512,
  height: 512,
  pageCount: null,
  alt: 'Bonjour à tous',
  isViewOnce: false,
  isBlurred: false,
  effectFlags: 0,
  ...overrides,
});

const stickerMessage = (overrides: Row = {}): Row => ({
  id: 'msg-1',
  content: '',
  originalLanguage: 'fr',
  translations: null,
  senderId: 'p-B',
  createdAt: new Date('2026-09-23T10:00:00Z'),
  messageType: 'image',
  messageSource: 'user',
  isViewOnce: false,
  isBlurred: false,
  isEncrypted: false,
  effectFlags: 0,
  expiresAt: null,
  ephemeralDuration: null,
  forwardedFromId: null,
  metadata: { sticker: { templateId: 'bubble-pop', slots: { title: 'Bonjour à tous' } } },
  sender: { displayName: 'Demo', user: null },
  attachments: [attachment()],
  _count: { attachments: 1 },
  ...overrides,
});

async function emittedFor(latest: Row, statusEntries: readonly StatusEntry[] = []): Promise<Emitted[]> {
  const emitted: Emitted[] = [];
  await emitConversationPreviewUpdate(makePrisma(latest, statusEntries) as never, makeIo(emitted) as never, 'conv-1', 'user-B');
  return emitted;
}

const payloadOf = (emitted: Emitted[], room: string) => emitted.find((e) => e.room === room)?.payload ?? {};

describe('conversation:updated — sticker et texte alternatif (#7594)', () => {
  it('porte lastMessageSticker et l’alt de la première pièce jointe, avec sa protection', async () => {
    const emitted = await emittedFor(stickerMessage());
    const payload = payloadOf(emitted, 'user:user-A');
    expect(payload.lastMessageType).toBe('image');
    expect(payload.lastMessageSticker).toEqual({ templateId: 'bubble-pop', slots: { title: 'Bonjour à tous' } });
    expect((payload.lastMessageAttachments as Row[])[0]).toMatchObject({
      alt: 'Bonjour à tous',
      isViewOnce: false,
      isBlurred: false,
      effectFlags: 0,
    });
  });

  it('lastMessageSticker vaut null (jamais absent) pour un message sans sticker', async () => {
    const payload = payloadOf(await emittedFor(stickerMessage({ metadata: null })), 'user:user-A');
    expect(payload).toHaveProperty('lastMessageSticker', null);
  });

  it('sélectionne alt et la protection de la pièce', async () => {
    const prisma = makePrisma(stickerMessage());
    await emitConversationPreviewUpdate(prisma as never, makeIo([]) as never, 'conv-1', 'user-B');
    const select = (prisma.message.findFirst.mock.calls[0] as unknown as [{ select: { attachments: { select: Row } } }])[0].select;
    expect(select.attachments.select).toMatchObject({ alt: true, isViewOnce: true, isBlurred: true, effectFlags: true });
  });

  describe('témoins de fuite', () => {
    it.each([
      ['message à vue unique', { isViewOnce: true, effectFlags: 4 }],
      ['message flouté', { isBlurred: true }],
      ['message chiffré', { isEncrypted: true }],
    ])('%s : ni sticker, ni alt, ni la phrase', async (_label, flags) => {
      const payload = payloadOf(await emittedFor(stickerMessage(flags)), 'user:user-A');
      expect(payload.lastMessageSticker).toBeNull();
      expect(payload.lastMessageAttachments).toEqual([]);
      expect(JSON.stringify(payload)).not.toContain('Bonjour à tous');
    });

    it.each([
      ['floutée', { isBlurred: true }],
      ['à vue unique', { isViewOnce: true }],
      ['à vue unique par son bitfield', { effectFlags: 4 }],
    ])('pièce %s sur un message ordinaire : la pièce part avec ses drapeaux, sans alt ni sticker', async (_label, flags) => {
      const payload = payloadOf(await emittedFor(stickerMessage({ attachments: [attachment(flags)] })), 'user:user-A');
      const [served] = payload.lastMessageAttachments as Row[];
      expect(served).toMatchObject(flags);
      expect(served.alt).toBeNull();
      expect(payload.lastMessageSticker).toBeNull();
      expect(JSON.stringify(payload)).not.toContain('Bonjour à tous');
    });
  });
});

describe('conversation:updated — vue unique ouverte, par lecteur (#7594)', () => {
  const viewOnce = () =>
    stickerMessage({ isViewOnce: true, effectFlags: 4, metadata: null, messageType: 'text', attachments: [], _count: { attachments: 0 } });

  it('chaque room personnelle reçoit SA valeur : true pour qui a ouvert, false pour l’autre', async () => {
    const emitted = await emittedFor(viewOnce(), [
      { messageId: 'msg-1', participantId: 'p-A', viewedOnceAt: new Date('2026-09-23T10:01:00Z') },
      { messageId: 'msg-1', participantId: 'p-B' },
    ]);
    expect(payloadOf(emitted, 'user:user-A').lastMessageViewOnceConsumed).toBe(true);
    expect(payloadOf(emitted, 'user:user-B').lastMessageViewOnceConsumed).toBe(false);
  });

  it('false hors vue unique, sans lecture de la base', async () => {
    const prisma = makePrisma(stickerMessage());
    const emitted: Emitted[] = [];
    await emitConversationPreviewUpdate(prisma as never, makeIo(emitted) as never, 'conv-1', 'user-B');
    expect(payloadOf(emitted, 'user:user-A').lastMessageViewOnceConsumed).toBe(false);
    expect(prisma.messageStatusEntry.findMany).not.toHaveBeenCalled();
  });

  it('une lecture de consommation en échec dégrade en false, sans perdre l’émission', async () => {
    const prisma = makePrisma(viewOnce());
    prisma.messageStatusEntry.findMany.mockRejectedValueOnce(new Error('mongo down'));
    const emitted: Emitted[] = [];
    await emitConversationPreviewUpdate(prisma as never, makeIo(emitted) as never, 'conv-1', 'user-B');
    expect(emitted).toHaveLength(2);
    expect(payloadOf(emitted, 'user:user-A').lastMessageViewOnceConsumed).toBe(false);
  });

  it('émission ciblée après consommation : la seule room du lecteur, avec true', async () => {
    const prisma = makePrisma(viewOnce(), [
      { messageId: 'msg-1', participantId: 'p-A', viewedOnceAt: new Date('2026-09-23T10:01:00Z') },
    ]);
    const emitted: Emitted[] = [];
    await emitViewOnceConsumedPreview(prisma as never, makeIo(emitted) as never, {
      conversationId: 'conv-1',
      messageId: 'msg-1',
      readerParticipantId: 'p-A',
      actorUserId: 'user-A',
    });
    expect(emitted).toHaveLength(1);
    expect(emitted[0].room).toBe('user:user-A');
    expect(emitted[0].event).toBe(SERVER_EVENTS.CONVERSATION_UPDATED);
    expect(emitted[0].payload.lastMessageId).toBe('msg-1');
    expect(emitted[0].payload.lastMessageViewOnceConsumed).toBe(true);
  });

  it('émission ciblée : un invité sans compte est adressé par son Participant.id', async () => {
    const prisma = makePrisma(viewOnce(), [
      { messageId: 'msg-1', participantId: 'p-guest', viewedOnceAt: new Date('2026-09-23T10:01:00Z') },
    ]);
    prisma.participant.findMany.mockResolvedValueOnce([...PARTICIPANTS, { id: 'p-guest', userId: null, user: null }] as never);
    const emitted: Emitted[] = [];
    await emitViewOnceConsumedPreview(prisma as never, makeIo(emitted) as never, {
      conversationId: 'conv-1',
      messageId: 'msg-1',
      readerParticipantId: 'p-guest',
      actorUserId: 'p-guest',
    });
    expect(emitted.map((e) => e.room)).toEqual(['user:p-guest']);
    expect(emitted[0].payload.lastMessageViewOnceConsumed).toBe(true);
  });

  it('émission ciblée : rien quand le message consommé n’est plus le dernier', async () => {
    const prisma = makePrisma(stickerMessage({ id: 'msg-2' }));
    const emitted: Emitted[] = [];
    await emitViewOnceConsumedPreview(prisma as never, makeIo(emitted) as never, {
      conversationId: 'conv-1',
      messageId: 'msg-1',
      readerParticipantId: 'p-A',
      actorUserId: 'user-A',
    });
    expect(emitted).toEqual([]);
  });

  it('le groupe d’un message NEUF (émetteurs d’envoi) porte false et le sticker', () => {
    const group = resolveLastMessagePreviewGroup(
      { id: 'p-A', userId: 'user-A', user: { systemLanguage: 'fr' } },
      stickerMessage({ isViewOnce: false }) as never,
    );
    expect(group.lastMessageViewOnceConsumed).toBe(false);
    expect(group.lastMessageSticker).toEqual({ templateId: 'bubble-pop', slots: { title: 'Bonjour à tous' } });
    expect(group.lastMessageAttachments[0]?.alt).toBe('Bonjour à tous');
  });
});
