import { describe, it, expect, jest } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { emitConversationPreviewUpdate } from '../emitConversationPreviewUpdate';

type Emitted = { room: string; event: string; payload: Record<string, unknown> };

const makeIo = (sink: Emitted[]) => ({
  to: (room: string) => ({
    emit: (event: string, payload: Record<string, unknown>) => {
      sink.push({ room, event, payload });
    },
  }),
});

const makePrisma = (latest: Record<string, unknown>) =>
  ({
    participant: {
      findMany: jest.fn(async () => [
        { id: 'p-A', userId: 'user-A', user: { systemLanguage: 'fr', regionalLanguage: 'en' } },
      ]),
    },
    message: { findFirst: jest.fn(async () => latest) },
    userMessageDeletion: { findMany: jest.fn(async () => []) },
    userConversationPreferences: { findMany: jest.fn(async () => []) },
  }) as never;

const viewOnce = {
  id: 'msg-vu',
  content: 'Le code du portail est 4521',
  originalLanguage: 'fr',
  translations: { en: { text: 'The gate code is 4521' } },
  senderId: 'p-B',
  createdAt: new Date('2026-09-23T10:00:00Z'),
  messageType: 'image',
  isViewOnce: true,
  isBlurred: false,
  expiresAt: null,
  ephemeralDuration: null,
  metadata: null,
  sender: { displayName: 'Bob', user: null },
  attachments: [
    { id: 'att-1', mimeType: 'image/jpeg', thumbnailUrl: 'https://cdn/secret-thumb.jpg', originalName: 'secret.jpg', fileSize: 1000, duration: null, width: 10, height: 10, pageCount: null },
  ],
  _count: { attachments: 1 },
};

describe('conversation:updated — un vue unique ne transporte rien de son contenu (#7545)', () => {
  it('emitConversationPreviewUpdate : ni texte, ni traduction, ni pièce jointe', async () => {
    const emitted: Emitted[] = [];
    await emitConversationPreviewUpdate(makePrisma(viewOnce), makeIo(emitted) as never, 'conv-1', 'user-B');

    expect(emitted).toHaveLength(1);
    const [{ event, payload }] = emitted;
    expect(event).toBe(SERVER_EVENTS.CONVERSATION_UPDATED);
    expect(payload.lastMessageId).toBe('msg-vu');
    expect(payload.lastMessageIsViewOnce).toBe(true);
    expect(payload.lastMessagePreview).toBe('');
    expect(payload.lastMessageTranslations).toBeNull();
    expect(payload.lastMessageAttachments).toEqual([]);
    expect(payload.lastMessageAttachmentSummary).toBeNull();
    expect(JSON.stringify(payload)).not.toContain('4521');
    expect(JSON.stringify(payload)).not.toContain('secret');
  });

  it('emitConversationPreviewUpdate : sélectionne ce que la protection et la nature lisent', async () => {
    const prisma = makePrisma(viewOnce) as unknown as { message: { findFirst: jest.Mock } };
    await emitConversationPreviewUpdate(prisma as never, makeIo([]) as never, 'conv-1', 'user-B');

    const select = (prisma.message.findFirst.mock.calls[0][0] as { select: Record<string, unknown> }).select;
    for (const field of ['isViewOnce', 'isBlurred', 'isEncrypted', 'expiresAt', 'ephemeralDuration', 'messageType', 'messageSource', 'effectFlags', 'forwardedFromId', 'metadata']) {
      expect(select).toHaveProperty(field, true);
    }
  });

  // Les trois émetteurs du groupe d'aperçu passent par UN résolveur, celui qui
  // applique la protection. Un quatrième qui recomposerait le Prisme à la main
  // rouvrirait la fuite que ce lot ferme.
  it.each([
    'handlers/MessageHandler.ts',
    'postMessageSyncFanOut.ts',
    'emitConversationPreviewUpdate.ts',
  ])('%s compose le groupe par resolveLastMessagePreviewGroup', (file) => {
    const source = readFileSync(join(__dirname, '..', file), 'utf8');
    expect(source).toContain('resolveLastMessagePreviewGroup(');
    expect(source).not.toMatch(/resolveLastMessagePreviewPrism\(/);
    expect(source).not.toMatch(/resolvePreviewMediaFields\(/);
  });
});
