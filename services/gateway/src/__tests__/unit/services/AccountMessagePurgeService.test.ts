/**
 * Unit tests for AccountMessagePurgeService (#5689, suite de #3632).
 *
 * `applyMessageRemovalEffects` a déjà son propre témoin
 * (`messageRemovalEffects.test.ts`) — celui-ci vérifie l'ORCHESTRATION de ce
 * module (résolution des participants, drainage par lot, ordre pièce jointe
 * → mutation → effets), pas les internes du collaborateur.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../services/messaging/messageRemovalEffects', () => ({
  applyMessageRemovalEffects: jest.fn<any>().mockResolvedValue(undefined),
}));

import { anonymizeAccountMessages } from '../../../services/AccountMessagePurgeService';
import { applyMessageRemovalEffects } from '../../../services/messaging/messageRemovalEffects';

const USER_ID = '507f1f77bcf86cd799439011';

function fakeAttachmentRemover(overrides: Record<string, any> = {}) {
  return {
    deleteAttachment: jest.fn<any>().mockResolvedValue(undefined),
    ...overrides,
  };
}

function fakePrisma(overrides: Record<string, any> = {}) {
  return {
    participant: { findMany: jest.fn<any>().mockResolvedValue([]) },
    message: {
      findMany: jest.fn<any>().mockResolvedValue([]),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
    ...overrides,
  } as any;
}

describe('anonymizeAccountMessages', () => {
  it('resolves the account messages via its Participant ids, never User.id directly', async () => {
    const prisma = fakePrisma({
      participant: { findMany: jest.fn<any>().mockResolvedValue([{ id: 'part-1' }, { id: 'part-2' }]) },
    });
    const remover = fakeAttachmentRemover();

    await anonymizeAccountMessages(prisma, remover, USER_ID);

    expect(prisma.participant.findMany).toHaveBeenCalledWith({ where: { userId: USER_ID }, select: { id: true } });
    expect(prisma.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { senderId: { in: ['part-1', 'part-2'] }, deletedAt: null } })
    );
  });

  it('does nothing (no message query) when the account has no Participant row', async () => {
    const prisma = fakePrisma();
    const remover = fakeAttachmentRemover();

    const summary = await anonymizeAccountMessages(prisma, remover, USER_ID);

    expect(prisma.message.findMany).not.toHaveBeenCalled();
    expect(summary).toEqual({ messagesAnonymized: 0, attachmentsDeleted: 0 });
  });

  it('deletes attachments PHYSICALLY, before bulk-anonymizing the message', async () => {
    const order: string[] = [];
    const prisma = fakePrisma({
      participant: { findMany: jest.fn<any>().mockResolvedValue([{ id: 'part-1' }]) },
      message: {
        findMany: jest.fn<any>().mockResolvedValue([
          {
            id: 'msg-1',
            conversationId: 'conv-1',
            senderId: 'part-1',
            messageType: 'text',
            content: 'hello',
            metadata: null,
            attachments: [{ id: 'att-1', mimeType: 'image/jpeg' }],
          },
        ]),
        updateMany: jest.fn<any>(async () => {
          order.push('updateMany');
          return { count: 1 };
        }),
      },
    });
    const remover = fakeAttachmentRemover({
      deleteAttachment: jest.fn<any>(async () => {
        order.push('deleteAttachment');
      }),
    });

    await anonymizeAccountMessages(prisma, remover, USER_ID);

    expect(remover.deleteAttachment).toHaveBeenCalledWith('att-1');
    expect(order).toEqual(['deleteAttachment', 'updateMany']);
  });

  it('anonymizes with translations:null + deletedAt — the SAME pattern as a single "delete for everyone", never clearing content', async () => {
    const prisma = fakePrisma({
      participant: { findMany: jest.fn<any>().mockResolvedValue([{ id: 'part-1' }]) },
      message: {
        findMany: jest.fn<any>().mockResolvedValue([
          {
            id: 'msg-1',
            conversationId: 'conv-1',
            senderId: 'part-1',
            messageType: 'text',
            content: 'hello',
            metadata: null,
            attachments: [],
          },
        ]),
        updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
      },
    });

    await anonymizeAccountMessages(prisma, fakeAttachmentRemover(), USER_ID);

    expect(prisma.message.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['msg-1'] } },
      data: { translations: null, deletedAt: expect.any(Date) },
    });
  });

  it('applies the shared removal effects per message, with senderUserId set to the purged account', async () => {
    const prisma = fakePrisma({
      participant: { findMany: jest.fn<any>().mockResolvedValue([{ id: 'part-1' }]) },
      message: {
        findMany: jest.fn<any>().mockResolvedValue([
          {
            id: 'msg-1',
            conversationId: 'conv-1',
            senderId: 'part-1',
            messageType: 'text',
            content: 'hello m+abc123',
            metadata: { trackingLinks: ['abc123'] },
            attachments: [{ id: 'att-1', mimeType: 'audio/mp3' }],
          },
        ]),
        updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
      },
    });

    await anonymizeAccountMessages(prisma, fakeAttachmentRemover(), USER_ID);

    expect(applyMessageRemovalEffects).toHaveBeenCalledWith(prisma, {
      id: 'msg-1',
      conversationId: 'conv-1',
      senderId: 'part-1',
      senderUserId: USER_ID,
      messageType: 'text',
      attachmentMimeTypes: ['audio/mp3'],
      content: 'hello m+abc123',
      metadata: { trackingLinks: ['abc123'] },
    });
  });

  it('stops after a PARTIAL page — a batch smaller than the page size cannot have a successor', async () => {
    const findMany = jest.fn<any>().mockResolvedValueOnce([
      { id: 'm1', conversationId: 'c1', senderId: 'p1', messageType: 'text', content: '', metadata: null, attachments: [] },
    ]);
    const prisma = fakePrisma({
      participant: { findMany: jest.fn<any>().mockResolvedValue([{ id: 'p1' }]) },
      message: { findMany, updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }) },
    });

    const summary = await anonymizeAccountMessages(prisma, fakeAttachmentRemover(), USER_ID);

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(summary.messagesAnonymized).toBe(1);
  });

  it('drains a SECOND batch when the first page is FULL — no skip needed, each round re-reads deletedAt:null', async () => {
    const fullBatch = (prefix: string, n: number) =>
      Array.from({ length: n }, (_, i) => ({
        id: `${prefix}${i}`,
        conversationId: 'c1',
        senderId: 'p1',
        messageType: 'text',
        content: '',
        metadata: null,
        attachments: [],
      }));
    const findMany = jest
      .fn<any>()
      .mockResolvedValueOnce(fullBatch('m', 200))
      .mockResolvedValueOnce(fullBatch('n', 1));
    const prisma = fakePrisma({
      participant: { findMany: jest.fn<any>().mockResolvedValue([{ id: 'p1' }]) },
      message: { findMany, updateMany: jest.fn<any>().mockResolvedValue({ count: 200 }) },
    });

    const summary = await anonymizeAccountMessages(prisma, fakeAttachmentRemover(), USER_ID);

    expect(findMany).toHaveBeenCalledTimes(2);
    expect(summary.messagesAnonymized).toBe(201);
  });

  it("a failed attachment deletion doesn't stop the batch — the message is still anonymized", async () => {
    const prisma = fakePrisma({
      participant: { findMany: jest.fn<any>().mockResolvedValue([{ id: 'p1' }]) },
      message: {
        findMany: jest.fn<any>().mockResolvedValue([
          { id: 'm1', conversationId: 'c1', senderId: 'p1', messageType: 'text', content: '', metadata: null, attachments: [{ id: 'a1', mimeType: 'image/png' }] },
        ]),
        updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
      },
    });
    const remover = fakeAttachmentRemover({ deleteAttachment: jest.fn<any>().mockRejectedValue(new Error('storage down')) });

    const summary = await anonymizeAccountMessages(prisma, remover, USER_ID);

    expect(prisma.message.updateMany).toHaveBeenCalled();
    expect(summary.messagesAnonymized).toBe(1);
    expect(summary.attachmentsDeleted).toBe(0);
  });
});
