/**
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import { copyAttachmentsFromMessage } from '../copyAttachments';
import { MESSAGE_ATTACHMENT_ORDER } from '../../attachments/attachmentIncludes';
import { makeAttachmentStore } from '../../../__tests__/unit/services/attachment-order-store';

function makePrisma(overrides: any = {}) {
  return {
    message: {
      findUnique: jest.fn().mockResolvedValue({ sender: { id: 'me', userId: 'u1' } }),
    },
    participant: {
      findUnique: jest.fn().mockResolvedValue({ id: 'me', userId: 'u1' }),
    },
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
    const prisma = makePrisma({
      message: { findUnique: jest.fn().mockResolvedValue({ sender: { id: 'someone-else', userId: 'u2' } }) },
    });
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

  // Round de correction 1 — CRITICAL : `Message.senderId` (source) et
  // `requesterParticipantId` (cible) sont des `Participant.id` de
  // CONVERSATIONS DIFFÉRENTES dès que la diffusion vise une 2e conversation —
  // exactement le cas d'usage de ce module. Comparer les deux id bruts
  // refusait 100 % des diffusions au-delà de la première cible.
  it('autorise la copie quand la source et la cible sont deux participants DIFFÉRENTS du MÊME utilisateur (diffusion vers une autre conversation)', async () => {
    const prisma = makePrisma({
      message: { findUnique: jest.fn().mockResolvedValue({ sender: { id: 'p_famille', userId: 'u1' } }) },
      participant: { findUnique: jest.fn().mockResolvedValue({ id: 'p_collegues', userId: 'u1' }) },
    });
    const res = await copyAttachmentsFromMessage(prisma, {
      sourceMessageId: 'src', targetMessageId: 'dst', requesterParticipantId: 'p_collegues',
    });
    expect(res.copied).toBe(1);
  });

  // Le `requester.userId != null` est INDISPENSABLE : sans lui, deux
  // participants ANONYMES de conversations différentes (userId null des deux
  // côtés) seraient mutuellement propriétaires sur `null === null`.
  it('refuse deux anonymes de conversations différentes malgré un userId null des deux côtés', async () => {
    const prisma = makePrisma({
      message: { findUnique: jest.fn().mockResolvedValue({ sender: { id: 'p_anon_a', userId: null } }) },
      participant: { findUnique: jest.fn().mockResolvedValue({ id: 'p_anon_b', userId: null }) },
    });
    await expect(copyAttachmentsFromMessage(prisma, {
      sourceMessageId: 'src', targetMessageId: 'dst', requesterParticipantId: 'p_anon_b',
    })).rejects.toThrow(/not-owner/);
  });

  // Round de correction 1 — IMPORTANT : une source sans pièce jointe (message
  // texte, ou pièces jointes balayées entre-temps) ne doit PAS rendre
  // { copied: 0 } silencieusement — la bulle créée côté appelant serait vide
  // et diffusée telle quelle à tous les destinataires.
  it('refuse une source sans aucune pièce jointe', async () => {
    const prisma = makePrisma({
      messageAttachment: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
      },
    });
    await expect(copyAttachmentsFromMessage(prisma, {
      sourceMessageId: 'src', targetMessageId: 'dst', requesterParticipantId: 'me',
    })).rejects.toThrow(/empty-source/);
    expect(prisma.messageAttachment.create).not.toHaveBeenCalled();
  });
});

describe('copyAttachmentsFromMessage — l’ordre du message source (#9776)', () => {
  it('la copie garde l’ordre de la source, quelle que soit l’heure de création des copies', async () => {
    const at = (s: number) => new Date(Date.UTC(2026, 9, 9, 12, 0, s));
    const store = makeAttachmentStore([
      { id: 'a', messageId: 'src', rank: 2, createdAt: at(1), fileUrl: 'u/a' },
      { id: 'b', messageId: 'src', rank: 0, createdAt: at(3), fileUrl: 'u/b' },
      { id: 'c', messageId: 'src', rank: 1, createdAt: at(2), fileUrl: 'u/c' },
    ]);
    const prisma = makePrisma({ messageAttachment: store.prisma.messageAttachment });

    await copyAttachmentsFromMessage(prisma, {
      sourceMessageId: 'src', targetMessageId: 'dst', requesterParticipantId: 'me',
    });

    const served = store.findMany({ where: { messageId: 'dst' }, orderBy: MESSAGE_ATTACHMENT_ORDER });
    expect(served.map((row) => row.fileUrl)).toEqual(['u/b', 'u/c', 'u/a']);
  });
});
