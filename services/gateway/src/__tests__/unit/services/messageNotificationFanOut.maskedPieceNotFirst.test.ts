/**
 * Une pièce MASQUÉE ne se dénonce pas parce qu'une pièce ORDINAIRE la précède.
 *
 * `maskedAttachment` le dit chez elle (`packages/shared/utils/attachment-protection.ts`) :
 * « Le fail-closed de ce domaine vit dans l'APPELANT, qui doit poser la question
 * pour CHAQUE pièce et non pour la première. » L'éventail ne la posait que pour
 * `attachments[0]`, puis remettait `attachments.map(bannerAttachmentOf)` ENTIER —
 * nature, nom de fichier, nom d'origine, nombre de pages, nom du contact — et
 * comptait les pièces masquées dans `attachmentCount`.
 *
 * Le témoin s'écrit donc sur un rang AUTRE que le premier (leçon 261) : au rang 0
 * la garde du cycle 125 et la règle juste rendent le même verdict, et un témoin
 * posé là ne peut pas tomber. Le contrôle à l'ordre inversé le prouve.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

import { notifyMessageRecipients } from '../../../services/messaging/messageNotificationFanOut';

const CONV_ID = '507f1f77bcf86cd799439022';
const MSG_ID = '507f1f77bcf86cd799439051';
const SENDER_PART_ID = '507f1f77bcf86cd799439031';
const SENDER_USER_ID = '507f1f77bcf86cd799439041';
const PEER_USER_ID = '507f1f77bcf86cd799439042';

/** La pièce que l'utilisateur accepte de montrer. */
const ordinaryPhoto = {
  id: '507f1f77bcf86cd799439061',
  mimeType: 'image/jpeg',
  fileName: 'photo.jpg',
  originalName: 'photo.jpg',
  fileSize: 1024,
  duration: null,
  width: 100,
  height: 100,
  fileUrl: '/u/photo.jpg',
  thumbnailUrl: '/u/photo-thumb.jpg',
  transcription: null,
  translations: null,
  isViewOnce: false,
  isBlurred: false,
  effectFlags: 0,
  pageCount: null,
  lineCount: null,
};

/**
 * La pièce dont TOUTE la protection est de ne se montrer qu'une fois. Son nom de
 * fichier est le secret autant que son contenu.
 */
const maskedPayslip = {
  id: '507f1f77bcf86cd799439062',
  mimeType: 'application/pdf',
  fileName: 'salaires-2026.pdf',
  originalName: 'salaires-2026.pdf',
  fileSize: 2048,
  duration: null,
  width: null,
  height: null,
  fileUrl: '/u/salaires-2026.pdf',
  thumbnailUrl: null,
  transcription: null,
  translations: null,
  isViewOnce: true,
  isBlurred: false,
  effectFlags: 0,
  pageCount: 12,
  lineCount: null,
};

function makePrisma(attachments: unknown[]) {
  return {
    participant: {
      findUnique: jest
        .fn<any>()
        .mockResolvedValue({ userId: SENDER_USER_ID, displayName: 'Alice P', avatar: null }),
    },
    user: {
      findUnique: jest
        .fn<any>()
        .mockResolvedValue({ username: 'alice', displayName: 'Alice', avatar: null }),
    },
    conversation: {
      findUnique: jest.fn<any>().mockResolvedValue({
        title: 'Salon',
        type: 'group',
        participants: [{ userId: SENDER_USER_ID }, { userId: PEER_USER_ID }],
      }),
    },
    message: { findUnique: jest.fn<any>().mockResolvedValue({ deletedAt: null }) },
    notification: {
      findMany: jest.fn<any>().mockResolvedValue([]),
      deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
    messageAttachment: { findMany: jest.fn<any>().mockResolvedValue(attachments) },
    userConversationPreferences: { findMany: jest.fn<any>().mockResolvedValue([]) },
  };
}

function makeNotificationService() {
  return {
    createReplyNotification: jest.fn<any>().mockResolvedValue(null),
    createMentionNotificationsBatch: jest.fn<any>().mockResolvedValue(0),
    createMessageNotification: jest.fn<any>().mockResolvedValue(null),
  };
}

/** Aucune protection au niveau du MESSAGE : tout se décide par la PIÈCE. */
const unprotectedMessage = {
  id: MSG_ID,
  messageType: 'image',
  replyToId: null,
  isEncrypted: false,
  encryptionMode: null,
  isViewOnce: false,
  isBlurred: false,
  effectFlags: 0,
  expiresAt: null,
  createdAt: new Date('2026-11-06T10:00:00Z'),
  encryptedContent: null,
};

async function fanOut(attachments: unknown[]) {
  const prisma = makePrisma(attachments);
  const notificationService = makeNotificationService();

  await notifyMessageRecipients({
    prisma: prisma as any,
    notificationService,
    message: unprotectedMessage,
    senderParticipantId: SENDER_PART_ID,
    conversationId: CONV_ID,
    processedContent: '',
  });

  const [params] = notificationService.createMessageNotification.mock.calls[0] as [
    Record<string, unknown>
  ];
  return params;
}

describe('notifyMessageRecipients — une pièce masquée au rang 2 ne voyage pas', () => {
  it('ne remet AUCUNE entrée d’inventaire pour la pièce masquée', async () => {
    const params = await fanOut([ordinaryPhoto, maskedPayslip]);

    expect(params.attachments).toEqual([
      expect.objectContaining({ filename: 'photo.jpg', type: 'image' }),
    ]);
  });

  it('ne dénonce ni le nom, ni le nom d’origine, ni le nombre de pages de la pièce masquée', async () => {
    const params = await fanOut([ordinaryPhoto, maskedPayslip]);

    const charge = JSON.stringify(params);
    expect(charge).not.toContain('salaires-2026');
    expect(charge).not.toContain('application/pdf');
    expect(charge).not.toContain('"pageCount":12');
  });

  it('ne compte pas la pièce masquée — son EXISTENCE est déjà une divulgation', async () => {
    const params = await fanOut([ordinaryPhoto, maskedPayslip]);

    expect(params.attachmentCount).toBe(1);
    expect(params.hasAttachments).toBe(true);
  });

  it('laisse voyager la pièce ordinaire — la garde retire le masqué, pas le reste', async () => {
    const params = await fanOut([ordinaryPhoto, maskedPayslip]);

    expect(params.firstAttachmentId).toBe(ordinaryPhoto.id);
    expect(params.firstAttachmentType).toBe('image');
    // Une image ne remet jamais son propre fichier : seule la vignette du
    // serveur voyage (`pushedAttachmentFile`).
    expect(params.firstAttachmentUrl).toBe(ordinaryPhoto.thumbnailUrl);
    expect(params.firstAttachmentIsThumbnail).toBe(true);
  });

  it('CONTRÔLE — masquée au rang 1, rien ne voyage : le défaut tenait au RANG', async () => {
    const params = await fanOut([maskedPayslip, ordinaryPhoto]);

    expect(params.attachments).toBeUndefined();
    expect(params.attachmentCount).toBeUndefined();
    expect(JSON.stringify(params)).not.toContain('salaires-2026');
  });
});
