/**
 * Cycle 122 — la bannière de MENTION ne descendait AUCUN rang du Prisme.
 *
 * Suivi direct du cycle 121, mesuré : deux des trois éventails de
 * `messageNotificationFanOut` — `createReplyNotification` et
 * `createMentionNotification` — posaient `content: params.messagePreview`, sans
 * jamais lire `Message.translations`, et ne poussaient ni `translatedContent`
 * ni `translatedLanguage`. Défaut DISTINCT de celui du cycle 121 (absence du
 * Prisme, pas un mauvais rang) : une bannière de mention était toujours dans la
 * langue de l'EXPÉDITEUR, quelle que soit celle de la personne mentionnée.
 *
 * Le résolveur `resolvePrismTranslation` est celui de la quatrième famille — il
 * est partagé et juste ; il ne manquait que la liste en entrée. Ce lot le
 * câble.
 *
 * Les témoins assertent sur la charge REMISE à APNs (`pushService.sendToUser`),
 * jamais sur un calcul intermédiaire : c'est la valeur SERVIE. Même patron que
 * `messageNotificationPrism.test.ts`, avec les rôles de la mention en entrée.
 *
 * @jest-environment node
 */
import { NotificationService } from '../../../../services/notifications/NotificationService';

jest.mock('../../../../utils/logger-enhanced', () => ({
  notificationLogger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
  securityLogger: { logViolation: jest.fn() },
}));

const MENTIONER_ID = 'mentioner_id';
const MENTIONED_ID = 'mentioned_id';

type LangPrefs = {
  systemLanguage?: string | null;
  regionalLanguage?: string | null;
  customDestinationLanguage?: string | null;
  deviceLocale?: string | null;
};

/**
 * Le double `user.findUnique` répond selon l'id DEMANDÉ, jamais un profil
 * unique pour tout le monde : la personne mentionnée et le mentionneur sont
 * deux lectures distinctes de cette méthode, et un double qui rend le même
 * objet aux deux ferait résoudre le prisme du destinataire depuis les
 * préférences de l'expéditeur — un témoin qui atteste alors le mauvais
 * lecteur.
 */
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
        where?.id === MENTIONED_ID
          ? { id: MENTIONED_ID, ...opts.recipient }
          : { id: MENTIONER_ID, username: 'alice', displayName: 'Alice', avatar: null }
      )
    ),
    findMany: jest.fn().mockResolvedValue([]),
  },
  conversation: {
    findUnique: jest.fn().mockResolvedValue({ id: 'conv_x', title: 'Test Conv', type: 'group', avatar: null }),
  },
  userPreferences: { findUnique: jest.fn().mockResolvedValue(null) },
}) as any;

const makeIO = () => ({
  to: jest.fn().mockReturnThis(),
  in: jest.fn().mockReturnThis(),
  fetchSockets: jest.fn().mockResolvedValue([]),
  emit: jest.fn(),
}) as any;

const baseParams = {
  mentionedUserId: MENTIONED_ID,
  mentionerUserId: MENTIONER_ID,
  messageId: 'msg_xyz',
  conversationId: 'conv_x',
  messagePreview: '@bob Hello',
};

/** La charge `data` réellement remise à APNs, ou `undefined` si rien n'est parti. */
const servedPushData = (sendToUser: jest.Mock): Record<string, unknown> | undefined =>
  sendToUser.mock.calls[0]?.[0]?.payload?.data;

const runMention = async (opts: {
  recipient: LangPrefs;
  translations: unknown;
  originalLanguage: string | null;
}) => {
  const prisma = makePrismaMock(opts);
  const sendToUser = jest.fn().mockResolvedValue(undefined);
  const service = new NotificationService(prisma);
  service.setSocketIO(makeIO());
  service.setPushNotificationService({ sendToUser } as any);

  const notification = await service.createMentionNotification(baseParams);

  return { notification, data: servedPushData(sendToUser), prisma };
};

describe('createMentionNotification — le Prisme de la bannière DESCEND les rangs', () => {
  it('pousse la traduction du rang 1 quand elle existe', async () => {
    const { data } = await runMention({
      recipient: { systemLanguage: 'fr', regionalLanguage: 'es' },
      translations: { fr: { text: '@bob Bonjour' }, es: { text: '@bob Hola' } },
      originalLanguage: 'en',
    });

    expect(data?.translatedContent).toBe('@bob Bonjour');
    expect(data?.translatedLanguage).toBe('fr');
  });

  it('DESCEND au rang 2 quand le rang 1 n\'a pas de traduction', async () => {
    // Le défaut du cycle 122, dans sa forme la plus simple : avant le
    // correctif, `createMentionNotification` ne lisait AUCUNE traduction — la
    // bannière servait « @bob Hello ».
    const { data } = await runMention({
      recipient: { systemLanguage: 'de', regionalLanguage: 'es' },
      translations: { es: { text: '@bob Hola' } },
      originalLanguage: 'en',
    });

    expect(data?.translatedContent).toBe('@bob Hola');
    expect(data?.translatedLanguage).toBe('es');
  });

  it('DESCEND jusqu\'à la locale appareil — le rang 4 du Prisme', async () => {
    // Cas NOMINAL depuis l'extension du Prisme (2026-05-26) : un appareil dont
    // la locale diffère de la langue applicative. C'est la population pour
    // laquelle la bannière de mention et la ligne de liste divergeaient le plus
    // souvent.
    const { data } = await runMention({
      recipient: { systemLanguage: 'de', deviceLocale: 'pt-BR' },
      translations: { pt: { text: '@bob Olá' } },
      originalLanguage: 'en',
    });

    expect(data?.translatedContent).toBe('@bob Olá');
    expect(data?.translatedLanguage).toBe('pt');
  });
});

describe('createMentionNotification — la langue d\'origine concourt à son RANG', () => {
  it('ne pousse AUCUNE traduction quand la langue d\'origine gagne avant elle', async () => {
    // Règle critique #3. Ce témoin garde le mode d'échec du CORRECTIF : une
    // descente qui prendrait « la première traduction disponible » servirait
    // « @bob Bonjour » alors que le message est déjà écrit dans la langue de
    // rang 2 du lecteur.
    const { data } = await runMention({
      recipient: { systemLanguage: 'de', regionalLanguage: 'en', customDestinationLanguage: 'fr' },
      translations: { fr: { text: '@bob Bonjour' } },
      originalLanguage: 'en',
    });

    expect(data?.translatedContent).toBeUndefined();
    expect(data?.translatedLanguage).toBeUndefined();
  });
});

describe('createMentionNotification — ce que la descente ne doit PAS relâcher', () => {
  it('ne pousse jamais une traduction CHIFFRÉE, et descend au rang suivant', async () => {
    // La NSE déchiffre `encryptedContent`, jamais les traductions : une entrée
    // chiffrée n'est pas servable. Elle ne bloque pas la descente pour autant —
    // le rang suivant reste dû au lecteur.
    const { data } = await runMention({
      recipient: { systemLanguage: 'fr', regionalLanguage: 'es' },
      translations: { fr: { text: 'U2FsdGVk…', isEncrypted: true }, es: { text: '@bob Hola' } },
      originalLanguage: 'en',
    });

    expect(data?.translatedContent).toBe('@bob Hola');
    expect(data?.translatedLanguage).toBe('es');
  });

  it('ne retombe sur AUCUNE traduction quand rien ne matche le prisme (règle #1)', async () => {
    const { data } = await runMention({
      recipient: { systemLanguage: 'de' },
      translations: { es: { text: '@bob Hola' }, it: { text: '@bob Ciao' } },
      originalLanguage: 'en',
    });

    expect(data?.translatedContent).toBeUndefined();
  });

  it('tronque la traduction poussée à 200 caractères, quel que soit son rang', async () => {
    const long = '@' + 'á'.repeat(400);
    const { data } = await runMention({
      recipient: { systemLanguage: 'de', regionalLanguage: 'es' },
      translations: { es: { text: long } },
      originalLanguage: 'en',
    });

    expect((data?.translatedContent as string)?.length).toBe(200);
  });
});
