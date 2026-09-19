/**
 * #7003 — l'extension de notification iOS ne pouvait pas savoir ce qu'elle
 * s'apprêtait à descendre.
 *
 * `messageNotificationFanOut` remettait `firstAttachmentFileSize` depuis le
 * cycle 125 bis, et le créateur le posait dans `metadata.attachments.firstFileSize`
 * — une ligne de base de données. **La charge APNs, elle, ne le portait pas.**
 * Or c'est elle, et elle seule, que la NSE lit : l'extension téléchargeait donc
 * le média sans plafond, dans une enveloppe mémoire d'environ 24 Mo, et un
 * message vidéo de 40 Mo la faisait tuer par jetsam — sans rapport de crash,
 * donc invisible en production.
 *
 * > **Un champ REMIS n'est pas un champ SERVI.** C'est la leçon du cycle 122,
 * > rejouée sur une taille au lieu d'une traduction : la valeur existait, elle
 * > était juste, elle voyageait — mais pas jusqu'au seul lecteur qui en avait
 * > l'usage.
 *
 * Les témoins portent sur le bloc `data` que la NSE lit, jamais sur un calcul
 * intermédiaire.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

import { NotificationService } from '../../../../services/notifications/NotificationService';

jest.mock('../../../../utils/logger-enhanced', () => ({
  notificationLogger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
  securityLogger: { logViolation: jest.fn() },
  enhancedLogger: { child: () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }) },
}));

const CONV_ID = '507f1f77bcf86cd799439022';
const MSG_ID = '507f1f77bcf86cd799439051';
const SENDER_USER_ID = '507f1f77bcf86cd799439041';
const RECIPIENT_ID = '507f1f77bcf86cd799439043';

const SERVER_CLOCK = new Date('2026-08-24T10:00:00Z');

const PHOTO_URL = '/api/v1/attachments/file/photo.jpg';
const PHOTO_BYTES = 240_000;

const ORIGINAL_VOICE_URL = '/api/v1/attachments/file/voice_note.m4a';
const FR_TRACK_URL = '/api/v1/attachments/file/translated/att_fr.mp3';

/**
 * CE QUE LA CHARGE PUSH PORTE DEPUIS #7022 — l'adresse ABSOLUE, composée par
 * la passerelle (`publicMediaUrl`). La NSE iOS n'a aucune base configurée : un
 * chemin relatif n'y est pas téléchargeable, et une clé de stockage — la forme
 * que `normalize-media-urls.ts` laisse en base — encore moins. La RÉFÉRENCE,
 * elle, reste nue dans le contexte persisté ; seul le fil la compose.
 */
const SUR_LE_FIL = (chemin: string): string => `https://gate.meeshy.me${chemin}`;


function makeService(recipientLanguage = 'fr') {
  const prisma = {
    message: {
      findUnique: jest.fn<any>().mockResolvedValue({
        deletedAt: null,
        expiresAt: null,
        translations: null,
        originalLanguage: 'en',
        createdAt: SERVER_CLOCK,
        messageType: 'image',
      }),
    },
    notification: {
      create: jest.fn<any>().mockImplementation((args: any) => ({ id: 'notif_created', ...args.data })),
      findMany: jest.fn<any>().mockResolvedValue([]),
      count: jest.fn<any>().mockResolvedValue(0),
    },
    user: {
      findUnique: jest.fn<any>().mockImplementation(({ where }: any) =>
        Promise.resolve(
          where?.id === SENDER_USER_ID
            ? { id: SENDER_USER_ID, username: 'alice', displayName: 'Alice', avatar: null }
            : { id: where?.id, systemLanguage: recipientLanguage }
        )
      ),
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
    conversation: {
      findUnique: jest.fn<any>().mockResolvedValue({ title: 'Salon', type: 'group', avatar: null }),
    },
    userPreferences: { findUnique: jest.fn<any>().mockResolvedValue(null) },
    userConversationPreferences: { findMany: jest.fn<any>().mockResolvedValue([]) },
  } as any;

  const sendToUser = jest.fn<any>().mockResolvedValue(undefined);
  const service = new NotificationService(prisma);
  service.setSocketIO({
    to: jest.fn<any>().mockReturnThis(),
    in: jest.fn<any>().mockReturnThis(),
    fetchSockets: jest.fn<any>().mockResolvedValue([]),
    emit: jest.fn<any>(),
  } as any);
  service.setPushNotificationService({ sendToUser } as any);
  return { service, sendToUser };
}

const runPhoto = (service: NotificationService, overrides: Record<string, unknown> = {}) =>
  service.createMessageNotification({
    recipientUserId: RECIPIENT_ID,
    senderId: SENDER_USER_ID,
    messageId: MSG_ID,
    conversationId: CONV_ID,
    messagePreview: 'regarde',
    senderProfile: { username: 'alice', displayName: 'Alice', avatar: null },
    hasAttachments: true,
    attachmentCount: 1,
    attachments: [{ type: 'image', filename: 'photo.jpg' }],
    firstAttachmentType: 'image',
    firstAttachmentFilename: 'photo.jpg',
    firstAttachmentUrl: PHOTO_URL,
    firstAttachmentMimeType: 'image/jpeg',
    firstAttachmentFileSize: PHOTO_BYTES,
    ...overrides,
  } as any);

const pushedData = (sendToUser: any) => sendToUser.mock.calls[0]?.[0]?.payload?.data ?? {};

describe('charge APNs — la taille du média atteint la NSE', () => {
  it('elle voyage à côté de l\'URL qu\'elle décrit', async () => {
    const { service, sendToUser } = makeService();

    await runPhoto(service);

    const data = pushedData(sendToUser);
    expect(data.attachmentUrl).toBe(SUR_LE_FIL(PHOTO_URL));
    expect(data.attachmentFileSize).toBe(String(PHOTO_BYTES));
  });

  it('une taille inconnue reste une CHAÎNE VIDE, jamais un zéro', async () => {
    // Un zéro se lirait comme « fichier vide » et ferait refuser un média
    // parfaitement légitime ; `''` dit « je ne sais pas », et la NSE retombe
    // alors sur la mesure APRÈS téléchargement (`NSEAttachmentPolicy`).
    const { service, sendToUser } = makeService();

    await runPhoto(service, { firstAttachmentFileSize: undefined });

    expect(pushedData(sendToUser).attachmentFileSize).toBe('');
  });

  /**
   * Même verrou que l'URL et le mime (cycle 125) : un média protégé n'annonce
   * pas plus sa taille que son adresse. Une taille seule ne dit pas grand-chose,
   * mais une protection de contenu se mesure sur TOUT ce que la charge
   * transporte — pas sur sa seule chaîne.
   */
  it('un `notificationLocKey` la retient comme il retient l\'URL', async () => {
    const { service, sendToUser } = makeService();

    await runPhoto(service, { notificationLocKey: 'notification.view_once_message' });

    const data = pushedData(sendToUser);
    expect(data.attachmentUrl).toBe('');
    expect(data.attachmentFileSize).toBe('');
  });

  /**
   * Cycle 128, porté à la taille : la piste TRADUITE remplace le fichier, donc
   * la taille de l'ORIGINAL décrirait un autre fichier. Absente, elle reste
   * absente — la NSE mesurera ce qu'elle a réellement descendu plutôt que de
   * croire un chiffre emprunté.
   */
  it('elle ne suit PAS quand la piste servie est une traduction', async () => {
    const { service, sendToUser } = makeService('fr');

    await service.createMessageNotification({
      recipientUserId: RECIPIENT_ID,
      senderId: SENDER_USER_ID,
      messageId: MSG_ID,
      conversationId: CONV_ID,
      messagePreview: 'the meeting moved to friday',
      senderProfile: { username: 'alice', displayName: 'Alice', avatar: null },
      previewBasis: {
        kind: 'transcript',
        source: { translations: { fr: 'la réunion est déplacée' }, originalLanguage: 'en' },
      },
      hasAttachments: true,
      attachmentCount: 1,
      attachments: [{ type: 'audio', filename: 'voice_note.m4a' }],
      firstAttachmentType: 'audio',
      firstAttachmentFilename: 'voice_note.m4a',
      firstAttachmentUrl: ORIGINAL_VOICE_URL,
      firstAttachmentMimeType: 'audio/m4a',
      firstAttachmentFileSize: 84_000,
      attachmentTracks: {
        fr: { url: FR_TRACK_URL, mimeType: 'audio/mp3', durationMs: 9_400 },
      },
    } as any);

    const data = pushedData(sendToUser);
    expect(data.attachmentUrl).toBe(SUR_LE_FIL(FR_TRACK_URL));
    expect(data.attachmentFileSize).toBe('');
  });
});
