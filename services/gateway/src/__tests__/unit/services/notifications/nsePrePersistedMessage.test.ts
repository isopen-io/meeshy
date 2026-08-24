/**
 * Cycle 124 — le message pré-enregistré au démarrage à froid avait un corps
 * VIDE et une langue INVENTÉE.
 *
 * Second suivi MESURÉ du cycle 122. `NotificationService.prePersistMessage`
 * (NSE iOS, `apps/ios/MeeshyNotificationExtension/NotificationService.swift`)
 * écrit une ligne `MessageRecord` dès l'arrivée du push, pour que la bulle
 * existe avant même que l'application démarre. Elle la compose ainsi :
 *
 *     let content = userInfo["content"] as? String ?? ""
 *     originalLanguage: (userInfo["originalLanguage"] as? String) ?? "en"
 *
 * Deux clés que le fil push ne porte PAS — vérifié sur le seul producteur de
 * `data` (`createNotification`) et sur `PushNotificationService`, qui pose
 * `{ ...payload.data }` sans rien y ajouter. La bulle pré-enregistrée était
 * donc VIDE, étiquetée « en » quelle que soit la langue réelle, jusqu'à ce que
 * la synchro REST la réécrive — et la SEULE raison d'exister d'un
 * pré-enregistrement est la fenêtre AVANT cette synchro.
 *
 * C'est la même question que le cycle 122 a posée à la bannière, appliquée à
 * l'autre lecteur du même push : **qui AFFICHE ce que le serveur résout ?**
 * La bannière servait le bon texte ; la ligne persistée n'en recevait aucun.
 *
 * Ce qui voyage est l'ORIGINAL, jamais la traduction : `MessageRecord.content`
 * est le champ d'origine, et `originalLanguage` l'étiquette. Y poser le texte
 * traduit ferait mentir le couple — et la traduction, elle, a déjà son champ
 * (`translatedContent`) et son rang (cycle 121).
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

const makePrismaMock = (opts: {
  translations?: unknown;
  originalLanguage?: string | null;
  notificationPrefs?: Record<string, unknown> | null;
}) => ({
  message: {
    findUnique: jest.fn().mockResolvedValue({
      deletedAt: null,
      expiresAt: null,
      isViewOnce: false,
      viewOnceCount: 0,
      createdAt: new Date('2026-08-24T10:00:00Z'),
      messageType: 'text',
      translations: opts.translations ?? null,
      originalLanguage: opts.originalLanguage ?? null,
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
    findUnique: jest.fn().mockImplementation(({ where }: any) =>
      Promise.resolve(
        where?.id === RECIPIENT_ID
          ? { id: RECIPIENT_ID, systemLanguage: 'de', regionalLanguage: 'es' }
          : { id: SENDER_ID, username: 'alice', displayName: 'Alice', avatar: null }
      )
    ),
    findMany: jest.fn().mockResolvedValue([]),
  },
  conversation: {
    findUnique: jest.fn().mockResolvedValue({ id: 'conv_x', title: 'Test Conv', type: 'group', avatar: null }),
  },
  userPreferences: {
    findUnique: jest.fn().mockResolvedValue(
      opts.notificationPrefs === undefined ? null : { notification: opts.notificationPrefs }
    ),
  },
}) as any;

const makeIO = () => ({
  to: jest.fn().mockReturnThis(),
  in: jest.fn().mockReturnThis(),
  fetchSockets: jest.fn().mockResolvedValue([]),
  emit: jest.fn(),
}) as any;

const run = async (opts: {
  translations?: unknown;
  originalLanguage?: string | null;
  notificationPrefs?: Record<string, unknown> | null;
  params?: Record<string, unknown>;
}) => {
  const sendToUser = jest.fn().mockResolvedValue(undefined);
  const service = new NotificationService(makePrismaMock(opts));
  service.setSocketIO(makeIO());
  service.setPushNotificationService({ sendToUser } as any);

  await service.createMessageNotification({
    recipientUserId: RECIPIENT_ID,
    senderId: SENDER_ID,
    messageId: 'msg_xyz',
    conversationId: 'conv_x',
    messagePreview: 'Hello',
    ...opts.params,
  } as any);

  return sendToUser.mock.calls[0]?.[0]?.payload?.data as Record<string, unknown> | undefined;
};

describe('push data — ce que la NSE pré-enregistre au démarrage à froid', () => {
  it('porte le CONTENU du message, la clé que la NSE lit', async () => {
    const data = await run({ originalLanguage: 'en' });

    expect(data?.content).toBe('Hello');
  });

  it('porte la langue d\'ORIGINE, au lieu du repli « en » inventé par la NSE', async () => {
    const data = await run({ originalLanguage: 'pt' });

    expect(data?.originalLanguage).toBe('pt');
  });

  it('porte l\'ORIGINAL, jamais la traduction servie dans la bannière', async () => {
    // Le couple `content` / `originalLanguage` est le champ d'ORIGINE et son
    // étiquette : y poser le texte traduit ferait mentir les deux, et la
    // traduction a déjà son champ. Ce témoin garde le mode d'échec du
    // CORRECTIF — la bannière, elle, sert bien « Hola » (cycle 122).
    const data = await run({
      translations: { es: { text: 'Hola' } },
      originalLanguage: 'en',
    });

    expect(data?.translatedContent).toBe('Hola');
    expect(data?.content).toBe('Hello');
    expect(data?.originalLanguage).toBe('en');
  });

  it('ne porte AUCUN contenu sous un aperçu protégé', async () => {
    // Un placeholder de protection n'est pas le contenu du message : le
    // pré-enregistrer rendrait « 👁️ 🎵 » dans la bulle, et le laisser passer
    // pour du contenu est précisément ce que la protection interdit.
    const data = await run({
      originalLanguage: 'en',
      params: {
        messagePreview: '👁️ 🎵',
        notificationLocKey: 'notification.view_once_message',
      },
    });

    expect(data?.content).toBeUndefined();
  });

  it('ne porte AUCUN contenu quand l\'aperçu est la transcription d\'un vocal', async () => {
    // `MessageRecord.content` est `Message.content` ; la transcription vit sur
    // la pièce jointe et sera rendue par la bulle audio après la synchro REST.
    const data = await run({
      originalLanguage: 'fr',
      params: {
        messagePreview: 'Salut, je te rappelle ce soir',
        previewBasis: {
          kind: 'transcript',
          source: { translations: { es: 'Te llamo esta noche' }, originalLanguage: 'fr' },
        },
      },
    });

    expect(data?.content).toBeUndefined();
  });

  it('ne porte AUCUN contenu quand le destinataire a coupé les aperçus (GW7)', async () => {
    // Même règle que `translatedContent` / `encryptedContent` : `showPreview:
    // false` retire TOUT champ porteur de contenu du canal push. Un contenu
    // pré-enregistré est du contenu.
    const data = await run({
      originalLanguage: 'en',
      notificationPrefs: { showPreview: false },
    });

    expect(data?.content).toBeUndefined();
    expect(data?.originalLanguage).toBeUndefined();
  });

  it('ne porte AUCUN contenu quand le message est vide (pièce jointe seule)', async () => {
    // Le corps se compose alors entièrement des badges de pièce jointe : une
    // chaîne vide dans `content` ne dit rien de plus que son absence, et
    // occupe le budget APNs.
    const data = await run({
      originalLanguage: 'en',
      params: { messagePreview: '', attachments: [{ type: 'image' }] },
    });

    expect(data?.content).toBeUndefined();
  });
});

/**
 * Cycle 125 — les clés que la NSE LIT pour composer cette ligne, et la famille
 * de push qui n'a jamais eu le droit d'en composer une.
 *
 * `prePersistMessage` n'a d'autre entrée que ce `data`. Les témoins ci-dessous
 * gèlent le contrat CROISÉ des deux côtés :
 *
 *  - les NOMS de clé. La NSE lisait `userInfo["senderName"]`, qu'aucun
 *    producteur n'émet — la bulle pré-enregistrée était anonyme — pendant que
 *    `applyCommunicationIntent`, cent lignes plus bas dans le MÊME fichier,
 *    lisait les bons noms. Et GW5 émet `createdAt` / `messageType` en les
 *    nommant « champs de persistance NSE » : ni l'un ni l'autre n'était lu, si
 *    bien que la bulle était horodatée à l'instant de la REMISE.
 *  - la FAMILLE. Quatre types de push portent un `messageId` ; le quatrième,
 *    `message_reaction`, désigne le message RÉAGI — celui que le destinataire a
 *    le plus souvent écrit lui-même — et porte le `senderId` du RÉACTEUR. La
 *    NSE écrivait par `save()`, un UPSERT sur la clé primaire `localId` : une
 *    réaction VIDAIT le texte du message en base, lui réassignait son auteur et
 *    le rehorodatait.
 */
describe('push data — le contrat croisé de la bulle pré-enregistrée', () => {
  it('porte les clés d\'identité et de persistance que la NSE lit, sous LEURS noms', async () => {
    const data = await run({ originalLanguage: 'fr' });

    expect(data?.type).toBe('new_message');
    expect(data?.messageId).toBe('msg_xyz');
    expect(data?.conversationId).toBe('conv_x');
    expect(data?.senderId).toBe(SENDER_ID);
    // GW5 — l'horodatage SERVEUR : sans lui la bulle prend l'heure de la
    // remise, et un push remis en retard se range au bas de la conversation.
    expect(data?.createdAt).toBe('2026-08-24T10:00:00.000Z');
    // GW5 — le type AUTORITATIF : la pièce jointe ne voyage pas sous
    // `showPreview: false`, et un `location` n'a pas de MIME à déduire.
    expect(data?.messageType).toBe('text');
    // Le nom de l'expéditeur, sous les clés RÉELLES.
    expect(data?.senderDisplayName).toBe('Alice');
    expect(data?.senderUsername).toBe('alice');
  });

  it('n\'a jamais porté « senderName » — la clé que la NSE lisait', async () => {
    // Piège armé : ce témoin tombera le jour où quelqu'un ajoutera la clé au
    // fil, et l'obligera à constater que la NSE ne la lit plus.
    const data = await run({ originalLanguage: 'fr' });

    expect(data).not.toHaveProperty('senderName');
  });

  it('un push de RÉACTION nomme le message RÉAGI et l\'acteur qui a réagi', async () => {
    // La PRÉMISSE du gate de type côté NSE. Ce `messageId` n'est pas celui
    // d'un message qui arrive : c'est celui d'un message DÉJÀ en base chez le
    // destinataire, et `senderId` n'est pas son auteur.
    const REACTOR_ID = 'reactor_id';
    const prisma = makePrismaMock({});
    prisma.message.findUnique.mockResolvedValue({
      content: 'Le message auquel on réagit',
      expiresAt: null,
      messageType: 'text',
      createdAt: new Date('2026-08-24T10:00:00Z'),
      isViewOnce: false,
      isBlurred: false,
      isEncrypted: false,
      effectFlags: 0,
    });
    prisma.user.findUnique.mockImplementation(({ where }: any) =>
      Promise.resolve(
        where?.id === REACTOR_ID
          ? { id: REACTOR_ID, username: 'bob', displayName: 'Bob', avatar: null }
          : { id: RECIPIENT_ID, systemLanguage: 'fr' }
      )
    );

    const sendToUser = jest.fn().mockResolvedValue(undefined);
    const service = new NotificationService(prisma);
    service.setSocketIO(makeIO());
    service.setPushNotificationService({ sendToUser } as any);

    await service.createReactionNotification({
      messageAuthorId: RECIPIENT_ID,
      reactorUserId: REACTOR_ID,
      messageId: 'msg_xyz',
      conversationId: 'conv_x',
      reactionEmoji: '🔥',
    });

    const data = sendToUser.mock.calls[0]?.[0]?.payload?.data as Record<string, unknown>;
    expect(data?.type).toBe('message_reaction');
    expect(data?.messageId).toBe('msg_xyz');
    expect(data?.senderId).toBe(REACTOR_ID);
    // Aucun couple `content` / `originalLanguage` : le champ d'origine du
    // message réagi n'a rien à faire sur ce fil, et une bulle composée depuis
    // ce push n'aurait ni corps ni langue.
    expect(data).not.toHaveProperty('content');
    expect(data).not.toHaveProperty('originalLanguage');
  });
});
