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

describe('offeredMessagesOf — ce que le fil confie à l’appareil (#9898)', () => {
  test('un message reçu, en clair, part avec ses langues déjà servies', () => {
    const translations = [{ targetLanguage: 'en', translatedContent: 'how are you' }] as unknown as Message['translations'];
    expect(offeredMessagesOf([message({ translations })], 'u-me')).toEqual([
      { id: 'm1', conversationId: 'c1', content: 'habari yako', originalLanguage: 'sw', translatedLanguages: ['en'], encrypted: false },
    ]);
  });

  test('mes propres messages, les éphémères, les vues uniques et les floutés restent hors du cache de l’appareil', () => {
    expect(
      offeredMessagesOf(
        [
          message({ id: 'mine', senderId: 'u-me' }),
          message({ id: 'once', isViewOnce: true }),
          message({ id: 'blur', isBlurred: true }),
          message({ id: 'gone', expiresAt: new Date('2026-10-10T08:00:00Z') }),
        ],
        'u-me',
      ),
    ).toEqual([]);
  });

  test('un message chiffré de bout en bout est marqué : sans clair déchiffré, rien n’est calculé', () => {
    expect(offeredMessagesOf([message({ isEncrypted: true, encryptionMode: 'e2ee' })], 'u-me')[0]?.encrypted).toBe(true);
  });

  test('un chiffrement côté serveur laisse un clair : le message reste traduisible', () => {
    expect(offeredMessagesOf([message({ isEncrypted: true, encryptionMode: 'server' })], 'u-me')[0]?.encrypted).toBe(false);
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
    expect(offeredMessagesOf(protectedMessages, 'u-me')).toEqual([]);
  });

  test('un effet qui ne protège rien n’empêche pas la traduction', () => {
    const shaken = message({ effectFlags: MESSAGE_EFFECT_FLAGS.SHAKE | MESSAGE_EFFECT_FLAGS.GLOW });
    expect(offeredMessagesOf([shaken], 'u-me').map((offered) => offered.id)).toEqual(['m1']);
  });

  test('mon message se reconnaît aussi par l’utilisateur de son expéditeur', () => {
    const mine = message({ senderId: 'participant-9', sender: { userId: 'u-me' } as unknown as NonNullable<Message['sender']> });
    expect(offeredMessagesOf([mine], 'u-me')).toEqual([]);
  });

  test('sans lecteur identifié, rien ne part : on ne sait pas lesquels sont les siens', () => {
    expect(offeredMessagesOf([message()], '')).toEqual([]);
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
