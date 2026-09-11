import { describe, expect, test } from 'bun:test';

import { translation } from '@/lib/api/fixtures-base';

import {
  EXTENDED_REACTIONS,
  QUICK_REACTIONS,
  messageMenuContextOf,
  messageMenuItems,
  translationChoices,
  type MessageMenuContext,
} from './message-actions';

/** Un `MessageMenuContext` de base — « rien de protégé, deux langues ». */
const ctx = (overrides: Partial<MessageMenuContext> = {}): MessageMenuContext => ({
  hasText: true,
  isProtected: false,
  languageCount: 2,
  ...overrides,
});

describe('messageMenuItems — miroir MessageActionResolver.primaryActions, réduit (#5814 §1.2)', () => {
  test('message standard, deux langues ⇒ select, translate, copy, compose, more', () => {
    expect(messageMenuItems(ctx()).map((i) => i.id)).toEqual(['select', 'translate', 'copy', 'compose', 'more']);
  });

  test('message SANS texte (m3) ⇒ select, compose, more — ni copy ni translate', () => {
    expect(messageMenuItems(ctx({ hasText: false })).map((i) => i.id)).toEqual(['select', 'compose', 'more']);
  });

  test('message PROTÉGÉ (D-23) ⇒ ni copy ni translate, même avec du texte', () => {
    expect(messageMenuItems(ctx({ isProtected: true })).map((i) => i.id)).toEqual(['select', 'compose', 'more']);
  });

  test('une seule langue ⇒ pas de translate, copy reste', () => {
    expect(messageMenuItems(ctx({ languageCount: 1 })).map((i) => i.id)).toEqual(['select', 'copy', 'compose', 'more']);
  });

  test('libellés exacts', () => {
    const labels = Object.fromEntries(messageMenuItems(ctx()).map((i) => [i.id, i.label]));
    expect(labels).toEqual({
      select: 'Sélectionner',
      translate: 'Traduire',
      copy: 'Copier',
      compose: 'Composer',
      more: 'Plus…',
    });
  });

  test('QUICK_REACTIONS et EXTENDED_REACTIONS — miroir MessageOverlayMenu.swift:99-104', () => {
    expect(QUICK_REACTIONS).toEqual(['😂', '❤️', '👍', '😮', '😢', '🔥']);
    expect(EXTENDED_REACTIONS.length).toBe(20);
    expect(EXTENDED_REACTIONS.slice(0, 6)).toEqual(QUICK_REACTIONS as unknown as string[]);
  });
});

describe('messageMenuContextOf — dérivé du message, jamais une seconde loi de protection', () => {
  test('D-23 : un message flouté est protégé', () => {
    const result = messageMenuContextOf(
      {
        content: 'bonjour',
        isBlurred: true,
        isViewOnce: false,
        viewOnceCount: 0,
        translations: [],
      },
      { now: 1000 },
    );
    expect(result.isProtected).toBe(true);
    expect(result.hasText).toBe(true);
    expect(result.languageCount).toBe(1);
  });

  test('contenu vide (image seule) ⇒ hasText false', () => {
    const result = messageMenuContextOf(
      { content: '  ', isBlurred: false, isViewOnce: false, viewOnceCount: 0, translations: [] },
      { now: 1000 },
    );
    expect(result.hasText).toBe(false);
  });
});

describe('translationChoices — original puis les rangs du PRISME, jamais l’ordre du tableau', () => {
  test('témoin de RANG (leçon 261) : lecteur [es,en], message fr + trad en ⇒ servie au rang 2', () => {
    const message = {
      originalLanguage: 'fr',
      translations: [translation('m2', 'en', 'Hello')],
    };
    const choices = translationChoices({
      message,
      preferredLanguages: ['es', 'en'],
      servedLanguage: 'en',
    });
    expect(choices).toEqual([
      { code: 'fr', isOriginal: true, isServed: false },
      { code: 'en', isOriginal: false, isServed: true },
    ]);
  });

  test('le reste des traductions, non couvertes par le prisme, ferme la liste', () => {
    const message = {
      originalLanguage: 'fr',
      translations: [translation('m9', 'en', 'Hello'), translation('m9', 'de', 'Hallo')],
    };
    const choices = translationChoices({ message, preferredLanguages: ['en'], servedLanguage: 'en' });
    expect(choices.map((c) => c.code)).toEqual(['fr', 'en', 'de']);
  });
});
