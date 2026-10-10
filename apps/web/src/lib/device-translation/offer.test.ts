import { describe, expect, test } from 'bun:test';

import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

import { offeredMessagesOf, translationEventOf } from './offer';
import type { Message } from '@/lib/api/types';

const message = (over: Partial<Message> = {}): Message =>
  ({
    id: 'm1',
    conversationId: 'c1',
    senderId: 'u-other',
    content: 'habari yako',
    originalLanguage: 'sw',
    translations: [],
    isViewOnce: false,
    viewOnceCount: 0,
    isBlurred: false,
    isEncrypted: false,
    ...over,
  }) as unknown as Message;

/** Le fil de `u-me`, dans une conversation dont le mode de chiffrement est `mode` (`null` : la conversation ne le dit pas). */
const offeredIn = (messages: readonly Message[], mode: string | null = null) => offeredMessagesOf(messages, 'u-me', mode);

describe('offeredMessagesOf — ce que le fil confie à l’appareil (#9898)', () => {
  test('un message reçu, en clair, part avec ses langues déjà servies, partageable, à la version d’origine', () => {
    const translations = [{ targetLanguage: 'en', translatedContent: 'how are you' }] as unknown as Message['translations'];
    expect(offeredIn([message({ translations })])).toEqual([
      {
        id: 'm1',
        conversationId: 'c1',
        content: 'habari yako',
        originalLanguage: 'sw',
        translatedLanguages: ['en'],
        encrypted: false,
        shareable: true,
        sourceVersion: 'original',
      },
    ]);
  });

  test('mes propres messages, les éphémères, les vues uniques et les floutés restent hors du cache de l’appareil', () => {
    expect(
      offeredIn([
        message({ id: 'mine', senderId: 'u-me' }),
        message({ id: 'once', isViewOnce: true }),
        message({ id: 'blur', isBlurred: true }),
        message({ id: 'gone', expiresAt: new Date('2026-10-10T08:00:00Z') }),
      ]),
    ).toEqual([]);
  });


  test('tout ce que la loi de sortie ne laisse pas sortir reste hors du cache et du partage', () => {
    const protectedMessages = [
      message({ id: 'timer', ephemeralDuration: 30 }),
      message({ id: 'flame', effectFlags: MESSAGE_EFFECT_FLAGS.EPHEMERAL }),
      message({ id: 'after-read', effectFlags: MESSAGE_EFFECT_FLAGS.EPHEMERAL | MESSAGE_EFFECT_FLAGS.EPHEMERAL_AFTER_READ }),
      message({ id: 'once-bit', effectFlags: MESSAGE_EFFECT_FLAGS.VIEW_ONCE }),
      message({ id: 'blur-bit', effectFlags: MESSAGE_EFFECT_FLAGS.BLURRED }),
      message({ id: 'once-piece', attachments: [{ id: 'a1', isViewOnce: true }] as unknown as NonNullable<Message['attachments']> }),
      message({ id: 'deleted', deletedAt: new Date('2026-10-10T08:00:00Z') }),
    ];
    expect(offeredIn(protectedMessages)).toEqual([]);
  });

  test('un effet qui ne protège rien n’empêche pas la traduction', () => {
    const shaken = message({ effectFlags: MESSAGE_EFFECT_FLAGS.SHAKE | MESSAGE_EFFECT_FLAGS.GLOW });
    expect(offeredIn([shaken]).map((offered) => offered.id)).toEqual(['m1']);
  });

  test('mon message se reconnaît aussi par l’utilisateur de son expéditeur', () => {
    const mine = message({ senderId: 'participant-9', sender: { userId: 'u-me' } as unknown as NonNullable<Message['sender']> });
    expect(offeredIn([mine])).toEqual([]);
  });

  test('sans lecteur identifié, rien ne part : on ne sait pas lesquels sont les siens', () => {
    expect(offeredMessagesOf([message()], '', null)).toEqual([]);
  });
});

describe('offeredMessagesOf — l’appareil traduit un clair, mais ne partage que ce que le serveur lit déjà (#9899)', () => {
  const only = (over: Partial<Message>, mode: string | null = null) => offeredIn([message(over)], mode)[0];

  test('un message en clair se partage dans une conversation en clair, ou chiffrée par le serveur', () => {
    for (const mode of [null, 'server', 'hybrid']) {
      expect(only({}, mode)).toMatchObject({ encrypted: false, shareable: true });
    }
  });

  test('un chiffrement côté serveur laisse un clair : le message reste traduisible, et se partage', () => {
    for (const encryptionMode of ['server', 'hybrid'] as const) {
      expect(only({ isEncrypted: true, encryptionMode })).toMatchObject({ encrypted: false, shareable: true });
    }
  });

  test('un message chiffré de bout en bout est marqué : sans clair déchiffré, rien n’est calculé ni partagé', () => {
    expect(only({ isEncrypted: true, encryptionMode: 'e2ee' })).toMatchObject({ encrypted: true, shareable: false });
  });

  test('un message chiffré dont le mode est absent ou inconnu se lit comme chiffré : on ne devine pas un clair', () => {
    for (const encryptionMode of [undefined, null, 'quantum']) {
      const over = { isEncrypted: true, ...(encryptionMode === undefined ? {} : { encryptionMode }) } as Partial<Message>;
      expect(only(over)).toMatchObject({ encrypted: true, shareable: false });
    }
  });

  test('un clair que le serveur ne lit pas se traduit sur l’appareil, mais ne se partage ni ne se demande', () => {
    expect(only({ isEncrypted: false, encryptionMode: 'e2ee' })).toMatchObject({ encrypted: false, shareable: false });
    expect(only({}, 'e2ee')).toMatchObject({ encrypted: false, shareable: false });
    expect(only({}, 'un-mode-inconnu')).toMatchObject({ encrypted: false, shareable: false });
  });

  test('une conversation chiffrée de bout en bout ferme aussi le message chiffré par le serveur', () => {
    expect(only({ isEncrypted: true, encryptionMode: 'server' }, 'e2ee')).toMatchObject({ encrypted: true, shareable: false });
  });

  test('le mode se lit comme la loi partagée : sans casse ni blancs', () => {
    expect(only({}, ' E2EE ')).toMatchObject({ shareable: false });
    expect(only({ isEncrypted: true, encryptionMode: ' E2EE ' as unknown as NonNullable<Message['encryptionMode']> })).toMatchObject({ encrypted: true, shareable: false });
    expect(only({}, ' Server ')).toMatchObject({ shareable: true });
  });

  test('la version du texte traduit est l’instant de sa dernière modification, ou « original »', () => {
    expect(only({})?.sourceVersion).toBe('original');
    expect(only({ editedAt: new Date('2026-10-10T08:00:00.123Z') })?.sourceVersion).toBe('2026-10-10T08:00:00.123Z');
  });

  test('une date de modification encore en chaîne (cache non décodé) se normalise comme celle de la passerelle', () => {
    expect(only({ editedAt: '2026-10-10T10:00:00+02:00' as unknown as Date })?.sourceVersion).toBe('2026-10-10T08:00:00.000Z');
  });

  test('une date de modification illisible : version inconnue, jamais « original » — l’appareil ne sait pas ce qu’il traduit', () => {
    expect(only({ editedAt: new Date('pas une date') })?.sourceVersion).toBeNull();
    expect(only({ editedAt: 'pas une date' as unknown as Date })?.sourceVersion).toBeNull();
  });
});

describe('translationEventOf — la traduction de l’appareil emprunte le puits de message:translation', () => {
  test('la forme TranslationData, marquée comme venue de l’appareil', () => {
    expect(translationEventOf({ messageId: 'm1', source: 'sw', target: 'fr', text: 'comment vas-tu', engine: 'device:nllb' })).toEqual({
      messageId: 'm1',
      translations: [
        {
          id: 'device:m1:fr',
          messageId: 'm1',
          sourceLanguage: 'sw',
          targetLanguage: 'fr',
          translatedContent: 'comment vas-tu',
          translationModel: 'device:nllb',
          cacheKey: 'device:m1:fr',
          cached: true,
        },
      ],
    });
  });
});
