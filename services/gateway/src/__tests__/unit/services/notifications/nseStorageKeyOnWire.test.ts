/**
 * #7022 — CE QUE LA NORMALISATION DES ADRESSES FAIT PARTIR À CÔTÉ.
 *
 * `scripts/normalize-media-urls.ts` réécrit `MessageAttachment.fileUrl` vers sa
 * CLÉ DE STOCKAGE NUE (`2026/09/<user>/photo.jpg`) — c'est la forme voulue
 * (#4324 : « la clé, jamais une adresse »), et 1600 lignes sur 2912 portent
 * encore `https://gate.meeshy.me/…`.
 *
 * MAIS LA CHARGE APNs TRANSPORTE CETTE VALEUR TELLE QUELLE. `attachmentUrl`
 * est descendu par l'extension de notification iOS, **qui n'a aucune base
 * configurée** : une clé nue n'y est pas une adresse, et le média ne s'attache
 * plus du tout. Aujourd'hui 964 lignes d'attachement sont absolues et
 * fonctionnent ; après le passage du script elles seraient TOUTES des clés —
 * la vignette de l'écran verrouillé passerait de « la moitié » à « jamais ».
 *
 * > Une résolution d'adresse se mesure sur tout ce que la charge TRANSPORTE,
 * > pas sur la seule colonne qu'on vient de réparer (leçon 275).
 *
 * LA CLÉ IDENTIFIE LE FICHIER, LE SERVEUR COMPOSE L'ADRESSE — c'est la moitié
 * que #7022 devait poser côté passerelle pour que la moitié « donnée » soit
 * jouable sans rien casser. Le témoin porte sur le bloc `data` que la NSE lit,
 * jamais sur un calcul intermédiaire.
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

/** La forme que le script de normalisation LAISSE en base. */
const STORAGE_KEY = '2026/09/507f1f77bcf86cd799439041/photo.jpg';
/** Ce que la route de flux attend — la clé encodée UNE fois, derrière la base publique. */
const SERVED_URL = 'https://gate.meeshy.me/api/v1/attachments/file/2026%2F09%2F507f1f77bcf86cd799439041%2Fphoto.jpg';
/** Une adresse déjà absolue (CDN tiers) ne se réécrit JAMAIS. */
const CDN_URL = 'https://cdn.example/photo.jpg';

function makeService() {
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
            : { id: where?.id, systemLanguage: 'fr' }
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

const pushPhoto = (service: NotificationService, url: string) =>
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
    firstAttachmentUrl: url,
    firstAttachmentMimeType: 'image/jpeg',
  } as any);

const pushedData = (sendToUser: any) => sendToUser.mock.calls[0]?.[0]?.payload?.data ?? {};

describe('charge APNs — une CLÉ DE STOCKAGE reste téléchargeable par la NSE (#7022)', () => {
  it('la clé nue part en adresse de flux ABSOLUE', async () => {
    const { service, sendToUser } = makeService();

    await pushPhoto(service, STORAGE_KEY);

    expect(pushedData(sendToUser).attachmentUrl).toBe(SERVED_URL);
  });

  /**
   * CONTRE-ÉPREUVE — sans elle, « tout préfixer par la base » passerait au
   * vert en cassant les adresses qui marchaient : un CDN tiers ne vit pas sur
   * la passerelle, et sa réécriture perdrait le fichier.
   */
  it('une adresse déjà absolue traverse INCHANGÉE', async () => {
    const { service, sendToUser } = makeService();

    await pushPhoto(service, CDN_URL);

    expect(pushedData(sendToUser).attachmentUrl).toBe(CDN_URL);
  });
});
