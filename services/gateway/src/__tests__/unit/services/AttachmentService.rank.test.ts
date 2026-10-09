/**
 * #9776 — les pièces d'un envoi groupé arrivent dans l'ordre du composeur.
 *
 * Les téléversements partent EN PARALLÈLE : `createdAt` (l'heure de FIN de
 * chaque téléversement) ne dit donc pas l'ordre choisi par l'auteur. Seul
 * l'ordre de `attachmentIds` dans la requête de création le dit — le lien
 * l'écrit en `rank`, et toute lecture trie par `MESSAGE_ATTACHMENT_ORDER`.
 *
 * Le double de base ci-dessous INTERPRÈTE ce que le service lui passe (`where`,
 * `data`, `orderBy`) avec la sémantique de MongoDB — un champ absent ou nul se
 * range EN TÊTE d'un tri ascendant. Il ne recopie aucune règle de production :
 * il exécute la requête que la production compose.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../services/attachments/UploadProcessor', () => ({
  UploadProcessor: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('../../../services/attachments/MetadataManager', () => ({
  MetadataManager: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('../../../services/AttachmentEncryptionService', () => ({
  getAttachmentEncryptionService: jest.fn(() => ({})),
}));
jest.mock('../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: {
    child: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
  },
}));

import { AttachmentService } from '../../../services/attachments';
import { MESSAGE_ATTACHMENT_ORDER } from '../../../services/attachments/attachmentIncludes';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';
import { makeAttachmentStore, type StoredAttachment } from './attachment-order-store';

const MSG_ID = '507f1f77bcf86cd7994390aa';
const id = (n: number) => `507f1f77bcf86cd7994390${n.toString(16).padStart(2, '0')}`;

const finishedAt = (second: number) => new Date(Date.UTC(2026, 9, 9, 12, 0, second));

const uploadedOutOfOrder = (): StoredAttachment[] => [
  { id: id(1), createdAt: finishedAt(3), effectFlags: 0 },
  { id: id(2), createdAt: finishedAt(1), effectFlags: 0 },
  { id: id(3), createdAt: finishedAt(4), effectFlags: 0 },
  { id: id(4), createdAt: finishedAt(2), effectFlags: 0 },
];

const servedIds = (store: ReturnType<typeof makeAttachmentStore>) =>
  store.findMany({ where: { messageId: MSG_ID }, orderBy: MESSAGE_ATTACHMENT_ORDER }).map((row) => row.id);

describe('#9776 — les pièces gardent l’ordre du composeur', () => {
  it('quatre pièces terminées dans le désordre sont servies dans l’ordre demandé', async () => {
    const store = makeAttachmentStore(uploadedOutOfOrder());
    const svc = new AttachmentService(store.prisma as unknown as PrismaClient);

    await svc.associateAttachmentsToMessage([id(3), id(1), id(4), id(2)], MSG_ID);

    expect(servedIds(store)).toEqual([id(3), id(1), id(4), id(2)]);
  });

  it('l’ordre tient aussi quand le message porte une protection (chemin des bits composés)', async () => {
    const store = makeAttachmentStore(uploadedOutOfOrder());
    const svc = new AttachmentService(store.prisma as unknown as PrismaClient);

    await svc.associateAttachmentsToMessage([id(4), id(3), id(2), id(1)], MSG_ID, {
      isBlurred: true,
      effectFlags: MESSAGE_EFFECT_FLAGS.BLURRED,
    });

    expect(servedIds(store)).toEqual([id(4), id(3), id(2), id(1)]);
  });

  it('un id répété garde le rang de sa PREMIÈRE apparition', async () => {
    const store = makeAttachmentStore(uploadedOutOfOrder());
    const svc = new AttachmentService(store.prisma as unknown as PrismaClient);

    await svc.associateAttachmentsToMessage([id(2), id(1), id(2), id(3), id(4)], MSG_ID);

    expect(servedIds(store)).toEqual([id(2), id(1), id(3), id(4)]);
  });

  it('un message d’AVANT le rang se lit dans un ordre stable : createdAt, puis id', () => {
    const store = makeAttachmentStore([
      { id: id(9), messageId: MSG_ID, createdAt: finishedAt(5), effectFlags: 0 },
      { id: id(7), messageId: MSG_ID, createdAt: finishedAt(1), effectFlags: 0 },
      { id: id(8), messageId: MSG_ID, createdAt: finishedAt(1), effectFlags: 0 },
    ]);

    expect(servedIds(store)).toEqual([id(7), id(8), id(9)]);
  });

  it('une pièce déjà portée par un autre message ne reçoit ni lien ni rang', async () => {
    const store = makeAttachmentStore([
      { id: id(1), messageId: 'autre-message', rank: 5, createdAt: finishedAt(1), effectFlags: 0 },
      { id: id(2), createdAt: finishedAt(2), effectFlags: 0 },
    ]);
    const svc = new AttachmentService(store.prisma as unknown as PrismaClient);

    await svc.associateAttachmentsToMessage([id(1), id(2)], MSG_ID);

    expect(store.row(id(1))).toMatchObject({ messageId: 'autre-message', rank: 5 });
    expect(store.row(id(2))).toMatchObject({ messageId: MSG_ID, rank: 1 });
  });
});
