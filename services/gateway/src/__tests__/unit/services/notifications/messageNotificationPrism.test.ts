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

/** La charge réellement remise à APNs, ou `undefined` si rien n'est parti. */
const servedPush = (sendToUser: jest.Mock): Record<string, any> | undefined =>
  sendToUser.mock.calls[0]?.[0]?.payload;

const servedPushData = (sendToUser: jest.Mock): Record<string, unknown> | undefined =>
  servedPush(sendToUser)?.data;

const runFanOut = async (opts: {
  recipient: LangPrefs;
  translations: unknown;
  originalLanguage: string | null;
  /** Surcharge des paramètres d'envoi — le CADRAGE ne s'observe que sur un
   *  corps localisé, donc sur un message porteur de pièce jointe. */
  params?: Record<string, unknown>;
}) => {
  const prisma = makePrismaMock(opts);
  const sendToUser = jest.fn().mockResolvedValue(undefined);
  const service = new NotificationService(prisma);
  service.setSocketIO(makeIO());
  service.setPushNotificationService({ sendToUser } as any);

  const notification = await service.createMessageNotification({ ...baseParams, ...opts.params } as any);

  return { notification, data: servedPushData(sendToUser), push: servedPush(sendToUser), prisma };
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
    // Les confondre localiserait la bannière en français pour un lecteur dont
    // l'application est en allemand.
    //
    // Le témoin porte sur le CORPS réellement remis à APNs. `Notification.lang`
    // n'est PAS persisté — il ne pilote que le rendu — si bien que la forme
    // antérieure de ce témoin (`notification.lang ?? 'de'`) ne pouvait pas
    // tomber : elle lisait `undefined` puis assertait son propre repli. Le
    // corps localisé, lui, dirait « 📷 Photo » si les deux fusionnaient.
    const { data, push } = await runFanOut({
      recipient: { systemLanguage: 'de', deviceLocale: 'fr-FR' },
      translations: { fr: { text: 'Bonjour' } },
      originalLanguage: 'en',
      params: { messagePreview: '', attachments: [{ type: 'image' }] },
    });

    expect(data?.translatedContent).toBe('Bonjour');
    expect(push?.body).toBe('📷 Foto');
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
 * Cycle 122 — le Prisme s'arrêtait aux champs de SERVICE du fil push.
 *
 * La descente ci-dessus alimente `data.translatedContent` / `data.translatedLanguage`.
 * Ces deux champs ne sont lus par AUCUN client : ni la NSE iOS
 * (`MeeshyNotificationExtension`), ni l'application, ni Android, ni le service
 * worker web. Le seul texte que les trois plateformes rendent est
 * `payload.body`, et il restait composé depuis l'aperçu ORIGINAL.
 *
 * Le symptôme que le cycle 121 visait — deux textes pour un même message, la
 * bannière dans la langue de l'expéditeur pendant que la ligne de liste est
 * traduite — survivait donc intact, une couche plus bas. Un correctif dont la
 * valeur ne parvient à aucun lecteur n'a corrigé personne.
 */
describe('createMessageNotification — le CORPS servi descend le Prisme', () => {
  it('compose la bannière avec la traduction du rang atteint, pas avec l\'original', async () => {
    const { push, data } = await runFanOut({
      recipient: { systemLanguage: 'de', regionalLanguage: 'es' },
      translations: { es: { text: 'Hola' } },
      originalLanguage: 'en',
    });

    expect(push?.body).toBe('Hola');
    expect(data?.translatedContent).toBe('Hola');
  });

  it('persiste dans la ligne in-app le MÊME texte que la bannière', async () => {
    // La valeur attendue est écrite en clair : `content === body` seul ne peut
    // pas tomber — les deux restent égaux quand aucun des deux ne descend.
    const { push, notification } = await runFanOut({
      recipient: { systemLanguage: 'de', regionalLanguage: 'es' },
      translations: { es: { text: 'Hola' } },
      originalLanguage: 'en',
    });

    expect((notification as any)?.content).toBe('Hola');
    expect(push?.body).toBe('Hola');
  });

  it('sert l\'ORIGINAL quand le Prisme n\'élit rien (règle #1)', async () => {
    const { push } = await runFanOut({
      recipient: { systemLanguage: 'de' },
      translations: { it: { text: 'Ciao' } },
      originalLanguage: 'en',
    });

    expect(push?.body).toBe('Hello');
  });

  it('sert l\'original quand la langue d\'origine gagne à son rang (règle #3)', async () => {
    const { push } = await runFanOut({
      recipient: { systemLanguage: 'de', regionalLanguage: 'en', customDestinationLanguage: 'fr' },
      translations: { fr: { text: 'Bonjour' } },
      originalLanguage: 'en',
    });

    expect(push?.body).toBe('Hello');
  });

  it('ne substitue JAMAIS dans un aperçu PROTÉGÉ — la traduction relâcherait le texte masqué', async () => {
    // Mode d'échec du CORRECTIF, pas du défaut : un message éphémère / à vue
    // unique / flouté n'affiche qu'un placeholder sur l'écran verrouillé.
    // `Message.translations` porte pourtant le texte en clair — y substituer la
    // traduction montrerait exactement ce que la protection cache.
    const { push } = await runFanOut({
      recipient: { systemLanguage: 'de', regionalLanguage: 'es' },
      translations: { es: { text: 'Hola, mi secreto' } },
      originalLanguage: 'en',
      params: {
        messagePreview: '⏱️ 💬 24h',
        notificationLocKey: 'notification.ephemeral_message',
      },
    });

    expect(push?.body).toBe('⏱️ 💬 24h');
  });

  it('ne substitue pas la transcription d\'un vocal — un AUTRE texte que Message.content', async () => {
    // Les traductions d'une transcription vivent sur
    // `MessageAttachment.translations` ; une entrée de `Message.translations`
    // substituée ici afficherait un contenu sans rapport avec l'audio.
    const { push } = await runFanOut({
      recipient: { systemLanguage: 'de', regionalLanguage: 'es' },
      translations: { es: { text: 'Hola' } },
      originalLanguage: 'en',
      params: {
        messagePreview: 'Salut, je te rappelle ce soir',
        previewIsMessageContent: false,
      },
    });

    expect(push?.body).toBe('Salut, je te rappelle ce soir');
  });
});

/**
 * Cycle 124 — un aperçu qui n'est PAS `Message.content` a le droit de descendre
 * SA source.
 *
 * Le cycle 122 avait posé la bonne condition de substitution — « la
 * transcription d'un vocal est un AUTRE texte » — et s'était arrêté là : la
 * bannière d'un vocal restait donc dans la langue de l'expéditeur, seule surface
 * du produit à ne pas descendre le Prisme sur ce contenu. La règle n'était pas
 * « ne pas traduire », elle était « ne pas traduire avec la MAUVAISE source ».
 *
 * `previewPrismSource` est cette source-là : l'éventail, seul à savoir ce que
 * l'aperçu montre, remet celle qui traduit CE texte. La descente, elle, reste le
 * site unique (`resolvePrismTranslation`).
 */
describe('createMessageNotification — un aperçu non-`content` descend SA source', () => {
  const TRANSCRIPT = 'Salut, je te rappelle ce soir';

  it('sert la traduction de la TRANSCRIPTION au rang atteint', async () => {
    const { push, data } = await runFanOut({
      recipient: { systemLanguage: 'de', regionalLanguage: 'es' },
      translations: { es: { text: 'Hola' } },
      originalLanguage: 'en',
      params: {
        messagePreview: TRANSCRIPT,
        previewIsMessageContent: false,
        previewPrismSource: {
          translations: { es: 'Te llamo esta noche' },
          originalLanguage: 'fr',
        },
      },
    });

    // `Message.translations` porte « Hola » au MÊME rang : un correctif qui
    // aurait simplement rouvert la substitution servirait ce texte-là, sans
    // rapport avec l'audio. Le témoin ne peut passer que si la source remise
    // l'emporte sur celle du message.
    expect(push?.body).toBe('Te llamo esta noche');
    expect(data?.translatedContent).toBe('Te llamo esta noche');
    expect(data?.translatedLanguage).toBe('es');
  });

  it('sert la transcription ORIGINALE quand sa langue gagne à son rang (règle #3)', async () => {
    const { push, data } = await runFanOut({
      recipient: { systemLanguage: 'de', regionalLanguage: 'fr' },
      translations: { es: { text: 'Hola' } },
      originalLanguage: 'en',
      params: {
        messagePreview: TRANSCRIPT,
        previewIsMessageContent: false,
        previewPrismSource: {
          translations: { es: 'Te llamo esta noche' },
          originalLanguage: 'fr',
        },
      },
    });

    expect(push?.body).toBe(TRANSCRIPT);
    expect(data?.translatedContent).toBeUndefined();
  });

  it('sert la transcription ORIGINALE quand rien ne matche le prisme (règle #1)', async () => {
    const { push } = await runFanOut({
      recipient: { systemLanguage: 'de' },
      translations: { es: { text: 'Hola' } },
      originalLanguage: 'en',
      params: {
        messagePreview: TRANSCRIPT,
        previewIsMessageContent: false,
        previewPrismSource: {
          translations: { it: 'Ti chiamo stasera' },
          originalLanguage: 'fr',
        },
      },
    });

    expect(push?.body).toBe(TRANSCRIPT);
  });

  it('ne substitue RIEN sous un aperçu protégé, même avec une source remise', async () => {
    // Fail-closed : la protection prime sur toute source. Aucun appelant ne
    // devrait composer ce couple — l'éventail refuse la transcription d'un
    // message protégé en amont — mais une garde de relâchement ne se délègue
    // pas à la discipline de ses appelants.
    const { push } = await runFanOut({
      recipient: { systemLanguage: 'de', regionalLanguage: 'es' },
      translations: { es: { text: 'Hola' } },
      originalLanguage: 'en',
      params: {
        messagePreview: '👁️ 🎵',
        notificationLocKey: 'notification.view_once_message',
        previewIsMessageContent: false,
        previewPrismSource: {
          translations: { es: 'Te llamo esta noche' },
          originalLanguage: 'fr',
        },
      },
    });

    expect(push?.body).toBe('👁️ 🎵');
  });
});
