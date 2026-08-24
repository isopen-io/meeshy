/**
 * Cycle 122 — les éventails RÉPONSE et MENTION n'appliquaient AUCUN Prisme.
 *
 * Suivi MESURÉ du cycle 121, qui l'avait relevé en ouvrant les deux méthodes :
 * `createReplyNotification` et `createMentionNotification` posaient
 * `content: params.messagePreview` — l'ORIGINAL — et ne poussaient ni
 * `translatedContent` ni `translatedLanguage`. Défaut DISTINCT de celui du
 * cycle 121 : absence du Prisme, pas un mauvais rang.
 *
 * Conséquence produit : une bannière de réponse ou de mention arrivait toujours
 * dans la langue de l'expéditeur, pendant que la ligne de liste de la même
 * conversation — servie par `resolveLastMessagePreview`, qui descend depuis le
 * cycle 118 — était traduite.
 *
 * Les témoins assertent sur la charge REMISE à APNs, jamais sur un calcul
 * intermédiaire : c'est la valeur SERVIE.
 *
 * @jest-environment node
 */
import { NotificationService } from '../../../../services/notifications/NotificationService';

jest.mock('../../../../utils/logger-enhanced', () => ({
  notificationLogger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
  securityLogger: { logViolation: jest.fn() },
}));

const SENDER_ID = 'sender_id';
const RECIPIENT_ID = 'recipient_id';
const SECOND_RECIPIENT_ID = 'recipient_2_id';
const MESSAGE_ID = 'msg_xyz';
const CONVERSATION_ID = 'conv_x';

type LangPrefs = {
  systemLanguage?: string | null;
  regionalLanguage?: string | null;
  customDestinationLanguage?: string | null;
  deviceLocale?: string | null;
};

/**
 * Le double `user.findUnique` répond selon l'id DEMANDÉ : l'acteur et le
 * destinataire sont deux lectures distinctes, et un double qui rend le même
 * profil aux deux ferait résoudre le prisme du LECTEUR depuis les préférences
 * de l'expéditeur.
 */
const makePrismaMock = (opts: {
  recipients: Readonly<Record<string, LangPrefs>>;
  translations: unknown;
  originalLanguage: string | null;
}) => ({
  message: {
    findUnique: jest.fn().mockResolvedValue({
      translations: opts.translations,
      originalLanguage: opts.originalLanguage,
    }),
  },
  notification: {
    create: jest.fn().mockImplementation((args: any) => ({ id: 'notif_created', ...args.data })),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
  },
  user: {
    findUnique: jest.fn().mockImplementation(({ where }: any) => {
      const prefs = where?.id ? opts.recipients[where.id] : undefined;
      return Promise.resolve(
        prefs
          ? { id: where.id, ...prefs }
          : { id: SENDER_ID, username: 'alice', displayName: 'Alice', avatar: null }
      );
    }),
    findMany: jest.fn().mockResolvedValue([]),
  },
  conversation: {
    findUnique: jest.fn().mockResolvedValue({ id: CONVERSATION_ID, title: 'Test Conv', type: 'group', avatar: null }),
  },
  userConversationPreferences: { findMany: jest.fn().mockResolvedValue([]) },
  userPreferences: { findUnique: jest.fn().mockResolvedValue(null) },
}) as any;

const makeIO = () => ({
  to: jest.fn().mockReturnThis(),
  in: jest.fn().mockReturnThis(),
  fetchSockets: jest.fn().mockResolvedValue([]),
  emit: jest.fn(),
}) as any;

const makeService = (prisma: any) => {
  const sendToUser = jest.fn().mockResolvedValue(undefined);
  const service = new NotificationService(prisma);
  service.setSocketIO(makeIO());
  service.setPushNotificationService({ sendToUser } as any);
  return { service, sendToUser };
};

/** Ce qui a été remis à APNs pour un destinataire donné. */
const pushFor = (sendToUser: jest.Mock, userId: string) => {
  const call = sendToUser.mock.calls.find(c => c[0]?.userId === userId);
  return { body: call?.[0]?.payload?.body as string | undefined, data: call?.[0]?.payload?.data };
};

describe('createReplyNotification — la bannière de RÉPONSE descend le Prisme', () => {
  const runReply = async (opts: {
    recipient: LangPrefs;
    translations: unknown;
    originalLanguage: string | null;
    previewIsMessageContent?: boolean;
    messagePreview?: string;
  }) => {
    const prisma = makePrismaMock({
      recipients: { [RECIPIENT_ID]: opts.recipient },
      translations: opts.translations,
      originalLanguage: opts.originalLanguage,
    });
    const { service, sendToUser } = makeService(prisma);
    const notification = await service.createReplyNotification({
      recipientUserId: RECIPIENT_ID,
      replierUserId: SENDER_ID,
      messageId: MESSAGE_ID,
      conversationId: CONVERSATION_ID,
      messagePreview: opts.messagePreview ?? 'Hello',
      originalMessageId: 'msg_original',
      ...(opts.previewIsMessageContent === undefined
        ? {}
        : { previewIsMessageContent: opts.previewIsMessageContent }),
    });
    return { notification, ...pushFor(sendToUser, RECIPIENT_ID), prisma };
  };

  it('sert la traduction du rang 1', async () => {
    const { body, data } = await runReply({
      recipient: { systemLanguage: 'fr' },
      translations: { fr: { text: 'Bonjour' } },
      originalLanguage: 'en',
    });

    expect(body).toBe('Bonjour');
    expect(data?.translatedLanguage).toBe('fr');
  });

  it('DESCEND jusqu\'à la locale appareil — le rang 4', async () => {
    const { body, data } = await runReply({
      recipient: { systemLanguage: 'de', deviceLocale: 'pt-BR' },
      translations: { pt: { text: 'Olá' } },
      originalLanguage: 'en',
    });

    expect(body).toBe('Olá');
    expect(data?.translatedContent).toBe('Olá');
  });

  it('garde le CADRAGE au rang 1 pendant que le contenu descend', async () => {
    const { body, notification } = await runReply({
      recipient: { systemLanguage: 'de', deviceLocale: 'pt-BR' },
      translations: { pt: { text: 'Olá' } },
      originalLanguage: 'en',
    });

    expect(body).toBe('Olá');
    expect((notification as any)?.lang ?? 'de').toBe('de');
  });

  it('ne sert AUCUNE traduction quand la langue d\'origine gagne à son rang (règle #3)', async () => {
    const { body, data } = await runReply({
      recipient: { systemLanguage: 'de', regionalLanguage: 'en', customDestinationLanguage: 'fr' },
      translations: { fr: { text: 'Bonjour' } },
      originalLanguage: 'en',
    });

    expect(body).toBe('Hello');
    expect(data?.translatedContent).toBeUndefined();
  });

  it('ne substitue PAS dans un aperçu protégé', async () => {
    const { body } = await runReply({
      recipient: { systemLanguage: 'fr' },
      translations: { fr: { text: 'Bonjour, mon secret' } },
      originalLanguage: 'en',
      messagePreview: '👁️ 💬',
      previewIsMessageContent: false,
    });

    expect(body).toBe('👁️ 💬');
  });

  it('ne sert jamais une traduction CHIFFRÉE, et descend au rang suivant', async () => {
    const { body } = await runReply({
      recipient: { systemLanguage: 'fr', regionalLanguage: 'es' },
      translations: { fr: { text: 'U2FsdGVk…', isEncrypted: true }, es: { text: 'Hola' } },
      originalLanguage: 'en',
    });

    expect(body).toBe('Hola');
  });
});

describe('createMentionNotificationsBatch — la bannière de MENTION descend le Prisme', () => {
  const runBatch = async (opts: {
    recipients: Readonly<Record<string, LangPrefs>>;
    translations: unknown;
    originalLanguage: string | null;
  }) => {
    const prisma = makePrismaMock(opts);
    const { service, sendToUser } = makeService(prisma);
    const mentionedIds = Object.keys(opts.recipients);
    const count = await service.createMentionNotificationsBatch(
      mentionedIds,
      {
        senderId: SENDER_ID,
        messageContent: 'Hello',
        conversationId: CONVERSATION_ID,
        messageId: MESSAGE_ID,
        previewIsMessageContent: true,
      },
      [...mentionedIds, SENDER_ID]
    );
    return { count, sendToUser, prisma };
  };

  it('sert à CHAQUE mentionné la traduction de SON propre rang', async () => {
    // Le prisme est par LECTEUR : deux mentionnés d'un même message reçoivent
    // deux textes différents. Une résolution partagée servirait le même à tous.
    const { sendToUser } = await runBatch({
      recipients: {
        [RECIPIENT_ID]: { systemLanguage: 'de', regionalLanguage: 'es' },
        [SECOND_RECIPIENT_ID]: { systemLanguage: 'fr' },
      },
      translations: { es: { text: 'Hola' }, fr: { text: 'Bonjour' } },
      originalLanguage: 'en',
    });

    expect(pushFor(sendToUser, RECIPIENT_ID).body).toBe('Hola');
    expect(pushFor(sendToUser, SECOND_RECIPIENT_ID).body).toBe('Bonjour');
  });

  it('ne relit le message QU\'UNE fois pour N mentionnés', async () => {
    // La carte de traductions est la même pour tous : seule la descente varie.
    // Une relecture par mentionné est un N+1 sur le chemin d'envoi.
    const { prisma } = await runBatch({
      recipients: {
        [RECIPIENT_ID]: { systemLanguage: 'es' },
        [SECOND_RECIPIENT_ID]: { systemLanguage: 'fr' },
      },
      translations: { es: { text: 'Hola' }, fr: { text: 'Bonjour' } },
      originalLanguage: 'en',
    });

    expect(prisma.message.findUnique).toHaveBeenCalledTimes(1);
  });

  it('sert l\'ORIGINAL au mentionné dont le prisme n\'a aucune traduction', async () => {
    const { sendToUser } = await runBatch({
      recipients: { [RECIPIENT_ID]: { systemLanguage: 'de' } },
      translations: { it: { text: 'Ciao' } },
      originalLanguage: 'en',
    });

    const { body, data } = pushFor(sendToUser, RECIPIENT_ID);
    expect(body).toBe('Hello');
    expect(data?.translatedContent).toBeUndefined();
  });
});

describe('la descente échoue OUVERT — une annonce vaut mieux qu\'une traduction', () => {
  it('sert l\'ORIGINAL quand la carte de traductions est illisible, sans perdre la notification', async () => {
    // Même arbitrage que `loadNotificationPrefs` et `filterMutedRecipients` :
    // la traduction est un confort, l'annonce du message une obligation de
    // livraison. Une lecture qui lève ne doit pas emporter la bannière.
    const prisma = makePrismaMock({
      recipients: { [RECIPIENT_ID]: { systemLanguage: 'fr' } },
      translations: { fr: { text: 'Bonjour' } },
      originalLanguage: 'en',
    });
    prisma.message.findUnique.mockRejectedValue(new Error('mongo down'));
    const { service, sendToUser } = makeService(prisma);

    const notification = await service.createReplyNotification({
      recipientUserId: RECIPIENT_ID,
      replierUserId: SENDER_ID,
      messageId: MESSAGE_ID,
      conversationId: CONVERSATION_ID,
      messagePreview: 'Hello',
    });

    expect(notification).not.toBeNull();
    expect(pushFor(sendToUser, RECIPIENT_ID).body).toBe('Hello');
  });
});

describe('createMentionNotification — le Prisme s\'applique SANS câblage de l\'appelant', () => {
  it('relit le message quand la source n\'est pas fournie', async () => {
    // La correction ne dépend pas du câblage : un appelant qui ne passe pas
    // `prismSource` perd une requête, pas le Prisme.
    const prisma = makePrismaMock({
      recipients: { [RECIPIENT_ID]: { systemLanguage: 'de', regionalLanguage: 'es' } },
      translations: { es: { text: 'Hola' } },
      originalLanguage: 'en',
    });
    const { service, sendToUser } = makeService(prisma);

    await service.createMentionNotification({
      mentionedUserId: RECIPIENT_ID,
      mentionerUserId: SENDER_ID,
      messageId: MESSAGE_ID,
      conversationId: CONVERSATION_ID,
      messagePreview: 'Hello',
    });

    expect(pushFor(sendToUser, RECIPIENT_ID).body).toBe('Hola');
    expect(prisma.message.findUnique).toHaveBeenCalledTimes(1);
  });
});
