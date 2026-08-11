import { resolveLastMessagePrismeByRoom } from '../../../socketio/utils/lastMessagePrisme';

const FR_USER = {
  id: 'u-fr',
  systemLanguage: 'fr',
  regionalLanguage: null,
  customDestinationLanguage: null,
  deviceLocale: null,
};
const ES_USER = {
  id: 'u-es',
  systemLanguage: 'es',
  regionalLanguage: null,
  customDestinationLanguage: null,
  deviceLocale: null,
};

function prismaWith(users: Array<Record<string, unknown>>) {
  const findMany = jest.fn().mockResolvedValue(users);
  return { prisma: { user: { findMany } } as never, findMany };
}

const TRANSLATIONS = {
  fr: { text: 'Bonjour tout le monde' },
  es: { text: 'Hola a todos' },
};

describe('resolveLastMessagePrismeByRoom', () => {
  it('sert à chaque destinataire la traduction de SON prisme, pas celle du premier venu', async () => {
    const { prisma } = prismaWith([FR_USER, ES_USER]);

    const byRoom = await resolveLastMessagePrismeByRoom({
      prisma,
      participants: [
        { id: 'p1', userId: 'u-fr' },
        { id: 'p2', userId: 'u-es' },
      ],
      translations: TRANSLATIONS,
      originalLanguage: 'en',
    });

    expect(byRoom.get('user:u-fr')).toEqual({ fr: 'Bonjour tout le monde' });
    expect(byRoom.get('user:u-es')).toEqual({ es: 'Hola a todos' });
  });

  it('ne touche PAS la base quand le message ne porte aucune traduction — le cas nominal de l\'envoi', async () => {
    const { prisma, findMany } = prismaWith([]);

    const byRoom = await resolveLastMessagePrismeByRoom({
      prisma,
      participants: [{ id: 'p1', userId: 'u-fr' }],
      translations: null,
      originalLanguage: 'en',
    });

    expect(findMany).not.toHaveBeenCalled();
    expect(byRoom.size).toBe(0);
  });

  it('ne touche pas la base pour une carte vide non plus', async () => {
    const { prisma, findMany } = prismaWith([]);

    const byRoom = await resolveLastMessagePrismeByRoom({
      prisma,
      participants: [{ id: 'p1', userId: 'u-fr' }],
      translations: {},
      originalLanguage: 'en',
    });

    expect(findMany).not.toHaveBeenCalled();
    expect(byRoom.size).toBe(0);
  });

  it('omet le destinataire dont le prisme n\'est servi par aucune traduction — le résolveur client retombe sur l\'original', async () => {
    const { prisma } = prismaWith([
      { ...FR_USER },
      { id: 'u-de', systemLanguage: 'de', regionalLanguage: null, customDestinationLanguage: null, deviceLocale: null },
    ]);

    const byRoom = await resolveLastMessagePrismeByRoom({
      prisma,
      participants: [
        { id: 'p1', userId: 'u-fr' },
        { id: 'p2', userId: 'u-de' },
      ],
      translations: TRANSLATIONS,
      originalLanguage: 'en',
    });

    expect(byRoom.get('user:u-fr')).toEqual({ fr: 'Bonjour tout le monde' });
    expect(byRoom.has('user:u-de')).toBe(false);
  });

  it('nomme la room d\'un participant sans compte d\'après son Participant.id et résout sa langue de participant', async () => {
    const { prisma } = prismaWith([]);

    const byRoom = await resolveLastMessagePrismeByRoom({
      prisma,
      participants: [{ id: 'p-guest', userId: null, language: 'es' }],
      translations: TRANSLATIONS,
      originalLanguage: 'en',
    });

    expect(byRoom.get('user:p-guest')).toEqual({ es: 'Hola a todos' });
  });

  it('omet la langue d\'origine du prisme du lecteur — elle EST déjà lastMessagePreview', async () => {
    const { prisma } = prismaWith([FR_USER]);

    const byRoom = await resolveLastMessagePrismeByRoom({
      prisma,
      participants: [{ id: 'p1', userId: 'u-fr' }],
      translations: TRANSLATIONS,
      originalLanguage: 'fr',
    });

    expect(byRoom.has('user:u-fr')).toBe(false);
  });

  it('rend une carte vide plutôt que de propager une panne base — l\'aperçu brut reste juste', async () => {
    const findMany = jest.fn().mockRejectedValue(new Error('mongo down'));
    const onError = jest.fn();

    const byRoom = await resolveLastMessagePrismeByRoom({
      prisma: { user: { findMany } } as never,
      participants: [{ id: 'p1', userId: 'u-fr' }],
      translations: TRANSLATIONS,
      originalLanguage: 'en',
      onError,
    });

    expect(byRoom.size).toBe(0);
    expect(onError).toHaveBeenCalled();
  });

  // `Message.translations` promet un tableau au format API et livre parfois la
  // carte Mongo. Traiter le tableau comme « pas une carte » rendrait `null` à
  // tout le monde alors que les traductions existent — l'aperçu retomberait
  // silencieusement sur l'original.
  it('accepte AUSSI le tableau au format API que le chemin socket porte après traduction', async () => {
    const { prisma } = prismaWith([FR_USER]);

    const byRoom = await resolveLastMessagePrismeByRoom({
      prisma,
      participants: [{ id: 'p1', userId: 'u-fr' }],
      translations: [
        { id: 'm1-fr', messageId: 'm1', targetLanguage: 'fr', translatedContent: 'Bonjour tout le monde', isEncrypted: false },
      ],
      originalLanguage: 'en',
    });

    expect(byRoom.get('user:u-fr')).toEqual({ fr: 'Bonjour tout le monde' });
  });

  it('écarte une traduction chiffrée du tableau comme de la carte — un cryptogramme n\'est pas un aperçu', async () => {
    const { prisma } = prismaWith([FR_USER]);

    const byRoom = await resolveLastMessagePrismeByRoom({
      prisma,
      participants: [{ id: 'p1', userId: 'u-fr' }],
      translations: [
        { targetLanguage: 'fr', translatedContent: 'U2FsdGVkX1+base64', isEncrypted: true },
      ],
      originalLanguage: 'en',
    });

    expect(byRoom.has('user:u-fr')).toBe(false);
  });

  it('ne touche pas la base pour un tableau vide', async () => {
    const { prisma, findMany } = prismaWith([]);

    const byRoom = await resolveLastMessagePrismeByRoom({
      prisma,
      participants: [{ id: 'p1', userId: 'u-fr' }],
      translations: [],
      originalLanguage: 'en',
    });

    expect(findMany).not.toHaveBeenCalled();
    expect(byRoom.size).toBe(0);
  });

  it('ne demande à la base que les participants qui ONT un compte', async () => {
    const { prisma, findMany } = prismaWith([FR_USER]);

    await resolveLastMessagePrismeByRoom({
      prisma,
      participants: [
        { id: 'p1', userId: 'u-fr' },
        { id: 'p-guest', userId: null, language: 'es' },
      ],
      translations: TRANSLATIONS,
      originalLanguage: 'en',
    });

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany.mock.calls[0][0].where.id.in).toEqual(['u-fr']);
  });
});
