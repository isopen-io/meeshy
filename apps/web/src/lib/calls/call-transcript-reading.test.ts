import { describe, expect, test } from 'bun:test';

import { transcriptReading, type ReadableLine } from './call-transcript-reading';

/**
 * LA BASCULE « VOIR L'ORIGINAL » DU JOURNAL D'APRÈS L'APPEL (#17897, loi 7 de
 * `docs/product/appels-vue-finale.md`, décision porteur #17862) — pure : l'état de la
 * bascule dit quelle ligne est EN TÊTE et laquelle est DESSOUS ; elle INVERSE les deux,
 * elle ne remplace rien.
 */

const line = (overrides: Partial<ReadableLine> = {}): ReadableLine => ({
  original: 'Can you hear me?',
  originalLanguage: 'en',
  text: 'Tu m’entends ?',
  language: 'fr',
  translated: true,
  ...overrides,
});

describe('transcriptReading', () => {
  test('par défaut, la traduction est en tête et « Original » dessous', () => {
    expect(transcriptReading(line(), false)).toEqual({
      primary: { kind: 'translated', text: 'Tu m’entends ?', language: 'fr' },
      secondary: { kind: 'original', text: 'Can you hear me?', language: 'en' },
    });
  });

  test('« Voir l’original » INVERSE : l’original en tête, « Traduit » dessous, chacun dans SA langue', () => {
    expect(transcriptReading(line(), true)).toEqual({
      primary: { kind: 'original', text: 'Can you hear me?', language: 'en' },
      secondary: { kind: 'translated', text: 'Tu m’entends ?', language: 'fr' },
    });
  });

  test('une phrase sans traduction reste seule, dans les deux états', () => {
    const alone = line({ translated: false, text: 'Hello', original: 'Hello', language: 'en' });
    for (const inverted of [false, true]) {
      expect(transcriptReading(alone, inverted)).toEqual({ primary: { kind: 'original', text: 'Hello', language: 'en' }, secondary: null });
    }
  });

  test('ma phrase, jamais traduite, reste seule dans les deux états', () => {
    const mine = line({ translated: false, text: 'Oui', original: 'Oui', originalLanguage: 'fr', language: 'fr' });
    expect(transcriptReading(mine, true).secondary).toBeNull();
    expect(transcriptReading(mine, false).secondary).toBeNull();
  });

  test('inverser deux fois rend l’état par défaut', () => {
    expect(transcriptReading(line(), false)).toEqual(transcriptReading(line(), !true));
  });

  test('une langue vide ne pose pas d’attribut lang', () => {
    expect(transcriptReading(line({ originalLanguage: '', language: '' }), false)).toEqual({
      primary: { kind: 'translated', text: 'Tu m’entends ?', language: undefined },
      secondary: { kind: 'original', text: 'Can you hear me?', language: undefined },
    });
  });
});
