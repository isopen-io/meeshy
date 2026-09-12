import { describe, expect, test } from 'bun:test';

import { SENTIMENT_EMOJI, sentimentLevelOf, sentimentOf } from './sentiment';

describe('sentimentLevelOf — les six bornes (SentimentLevel.from(score:), TextAnalyzer.swift:22-31)', () => {
  const vectors: readonly (readonly [number, ReturnType<typeof sentimentLevelOf>])[] = [
    [-1, 'veryNegative'],
    [-0.61, 'veryNegative'],
    [-0.6, 'negative'],
    [-0.31, 'negative'],
    [-0.3, 'slightlyNegative'],
    [-0.11, 'slightlyNegative'],
    [-0.1, 'neutral'],
    [0, 'neutral'],
    [0.1, 'neutral'],
    [0.11, 'slightlyPositive'],
    [0.29, 'slightlyPositive'],
    [0.3, 'positive'],
    [0.59, 'positive'],
    [0.6, 'veryPositive'],
    [1, 'veryPositive'],
  ];

  for (const [score, level] of vectors) {
    test(`score ${score} ⇒ ${level}`, () => {
      expect(sentimentLevelOf(score)).toBe(level);
    });
  }
});

describe('sentimentOf — texte vidé, mots positifs/négatifs, langues (FR/EN/ES/DE)', () => {
  test('texte vide ⇒ neutral', () => {
    expect(sentimentOf('')).toBe('neutral');
    expect(sentimentOf('   ')).toBe('neutral');
  });

  test('un mot fortement positif domine', () => {
    expect(sentimentOf('love')).toBe('veryPositive');
    expect(sentimentOf('adore')).toBe('veryPositive');
  });

  test('un mot fortement négatif domine', () => {
    expect(sentimentOf('hate')).toBe('veryNegative');
    expect(sentimentOf('deteste')).toBe('veryNegative');
  });

  test('ponctuation en bordure ignorée, casse ignorée', () => {
    expect(sentimentOf('Love!')).toBe(sentimentOf('love'));
    expect(sentimentOf('AMAZING.')).toBe(sentimentOf('amazing'));
  });

  test('espagnol et allemand reconnus', () => {
    expect(sentimentOf('excelente')).toBe('veryPositive');
    expect(sentimentOf('schrecklich')).toBe('veryNegative');
  });

  test('mots neutres/inconnus ⇒ neutral', () => {
    expect(sentimentOf('le chat mange une pomme')).toBe('neutral');
  });

  test('chaque niveau a son emoji', () => {
    expect(SENTIMENT_EMOJI.neutral).toBe('\u{1F610}');
    expect(SENTIMENT_EMOJI.veryPositive).toBe('\u{1F929}');
    expect(Object.keys(SENTIMENT_EMOJI)).toHaveLength(7);
  });
});
