import { describe, expect, test } from 'bun:test';

import { message, minutesAgo } from '@/lib/api/fixtures-base';
import type { Message, MessageTranslation } from '@/lib/api/types';

import { deviceTranslationWanted } from './device-translation-request';

/**
 * « TRADUIRE SUR L'APPAREIL » NE S'OFFRE QUE SI LA FILE TRADUIRAIT (#11372,
 * contre-vérification) — le verdict du menu et la file de l'appareil lisent
 * la MÊME loi (`deviceTranslationTarget`, sur ce que `offeredMessagesOf`
 * confie) : sans quoi le menu offre un geste que la file saute en silence, et
 * l'annonce « Traduction demandée » ment.
 */

const row = (overrides: Partial<Message> = {}): Message =>
  message({
    id: 'm-1',
    conversationId: 'c-1',
    senderId: 'u-other',
    content: 'See you tomorrow',
    originalLanguage: 'en',
    translations: [],
    createdAt: minutesAgo(5),
    ...overrides,
  });

const reader = (languages: readonly string[], conversationEncryptionMode: string | null = 'e2ee') => ({
  viewerId: 'u-viewer',
  languages,
  conversationEncryptionMode,
});

const translationTo = (targetLanguage: string): MessageTranslation => ({
  id: `t-${targetLanguage}`,
  messageId: 'm-1',
  sourceLanguage: 'en',
  targetLanguage,
  translatedContent: 'À demain',
  translationModel: 'basic',
  createdAt: minutesAgo(4),
});

describe('deviceTranslationWanted — la loi de la file', () => {
  test('une langue étrangère, que l’appareil sait traduire vers le rang 1 : vrai', () => {
    expect(deviceTranslationWanted(row(), reader(['fr']))).toBe(true);
  });

  test('une langue d’origine INCONNUE : faux — la file ne traduit pas une source qu’on ignore', () => {
    expect(deviceTranslationWanted(Object.assign(row(), { originalLanguage: null }), reader(['fr']))).toBe(false);
    expect(deviceTranslationWanted(row({ originalLanguage: '' }), reader(['fr']))).toBe(false);
    expect(deviceTranslationWanted(row({ originalLanguage: '  ' }), reader(['fr']))).toBe(false);
  });

  test('un message déjà dans la langue du rang 1 : faux', () => {
    expect(deviceTranslationWanted(row({ content: 'À demain', originalLanguage: 'fr' }), reader(['fr', 'en']))).toBe(false);
    expect(deviceTranslationWanted(row({ content: 'À demain', originalLanguage: 'fr-FR' }), reader(['fr']))).toBe(false);
  });

  test('le rang 1 déjà servi par une traduction : faux — rien de plus haut à calculer', () => {
    expect(deviceTranslationWanted(row({ translations: [translationTo('fr')] }), reader(['fr']))).toBe(false);
  });

  test('une paire que l’appareil ne sait pas traduire est sautée, comme la file la saute', () => {
    expect(deviceTranslationWanted(row(), reader(['ln']))).toBe(false);
    expect(deviceTranslationWanted(row(), reader(['ln', 'fr']))).toBe(true);
  });

  test('le mien, un message vide ou chiffré sans clair ici : faux', () => {
    expect(deviceTranslationWanted(row({ senderId: 'u-viewer' }), reader(['fr']))).toBe(false);
    expect(deviceTranslationWanted(row({ content: '   ' }), reader(['fr']))).toBe(false);
    expect(deviceTranslationWanted(row({ isEncrypted: true, encryptionMode: 'e2ee' }), reader(['fr']))).toBe(false);
  });

  test('sans Prisme, rien à servir : faux', () => {
    expect(deviceTranslationWanted(row(), reader([]))).toBe(false);
  });
});
