import { describe, expect, test } from 'bun:test';

import { COMPOSE_CONFIDENCE_FLOOR, COMPOSE_MIN_LETTERS, composeLanguage, letterCount } from './compose-language';

/**
 * `composeLanguage` — détection, puis rang 1 du Prisme, puis fr (miroir
 * `ConversationViewModel+Send.swift:68-71`). Un témoin de RANG s'écrit sur un
 * rang AUTRE que le premier (leçon 261 du dépôt) : « lecteur `['fr','en']` qui
 * tape en anglais » est le critère de fin de #5828.
 */
describe('composeLanguage — détection, puis rang 1 du Prisme, puis fr (miroir ConversationViewModel+Send.swift:68-71)', () => {
  test('le critère de fin : lecteur [fr,en] qui tape en anglais ⇒ en (rang ≠ 1)', () => {
    expect(
      composeLanguage({
        text: 'Do you confirm the mockup?',
        detected: { language: 'en', confidence: 0.97 },
        preferred: ['fr', 'en'],
      }),
    ).toBe('en');
  });

  test('pas de détection ⇒ rang 1 du LECTEUR, même quand ce rang 1 n’est pas fr', () => {
    expect(composeLanguage({ text: 'ok', detected: null, preferred: ['en', 'fr'] })).toBe('en');
  });

  test('prisme vide ⇒ fr (dernier repli)', () => {
    expect(composeLanguage({ text: 'ok', detected: null, preferred: [] })).toBe('fr');
  });

  test('seuil de confiance, moitié basse : 0,85 < 0,86 est ignoré', () => {
    expect(
      composeLanguage({ text: 'Do you confirm the mockup?', detected: { language: 'en', confidence: 0.85 }, preferred: ['fr'] }),
    ).toBe('fr');
  });

  test('seuil de confiance, moitié haute : 0,86 est adopté', () => {
    expect(
      composeLanguage({
        text: 'Do you confirm the mockup?',
        detected: { language: 'en', confidence: COMPOSE_CONFIDENCE_FLOOR },
        preferred: ['fr'],
      }),
    ).toBe('en');
  });

  test('moins de 4 lettres ⇒ détection ignorée, même à confiance 1', () => {
    expect(composeLanguage({ text: 'ok!', detected: { language: 'en', confidence: 1 }, preferred: ['fr'] })).toBe('fr');
  });

  test('4 lettres exactement ⇒ détection prise (l’autre moitié du seuil)', () => {
    expect(composeLanguage({ text: 'ciao', detected: { language: 'it', confidence: 0.9 }, preferred: ['fr'] })).toBe('it');
  });

  test('le verdict détecté est NORMALISÉ (zh-Hans, EN, code inconnu)', () => {
    expect(
      composeLanguage({ text: '你好吗世界', detected: { language: 'zh-Hans', confidence: 0.99 }, preferred: ['fr'] }),
    ).toBe('zh');
    expect(
      composeLanguage({ text: 'Do you confirm?', detected: { language: 'EN', confidence: 0.99 }, preferred: ['fr'] }),
    ).toBe('en');
    expect(
      composeLanguage({ text: 'Do you confirm?', detected: { language: 'und', confidence: 0.99 }, preferred: ['fr'] }),
    ).toBe('fr');
    expect(
      composeLanguage({ text: 'Do you confirm?', detected: { language: 'xx', confidence: 0.99 }, preferred: ['fr'] }),
    ).toBe('fr');
  });

  test('le rang 1 est normalisé aussi (pt-BR)', () => {
    expect(composeLanguage({ text: 'ok', detected: null, preferred: ['pt-BR'] })).toBe('pt');
  });

  test('le choix manuel gagne sur la détection, quelle que soit sa confiance', () => {
    expect(
      composeLanguage({
        text: 'Do you confirm the mockup?',
        detected: { language: 'en', confidence: 0.99 },
        preferred: ['fr'],
        chosen: 'de',
      }),
    ).toBe('de');
  });

  test('un choix manuel invalide est ignoré (fail-closed) — la détection reprend la main', () => {
    expect(
      composeLanguage({
        text: 'Do you confirm the mockup?',
        detected: { language: 'en', confidence: 0.99 },
        preferred: ['fr'],
        chosen: 'ZZZZ',
      }),
    ).toBe('en');
  });

  test('pureté : deux appels identiques rendent le même résultat', () => {
    const input = { text: 'Do you confirm?', detected: { language: 'en', confidence: 0.9 }, preferred: ['fr'] };
    expect(composeLanguage(input)).toBe(composeLanguage({ ...input }));
  });
});

describe('letterCount — \\p{L} par grapheme, jamais [a-z]', () => {
  test('les chiffres et la ponctuation ne comptent pas', () => {
    expect(letterCount('ok!')).toBe(2);
    expect(letterCount('12:34')).toBe(0);
  });

  test('les écritures non latines comptent (arabe, japonais)', () => {
    expect(letterCount('مرحبا')).toBe(5);
    expect(letterCount('こんにちは')).toBe(5);
  });

  test(`le seuil du dépôt vaut ${COMPOSE_MIN_LETTERS}`, () => {
    expect(COMPOSE_MIN_LETTERS).toBe(4);
  });
});
