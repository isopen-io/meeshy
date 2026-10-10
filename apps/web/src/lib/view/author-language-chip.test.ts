import { describe, expect, test } from 'bun:test';

import { authorLanguageChip } from './author-language-chip';

/**
 * LA PASTILLE DE LANGUE SUR L'AVATAR DE 22 PX (#10004, note « look ») — elle
 * dit au lecteur que la personne écrit dans une AUTRE langue que celle qu'il
 * lit : posée quand la rangée sert une traduction, jamais sur ses propres
 * messages, jamais sur une langue inconnue.
 */
describe('la pastille de langue de l’auteur (#10004)', () => {
  test('rangée traduite : la langue d’origine, en capitales', () => {
    expect(authorLanguageChip({ originalLanguage: 'ja', servedLanguage: 'fr', isMine: false })).toBe('JA');
  });

  test('rangée servie dans sa langue d’origine : aucune pastille', () => {
    expect(authorLanguageChip({ originalLanguage: 'fr', servedLanguage: 'fr', isMine: false })).toBeNull();
  });

  test('ses propres messages : aucune pastille', () => {
    expect(authorLanguageChip({ originalLanguage: 'ja', servedLanguage: 'fr', isMine: true })).toBeNull();
  });

  test('une variante régionale se lit par sa langue de base', () => {
    expect(authorLanguageChip({ originalLanguage: 'pt-BR', servedLanguage: 'fr', isMine: false })).toBe('PT');
    expect(authorLanguageChip({ originalLanguage: 'pt-BR', servedLanguage: 'pt', isMine: false })).toBeNull();
  });

  test('langue d’origine absente ou illisible : aucune pastille', () => {
    expect(authorLanguageChip({ originalLanguage: '', servedLanguage: 'fr', isMine: false })).toBeNull();
    expect(authorLanguageChip({ originalLanguage: undefined, servedLanguage: 'fr', isMine: false })).toBeNull();
    expect(authorLanguageChip({ originalLanguage: '??', servedLanguage: 'fr', isMine: false })).toBeNull();
  });
});
