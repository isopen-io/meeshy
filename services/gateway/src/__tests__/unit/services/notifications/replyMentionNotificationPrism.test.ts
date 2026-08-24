/**
 * Cycle 122 — les DEUX autres éventails de `messageNotificationFanOut`
 * n'appliquaient AUCUN Prisme.
 *
 * Suivi MESURÉ du cycle 121 (leçon 264), pas hérité : `createReplyNotification`
 * et `createMentionNotification` posaient `content: params.messagePreview` —
 * l'original — et ne poussaient ni `translatedContent` ni `translatedLanguage`.
 * Défaut DISTINCT de celui du cycle 121, qui était un mauvais RANG : ici c'est
 * l'ABSENCE de la descente. Une bannière de réponse ou de mention arrivait donc
 * toujours dans la langue de l'expéditeur, pendant que la bannière de message
 * simple — même conversation, même seconde, même destinataire — servait la
 * traduction depuis le cycle 121.
 *
 * Les témoins assertent sur la charge REMISE à APNs (`pushService.sendToUser`),
 * jamais sur un calcul intermédiaire : c'est la valeur SERVIE.
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
const MESSAGE_ID = 'msg_xyz';
const CONVERSATION_ID = 'conv_x';

type LangPrefs = {
  systemLanguage?: string | null;
  regionalLanguage?: string | null;
  customDestinationLanguage?: string | null;
  deviceLocale?: string | null;
};

type Scenario = {
  recipient: LangPrefs;
  translations: unknown;
  originalLanguage: string | null;
};

/**
 * Le double `user.findUnique` répond selon l'id DEMANDÉ — cf. le harnais du
 * cycle 121 : un double qui rend le même profil aux deux résoudrait le prisme
 * du destinataire depuis les préférences de l'expéditeur.
 */
const makePrismaMock = (opts: Scenario) => ({
  message: {
    findUnique: jest.fn().mockResolvedValue({
      deletedAt: null,
      expiresAt: null,
      isViewOnce: false,
      viewOnceCount: 0,
      createdAt: new Date('2026-08-24T10:00:00Z'),
      messageType: 'text',
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
    findUnique: jest.fn().mockImplementation(({ where }: any) =>
      Promise.resolve(
        where?.id === RECIPIENT_ID
          ? { id: RECIPIENT_ID, ...opts.recipient }
          : { id: SENDER_ID, username: 'alice', displayName: 'Alice', avatar: null }
      )
    ),
    findMany: jest.fn().mockResolvedValue([]),
  },
  conversation: {
    findUnique: jest.fn().mockResolvedValue({ id: CONVERSATION_ID, title: 'Test Conv', type: 'group', avatar: null }),
  },
  userPreferences: { findUnique: jest.fn().mockResolvedValue(null) },
  userConversationPreferences: { findMany: jest.fn().mockResolvedValue([]) },
}) as any;

const makeIO = () => ({
  to: jest.fn().mockReturnThis(),
  in: jest.fn().mockReturnThis(),
  fetchSockets: jest.fn().mockResolvedValue([]),
  emit: jest.fn(),
}) as any;

/** La charge réellement remise à APNs, ou `undefined` si rien n'est parti. */
const servedPush = (sendToUser: jest.Mock): Record<string, any> | undefined =>
  sendToUser.mock.calls[0]?.[0]?.payload;

const servedPushData = (sendToUser: jest.Mock): Record<string, unknown> | undefined =>
  servedPush(sendToUser)?.data;

const makeService = (opts: Scenario) => {
  const prisma = makePrismaMock(opts);
  const sendToUser = jest.fn().mockResolvedValue(undefined);
  const service = new NotificationService(prisma);
  service.setSocketIO(makeIO());
  service.setPushNotificationService({ sendToUser } as any);
  return { prisma, sendToUser, service };
};

const runReply = async (opts: Scenario) => {
  const { service, sendToUser, prisma } = makeService(opts);
  const notification = await service.createReplyNotification({
    recipientUserId: RECIPIENT_ID,
    replierUserId: SENDER_ID,
    messageId: MESSAGE_ID,
    conversationId: CONVERSATION_ID,
    messagePreview: 'Hello',
  });
  return { notification, data: servedPushData(sendToUser), push: servedPush(sendToUser), prisma };
};

const runMention = async (opts: Scenario) => {
  const { service, sendToUser, prisma } = makeService(opts);
  const notification = await service.createMentionNotification({
    mentionedUserId: RECIPIENT_ID,
    mentionerUserId: SENDER_ID,
    messageId: MESSAGE_ID,
    conversationId: CONVERSATION_ID,
    messagePreview: 'Hello',
  });
  return { notification, data: servedPushData(sendToUser), push: servedPush(sendToUser), prisma };
};

describe.each([
  ['createReplyNotification', runReply],
  ['createMentionNotification', runMention],
] as const)('%s — le Prisme de la bannière DESCEND les rangs', (_name, run) => {
  it('pousse la traduction du rang 1 quand elle existe', async () => {
    const { data } = await run({
      recipient: { systemLanguage: 'fr', regionalLanguage: 'es' },
      translations: { fr: { text: 'Bonjour' }, es: { text: 'Hola' } },
      originalLanguage: 'en',
    });

    expect(data?.translatedContent).toBe('Bonjour');
    expect(data?.translatedLanguage).toBe('fr');
  });

  it('DESCEND au rang 2 quand le rang 1 n\'a pas de traduction', async () => {
    const { data } = await run({
      recipient: { systemLanguage: 'de', regionalLanguage: 'es' },
      translations: { es: { text: 'Hola' } },
      originalLanguage: 'en',
    });

    expect(data?.translatedContent).toBe('Hola');
    expect(data?.translatedLanguage).toBe('es');
  });

  it('DESCEND jusqu\'à la locale appareil — le rang 4 du Prisme', async () => {
    // Cas NOMINAL depuis l'extension du Prisme (2026-05-26).
    const { data } = await run({
      recipient: { systemLanguage: 'de', deviceLocale: 'pt-BR' },
      translations: { pt: { text: 'Olá' } },
      originalLanguage: 'en',
    });

    expect(data?.translatedContent).toBe('Olá');
    expect(data?.translatedLanguage).toBe('pt');
  });

  it('ne pousse AUCUNE traduction quand la langue d\'origine gagne avant elle', async () => {
    // Règle critique #3 — garde le mode d'échec du CORRECTIF : une descente
    // naïve servirait « Bonjour » là où le message est déjà écrit dans la
    // langue de rang 2 du lecteur.
    const { data } = await run({
      recipient: { systemLanguage: 'de', regionalLanguage: 'en', customDestinationLanguage: 'fr' },
      translations: { fr: { text: 'Bonjour' } },
      originalLanguage: 'en',
    });

    expect(data?.translatedContent).toBeUndefined();
    expect(data?.translatedLanguage).toBeUndefined();
  });

  it('ne retombe sur AUCUNE traduction quand rien ne matche le prisme (règle #1)', async () => {
    const { data } = await run({
      recipient: { systemLanguage: 'de' },
      translations: { es: { text: 'Hola' }, it: { text: 'Ciao' } },
      originalLanguage: 'en',
    });

    expect(data?.translatedContent).toBeUndefined();
  });

  it('ne pousse jamais une traduction CHIFFRÉE, et descend au rang suivant', async () => {
    const { data } = await run({
      recipient: { systemLanguage: 'fr', regionalLanguage: 'es' },
      translations: { fr: { text: 'U2FsdGVk…', isEncrypted: true }, es: { text: 'Hola' } },
      originalLanguage: 'en',
    });

    expect(data?.translatedContent).toBe('Hola');
    expect(data?.translatedLanguage).toBe('es');
  });

  it('RÉÉCRIT le corps servi : c\'est le seul texte qu\'un lecteur voit', async () => {
    // Ce témoin a d'abord gelé l'inverse (« le corps original reste le corps »)
    // sur deux prémisses, mesurées depuis :
    //
    //  1. « `translatedContent` voyage à côté ; le client choisit. » — AUCUN
    //     client ne le lit : ni la NSE iOS, ni l'application, ni Android, ni le
    //     service worker web. Personne ne choisit ; tout le monde affiche
    //     `payload.body`.
    //  2. « écraser le corps priverait la NSE du repli quand la charge est
    //     dégradée pour le budget APNs. » — la dégradation coupe d'ABORD
    //     `translatedContent`, et garde le corps. Porter la traduction dans le
    //     corps est donc ce qui la fait SURVIVRE à la dégradation, pas ce qui
    //     l'expose.
    //
    // Les deux champs de service restent poussés : ils ne coûtent rien et
    // deviendront lisibles le jour où un client s'en saisira.
    const { data, push } = await run({
      recipient: { systemLanguage: 'es' },
      translations: { es: { text: 'Hola' } },
      originalLanguage: 'en',
    });

    expect(data?.translatedContent).toBe('Hola');
    expect(push?.body).toBe('Hola');
  });

  it('tronque la traduction poussée à 200 caractères, quel que soit son rang', async () => {
    const { data } = await run({
      recipient: { systemLanguage: 'de', regionalLanguage: 'es' },
      translations: { es: { text: 'á'.repeat(400) } },
      originalLanguage: 'en',
    });

    expect((data?.translatedContent as string)?.length).toBe(200);
  });

  it('survit à un message VOLATILISÉ : la bannière part, sans traduction', async () => {
    // La relecture des traductions n'est PAS un gate d'éligibilité pour ces
    // deux éventails — leur échéance vient de l'appelant (`messageExpiresAt`).
    // Un message introuvable ne doit donc pas SUPPRIMER la notification, juste
    // la priver de sa traduction.
    const { service, sendToUser, prisma } = makeService({
      recipient: { systemLanguage: 'fr' },
      translations: { fr: { text: 'Bonjour' } },
      originalLanguage: 'en',
    });
    prisma.message.findUnique.mockResolvedValue(null);

    const notification = _name === 'createReplyNotification'
      ? await service.createReplyNotification({
          recipientUserId: RECIPIENT_ID,
          replierUserId: SENDER_ID,
          messageId: MESSAGE_ID,
          conversationId: CONVERSATION_ID,
          messagePreview: 'Hello',
        })
      : await service.createMentionNotification({
          mentionedUserId: RECIPIENT_ID,
          mentionerUserId: SENDER_ID,
          messageId: MESSAGE_ID,
          conversationId: CONVERSATION_ID,
          messagePreview: 'Hello',
        });

    expect(notification).not.toBeNull();
    expect(servedPushData(sendToUser)?.translatedContent).toBeUndefined();
  });

  it('fail-OPEN quand la relecture LÈVE : la bannière part quand même', async () => {
    // La traduction est un confort, l'annonce du message une obligation de
    // livraison. Même arbitrage que `loadNotificationPrefs` et
    // `filterMutedRecipients` — un incident Mongo transitoire ne doit pas
    // taire un éventail entier.
    const { service, sendToUser, prisma } = makeService({
      recipient: { systemLanguage: 'fr' },
      translations: { fr: { text: 'Bonjour' } },
      originalLanguage: 'en',
    });
    prisma.message.findUnique.mockRejectedValue(new Error('mongo down'));

    const notification = _name === 'createReplyNotification'
      ? await service.createReplyNotification({
          recipientUserId: RECIPIENT_ID,
          replierUserId: SENDER_ID,
          messageId: MESSAGE_ID,
          conversationId: CONVERSATION_ID,
          messagePreview: 'Hello',
        })
      : await service.createMentionNotification({
          mentionedUserId: RECIPIENT_ID,
          mentionerUserId: SENDER_ID,
          messageId: MESSAGE_ID,
          conversationId: CONVERSATION_ID,
          messagePreview: 'Hello',
        });

    expect(notification).not.toBeNull();
    expect(servedPushData(sendToUser)?.translatedContent).toBeUndefined();
  });
});

describe('createMentionNotification — CADRAGE et CONTENU sont deux résolutions', () => {
  it('cadre au rang 1 pendant que le contenu est servi au rang 4', async () => {
    // Le défaut symétrique de celui du lot : confondre les deux résolutions
    // localiserait la bannière en espagnol pour un lecteur dont l'application
    // est en allemand. Le témoin porte sur le SOUS-TITRE réellement remis à
    // APNs — « te mencionó » si les deux fusionnaient.
    const { push, data } = await runMention({
      recipient: { systemLanguage: 'de', deviceLocale: 'es-ES' },
      translations: { es: { text: 'Hola' } },
      originalLanguage: 'en',
    });

    expect(data?.translatedContent).toBe('Hola');
    expect(push?.subtitle).toBe('hat dich erwähnt');
  });

  it('ne résout le destinataire QU\'UNE fois', async () => {
    // Le cadrage était auparavant résolu paresseusement DANS `createNotification`,
    // ce qui rouvrait une seconde lecture `User` par mentionné — le titre du
    // type `user_mentioned` étant localisé, la branche paresseuse tombait
    // toujours. Une seule lecture sert désormais les deux résolutions.
    const { prisma } = await runMention({
      recipient: { systemLanguage: 'de', deviceLocale: 'es-ES' },
      translations: { es: { text: 'Hola' } },
      originalLanguage: 'en',
    });

    const recipientReads = prisma.user.findUnique.mock.calls
      .filter((call: any) => call[0]?.where?.id === RECIPIENT_ID);
    expect(recipientReads).toHaveLength(1);
  });
});

describe('createMentionNotificationsBatch — une seule relecture pour tout l\'éventail', () => {
  it('sert la traduction du prisme de CHAQUE destinataire', async () => {
    // Deux lecteurs, deux prismes, un seul message : la descente est par
    // LECTEUR même quand la source est partagée.
    const OTHER_ID = 'other_id';
    const prisma = makePrismaMock({
      recipient: {},
      translations: { es: { text: 'Hola' }, pt: { text: 'Olá' } },
      originalLanguage: 'en',
    });
    prisma.user.findUnique.mockImplementation(({ where }: any) => {
      if (where?.id === RECIPIENT_ID) return Promise.resolve({ id: RECIPIENT_ID, systemLanguage: 'de', regionalLanguage: 'es' });
      if (where?.id === OTHER_ID) return Promise.resolve({ id: OTHER_ID, systemLanguage: 'nl', deviceLocale: 'pt-BR' });
      return Promise.resolve({ id: SENDER_ID, username: 'alice', displayName: 'Alice', avatar: null });
    });

    const sendToUser = jest.fn().mockResolvedValue(undefined);
    const service = new NotificationService(prisma);
    service.setSocketIO(makeIO());
    service.setPushNotificationService({ sendToUser } as any);

    const count = await service.createMentionNotificationsBatch(
      [RECIPIENT_ID, OTHER_ID],
      {
        senderId: SENDER_ID,
        messageContent: 'Hello',
        conversationId: CONVERSATION_ID,
        messageId: MESSAGE_ID,
      },
      [RECIPIENT_ID, OTHER_ID]
    );

    expect(count).toBe(2);
    const served = new Map(
      sendToUser.mock.calls.map((call: any) => [call[0]?.userId, call[0]?.payload?.data])
    );
    expect(served.get(RECIPIENT_ID)?.translatedContent).toBe('Hola');
    expect(served.get(OTHER_ID)?.translatedContent).toBe('Olá');
  });

  it('ne relit le message QU\'UNE fois pour tout l\'éventail', async () => {
    // La source du Prisme est la MÊME pour tous les destinataires : la relire
    // par destinataire multiplie une lecture identique par la taille de
    // l'éventail, sur le chemin le plus chaud de la passerelle.
    const OTHER_ID = 'other_id';
    const prisma = makePrismaMock({
      recipient: { systemLanguage: 'es' },
      translations: { es: { text: 'Hola' } },
      originalLanguage: 'en',
    });
    const sendToUser = jest.fn().mockResolvedValue(undefined);
    const service = new NotificationService(prisma);
    service.setSocketIO(makeIO());
    service.setPushNotificationService({ sendToUser } as any);

    await service.createMentionNotificationsBatch(
      [RECIPIENT_ID, OTHER_ID],
      {
        senderId: SENDER_ID,
        messageContent: 'Hello',
        conversationId: CONVERSATION_ID,
        messageId: MESSAGE_ID,
      },
      [RECIPIENT_ID, OTHER_ID]
    );

    expect(prisma.message.findUnique).toHaveBeenCalledTimes(1);
  });
});

/**
 * Cycle 122 — le CORPS servi, et non les seuls champs de service.
 *
 * `translatedContent` / `translatedLanguage` voyagent sur le fil push et aucun
 * client ne les lit. Le seul texte que les trois plateformes rendent est
 * `payload.body` : tant qu'il porte l'aperçu original, la descente ci-dessus
 * n'atteint aucun lecteur.
 */
describe.each([
  ['createReplyNotification', (s: NotificationService, p: any) => s.createReplyNotification(p)],
  ['createMentionNotification', (s: NotificationService, p: any) =>
    s.createMentionNotification({
      mentionedUserId: p.recipientUserId,
      mentionerUserId: p.replierUserId,
      messageId: p.messageId,
      conversationId: p.conversationId,
      messagePreview: p.messagePreview,
      ...(p.previewBasis === undefined ? {} : { previewBasis: p.previewBasis }),
    })],
] as const)('%s — le CORPS servi descend le Prisme', (_name, invoke) => {
  const runServed = async (opts: Scenario & { messagePreview?: string; previewBasis?: unknown }) => {
    const { service, sendToUser } = makeService(opts);
    const notification = await invoke(service, {
      recipientUserId: RECIPIENT_ID,
      replierUserId: SENDER_ID,
      messageId: MESSAGE_ID,
      conversationId: CONVERSATION_ID,
      messagePreview: opts.messagePreview ?? 'Hello',
      ...(opts.previewBasis === undefined ? {} : { previewBasis: opts.previewBasis }),
    });
    return { notification, push: servedPush(sendToUser) };
  };

  it('compose la bannière avec la traduction du rang atteint', async () => {
    const { push } = await runServed({
      recipient: { systemLanguage: 'de', regionalLanguage: 'es' },
      translations: { es: { text: 'Hola' } },
      originalLanguage: 'en',
    });

    expect(push?.body).toBe('Hola');
  });

  it('DESCEND jusqu\'à la locale appareil — le rang 4', async () => {
    const { push } = await runServed({
      recipient: { systemLanguage: 'de', deviceLocale: 'pt-BR' },
      translations: { pt: { text: 'Olá' } },
      originalLanguage: 'en',
    });

    expect(push?.body).toBe('Olá');
  });

  it('persiste dans la ligne in-app le MÊME texte que la bannière', async () => {
    const { push, notification } = await runServed({
      recipient: { systemLanguage: 'fr' },
      translations: { fr: { text: 'Bonjour' } },
      originalLanguage: 'en',
    });

    expect((notification as any)?.content).toBe('Bonjour');
    expect(push?.body).toBe('Bonjour');
  });

  it('sert l\'ORIGINAL quand la langue d\'origine gagne à son rang (règle #3)', async () => {
    const { push } = await runServed({
      recipient: { systemLanguage: 'de', regionalLanguage: 'en', customDestinationLanguage: 'fr' },
      translations: { fr: { text: 'Bonjour' } },
      originalLanguage: 'en',
    });

    expect(push?.body).toBe('Hello');
  });

  it('ne substitue JAMAIS dans un aperçu PROTÉGÉ', async () => {
    const { push } = await runServed({
      recipient: { systemLanguage: 'fr' },
      translations: { fr: { text: 'Bonjour, mon secret' } },
      originalLanguage: 'en',
      messagePreview: '👁️ 💬',
      previewBasis: { kind: 'protected-placeholder' },
    });

    expect(push?.body).toBe('👁️ 💬');
  });

  /**
   * Cycle 123 — la protection gardait le CORPS, pas le FIL.
   *
   * Le témoin ci-dessus est celui du cycle 122 : il assertait que la traduction
   * ne REMPLACE pas le placeholder. Elle ne le remplaçait pas — et partait quand
   * même, à côté, dans `data.translatedContent`, d'où elle était poussée sur le
   * canal APNs/FCM puis persistée dans la ligne `Notification`. Le champ observé
   * rendait la moitié de la règle inobservable (leçon 266).
   */
  it('ne TRANSPORTE pas non plus la traduction d\'un aperçu protégé', async () => {
    const { push } = await runServed({
      recipient: { systemLanguage: 'fr' },
      translations: { fr: { text: 'Bonjour, mon secret' } },
      originalLanguage: 'en',
      messagePreview: '👁️ 💬',
      previewBasis: { kind: 'protected-placeholder' },
    });

    expect(push?.data?.translatedContent).toBeUndefined();
    expect(push?.data?.translatedLanguage).toBeUndefined();
  });
});

/**
 * Cycle 124 — la JUMELLE, posée dans le MÊME lot.
 *
 * `messageOriginalLanguage` — le droit, pour la NSE iOS, d'enregistrer
 * localement le corps qu'elle affiche — est né sur `createMessageNotification`.
 * La règle de `services/gateway/CLAUDE.md` (« cette entité a-t-elle une
 * JUMELLE ? à poser au moment où l'on corrige ») rend ici la même réponse qu'au
 * cycle 122 pour le Prisme lui-même : les TROIS éventails poussent un
 * `messageId`, donc les trois font pré-enregistrer une bulle. Deux d'entre eux
 * l'auraient laissée sans corps.
 *
 * Les deux méthodes tiennent déjà la langue d'origine — `MessagePrismSource`
 * la porte, relue une fois pour tout l'éventail. Aucune lecture de plus.
 */
describe.each([
  ['createReplyNotification', runReply],
  ['createMentionNotification', runMention],
] as const)('%s — ce que la NSE a le droit d\'ENREGISTRER', (_name, run) => {
  it('émet la langue du contenu quand le corps servi EST le contenu du message', async () => {
    const { data } = await run({
      recipient: { systemLanguage: 'fr' },
      translations: null,
      originalLanguage: 'es',
    });

    expect(data?.messageOriginalLanguage).toBe('es');
  });

  it('dit la langue d\'ORIGINE, pas celle servie', async () => {
    const { data } = await run({
      recipient: { systemLanguage: 'fr' },
      translations: { fr: { text: 'Bonjour' } },
      originalLanguage: 'es',
    });

    expect(data?.translatedLanguage).toBe('fr');
    expect(data?.messageOriginalLanguage).toBe('es');
  });

  it('n\'émet rien quand la langue d\'origine est inconnue', async () => {
    const { data } = await run({
      recipient: { systemLanguage: 'fr' },
      translations: null,
      originalLanguage: null,
    });

    expect(data).not.toHaveProperty('messageOriginalLanguage');
  });
});

describe.each([
  ['createReplyNotification', (s: NotificationService, p: any) => s.createReplyNotification(p)],
  ['createMentionNotification', (s: NotificationService, p: any) =>
    s.createMentionNotification({
      mentionedUserId: p.recipientUserId,
      mentionerUserId: p.replierUserId,
      messageId: p.messageId,
      conversationId: p.conversationId,
      messagePreview: p.messagePreview,
      previewBasis: p.previewBasis,
    })],
] as const)('%s — un placeholder de PROTECTION n\'est pas enregistrable', (_name, invoke) => {
  it('n\'émet pas la langue du contenu sous une base protégée', async () => {
    const { service, sendToUser } = makeService({
      recipient: { systemLanguage: 'fr' },
      translations: null,
      originalLanguage: 'es',
    });

    await invoke(service, {
      recipientUserId: RECIPIENT_ID,
      replierUserId: SENDER_ID,
      messageId: MESSAGE_ID,
      conversationId: CONVERSATION_ID,
      messagePreview: '⏱️ 💬 24h',
      previewBasis: { kind: 'protected-placeholder' },
    });

    expect(servedPushData(sendToUser)).not.toHaveProperty('messageOriginalLanguage');
  });
});
