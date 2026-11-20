/**
 * @jest-environment node
 *
 * #19917 — LE REJEU QUI APPORTE DES PIÈCES NEUVES. Relevé par l'audit
 * adversarial du cycle 186 (#19865).
 *
 * Le dédoublonnage précoce de `MessagingService.handleMessage` rend la ligne
 * existante et s'arrête là — AVANT `handleAttachments`. Les `attachmentIds`
 * du rejeu, que les deux transports viennent pourtant d'ADMETTRE
 * (`admitMessageAttachments` côté REST, `admitLoadedMessageAttachments` côté
 * WS : vivantes, à l'expéditeur, non attachées), n'étaient jamais liés.
 *
 * L'enchaînement qui y mène est écrit par le dépôt lui-même, vingt lignes
 * au-dessus du site fautif (`MessageProcessor.handleAttachments`, § copie) :
 * un envoi dont la liaison des pièces a échoué laisse une bulle SANS elles,
 * et « un rejeu au même `clientMessageId` rendrait ensuite `success: true` ».
 * L'expéditeur voit « envoyé » avec ses aperçus LOCAUX ; la pièce n'existe
 * pour personne, et elle part au balayage des orphelines.
 */
import { describe, it, expect, jest, beforeEach, afterAll } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

const mockHandleNewMessage = jest.fn(async (..._args: unknown[]) => undefined);

jest.mock('../../../../services/message-translation/MessageTranslationService', () => ({
  MessageTranslationService: jest.fn().mockImplementation(() => ({ handleNewMessage: mockHandleNewMessage })),
}));
jest.mock('../../../../services/TrackingLinkService', () => ({
  TrackingLinkService: jest.fn().mockImplementation(() => ({
    processExplicitLinksInContent: jest.fn(async ({ content }: { content: string }) => ({ processedContent: content, trackingLinks: [] })),
    collectContentTrackingLinks: jest.fn(async () => []),
  })),
}));
jest.mock('../../../../services/MessageReadStatusService', () => ({
  MessageReadStatusService: jest.fn().mockImplementation(() => ({ markMessagesAsRead: jest.fn(), getUnreadCount: jest.fn() })),
}));
jest.mock('../../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { MessagingService } from '../../../../services/messaging/MessagingService';
import { resetParticipantLookupCache } from '../../../../utils/participant-lookup-cache';

const CONV_ID = '507f1f77bcf86cd799439012';
const PARTICIPANT_ID = '507f1f77bcf86cd799439014';
const USER_ID = '507f1f77bcf86cd799439011';
const MESSAGE_ID = '507f1f77bcf86cd799439013';
const CLIENT_MSG_ID = 'cid_550e8400-e29b-41d4-a716-446655440000';
const ATT_ID = '507f1f77bcf86cd799439021';
const savedKey = process.env.ENCRYPTION_MASTER_KEY;

afterAll(() => {
  if (savedKey === undefined) delete process.env.ENCRYPTION_MASTER_KEY;
  else process.env.ENCRYPTION_MASTER_KEY = savedKey;
});

beforeEach(() => {
  jest.clearAllMocks();
  resetParticipantLookupCache();
  process.env.ENCRYPTION_MASTER_KEY = Buffer.alloc(32, 5).toString('base64');
});

const attachmentRow = (overrides: Record<string, unknown> = {}) => ({
  id: ATT_ID, messageId: null, fileName: 'prisme.png', originalName: 'prisme.png',
  mimeType: 'image/png', fileSize: 3, fileUrl: 'https://x/prisme.png', thumbnailUrl: null,
  width: null, height: null, duration: null, rank: 0, effectFlags: 0,
  isViewOnce: false, isBlurred: false, uploadedBy: PARTICIPANT_ID, createdAt: new Date(),
  ...overrides,
});

const storedMessage = (attachments: readonly unknown[]) => ({
  id: MESSAGE_ID, conversationId: CONV_ID, senderId: PARTICIPANT_ID, content: 'déjà là',
  originalLanguage: 'fr', messageType: 'image', replyToId: null, deletedAt: null, isEdited: false,
  validatedMentions: [], createdAt: new Date(), updatedAt: new Date(), clientMessageId: CLIENT_MSG_ID,
  translations: { en: { text: 'already here' } }, sender: null, attachments, replyTo: null,
  isEncrypted: false, encryptionMode: null,
});

function harness(params: { readonly stored: ReturnType<typeof storedMessage>; readonly rows?: readonly unknown[] }) {
  const linked: { readonly where: unknown; readonly data: unknown }[] = [];
  const rows = [...(params.rows ?? [attachmentRow()])];
  const prisma = {
    conversation: {
      findUnique: jest.fn(async () => ({ id: CONV_ID, type: 'private' })),
      findFirst: jest.fn(async () => ({ id: CONV_ID, identifier: 'test-conv', type: 'private' })),
      update: jest.fn(),
    },
    participant: {
      findUnique: jest.fn(async () => ({ id: PARTICIPANT_ID, conversationId: CONV_ID, isActive: true, type: 'user', userId: USER_ID })),
      findFirst: jest.fn(async () => null),
      findMany: jest.fn(async () => []),
    },
    message: {
      create: jest.fn(), update: jest.fn(), findMany: jest.fn(async () => []),
      findFirst: jest.fn(async () => params.stored), findUnique: jest.fn(async () => params.stored),
    },
    messageAttachment: {
      findMany: jest.fn(async ({ where }: { where?: Record<string, any> }) => {
        const ids: string[] | undefined = where?.id?.in;
        const byMessage: string | undefined = where?.messageId;
        return rows.filter((row: any) =>
          (ids === undefined || ids.includes(row.id)) &&
          (byMessage === undefined || row.messageId === byMessage));
      }),
      updateMany: jest.fn(async ({ where, data }: { where: any; data: any }) => {
        linked.push({ where, data });
        const ids: string[] = where?.id?.in ?? [];
        let count = 0;
        for (const row of rows as any[]) {
          if (ids.includes(row.id) && (row.messageId === null || row.messageId === undefined)) {
            Object.assign(row, data);
            count += 1;
          }
        }
        return { count };
      }),
    },
    user: { findUnique: jest.fn(), findMany: jest.fn(async () => []) },
    serverEncryptionKey: {
      create: jest.fn(async () => ({})), findUnique: jest.fn(async () => null),
      findMany: jest.fn(async () => []), update: jest.fn(async () => ({})),
    },
  };
  return { prisma, linked, rows };
}

const send = (prisma: unknown, attachmentIds?: readonly string[]) =>
  new MessagingService(prisma as PrismaClient, { handleNewMessage: mockHandleNewMessage } as never).handleMessage(
    {
      conversationId: CONV_ID,
      content: 'déjà là',
      clientMessageId: CLIENT_MSG_ID,
      ...(attachmentIds === undefined ? {} : { attachmentIds }),
    } as never,
    PARTICIPANT_ID,
  );

describe('MessagingService — le rejeu qui apporte des pièces NEUVES (#19917)', () => {
  it('les LIE au message existant, au lieu de rendre « succès » sans elles', async () => {
    const { prisma, linked, rows } = harness({ stored: storedMessage([]) });

    const response = await send(prisma, [ATT_ID]);

    expect(prisma.message.create).not.toHaveBeenCalled();
    expect(linked).toHaveLength(1);
    expect((rows[0] as { messageId?: string }).messageId).toBe(MESSAGE_ID);
    /* Et la réponse les PORTE : sans ça le client promeut sa bulle avec ses
       aperçus `blob:`, qui disparaissent au prochain rechargement. */
    expect((response.data as { attachments?: readonly { id: string }[] }).attachments?.map((a) => a.id)).toEqual([ATT_ID]);
  });

  it('ne retouche RIEN quand le message porte déjà ses pièces (le rejeu nominal)', async () => {
    const carried = attachmentRow({ messageId: MESSAGE_ID });
    const { prisma, linked } = harness({ stored: storedMessage([carried]), rows: [carried] });

    const response = await send(prisma, [ATT_ID]);

    expect(linked).toEqual([]);
    expect((response.data as { attachments?: readonly { id: string }[] }).attachments?.map((a) => a.id)).toEqual([ATT_ID]);
  });

  it('ne lie rien quand le rejeu ne porte aucune pièce', async () => {
    const { prisma, linked } = harness({ stored: storedMessage([]) });

    await send(prisma);

    expect(linked).toEqual([]);
  });
});

/**
 * CE QUE CE LOT REFUSE D'AGGRAVER — le dédoublonnage n'a aucun filtre sur
 * `deletedAt` et rend un message supprimé avec `success: true` (mesuré,
 * #19957). Y attacher les pièces du rejeu les rendrait invisibles ET
 * immortelles : le balayage des orphelines ne ramasse que les lignes dont
 * `messageId` est vide.
 */
describe('MessagingService — un message SUPPRIMÉ ne reçoit aucune pièce (#19917)', () => {
  it('le rejeu ne lie rien sur une ligne supprimée', async () => {
    const { prisma, linked, rows } = harness({ stored: { ...storedMessage([]), deletedAt: new Date() } as never });

    await send(prisma, [ATT_ID]);

    expect(linked).toEqual([]);
    expect((rows[0] as { messageId?: string | null }).messageId).toBeNull();
  });
});
