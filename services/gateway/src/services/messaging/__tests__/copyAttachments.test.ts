/**
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import { copyAttachmentsFromMessage } from '../copyAttachments';

function makePrisma(overrides: any = {}) {
  return {
    message: { findUnique: jest.fn().mockResolvedValue({ id: 'src', senderId: 'me' }) },
    messageAttachment: {
      findMany: jest.fn().mockResolvedValue([{ id: 'a1', mimeType: 'image/jpeg', filePath: '/p/1', fileUrl: 'u/1', fileName: 'f', originalName: 'f', fileSize: 10 }]),
      create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'copy-1', ...data })),
    },
    ...overrides,
  } as any;
}

describe('copyAttachmentsFromMessage', () => {
  it('copie les pièces jointes en réutilisant les mêmes octets', async () => {
    const prisma = makePrisma();
    const res = await copyAttachmentsFromMessage(prisma, {
      sourceMessageId: 'src', targetMessageId: 'dst', requesterParticipantId: 'me',
    });
    expect(res.copied).toBe(1);
    const written = prisma.messageAttachment.create.mock.calls[0][0].data;
    expect(written.messageId).toBe('dst');
    expect(written.filePath).toBe('/p/1');
    expect(written.forwardedFromAttachmentId ?? null).toBeNull();
  });

  // Exigence user : les destinataires d'une diffusion ne voient AUCUNE marque
  // de transfert — ni sur le message, ni sur ses pièces jointes.
  it('ne laisse aucune marque de transfert sur les pièces jointes copiées', async () => {
    const prisma = makePrisma();
    await copyAttachmentsFromMessage(prisma, {
      sourceMessageId: 'src', targetMessageId: 'dst', requesterParticipantId: 'me',
    });
    const written = prisma.messageAttachment.create.mock.calls[0][0].data;
    expect(written.forwardedFromAttachmentId ?? null).toBeNull();
    expect(written.isForwarded ?? false).toBe(false);
    // Mêmes octets, jamais un ré-envoi : le fichier est partagé, pas dupliqué.
    expect(written.fileUrl).toBe('u/1');
  });

  it('refuse quand l’appelant n’est pas l’auteur du message source', async () => {
    const prisma = makePrisma({ message: { findUnique: jest.fn().mockResolvedValue({ id: 'src', senderId: 'someone-else' }) } });
    await expect(copyAttachmentsFromMessage(prisma, {
      sourceMessageId: 'src', targetMessageId: 'dst', requesterParticipantId: 'me',
    })).rejects.toThrow(/not-owner/);
    expect(prisma.messageAttachment.create).not.toHaveBeenCalled();
  });

  it('remonte l’échec au lieu de laisser une bulle vide', async () => {
    const prisma = makePrisma();
    prisma.messageAttachment.create.mockRejectedValueOnce(new Error('db down'));
    await expect(copyAttachmentsFromMessage(prisma, {
      sourceMessageId: 'src', targetMessageId: 'dst', requesterParticipantId: 'me',
    })).rejects.toThrow('db down');
  });
});
