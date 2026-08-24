/**
 * Cycle 126 — la bulle pré-enregistrée d'une RÉPONSE ou d'une MENTION était
 * ordonnée par l'horloge du DEVICE, et rendue en texte.
 *
 * Suivi MESURÉ du cycle 124, laissé ouvert deux cycles de plus. La NSE iOS
 * pré-enregistre une bulle dès qu'un push porte un `messageId` — donc pour les
 * TROIS éventails de `messageNotificationFanOut`, pas seulement le message
 * simple. `NotificationPayloadHelpers.prePersistedMessageFields` (extension)
 * écrit QUATRE champs dans cette bulle :
 *
 *   | champ | ce qu'il décide | d'où il vient |
 *   |---|---|---|
 *   | `content` | le texte | fil `content` |
 *   | `originalLanguage` | l'étiquette de langue, donc la descente du Prisme | fil `originalLanguage` |
 *   | `createdAt` | **la PLACE de la bulle dans le fil** | fil `createdAt`, **repli : `Date()`** |
 *   | `messageType` | **le RENDU (audio / image / vidéo vs texte)** | fil `messageType`, **repli : `text`** |
 *
 * Les deux premiers sont posés par `prePersistedMessageFields` (passerelle), que
 * les TROIS éventails appellent depuis le cycle 124. **Les deux derniers étaient
 * posés en ligne, dans le seul `createMessageNotification`.** Une réponse ou une
 * mention pré-enregistrait donc une bulle :
 *
 *  - horodatée à l'heure de RÉCEPTION du push — deux appareils du même compte
 *    n'ont aucune raison de l'ordonner pareil, et une salve la range à contretemps ;
 *  - rendue en `text` quand le message est un VOCAL ou une PHOTO — et ces deux
 *    éventails ne poussent pas `attachmentMimeType` non plus (décision du
 *    cycle 125 bis), donc le repli `mediaMessageTypes` de l'extension ne rattrape
 *    rien : la bulle est un rectangle de texte VIDE jusqu'à la synchro REST.
 *
 * ### Pourquoi il a survécu au cycle 125 bis
 *
 * Ce cycle-là a consolidé la composition du CORPS parce qu'elle vivait chez UN
 * des trois. La composition des champs de PRÉ-ENREGISTREMENT, elle, avait déjà
 * son helper partagé — `prePersistedMessageFields`, appelé par les trois — et
 * cela suffisait à la faire passer pour partagée. Elle ne composait que DEUX des
 * quatre champs que son nom annonce.
 *
 * > Un helper PARTAGÉ peut ne composer qu'une PARTIE de ce que son nom promet.
 * > Compter ses appelants ne dit rien de ce qu'il compose ; c'est le CONSOMMATEUR
 * > — ici les champs que la NSE lit vraiment — qu'il faut compter en face.
 *
 * Les témoins portent sur le fil push REMIS à APNs, seul endroit où la NSE lit.
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
const ORIGINAL_MSG_ID = '507f1f77bcf86cd799439052';
const SENDER_USER_ID = '507f1f77bcf86cd799439041';
const RECIPIENT_ID = '507f1f77bcf86cd799439044';
const OTHER_RECIPIENT_ID = '507f1f77bcf86cd799439046';

/** L'horodatage SERVEUR du message — celui qui doit ORDONNER la bulle. */
const SERVER_CREATED_AT = new Date('2026-08-24T10:00:00.000Z');
/** Le type du message — celui qui doit décider du RENDU de la bulle. */
const SERVER_MESSAGE_TYPE = 'audio';

function makeServicePrisma(overrides: { messageFindUnique?: unknown } = {}) {
  const recipient = (id: string) => ({
    id,
    username: 'bob',
    displayName: 'Bob',
    avatar: null,
    systemLanguage: 'fr',
    regionalLanguage: null,
    customDestinationLanguage: null,
    deviceLocale: null,
  });

  return {
    message: {
      findUnique:
        overrides.messageFindUnique
        ?? jest.fn<any>().mockResolvedValue({
          deletedAt: null,
          expiresAt: null,
          isViewOnce: false,
          viewOnceCount: 0,
          createdAt: SERVER_CREATED_AT,
          messageType: SERVER_MESSAGE_TYPE,
          translations: null,
          originalLanguage: 'fr',
        }),
    },
    user: {
      findUnique: jest.fn<any>().mockImplementation(({ where }: any) =>
        Promise.resolve(
          where?.id === RECIPIENT_ID || where?.id === OTHER_RECIPIENT_ID
            ? recipient(where.id)
            : { id: SENDER_USER_ID, username: 'alice', displayName: 'Alice', avatar: null }
        )
      ),
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
    conversation: {
      findUnique: jest.fn<any>().mockResolvedValue({ title: 'Salon', type: 'group', avatar: null }),
    },
    notification: {
      create: jest.fn<any>().mockImplementation((args: any) => ({ id: 'notif_x', ...args.data })),
      findMany: jest.fn<any>().mockResolvedValue([]),
      count: jest.fn<any>().mockResolvedValue(0),
    },
    userConversationPreferences: { findUnique: jest.fn<any>().mockResolvedValue(null) },
    userPreferences: { findUnique: jest.fn<any>().mockResolvedValue(null) },
  } as any;
}

function makeService(overrides: { messageFindUnique?: unknown } = {}) {
  const prisma = makeServicePrisma(overrides);
  const sendToUser = jest.fn<any>().mockResolvedValue(undefined);
  const service = new NotificationService(prisma);
  service.setSocketIO({
    to: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    fetchSockets: jest.fn<any>().mockResolvedValue([]),
    emit: jest.fn(),
  } as any);
  service.setPushNotificationService({ sendToUser } as any);
  return { service, prisma, sendToUser };
}

/** Ce que la NSE lit vraiment : les `data` de la charge APNs. */
function pushedData(sendToUser: jest.Mock): Record<string, unknown> {
  return ((sendToUser.mock.calls[0]?.[0] as any)?.payload?.data ?? {}) as Record<string, unknown>;
}

/** L'aperçu d'un VOCAL : texte du message vide, corps composé par le média. */
const VOICE_NOTE = {
  messagePreview: '',
  attachments: [{ type: 'audio' as const, filename: 'vocal.m4a' }],
  firstAttachmentDuration: 7,
  firstAttachmentFileSize: 12_000,
};

async function pushForMessage() {
  const { service, sendToUser } = makeService();
  await service.createMessageNotification({
    recipientUserId: RECIPIENT_ID,
    senderId: SENDER_USER_ID,
    messageId: MSG_ID,
    conversationId: CONV_ID,
    ...VOICE_NOTE,
  } as any);
  return pushedData(sendToUser);
}

async function pushForReply() {
  const { service, sendToUser } = makeService();
  await service.createReplyNotification({
    recipientUserId: RECIPIENT_ID,
    replierUserId: SENDER_USER_ID,
    messageId: MSG_ID,
    conversationId: CONV_ID,
    originalMessageId: ORIGINAL_MSG_ID,
    ...VOICE_NOTE,
  } as any);
  return pushedData(sendToUser);
}

async function pushForMention() {
  const { service, sendToUser } = makeService();
  await service.createMentionNotification({
    mentionedUserId: RECIPIENT_ID,
    mentionerUserId: SENDER_USER_ID,
    messageId: MSG_ID,
    conversationId: CONV_ID,
    ...VOICE_NOTE,
  } as any);
  return pushedData(sendToUser);
}

describe('les TROIS éventails pré-enregistrent la MÊME bulle', () => {
  it('le message simple pousse l’horodatage SERVEUR (référence, verte avant)', async () => {
    expect(await pushForMessage()).toMatchObject({
      createdAt: SERVER_CREATED_AT.toISOString(),
    });
  });

  it('la RÉPONSE le pousse aussi — sans quoi la bulle est ordonnée par l’horloge du device', async () => {
    expect(await pushForReply()).toMatchObject({
      createdAt: SERVER_CREATED_AT.toISOString(),
    });
  });

  it('la MENTION le pousse aussi', async () => {
    expect(await pushForMention()).toMatchObject({
      createdAt: SERVER_CREATED_AT.toISOString(),
    });
  });

  it('et les trois poussent le TYPE du message — sinon un vocal se rend en texte VIDE', async () => {
    // Ces deux éventails ne poussent PAS `attachmentMimeType` (décision du
    // cycle 125 bis : le rich-push reste au message simple). Le repli
    // `mediaMessageTypes` de l'extension ne peut donc rien rattraper : sans ce
    // champ, la bulle d'un vocal est un rectangle de texte vide.
    for (const data of [await pushForMessage(), await pushForReply(), await pushForMention()]) {
      expect(data.messageType).toBe(SERVER_MESSAGE_TYPE);
    }
  });

  it('et les trois estampilles sont IDENTIQUES pour un même message', async () => {
    const [regular, reply, mention] = [await pushForMessage(), await pushForReply(), await pushForMention()];
    const stamp = (data: Record<string, unknown>) => ({
      createdAt: data.createdAt,
      messageType: data.messageType,
    });

    expect(stamp(reply)).toEqual(stamp(regular));
    expect(stamp(mention)).toEqual(stamp(regular));
  });
});

describe('la relecture reste FAIL-OPEN, et une estampille absente ne ment pas', () => {
  it('une lecture en échec ne pousse aucune estampille, et la bannière part quand même', async () => {
    // Même arbitrage que la source du Prisme : une lecture en échec dégrade la
    // bannière, elle ne la supprime pas. Et une clé ABSENTE laisse l'extension
    // retomber sur son propre repli — poser une valeur inventée ferait mentir
    // l'ordre du fil.
    const { service, sendToUser } = makeService({
      messageFindUnique: jest.fn<any>().mockRejectedValue(new Error('mongo down')),
    });

    await service.createReplyNotification({
      recipientUserId: RECIPIENT_ID,
      replierUserId: SENDER_USER_ID,
      messageId: MSG_ID,
      conversationId: CONV_ID,
      originalMessageId: ORIGINAL_MSG_ID,
      messagePreview: 'Bien reçu',
    } as any);

    expect(sendToUser).toHaveBeenCalledTimes(1);
    const data = pushedData(sendToUser);
    expect(data).not.toHaveProperty('createdAt');
    expect(data).not.toHaveProperty('messageType');
  });
});

describe('l’estampille n’est pas du CONTENU, et ne se garde pas comme lui', () => {
  it('un message PROTÉGÉ n’a pas de texte pré-enregistré mais garde sa place et son rendu', async () => {
    // `prePersistedMessageFields` refuse d'écrire le texte d'un placeholder de
    // protection (cycle 124) — il planterait « ⏱️ 💬 24h » dans la base locale.
    // L'horodatage et le type, eux, ne révèlent rien de plus que l'icône que
    // `protectedPreview` compose déjà : les retirer n'ajoute aucune garde et
    // désordonne le fil.
    const { service, sendToUser } = makeService();

    await service.createMentionNotification({
      mentionedUserId: RECIPIENT_ID,
      mentionerUserId: SENDER_USER_ID,
      messageId: MSG_ID,
      conversationId: CONV_ID,
      messagePreview: '👁️ 🎵',
      previewBasis: { kind: 'protected-placeholder' },
    } as any);

    const data = pushedData(sendToUser);
    expect(data).not.toHaveProperty('content');
    expect(data.createdAt).toBe(SERVER_CREATED_AT.toISOString());
    expect(data.messageType).toBe(SERVER_MESSAGE_TYPE);
  });
});

describe('l’éventail de mentions relit le message UNE fois pour tous ses destinataires', () => {
  it('deux mentionnés ⇒ une seule relecture', async () => {
    // La source ne dépend pas du destinataire (cycle 122) : l'estampille non
    // plus. Ajouter des champs à cette relecture ne doit pas en ajouter une.
    const { service, prisma } = makeService();

    await service.createMentionNotificationsBatch(
      [RECIPIENT_ID, OTHER_RECIPIENT_ID],
      {
        senderId: SENDER_USER_ID,
        messageContent: 'Coucou',
        conversationId: CONV_ID,
        messageId: MSG_ID,
      } as any,
      [RECIPIENT_ID, OTHER_RECIPIENT_ID, SENDER_USER_ID]
    );

    expect(prisma.message.findUnique).toHaveBeenCalledTimes(1);
  });
});
