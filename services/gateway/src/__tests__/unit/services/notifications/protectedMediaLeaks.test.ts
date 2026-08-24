/**
 * Cycle 125 — la protection masquait le TEXTE et laissait partir le FICHIER.
 *
 * Le cycle 124 a fermé le CORPS d'un vocal protégé : la transcription ne gagne
 * plus sur le placeholder que `protectedPreview` compose. Il restait, dans le
 * MÊME objet et une ligne plus bas, la chose que la protection existe pour
 * masquer :
 *
 *     firstAttachmentUrl: first?.fileUrl || undefined,
 *     firstAttachmentMimeType: first?.mimeType || undefined,
 *
 * `attachmentInfo` est composé et remis au créateur SANS aucune condition de
 * protection, et la NSE iOS télécharge `attachmentUrl` puis l'attache en
 * `UNNotificationAttachment` sans regarder `notificationLocKey` non plus. Une
 * photo à VUE UNIQUE, FLOUTÉE, ÉPHÉMÈRE ou CHIFFRÉE s'affichait donc EN ENTIER
 * sur l'écran verrouillé, sous une bannière disant « 👁️ 🖼️ ».
 *
 * C'est la forme du cycle 124 portée d'un cran : la garde y masquait le texte
 * pendant que l'hôte servait le texte transcrit ; ici elle masque le texte
 * pendant que l'hôte sert le MÉDIA LUI-MÊME — un aveuglement plus complet,
 * puisque aucun texte n'a jamais eu à fuir pour que le secret parte.
 *
 * > La question à poser à une garde n'est pas seulement « le texte qu'elle
 * > gouverne est-il bien celui qui part ? » (cycle 124) mais « **qu'est-ce qui
 * > part À CÔTÉ du texte qu'elle gouverne ?** ». Une protection de CONTENU se
 * > mesure sur tout ce que la charge transporte, pas sur sa seule chaîne.
 *
 * Second constat, distinct : `MessageAttachment` porte SES PROPRES drapeaux de
 * masquage (`isViewOnce`, `isBlurred`, `effectFlags`) et le `select` de
 * l'éventail n'en lisait AUCUN. La protection d'un média n'était donc lue à
 * aucun des deux niveaux qui la déclarent.
 *
 * Les témoins portent sur ce qui PART — ce que l'éventail remet au créateur, et
 * la charge remise à APNs — jamais sur un calcul intermédiaire.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

import { notifyMessageRecipients } from '../../../../services/messaging/messageNotificationFanOut';
import { NotificationService } from '../../../../services/notifications/NotificationService';

jest.mock('../../../../utils/logger-enhanced', () => ({
  notificationLogger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
  securityLogger: { logViolation: jest.fn() },
  enhancedLogger: { child: () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }) },
}));

const CONV_ID = '507f1f77bcf86cd799439022';
const MSG_ID = '507f1f77bcf86cd799439051';
const SENDER_PART_ID = '507f1f77bcf86cd799439031';
const SENDER_USER_ID = '507f1f77bcf86cd799439041';
const PEER_USER_ID = '507f1f77bcf86cd799439042';

/** Le FICHIER : aucun témoin de ce fichier ne doit le retrouver sur un fil. */
const SECRET_URL = 'https://cdn.example/private/polaroid.jpg';

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

const photoAttachment = (overrides: Record<string, unknown> = {}) => ({
  mimeType: 'image/jpeg',
  fileName: 'resultats-analyses.jpg',
  fileSize: 240_000,
  duration: null,
  width: 1024,
  height: 768,
  fileUrl: SECRET_URL,
  transcription: null,
  translations: null,
  isViewOnce: false,
  isBlurred: false,
  effectFlags: 0,
  ...overrides,
});

function makeMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: MSG_ID,
    messageType: 'image',
    replyToId: null,
    isEncrypted: false,
    encryptionMode: null,
    isViewOnce: false,
    isBlurred: false,
    effectFlags: 0,
    expiresAt: null,
    createdAt: new Date('2026-08-24T10:00:00Z'),
    encryptedContent: null,
    ...overrides,
  };
}

/** Ce que l'éventail remet au créateur de notification pour le seul destinataire. */
async function servedParams(opts: {
  attachments?: unknown[];
  message?: Record<string, unknown>;
  processedContent?: string;
}): Promise<Record<string, unknown>> {
  const createMessageNotification = jest.fn<any>().mockResolvedValue({ id: 'notif' });
  await notifyMessageRecipients({
    prisma: makePrisma(opts.attachments ?? [photoAttachment()]) as any,
    notificationService: {
      createReplyNotification: jest.fn<any>().mockResolvedValue(null),
      createMentionNotificationsBatch: jest.fn<any>().mockResolvedValue(0),
      createMessageNotification,
    },
    message: makeMessage(opts.message) as any,
    senderParticipantId: SENDER_PART_ID,
    conversationId: CONV_ID,
    processedContent: opts.processedContent ?? '',
  });

  expect(createMessageNotification).toHaveBeenCalledTimes(1);
  return createMessageNotification.mock.calls[0][0] as Record<string, unknown>;
}

// ── L'éventail — ce qu'il remet au créateur ─────────────────────────────────

describe('éventail — le FICHIER ne franchit pas une protection du MESSAGE', () => {
  // La table des quatre protections, une par branche de `protectedPreview` :
  // celle-là même qui compose déjà le placeholder du corps.
  const protections: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
    ['vue unique', { isViewOnce: true }],
    ['flouté', { isBlurred: true }],
    ['éphémère', { expiresAt: new Date('2026-08-24T11:00:00Z') }],
    ['chiffré', { isEncrypted: true }],
  ];

  it.each(protections)('une photo %s ne remet aucune URL', async (_label, overrides) => {
    const params = await servedParams({ message: overrides });

    expect(params.firstAttachmentUrl).toBeUndefined();
    expect(params.firstAttachmentMimeType).toBeUndefined();
    expect(params.notificationLocKey).toBeTruthy();
  });

  it.each(protections)('ni l\'étiquette qui la décrit (%s)', async (_label, overrides) => {
    // Le nom de fichier est PERSISTÉ dans `metadata.attachments.firstFilename`,
    // donc relu longtemps après que la bannière a disparu. « Un aperçu vu puis
    // oublié n'est pas une ligne relue » (cycle 124) : la protection vaut pour
    // les deux, et le placeholder porte déjà l'icône de type.
    const params = await servedParams({ message: overrides });

    expect(params.attachments).toBeUndefined();
    expect(params.firstAttachmentFilename).toBeUndefined();
    expect(params.firstAttachmentFileSize).toBeUndefined();
    expect(params.hasAttachments).toBeFalsy();
    expect(JSON.stringify(params)).not.toContain('resultats-analyses');
  });

  it('un média ORDINAIRE voyage toujours — son URL et son type', async () => {
    // Mode d'échec du CORRECTIF : refermer la fuite ne doit pas supprimer le
    // rich-push du cas nominal, qui est la raison d'être de ces champs.
    const params = await servedParams({});

    expect(params.firstAttachmentUrl).toBe(SECRET_URL);
    expect(params.firstAttachmentMimeType).toBe('image/jpeg');
    expect(params.hasAttachments).toBe(true);
    expect(params.firstAttachmentWidth).toBe(1024);
  });
});

describe('éventail — le FICHIER ne franchit pas une protection de la PIÈCE JOINTE', () => {
  // Second niveau, que le `select` de l'éventail ne lisait pas du tout :
  // `MessageAttachment` porte SES drapeaux. Le message, lui, n'est pas protégé —
  // sa bannière garde donc son texte, et seul le média est retenu.
  const masked: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
    ['vue unique', { isViewOnce: true }],
    ['floutée', { isBlurred: true }],
    ['drapeau VIEW_ONCE', { effectFlags: 4 }],
    ['drapeau BLURRED', { effectFlags: 2 }],
  ];

  it.each(masked)('une pièce jointe %s ne remet aucune URL', async (_label, overrides) => {
    const params = await servedParams({
      attachments: [photoAttachment(overrides)],
      processedContent: 'Regarde',
    });

    expect(params.firstAttachmentUrl).toBeUndefined();
    expect(params.messagePreview).toBe('Regarde');
  });
});

// ── Le second verrou — la charge remise à APNs ──────────────────────────────

const RECIPIENT_ID = '507f1f77bcf86cd799439043';

function makeServicePrisma() {
  return {
    message: {
      findUnique: jest.fn<any>().mockResolvedValue({
        deletedAt: null,
        expiresAt: null,
        isViewOnce: true,
        viewOnceCount: 0,
        createdAt: new Date('2026-08-24T10:00:00Z'),
        messageType: 'image',
        translations: null,
        originalLanguage: 'fr',
      }),
    },
    user: {
      findUnique: jest.fn<any>().mockResolvedValue({
        id: RECIPIENT_ID,
        username: 'alice',
        displayName: 'Alice',
        avatar: null,
        systemLanguage: 'fr',
        regionalLanguage: null,
        customDestinationLanguage: null,
        deviceLocale: null,
      }),
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
    conversation: { findUnique: jest.fn<any>().mockResolvedValue({ title: 'Salon', type: 'group', avatar: null }) },
    notification: {
      create: jest.fn<any>().mockImplementation((args: any) => ({ id: 'notif_x', ...args.data })),
      findMany: jest.fn<any>().mockResolvedValue([]),
      count: jest.fn<any>().mockResolvedValue(0),
    },
    userConversationPreferences: { findUnique: jest.fn<any>().mockResolvedValue(null) },
    userPreferences: { findUnique: jest.fn<any>().mockResolvedValue(null) },
  } as any;
}

/** La charge REMISE à APNs pour un appelant qui déclare un placeholder de protection. */
async function pushedData(extra: Record<string, unknown>): Promise<Record<string, unknown>> {
  const prisma = makeServicePrisma();
  const sendToUser = jest.fn<any>().mockResolvedValue(undefined);
  const service = new NotificationService(prisma);
  service.setSocketIO({
    to: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    fetchSockets: jest.fn<any>().mockResolvedValue([]),
    emit: jest.fn(),
  } as any);
  service.setPushNotificationService({ sendToUser } as any);

  await service.createMessageNotification({
    recipientUserId: RECIPIENT_ID,
    senderId: SENDER_USER_ID,
    messageId: MSG_ID,
    conversationId: CONV_ID,
    messagePreview: '👁️ 🖼️',
    firstAttachmentUrl: SECRET_URL,
    firstAttachmentMimeType: 'image/jpeg',
    firstAttachmentDuration: 12,
    ...extra,
  } as any);

  return (sendToUser.mock.calls[0]?.[0] as any)?.payload?.data ?? {};
}

describe('charge APNs — le second verrou du média', () => {
  it('un `notificationLocKey` retient l\'URL, le type et la durée', async () => {
    // Même arbitrage que `previewPrismSource` et `prePersistedMessageFields` :
    // un appelant qui compose un placeholder de protection sans retirer son
    // média perd le rich-push, jamais le secret. Une garde de confidentialité
    // échoue en montrant MOINS.
    const data = await pushedData({ notificationLocKey: 'notification.view_once_message' });

    expect(data.attachmentUrl).toBe('');
    expect(data.attachmentMimeType).toBe('');
    expect(data.attachmentDurationMs).toBe('');
  });

  it('et sans lui, le média voyage', async () => {
    const data = await pushedData({});

    expect(data.attachmentUrl).toBe(SECRET_URL);
    expect(data.attachmentMimeType).toBe('image/jpeg');
  });
});
