import { describe, expect, test } from 'bun:test';

import { offeredMessagesOf, translationEventOf } from './offer';
import type { Message } from '@/lib/api/types';

const message = (over: Partial<Message> = {}): Message =>
  ({
    id: 'm1',
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
      { id: 'm1', content: 'habari yako', originalLanguage: 'sw', translatedLanguages: ['en'], encrypted: false },
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
