import { describe, expect, test } from 'bun:test';

import { READER_LANGUAGES, resolveReaderLanguages } from './reader';

describe('resolveReaderLanguages — F6 (#5650)', () => {
  test('source fixtures ⇒ le lecteur provisoire, quelle que soit la session', () => {
    const result = resolveReaderLanguages({
      source: 'fixtures',
      session: { status: 'authenticated', user: { systemLanguage: 'en' } },
    });
    expect(result).toEqual(READER_LANGUAGES);
  });

  test('gateway anonyme ⇒ le lecteur par défaut', () => {
    const result = resolveReaderLanguages({ source: 'gateway', session: { status: 'anonymous' } });
    expect(result).toEqual(READER_LANGUAGES);
  });

  test('gateway + session authentifiée ⇒ la descente RÉELLE, rang 2 ≠ rang 1 — témoin de RANG', () => {
    const result = resolveReaderLanguages({
      source: 'gateway',
      session: {
        status: 'authenticated',
        user: { systemLanguage: 'en', regionalLanguage: 'fr' },
      },
      deviceLocale: 'de',
    });
    expect(result).toEqual(['en', 'fr', 'de']);
    // Le témoin de RANG : le français est au rang 2, jamais 1 — un
    // résolveur qui court-circuiterait sur la langue d'origine tomberait ici.
    expect(result[0]).toBe('en');
    expect(result[1]).toBe('fr');
  });

  test('gateway + session authentifiée sans AUCUN rang applicatif ⇒ repli sur le lecteur provisoire, jamais un tableau vide', () => {
    const result = resolveReaderLanguages({
      source: 'gateway',
      session: { status: 'authenticated', user: {} },
    });
    expect(result.length).toBeGreaterThan(0);
    expect(result).toEqual(READER_LANGUAGES);
  });

  /**
   * L'INVITÉ D'UN LIEN (#9710) — la langue choisie en rejoignant EST son rang 1.
   * Sans elle, l'invité retombait sur le lecteur provisoire (`'fr'` au rang 1) :
   * une invitée qui avait choisi l'anglais écrivait sous une pastille « FR » et
   * sa réponse partait étiquetée française, jamais traduite pour son hôte.
   */
  test('gateway + invité ⇒ la langue choisie en rejoignant passe au rang 1, la locale de l’appareil derrière', () => {
    const result = resolveReaderLanguages({
      source: 'gateway',
      session: { status: 'guest', guest: { language: 'en' } },
      deviceLocale: 'de',
    });
    expect(result).toEqual(['en', 'de']);
  });

  test('gateway + invité restauré d’avant #9710 (sans langue) ⇒ le lecteur provisoire, jamais un tableau vide', () => {
    const result = resolveReaderLanguages({ source: 'gateway', session: { status: 'guest', guest: {} } });
    expect(result).toEqual(READER_LANGUAGES);
  });
});
