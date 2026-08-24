/**
 * Cycle 126 — le cycle 125 bis a fait converger le CORPS des trois bannières ;
 * ce qui ne compose aucun texte est resté derrière.
 *
 * `replyMentionMediaPreview.test.ts` (cycle 125 bis) garde le TEXTE : réponse et
 * mention reçoivent désormais `notificationPreviewForPush`, `pushPreviewBasis`
 * et le résumé de média qui compose le corps. Deux champs de l'éventail n'ont
 * pas suivi, et pour la même raison exactement : **ils ne composent aucune
 * chaîne**.
 *
 *  1. `notificationLocKey` — la clé de PROTECTION, dont `protectedPreview` est
 *     l'unique producteur du dépôt. Elle ne compose pas le placeholder, elle le
 *     QUALIFIE : la NSE iOS s'en sert pour rendre le texte depuis sa propre
 *     table de localisation plutôt que d'afficher la chaîne composée par la
 *     passerelle, et `createNotification` s'en sert comme SECOND VERROU.
 *  2. `messageCreatedAt` / `messageType` — l'horloge SERVEUR de la bulle que la
 *     NSE PRÉ-ENREGISTRE. Réponse et mention poussent un `messageId`, donc font
 *     pré-enregistrer une bulle exactement comme un message simple ; la leur
 *     portait l'horloge du DEVICE et se rangeait au mauvais endroit du fil.
 *
 * > C'est la forme du cycle 125 rejouée un cran plus haut : là, quatre gardes
 * > tenaient une CHAÎNE pendant que le fichier partait dans l'objet voisin ;
 * > ici, un lot fait converger une CHAÎNE pendant que ce qui la qualifie reste
 * > derrière. **Un lot qui partage une valeur composée doit énumérer ce qui
 * > voyage AVEC elle, pas seulement ce qui la compose.**
 *
 * Les témoins portent sur ce que l'éventail REMET aux trois créateurs, puis sur
 * la charge réellement remise à APNs — jamais sur un calcul intermédiaire.
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
const REPLIED_MSG_ID = '507f1f77bcf86cd799439052';
const SENDER_PART_ID = '507f1f77bcf86cd799439031';
const PEER_PART_ID = '507f1f77bcf86cd799439032';
const SENDER_USER_ID = '507f1f77bcf86cd799439041';
const PEER_USER_ID = '507f1f77bcf86cd799439042';
const THIRD_USER_ID = '507f1f77bcf86cd799439044';
const FOURTH_USER_ID = '507f1f77bcf86cd799439045';
const RECIPIENT_ID = '507f1f77bcf86cd799439043';

const SERVER_CLOCK = new Date('2026-08-24T10:00:00Z');

// ── Éventail — ce que les trois lots reçoivent ─────────────────────────────

const photoAttachment = (overrides: Record<string, unknown> = {}) => ({
  mimeType: 'image/jpeg',
  fileName: 'plage.jpg',
  fileSize: 240_000,
  duration: null,
  width: 1024,
  height: 768,
  fileUrl: 'https://cdn.example/photo/plage.jpg',
  transcription: null,
  translations: null,
  isViewOnce: false,
  isBlurred: false,
  effectFlags: 0,
  ...overrides,
});

function makePrisma() {
  return {
    participant: {
      findUnique: jest.fn<any>().mockImplementation(({ where }: any) =>
        Promise.resolve(
          where?.id === PEER_PART_ID
            ? { userId: PEER_USER_ID, displayName: 'Bob P', avatar: null }
            : { userId: SENDER_USER_ID, displayName: 'Alice P', avatar: null }
        )
      ),
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
        participants: [
          { userId: SENDER_USER_ID },
          { userId: PEER_USER_ID },
          { userId: THIRD_USER_ID },
          { userId: FOURTH_USER_ID },
        ],
      }),
    },
    message: {
      findUnique: jest.fn<any>().mockResolvedValue({ senderId: PEER_PART_ID, deletedAt: null }),
    },
    notification: {
      findMany: jest.fn<any>().mockResolvedValue([]),
      deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
    messageAttachment: { findMany: jest.fn<any>().mockResolvedValue([photoAttachment()]) },
    userConversationPreferences: { findMany: jest.fn<any>().mockResolvedValue([]) },
  };
}

async function servedLots(messageOverrides: Record<string, unknown> = {}) {
  const createReplyNotification = jest.fn<any>().mockResolvedValue({ id: 'reply' });
  const createMentionNotificationsBatch = jest.fn<any>().mockResolvedValue(1);
  const createMessageNotification = jest.fn<any>().mockResolvedValue({ id: 'notif' });

  await notifyMessageRecipients({
    prisma: makePrisma() as any,
    notificationService: {
      createReplyNotification,
      createMentionNotificationsBatch,
      createMessageNotification,
    },
    message: {
      id: MSG_ID,
      messageType: 'image',
      replyToId: REPLIED_MSG_ID,
      isEncrypted: false,
      encryptionMode: null,
      isViewOnce: false,
      isBlurred: false,
      effectFlags: 0,
      expiresAt: null,
      createdAt: SERVER_CLOCK,
      encryptedContent: null,
      ...messageOverrides,
    } as any,
    senderParticipantId: SENDER_PART_ID,
    conversationId: CONV_ID,
    processedContent: '',
    validatedMentionUserIds: [THIRD_USER_ID],
  });

  return {
    reply: createReplyNotification.mock.calls[0]?.[0] as Record<string, unknown> | undefined,
    mention: createMentionNotificationsBatch.mock.calls[0]?.[1] as Record<string, unknown> | undefined,
    regular: createMessageNotification.mock.calls[0]?.[0] as Record<string, unknown> | undefined,
  };
}

describe('éventail — le VERROU de protection accompagne les trois lots', () => {
  // Une protection par branche de `protectedPreview`, l'unique producteur de
  // cette clé dans tout le dépôt.
  const protections: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
    ['vue unique', { isViewOnce: true }],
    ['flouté', { isBlurred: true }],
    ['éphémère', { expiresAt: new Date('2026-08-24T11:00:00Z') }],
    ['chiffré', { isEncrypted: true }],
  ];

  it.each(protections)('un message %s qualifie ses TROIS bannières', async (_l, overrides) => {
    const { reply, mention, regular } = await servedLots(overrides);

    expect(regular?.notificationLocKey).toBeTruthy();
    expect(reply?.notificationLocKey).toBe(regular?.notificationLocKey);
    expect(mention?.notificationLocKey).toBe(regular?.notificationLocKey);
  });

  it('un message ORDINAIRE n\'en porte aucune, sur aucun lot', async () => {
    // Mode d'échec du correctif : une clé posée sans protection ferait perdre le
    // rich-push au cas nominal, `createNotification` s'en servant comme verrou.
    const { reply, mention, regular } = await servedLots();

    for (const lot of [regular, reply, mention]) {
      expect(lot?.notificationLocKey).toBeUndefined();
    }
  });
});

// ── Service — la charge remise à APNs ──────────────────────────────────────

function makeServicePrisma(recipient: Record<string, unknown>) {
  return {
    message: {
      findUnique: jest.fn<any>().mockResolvedValue({
        deletedAt: null,
        expiresAt: null,
        isViewOnce: false,
        viewOnceCount: 0,
        createdAt: SERVER_CLOCK,
        messageType: 'image',
        translations: null,
        originalLanguage: 'fr',
      }),
    },
    notification: {
      create: jest.fn<any>().mockImplementation((args: any) => ({ id: 'notif_created', ...args.data })),
      findMany: jest.fn<any>(),
      findUnique: jest.fn<any>(),
      update: jest.fn<any>(),
      updateMany: jest.fn<any>(),
      delete: jest.fn<any>(),
      deleteMany: jest.fn<any>(),
      count: jest.fn<any>().mockResolvedValue(0),
    },
    user: {
      findUnique: jest.fn<any>().mockImplementation(({ where }: any) =>
        Promise.resolve(
          where?.id === RECIPIENT_ID
            ? { id: RECIPIENT_ID, ...recipient }
            : { id: SENDER_USER_ID, username: 'alice', displayName: 'Alice', avatar: null }
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
}

function makeService(recipient: Record<string, unknown> = { systemLanguage: 'fr' }) {
  const prisma = makeServicePrisma(recipient);
  const sendToUser = jest.fn<any>().mockResolvedValue(undefined);
  const service = new NotificationService(prisma);
  service.setSocketIO({
    to: jest.fn<any>().mockReturnThis(),
    in: jest.fn<any>().mockReturnThis(),
    fetchSockets: jest.fn<any>().mockResolvedValue([]),
    emit: jest.fn<any>(),
  } as any);
  service.setPushNotificationService({ sendToUser } as any);
  return { service, sendToUser, prisma };
}

/** La charge réellement remise à APNs. */
const servedPushData = (sendToUser: any): Record<string, any> | undefined =>
  sendToUser.mock.calls[0]?.[0]?.payload?.data;

const runners = [
  [
    'createReplyNotification',
    (service: NotificationService, extra: Record<string, unknown>) =>
      service.createReplyNotification({
        recipientUserId: RECIPIENT_ID,
        replierUserId: SENDER_USER_ID,
        messageId: MSG_ID,
        conversationId: CONV_ID,
        messagePreview: 'Regarde ça',
        originalMessageId: REPLIED_MSG_ID,
        ...extra,
      } as any),
  ],
  [
    'createMentionNotification',
    (service: NotificationService, extra: Record<string, unknown>) =>
      service.createMentionNotification({
        mentionedUserId: RECIPIENT_ID,
        mentionerUserId: SENDER_USER_ID,
        messageId: MSG_ID,
        conversationId: CONV_ID,
        messagePreview: 'Regarde ça',
        ...extra,
      } as any),
  ],
] as const;

describe.each(runners)('%s — l\'horloge de la bulle pré-enregistrée', (_name, run) => {
  it('porte l\'horloge du SERVEUR, jamais celle du device', async () => {
    const { service, sendToUser } = makeService();

    await run(service, {});

    const data = servedPushData(sendToUser);
    expect(data?.createdAt).toBe(SERVER_CLOCK.toISOString());
    expect(data?.messageType).toBe('image');
  });

  it('vient de la relecture que ce créateur faisait DÉJÀ — aucune requête de plus', async () => {
    // La leçon 264 : quand un consommateur a besoin d'un peu plus que ce que
    // rend le résolveur existant, l'issue par défaut est d'ouvrir une seconde
    // lecture. Le `select` s'élargit, la requête ne se dédouble pas.
    const { service, prisma } = makeService();

    await run(service, {});

    expect(prisma.message.findUnique).toHaveBeenCalledTimes(1);
    const select = prisma.message.findUnique.mock.calls[0][0].select;
    expect(select.createdAt).toBe(true);
    expect(select.messageType).toBe(true);
  });

  it('se tait quand la relecture du message tombe — jamais une horloge inventée', async () => {
    // `loadMessagePrismSource` est fail-OPEN : une lecture en échec rend une
    // source vide. Une horloge par défaut y daterait la bulle de l'époque Unix.
    const { service, sendToUser, prisma } = makeService();
    prisma.message.findUnique.mockRejectedValue(new Error('mongo down'));

    await run(service, {});

    const data = servedPushData(sendToUser);
    expect(data?.createdAt).toBeUndefined();
    expect(data?.messageType).toBeUndefined();
  });
});

describe.each(runners)('%s — le VERROU de protection', (_name, run) => {
  it('voyage sur le fil pour que le client localise le placeholder', async () => {
    const { service, sendToUser } = makeService();

    await run(service, { notificationLocKey: 'notification.view_once_message', messagePreview: '👁️ 🖼️' });

    expect(servedPushData(sendToUser)?.notificationLocKey).toBe('notification.view_once_message');
  });

  it('retient la traduction du texte masqué hors du fil', async () => {
    // Le défaut du cycle 123, sur ces deux éventails : la bannière affiche son
    // placeholder pendant que la charge transporte à côté la traduction EN
    // CLAIR du texte qu'elle masque. Sans la clé, rien ne l'empêchait ici.
    const { service, sendToUser, prisma } = makeService({ systemLanguage: 'es' });
    prisma.message.findUnique.mockResolvedValue({
      deletedAt: null,
      expiresAt: null,
      isViewOnce: true,
      viewOnceCount: 0,
      createdAt: SERVER_CLOCK,
      messageType: 'image',
      translations: { es: { text: 'El resultado del análisis' } },
      originalLanguage: 'fr',
    });

    await run(service, { notificationLocKey: 'notification.view_once_message', messagePreview: '👁️ 🖼️' });

    const data = servedPushData(sendToUser);
    expect(data?.translatedContent).toBeUndefined();
    expect(JSON.stringify(data)).not.toContain('análisis');
  });

  it('retient aussi le corps PRÉ-ENREGISTRÉ de la bulle', async () => {
    // `prePersistedMessageFields` : ce que la NSE écrit localement survit à la
    // bannière si la synchro REST n'arrive pas. Un aperçu vu puis oublié n'est
    // pas une ligne relue.
    const { service, sendToUser } = makeService();

    await run(service, { notificationLocKey: 'notification.view_once_message', messagePreview: '👁️ 🖼️' });

    const data = servedPushData(sendToUser);
    expect(data?.content).toBeUndefined();
    expect(data?.originalLanguage).toBeUndefined();
  });

  it('un message ORDINAIRE garde sa traduction et sa bulle', async () => {
    // Mode d'échec du correctif : le verrou ne doit rien retenir sans protection.
    const { service, sendToUser, prisma } = makeService({ systemLanguage: 'es' });
    prisma.message.findUnique.mockResolvedValue({
      deletedAt: null,
      expiresAt: null,
      isViewOnce: false,
      viewOnceCount: 0,
      createdAt: SERVER_CLOCK,
      messageType: 'text',
      translations: { es: { text: 'Mira esto' } },
      originalLanguage: 'fr',
    });

    await run(service, {});

    const data = servedPushData(sendToUser);
    expect(data?.translatedContent).toBe('Mira esto');
    expect(data?.content).toBe('Regarde ça');
  });
});

// ── L'éventail de MENTIONS relit une fois pour tout son lot ────────────────

/**
 * Les témoins ci-dessus exercent `createMentionNotification` en SOLO. Le chemin
 * de production est le BATCH, et c'est lui qui porte le risque que le correctif
 * introduit : élargir un `select` est exactement le geste qui invite à ouvrir
 * une seconde lecture, et une lecture PAR DESTINATAIRE ne rougit nulle part —
 * elle se paie en latence de fan-out, sur un chemin que personne ne mesure.
 *
 * Le témoin exige donc N > 1 : à un seul mentionné, « une lecture » et « une
 * lecture par destinataire » rendent le même compte, et l'assertion ne peut pas
 * tomber (§ Leçon 276 — un témoin de rang s'écrit sur un rang autre que le
 * premier ; ici, sur un lot autre que le singleton).
 */
describe('createMentionNotificationsBatch — une seule relecture pour N mentionnés', () => {
  const batchPrisma = () => {
    const prisma = makeServicePrisma({ systemLanguage: 'fr' });
    prisma.user.findUnique.mockImplementation(({ where }: any) =>
      Promise.resolve(
        where?.id === SENDER_USER_ID
          ? { id: SENDER_USER_ID, username: 'alice', displayName: 'Alice', avatar: null }
          : { id: where?.id, username: 'bob', displayName: 'Bob', avatar: null, systemLanguage: 'fr' }
      )
    );
    return prisma;
  };

  it('deux mentionnés ⇒ UNE lecture du message, et la même horloge pour les deux', async () => {
    const prisma = batchPrisma();
    const sendToUser = jest.fn<any>().mockResolvedValue(undefined);
    const service = new NotificationService(prisma);
    service.setSocketIO({
      to: jest.fn<any>().mockReturnThis(),
      in: jest.fn<any>().mockReturnThis(),
      fetchSockets: jest.fn<any>().mockResolvedValue([]),
      emit: jest.fn<any>(),
    } as any);
    service.setPushNotificationService({ sendToUser } as any);

    await service.createMentionNotificationsBatch(
      [RECIPIENT_ID, THIRD_USER_ID],
      {
        senderId: SENDER_USER_ID,
        messageContent: 'Coucou vous deux',
        conversationId: CONV_ID,
        messageId: MSG_ID,
      } as any,
      [RECIPIENT_ID, THIRD_USER_ID, SENDER_USER_ID]
    );

    expect(prisma.message.findUnique).toHaveBeenCalledTimes(1);

    // Et l'estampille ne dépend pas du lecteur : les deux bannières portent la
    // MÊME, celle du message.
    expect(sendToUser).toHaveBeenCalledTimes(2);
    for (const call of sendToUser.mock.calls) {
      expect(call[0]?.payload?.data?.createdAt).toBe(SERVER_CLOCK.toISOString());
      expect(call[0]?.payload?.data?.messageType).toBe('image');
    }
  });
});
