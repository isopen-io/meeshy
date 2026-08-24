/**
 * Cycle 122 — la bannière de RÉPONSE ne descendait AUCUN rang du Prisme.
 *
 * Jumelle du défaut sur `createMentionNotification` (même cycle) : les deux
 * éventails posaient `content: params.messagePreview` (l'original) et ne
 * poussaient ni `translatedContent` ni `translatedLanguage`. L'auteur du
 * message cité recevait donc TOUJOURS la réponse dans la langue de son
 * interlocuteur — la ligne de liste, elle, descendait. Deux textes pour un même
 * message sur le même écran (cf. `messageNotificationPrism.test.ts` § intro
 * cycle 121).
 *
 * Même patron de témoins que le cycle 121, avec les rôles de la réponse en
 * entrée : `recipientUserId` (l'auteur du message cité) et `replierUserId`
 * (celui qui répond).
 *
 * @jest-environment node
 */
import { NotificationService } from '../../../../services/notifications/NotificationService';

jest.mock('../../../../utils/logger-enhanced', () => ({
  notificationLogger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
  securityLogger: { logViolation: jest.fn() },
}));

const REPLIER_ID = 'replier_id';
const RECIPIENT_ID = 'recipient_id';

type LangPrefs = {
  systemLanguage?: string | null;
  regionalLanguage?: string | null;
  customDestinationLanguage?: string | null;
  deviceLocale?: string | null;
};

const makePrismaMock = (opts: {
  recipient: LangPrefs;
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
    findUnique: jest.fn().mockImplementation(({ where }: any) =>
      Promise.resolve(
        where?.id === RECIPIENT_ID
          ? { id: RECIPIENT_ID, ...opts.recipient }
          : { id: REPLIER_ID, username: 'alice', displayName: 'Alice', avatar: null }
      )
    ),
    findMany: jest.fn().mockResolvedValue([]),
  },
  conversation: {
    findUnique: jest.fn().mockResolvedValue({ id: 'conv_x', title: 'Test Conv', type: 'group', avatar: null }),
  },
  userPreferences: { findUnique: jest.fn().mockResolvedValue(null) },
  userConversationPreferences: { findUnique: jest.fn().mockResolvedValue(null) },
}) as any;

const makeIO = () => ({
  to: jest.fn().mockReturnThis(),
  in: jest.fn().mockReturnThis(),
  fetchSockets: jest.fn().mockResolvedValue([]),
  emit: jest.fn(),
}) as any;

const baseParams = {
  recipientUserId: RECIPIENT_ID,
  replierUserId: REPLIER_ID,
  messageId: 'msg_reply',
  conversationId: 'conv_x',
  messagePreview: 'Hello',
  originalMessageId: 'msg_original',
};

/** La charge `data` réellement remise à APNs, ou `undefined` si rien n'est parti. */
const servedPushData = (sendToUser: jest.Mock): Record<string, unknown> | undefined =>
  sendToUser.mock.calls[0]?.[0]?.payload?.data;

const runReply = async (opts: {
  recipient: LangPrefs;
  translations: unknown;
  originalLanguage: string | null;
}) => {
  const prisma = makePrismaMock(opts);
  const sendToUser = jest.fn().mockResolvedValue(undefined);
  const service = new NotificationService(prisma);
  service.setSocketIO(makeIO());
  service.setPushNotificationService({ sendToUser } as any);

  const notification = await service.createReplyNotification(baseParams);

  return { notification, data: servedPushData(sendToUser), prisma };
};

describe('createReplyNotification — le Prisme de la bannière DESCEND les rangs', () => {
  it('pousse la traduction du rang 1 quand elle existe', async () => {
    const { data } = await runReply({
      recipient: { systemLanguage: 'fr', regionalLanguage: 'es' },
      translations: { fr: { text: 'Bonjour' }, es: { text: 'Hola' } },
      originalLanguage: 'en',
    });

    expect(data?.translatedContent).toBe('Bonjour');
    expect(data?.translatedLanguage).toBe('fr');
  });

  it('DESCEND au rang 2 quand le rang 1 n\'a pas de traduction', async () => {
    // Le défaut du cycle 122, dans sa forme la plus simple : avant le
    // correctif, `createReplyNotification` ne lisait AUCUNE traduction — la
    // bannière servait « Hello ».
    const { data } = await runReply({
      recipient: { systemLanguage: 'de', regionalLanguage: 'es' },
      translations: { es: { text: 'Hola' } },
      originalLanguage: 'en',
    });

    expect(data?.translatedContent).toBe('Hola');
    expect(data?.translatedLanguage).toBe('es');
  });

  it('DESCEND jusqu\'à la locale appareil — le rang 4 du Prisme', async () => {
    const { data } = await runReply({
      recipient: { systemLanguage: 'de', deviceLocale: 'pt-BR' },
      translations: { pt: { text: 'Olá' } },
      originalLanguage: 'en',
    });

    expect(data?.translatedContent).toBe('Olá');
    expect(data?.translatedLanguage).toBe('pt');
  });
});

describe('createReplyNotification — la langue d\'origine concourt à son RANG', () => {
  it('ne pousse AUCUNE traduction quand la langue d\'origine gagne avant elle', async () => {
    const { data } = await runReply({
      recipient: { systemLanguage: 'de', regionalLanguage: 'en', customDestinationLanguage: 'fr' },
      translations: { fr: { text: 'Bonjour' } },
      originalLanguage: 'en',
    });

    expect(data?.translatedContent).toBeUndefined();
    expect(data?.translatedLanguage).toBeUndefined();
  });
});

describe('createReplyNotification — ce que la descente ne doit PAS relâcher', () => {
  it('ne pousse jamais une traduction CHIFFRÉE, et descend au rang suivant', async () => {
    const { data } = await runReply({
      recipient: { systemLanguage: 'fr', regionalLanguage: 'es' },
      translations: { fr: { text: 'U2FsdGVk…', isEncrypted: true }, es: { text: 'Hola' } },
      originalLanguage: 'en',
    });

    expect(data?.translatedContent).toBe('Hola');
    expect(data?.translatedLanguage).toBe('es');
  });

  it('ne retombe sur AUCUNE traduction quand rien ne matche le prisme (règle #1)', async () => {
    const { data } = await runReply({
      recipient: { systemLanguage: 'de' },
      translations: { es: { text: 'Hola' }, it: { text: 'Ciao' } },
      originalLanguage: 'en',
    });

    expect(data?.translatedContent).toBeUndefined();
  });

  it('tronque la traduction poussée à 200 caractères, quel que soit son rang', async () => {
    const long = 'á'.repeat(400);
    const { data } = await runReply({
      recipient: { systemLanguage: 'de', regionalLanguage: 'es' },
      translations: { es: { text: long } },
      originalLanguage: 'en',
    });

    expect((data?.translatedContent as string)?.length).toBe(200);
  });
});
