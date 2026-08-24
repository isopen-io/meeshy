/**
 * Cycle 121 — le Prisme de la BANNIÈRE de notification ne descendait que le
 * rang 1.
 *
 * Quatrième famille de résolveurs du Prisme, après l'aperçu de liste
 * (cycle 118), l'audio (cycle 119) et les posts/commentaires (cycle 120). Elle
 * n'était nommée par aucune des trois énumérations — c'est la question de la
 * leçon 261 instanciée sur un TYPE de contenu de plus : « et le texte poussé
 * dans une notification, qui le résout ? ».
 *
 * Réponse : `NotificationService.createMessageNotification`, et il appariait la
 * carte `Message.translations` à `resolveUserLanguage(...)` — c'est-à-dire à UNE
 * langue, la plus haute non vide, donc le rang 1 dans le cas nominal. Une
 * traduction disponible au rang 2, 3 ou 4 du prisme du destinataire n'était
 * jamais poussée : la bannière servait l'ORIGINAL pendant que la ligne de liste
 * de la même application — servie par `resolveLastMessagePreview`, qui DESCEND —
 * affichait la traduction. Deux textes pour un même message, sur le même écran,
 * à quelques secondes d'intervalle.
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

type LangPrefs = {
  systemLanguage?: string | null;
  regionalLanguage?: string | null;
  customDestinationLanguage?: string | null;
  deviceLocale?: string | null;
};

/**
 * Le double `user.findUnique` répond selon l'id DEMANDÉ, jamais un profil
 * unique pour tout le monde : l'expéditeur et le destinataire sont deux
 * lectures distinctes dans cette méthode, et un double qui rend le même objet
 * aux deux ferait résoudre le prisme du destinataire depuis les préférences de
 * l'expéditeur — un témoin qui atteste alors le mauvais lecteur.
 */
const makePrismaMock = (opts: {
  recipient: LangPrefs;
  translations: unknown;
  originalLanguage: string | null;
}) => ({
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
  recipientUserId: RECIPIENT_ID,
  senderId: SENDER_ID,
  messageId: 'msg_xyz',
  conversationId: 'conv_x',
  messagePreview: 'Hello',
};

/** La charge `data` réellement remise à APNs, ou `undefined` si rien n'est parti. */
const servedPushData = (sendToUser: jest.Mock): Record<string, unknown> | undefined =>
  sendToUser.mock.calls[0]?.[0]?.payload?.data;

/**
 * Le CORPS réellement remis à APNs — le seul champ que les trois plateformes
 * rendent, et donc le seul texte qu'un lecteur voit. `data.translatedContent`
 * est un champ de service : aucun client ne le lit (cycle 122).
 */
const servedPushBody = (sendToUser: jest.Mock): string | undefined =>
  sendToUser.mock.calls[0]?.[0]?.payload?.body;

const runFanOut = async (opts: {
  recipient: LangPrefs;
  translations: unknown;
  originalLanguage: string | null;
  params?: Partial<Parameters<NotificationService['createMessageNotification']>[0]>;
}) => {
  const prisma = makePrismaMock(opts);
  const sendToUser = jest.fn().mockResolvedValue(undefined);
  const service = new NotificationService(prisma);
  service.setSocketIO(makeIO());
  service.setPushNotificationService({ sendToUser } as any);

  const notification = await service.createMessageNotification({ ...baseParams, ...opts.params });

  return {
    notification,
    data: servedPushData(sendToUser),
    body: servedPushBody(sendToUser),
    prisma,
  };
};

describe('createMessageNotification — le Prisme de la bannière DESCEND les rangs', () => {
  it('pousse la traduction du rang 1 quand elle existe', async () => {
    const { data } = await runFanOut({
      recipient: { systemLanguage: 'fr', regionalLanguage: 'es' },
      translations: { fr: { text: 'Bonjour' }, es: { text: 'Hola' } },
      originalLanguage: 'en',
    });

    expect(data?.translatedContent).toBe('Bonjour');
    expect(data?.translatedLanguage).toBe('fr');
  });

  it('DESCEND au rang 2 quand le rang 1 n\'a pas de traduction', async () => {
    // Le défaut du cycle 121, dans sa forme la plus simple : avant le
    // correctif, `resolveUserLanguage` rendait 'de' et l'appariement EXACT
    // n'y trouvait rien — la bannière servait « Hello ».
    const { data } = await runFanOut({
      recipient: { systemLanguage: 'de', regionalLanguage: 'es' },
      translations: { es: { text: 'Hola' } },
      originalLanguage: 'en',
    });

    expect(data?.translatedContent).toBe('Hola');
    expect(data?.translatedLanguage).toBe('es');
  });

  it('DESCEND jusqu\'à la locale appareil — le rang 4 du Prisme', async () => {
    // Cas NOMINAL depuis l'extension du Prisme (2026-05-26) : un appareil dont
    // la locale diffère de la langue applicative. C'est la population pour
    // laquelle la bannière et la ligne de liste divergeaient le plus souvent.
    const { data } = await runFanOut({
      recipient: { systemLanguage: 'de', deviceLocale: 'pt-BR' },
      translations: { pt: { text: 'Olá' } },
      originalLanguage: 'en',
    });

    expect(data?.translatedContent).toBe('Olá');
    expect(data?.translatedLanguage).toBe('pt');
  });
});

describe('createMessageNotification — la langue d\'origine concourt à son RANG', () => {
  it('ne pousse AUCUNE traduction quand la langue d\'origine gagne avant elle', async () => {
    // Règle critique #3. Ce témoin garde le mode d'échec du CORRECTIF : une
    // descente qui prendrait « la première traduction disponible » servirait
    // « Bonjour » alors que le message est déjà écrit dans la langue de rang 2
    // du lecteur.
    const { data } = await runFanOut({
      recipient: { systemLanguage: 'de', regionalLanguage: 'en', customDestinationLanguage: 'fr' },
      translations: { fr: { text: 'Bonjour' } },
      originalLanguage: 'en',
    });

    expect(data?.translatedContent).toBeUndefined();
    expect(data?.translatedLanguage).toBeUndefined();
  });

  it('ne rétrograde PAS la langue primaire quand la langue d\'origine est plus bas', async () => {
    const { data } = await runFanOut({
      recipient: { systemLanguage: 'fr', deviceLocale: 'en-US' },
      translations: { fr: { text: 'Bonjour' } },
      originalLanguage: 'en',
    });

    expect(data?.translatedContent).toBe('Bonjour');
  });
});

describe('createMessageNotification — ce que la descente ne doit PAS relâcher', () => {
  it('ne pousse jamais une traduction CHIFFRÉE, et descend au rang suivant', async () => {
    // La NSE déchiffre `encryptedContent`, jamais les traductions : une entrée
    // chiffrée n'est pas servable. Elle ne bloque pas la descente pour autant —
    // le rang suivant reste dû au lecteur.
    const { data } = await runFanOut({
      recipient: { systemLanguage: 'fr', regionalLanguage: 'es' },
      translations: { fr: { text: 'U2FsdGVk…', isEncrypted: true }, es: { text: 'Hola' } },
      originalLanguage: 'en',
    });

    expect(data?.translatedContent).toBe('Hola');
    expect(data?.translatedLanguage).toBe('es');
  });

  it('ne retombe sur AUCUNE traduction quand rien ne matche le prisme (règle #1)', async () => {
    const { data } = await runFanOut({
      recipient: { systemLanguage: 'de' },
      translations: { es: { text: 'Hola' }, it: { text: 'Ciao' } },
      originalLanguage: 'en',
    });

    expect(data?.translatedContent).toBeUndefined();
  });

  it('garde la langue de CADRAGE au rang 1, même quand le contenu est servi plus bas', async () => {
    // Deux résolutions distinctes vivent dans cette méthode et ne doivent pas
    // fusionner : le CADRAGE (« Alice vous a envoyé une photo », la langue
    // d'interface du destinataire) reste le rang 1 ; seul le CONTENU descend.
    // Les confondre localiserait la bannière en portugais pour un lecteur dont
    // l'application est en allemand.
    const { data, notification } = await runFanOut({
      recipient: { systemLanguage: 'de', deviceLocale: 'pt-BR' },
      translations: { pt: { text: 'Olá' } },
      originalLanguage: 'en',
    });

    expect(data?.translatedContent).toBe('Olá');
    expect((notification as any)?.lang ?? 'de').toBe('de');
  });

  it('tronque la traduction poussée à 200 caractères, quel que soit son rang', async () => {
    const long = 'á'.repeat(400);
    const { data } = await runFanOut({
      recipient: { systemLanguage: 'de', regionalLanguage: 'es' },
      translations: { es: { text: long } },
      originalLanguage: 'en',
    });

    expect((data?.translatedContent as string)?.length).toBe(200);
  });
});

/**
 * Cycle 122 — le Prisme s'arrêtait au champ `translatedContent` du fil push.
 *
 * Le cycle 121 a corrigé le RANG de la traduction élue, et l'a déposée dans
 * `context.translatedContent`. Mais ce champ n'est lu par AUCUN client : ni la
 * NSE iOS (`MeeshyNotificationExtension`), ni l'application, ni Android, ni le
 * service worker web. Le seul texte que les trois plateformes rendent est
 * `payload.body`, et il restait composé depuis l'aperçu ORIGINAL.
 *
 * Autrement dit le symptôme que le cycle 121 visait — deux textes pour un même
 * message, la bannière dans la langue de l'expéditeur pendant que la ligne de
 * liste est traduite — survivait intact, une couche plus bas. Un correctif
 * dont la valeur ne parvient jamais à un lecteur n'a corrigé personne.
 */
describe('createMessageNotification — le CORPS servi descend le Prisme', () => {
  it('compose la bannière avec la traduction du rang atteint, pas avec l\'original', async () => {
    // `payload.body` est le SEUL champ que les trois plateformes rendent.
    // Avant ce correctif il valait « Hello » pendant que `translatedContent`,
    // que personne ne lit, portait « Hola ».
    const { body, data } = await runFanOut({
      recipient: { systemLanguage: 'de', regionalLanguage: 'es' },
      translations: { es: { text: 'Hola' } },
      originalLanguage: 'en',
    });

    expect(body).toBe('Hola');
    expect(data?.translatedContent).toBe('Hola');
  });

  it('persiste le MÊME texte dans la ligne in-app que celui de la bannière', async () => {
    // La liste in-app est servie par `Notification.content`. Le laisser à
    // l'original recréerait la divergence d'un cran : bannière traduite,
    // historique dans la langue de l'expéditeur.
    const { body, notification } = await runFanOut({
      recipient: { systemLanguage: 'de', regionalLanguage: 'es' },
      translations: { es: { text: 'Hola' } },
      originalLanguage: 'en',
    });

    // La valeur ATTENDUE est écrite en clair : `content === body` seul ne peut
    // pas tomber — les deux restent égaux quand aucun des deux ne descend.
    expect((notification as any)?.content).toBe('Hola');
    expect(body).toBe('Hola');
  });

  it('garde l\'ORIGINAL quand le Prisme n\'élit rien (règle #1)', async () => {
    const { body } = await runFanOut({
      recipient: { systemLanguage: 'de' },
      translations: { it: { text: 'Ciao' } },
      originalLanguage: 'en',
    });

    expect(body).toBe('Hello');
  });

  it('garde l\'original quand la langue d\'origine gagne à son rang (règle #3)', async () => {
    const { body } = await runFanOut({
      recipient: { systemLanguage: 'de', regionalLanguage: 'en', customDestinationLanguage: 'fr' },
      translations: { fr: { text: 'Bonjour' } },
      originalLanguage: 'en',
    });

    expect(body).toBe('Hello');
  });
});

describe('createMessageNotification — ce que la substitution ne doit PAS relâcher', () => {
  it('ne substitue JAMAIS dans un aperçu protégé — la traduction relâcherait le texte masqué', async () => {
    // Le mode d'échec du CORRECTIF, pas du défaut : un message éphémère /
    // à vue unique / flouté montre un placeholder sur l'écran verrouillé.
    // `Message.translations` porte pourtant le texte en clair — y substituer la
    // traduction afficherait exactement ce que la protection cache.
    const { body } = await runFanOut({
      recipient: { systemLanguage: 'de', regionalLanguage: 'es' },
      translations: { es: { text: 'Hola, mon secret' } },
      originalLanguage: 'en',
      params: {
        messagePreview: '⏱️ 💬 24h',
        notificationLocKey: 'notification.ephemeral_message',
      },
    });

    expect(body).toBe('⏱️ 💬 24h');
  });

  it('ne substitue pas la transcription d\'un vocal — un AUTRE texte que Message.content', async () => {
    // `Message.translations` ne traduit que `Message.content` ; les traductions
    // d'une transcription vivent sur `MessageAttachment.translations`. Servir
    // l'une pour l'autre afficherait un contenu sans rapport avec l'audio.
    const { body } = await runFanOut({
      recipient: { systemLanguage: 'de', regionalLanguage: 'es' },
      translations: { es: { text: 'Hola' } },
      originalLanguage: 'en',
      params: {
        messagePreview: 'Salut, je te rappelle ce soir',
        previewIsMessageContent: false,
      },
    });

    expect(body).toBe('Salut, je te rappelle ce soir');
  });

  it('descend le CONTENU sans emporter le CADRAGE, qui reste au rang 1', async () => {
    const { body, notification } = await runFanOut({
      recipient: { systemLanguage: 'de', deviceLocale: 'pt-BR' },
      translations: { pt: { text: 'Olá' } },
      originalLanguage: 'en',
    });

    expect(body).toBe('Olá');
    expect((notification as any)?.lang ?? 'de').toBe('de');
  });
});
