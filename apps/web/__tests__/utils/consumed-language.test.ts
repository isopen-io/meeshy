/**
 * Miroir de `ConsumedLanguageResolverTests.swift` : les deux implémentations
 * doivent répondre identiquement, faute de quoi le même message serait
 * comptabilisé dans deux langues différentes selon la plateforme du lecteur.
 *
 * La règle suit exactement celle qui choisit le TEXTE affiché
 * (`resolveUserLanguage` côté shared) : c'est la seule façon de ne pas déclarer
 * une langue que le lecteur n'a jamais vue.
 *
 * @see docs/superpowers/specs/2026-07-24-media-views-enrichment-design.md
 */

import {
  resolveConsumedLanguage,
  splitConsumedLanguages,
} from '@/utils/consumed-language';

describe('resolveConsumedLanguage — l\'original prime', () => {
  it('rend l\'original quand il est déjà dans une langue préférée', () => {
    expect(
      resolveConsumedLanguage({
        originalLanguage: 'fr',
        availableTranslations: ['en'],
        preferredLanguages: ['fr', 'en'],
      })
    ).toBe('fr');
  });

  it('préfère l\'original même si une traduction préférée existe', () => {
    expect(
      resolveConsumedLanguage({
        originalLanguage: 'en',
        availableTranslations: ['fr'],
        preferredLanguages: ['en', 'fr'],
      })
    ).toBe('en');
  });
});

describe('resolveConsumedLanguage — sinon, la première préférence traduite', () => {
  it('suit l\'ordre des préférences', () => {
    expect(
      resolveConsumedLanguage({
        originalLanguage: 'de',
        availableTranslations: ['en', 'fr'],
        preferredLanguages: ['fr', 'en'],
      })
    ).toBe('fr');

    expect(
      resolveConsumedLanguage({
        originalLanguage: 'de',
        availableTranslations: ['en', 'fr'],
        preferredLanguages: ['en', 'fr'],
      })
    ).toBe('en');
  });

  it('saute les préférences sans traduction', () => {
    expect(
      resolveConsumedLanguage({
        originalLanguage: 'de',
        availableTranslations: ['fr'],
        preferredLanguages: ['es', 'it', 'fr'],
      })
    ).toBe('fr');
  });
});

describe('resolveConsumedLanguage — le repli est l\'original', () => {
  it('rend l\'original quand aucune préférence n\'est traduite', () => {
    // Le cas qui rend la langue par message indispensable : le lecteur préfère
    // l'anglais mais voit de l'allemand, faute de traduction.
    expect(
      resolveConsumedLanguage({
        originalLanguage: 'de',
        availableTranslations: ['it'],
        preferredLanguages: ['en'],
      })
    ).toBe('de');
  });

  it('ne se rabat JAMAIS sur une traduction tierce', () => {
    expect(
      resolveConsumedLanguage({
        originalLanguage: 'de',
        availableTranslations: ['it', 'es'],
        preferredLanguages: ['en'],
      })
    ).toBe('de');
  });

  it('rend l\'original sans traduction ni préférence', () => {
    expect(
      resolveConsumedLanguage({ originalLanguage: 'de', availableTranslations: [], preferredLanguages: ['en'] })
    ).toBe('de');
    expect(
      resolveConsumedLanguage({ originalLanguage: 'de', availableTranslations: ['en'], preferredLanguages: [] })
    ).toBe('de');
  });
});

describe('resolveConsumedLanguage — normalisation', () => {
  it('réduit les locales complètes', () => {
    expect(
      resolveConsumedLanguage({
        originalLanguage: 'de',
        availableTranslations: ['fr-FR'],
        preferredLanguages: ['fr_FR'],
      })
    ).toBe('fr');
  });

  it('ignore la casse', () => {
    expect(
      resolveConsumedLanguage({ originalLanguage: 'FR', availableTranslations: [], preferredLanguages: ['fr'] })
    ).toBe('fr');
  });

  it('ne tronque pas un code 3-lettres supporté', () => {
    // `bas` tronqué donnerait `ba` (Bachkir), langue sans rapport.
    expect(
      resolveConsumedLanguage({
        originalLanguage: 'fr',
        availableTranslations: ['bas'],
        preferredLanguages: ['bas'],
      })
    ).toBe('bas');
  });
});

describe('resolveConsumedLanguage — rien à déclarer', () => {
  it('rend null quand l\'original est inconnu et rien ne correspond', () => {
    expect(
      resolveConsumedLanguage({
        originalLanguage: null,
        availableTranslations: ['it'],
        preferredLanguages: ['en'],
      })
    ).toBeNull();
  });

  it('rend la traduction préférée même sans original connu', () => {
    expect(
      resolveConsumedLanguage({
        originalLanguage: null,
        availableTranslations: ['en'],
        preferredLanguages: ['en'],
      })
    ).toBe('en');
  });

  it('rend null pour un original illisible', () => {
    expect(
      resolveConsumedLanguage({
        originalLanguage: '@@@',
        availableTranslations: [],
        preferredLanguages: ['en'],
      })
    ).toBeNull();
  });
});

describe('resolveConsumedLanguage — bascule manuelle', () => {
  it('prime sur les préférences', () => {
    expect(
      resolveConsumedLanguage({
        originalLanguage: 'fr',
        availableTranslations: ['en', 'es'],
        preferredLanguages: ['fr'],
        manualSelection: 'es',
      })
    ).toBe('es');
  });

  it('est ignorée si la version n\'existe pas', () => {
    expect(
      resolveConsumedLanguage({
        originalLanguage: 'fr',
        availableTranslations: ['en'],
        preferredLanguages: ['fr'],
        manualSelection: 'es',
      })
    ).toBe('fr');
  });

  it('honore un retour explicite à l\'original', () => {
    expect(
      resolveConsumedLanguage({
        originalLanguage: 'fr',
        availableTranslations: ['en'],
        preferredLanguages: ['en'],
        manualSelection: 'fr',
      })
    ).toBe('fr');
  });
});

describe('splitConsumedLanguages — dominante et exceptions', () => {
  it('n\'envoie qu\'une langue quand tout le lot s\'accorde', () => {
    const split = splitConsumedLanguages(
      new Map([
        ['a', 'fr'],
        ['b', 'fr'],
      ])
    );

    expect(split).toEqual({ language: 'fr' });
  });

  it('n\'énumère que ce qui s\'écarte de la dominante', () => {
    const split = splitConsumedLanguages(
      new Map([
        ['a', 'fr'],
        ['b', 'fr'],
        ['c', 'de'],
      ])
    );

    expect(split).toEqual({ language: 'fr', messageLanguages: { c: 'de' } });
  });

  it('ignore les messages dont la langue est indéterminée', () => {
    const split = splitConsumedLanguages(
      new Map([
        ['a', 'fr'],
        ['b', null],
      ])
    );

    expect(split).toEqual({ language: 'fr' });
  });

  it('n\'envoie rien quand aucune langue n\'est déterminée', () => {
    expect(splitConsumedLanguages(new Map([['a', null]]))).toEqual({});
    expect(splitConsumedLanguages(new Map())).toEqual({});
  });

  it('départage une égalité par le code, pour un corps reproductible', () => {
    const split = splitConsumedLanguages(
      new Map([
        ['a', 'fr'],
        ['b', 'de'],
      ])
    );

    expect(split).toEqual({ language: 'de', messageLanguages: { a: 'fr' } });
  });
});
