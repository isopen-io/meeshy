/**
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';

import { detectContentLanguage, measureContentLanguage } from '../../../utils/content-language';

describe('detectContentLanguage', () => {
  it('reads an accented French caption as French, never as Portuguese', () => {
    expect(
      detectContentLanguage('Recette #9072 — ma légende se pose au ras du bas. Lien : https://meeshy.me/notes'),
    ).toBe('fr');
  });

  it('does not let an accented letter inside a word count as a word', () => {
    expect(detectContentLanguage('Une légende élégante pour la soirée')).toBe('fr');
  });

  it('still reads Portuguese when its words are really there', () => {
    expect(detectContentLanguage('Não sei se o filme é bom, mas vou com os amigos')).toBe('pt');
  });

  it('reads Spanish and German by their words', () => {
    expect(detectContentLanguage('El perro es muy bonito y come con los niños')).toBe('es');
    expect(detectContentLanguage('Ich habe das Buch nicht gelesen, und der Hund ist müde')).toBe('de');
  });

  it('ignores the words of an address', () => {
    expect(detectContentLanguage('Look at https://example.com/le/la/les/que/pour')).toBe('en');
  });

  it('reads scripts before words', () => {
    expect(detectContentLanguage('مرحبا بكم')).toBe('ar');
    expect(detectContentLanguage('你好世界')).toBe('zh');
    expect(detectContentLanguage('こんにちは')).toBe('ja');
  });

  it('falls back to English on empty or unknown text', () => {
    expect(detectContentLanguage('')).toBe('en');
    expect(detectContentLanguage('Hello world, see you soon')).toBe('en');
  });
});

describe('measureContentLanguage — une détection sans indice ne tranche pas (#9861)', () => {
  it('rend null sur un texte court fait de mots inconnus et de chiffres', () => {
    expect(measureContentLanguage('Story recette B 9743 r2')).toBeNull();
  });

  it('rend null sur un texte vide', () => {
    expect(measureContentLanguage('')).toBeNull();
  });

  it('rend la langue quand ses mots sont là', () => {
    expect(measureContentLanguage('Une légende pour la soirée')).toBe('fr');
  });

  it('rend la langue quand son écriture est là', () => {
    expect(measureContentLanguage('مرحبا بكم')).toBe('ar');
  });
});
