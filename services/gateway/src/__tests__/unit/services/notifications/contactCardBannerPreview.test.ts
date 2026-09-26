/**
 * #8122 — une carte de visite partagée s'annonce par son CONTACT, jamais par
 * son fichier.
 *
 * Un message dont la première pièce est une vCard (`text/vcard`) poussait
 * « 📎 Fichier .vcf » : `buildMessageNotificationBodyI18n` ne connaissait que
 * photo / vidéo / audio / document, et l'éventail lui remettait le nom de
 * fichier STOCKÉ (`contact_<…>_<uuid>.vcf`), relu ensuite dans
 * `metadata.attachments.firstFilename`. Le corps dit désormais « 👤 Awa Diallo »
 * (le nom tel que l'auteur l'a nommé, lu dans `originalName` — le fichier n'est
 * pas relu), « 👤 Carte de visite » dans la langue du destinataire quand aucun
 * nom n'est lisible, et aucun nom technique ne part plus avec la bannière.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { NOTIFICATION_LANGUAGES } from '@meeshy/shared/utils/notification-strings';

import { notifyMessageRecipients } from '../../../../services/messaging/messageNotificationFanOut';
import { buildMessageNotificationBodyI18n } from '../../../../services/notifications/notification-preview';

jest.mock('../../../../utils/logger-enhanced', () => ({
  notificationLogger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
  securityLogger: { logViolation: jest.fn() },
  enhancedLogger: { child: () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }) },
}));

const LEGACY_ORIGINAL_NAME = 'contact_3F2504E0-4F89-11D3-9A0C-0305E82C3301_Awa Diallo.vcf';
const STORED_FILE_NAME = 'contact_3F2504E0_4F89_11D3_9A0C_0305E82C3301_Awa_Di_9b1c2d3e-0000-4000-8000-000000000000.vcf';

describe('corps de bannière — le premier média est une carte de visite', () => {
  it('dit « 👤 » et le nom du contact', () => {
    const body = buildMessageNotificationBodyI18n('fr', {
      messagePreview: '',
      attachments: [{ type: 'contact', filename: 'Awa Diallo.vcf', contactName: 'Awa Diallo' }],
      firstAttachmentFileSize: 412,
    });

    expect(body).toBe('👤 Awa Diallo');
  });

  it('dit « Carte de visite » dans la langue du destinataire quand aucun nom n’est lisible', () => {
    const summary = { type: 'contact' as const, filename: 'contact.vcf', contactName: null };

    expect(buildMessageNotificationBodyI18n('fr', { attachments: [summary] })).toBe('👤 Carte de visite');
    expect(buildMessageNotificationBodyI18n('en', { attachments: [summary] })).toBe('👤 Contact card');
    for (const lang of NOTIFICATION_LANGUAGES) {
      const body = buildMessageNotificationBodyI18n(lang, { attachments: [summary] });
      expect(body.startsWith('👤 ')).toBe(true);
      expect(body).not.toMatch(/vcf|Fichier|📎/);
    }
  });

  it('une carte en pièce SUIVANTE se compte en badge 👤, jamais comme un fichier', () => {
    const body = buildMessageNotificationBodyI18n('fr', {
      messagePreview: 'Voici son contact',
      attachments: [
        { type: 'image', filename: 'plage.jpg' },
        { type: 'contact', filename: 'Awa Diallo.vcf', contactName: 'Awa Diallo' },
      ],
    });

    expect(body).toBe('Voici son contact +1👤');
  });
});

const CONV_ID = '507f1f77bcf86cd799439022';
const MSG_ID = '507f1f77bcf86cd799439051';
const SENDER_PART_ID = '507f1f77bcf86cd799439031';
const SENDER_USER_ID = '507f1f77bcf86cd799439041';
const RECIPIENT_USER_ID = '507f1f77bcf86cd799439045';

const vcardAttachment = (originalName: string) => ({
  mimeType: 'text/vcard',
  fileName: STORED_FILE_NAME,
  originalName,
  fileSize: 412,
  duration: null,
  width: null,
  height: null,
  fileUrl: `https://cdn.example/${STORED_FILE_NAME}`,
  transcription: null,
  translations: null,
  isViewOnce: false,
  isBlurred: false,
  effectFlags: 0,
});

async function servedToRegularFanOut(originalName: string): Promise<Record<string, unknown>> {
  const createMessageNotification = jest.fn<any>().mockResolvedValue({ id: 'notif' });
  const prisma = {
    participant: {
      findUnique: jest.fn<any>().mockResolvedValue({ userId: SENDER_USER_ID, displayName: 'Alice', avatar: null }),
    },
    user: { findUnique: jest.fn<any>().mockResolvedValue({ username: 'alice', displayName: 'Alice', avatar: null }) },
    conversation: {
      findUnique: jest.fn<any>().mockResolvedValue({
        title: 'Salon',
        type: 'group',
        participants: [{ userId: SENDER_USER_ID }, { userId: RECIPIENT_USER_ID }],
      }),
    },
    message: { findUnique: jest.fn<any>().mockResolvedValue({ deletedAt: null }) },
    notification: {
      findMany: jest.fn<any>().mockResolvedValue([]),
      deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
    messageAttachment: { findMany: jest.fn<any>().mockResolvedValue([vcardAttachment(originalName)]) },
    userConversationPreferences: { findMany: jest.fn<any>().mockResolvedValue([]) },
  };

  await notifyMessageRecipients({
    prisma: prisma as any,
    notificationService: {
      createMessageNotification,
      createReplyNotification: jest.fn<any>(),
      createMentionNotificationsBatch: jest.fn<any>(),
    },
    message: {
      id: MSG_ID,
      messageType: 'file',
      replyToId: null,
      isEncrypted: false,
      encryptionMode: null,
      isViewOnce: false,
      isBlurred: false,
      effectFlags: 0,
      expiresAt: null,
      createdAt: new Date('2026-09-26T10:00:00Z'),
      encryptedContent: null,
    } as any,
    senderParticipantId: SENDER_PART_ID,
    conversationId: CONV_ID,
    processedContent: '',
    validatedMentionUserIds: [],
  });

  expect(createMessageNotification).toHaveBeenCalledTimes(1);
  return createMessageNotification.mock.calls[0][0] as Record<string, unknown>;
}

describe('éventail — ce qu’il remet pour une carte de visite', () => {
  it('résume la pièce comme un CONTACT nommé, lu dans son nom d’origine', async () => {
    const served = await servedToRegularFanOut(LEGACY_ORIGINAL_NAME);

    expect(served.attachments).toEqual([{ type: 'contact', filename: 'Awa Diallo.vcf', contactName: 'Awa Diallo' }]);
  });

  it('ne laisse partir aucun nom de fichier technique', async () => {
    const served = await servedToRegularFanOut(LEGACY_ORIGINAL_NAME);

    expect(served.firstAttachmentFilename).toBe('Awa Diallo.vcf');
    const { firstAttachmentUrl: _adresseDuFichier, ...annonce } = served;
    expect(JSON.stringify(annonce)).not.toContain('contact_3F2504E0');
  });

  it('sans nom lisible, la pièce reste un contact — le corps dira « Carte de visite »', async () => {
    const served = await servedToRegularFanOut('contact_3F2504E0-4F89-11D3-9A0C-0305E82C3301_.vcf');

    expect(served.attachments).toEqual([{ type: 'contact', filename: 'contact.vcf', contactName: null }]);
    expect(served.firstAttachmentFilename).toBe('contact.vcf');
  });
});
