import { describe, expect, test } from 'bun:test';

import { prismeDuMembre } from './prisme-membre';

/**
 * **LE QUATRIÈME RANG DU PRISME D'UN MEMBRE** (#8005) — depuis que la passerelle sert
 * `adminMetadata.deviceLocale`, le prisme d'un membre administré peut porter SA locale
 * d'appareil. C'est la locale DU MEMBRE : jamais celle de l'appareil qui regarde.
 *
 * `prisme-membre.test.ts` garde l'autre moitié de la règle : sans `deviceLocale` servie,
 * le prisme reste à trois rangs et rien ne vient de la machine qui joue les témoins.
 */
const membre = (system: string, regional = '', custom = '') => ({ systemLanguage: system, regionalLanguage: regional, customDestinationLanguage: custom });

describe('prismeDuMembre — la locale d’appareil du membre, en quatrième rang', () => {
  test('elle vient APRÈS les trois rangs applicatifs, jamais avant', () => {
    expect(prismeDuMembre({ ...membre('fr', 'en', 'es'), deviceLocale: 'de-DE' }).languages).toEqual(['fr', 'en', 'es', 'de']);
  });

  test('elle ne supplante jamais une préférence de l’application : un membre français sur un iPhone anglais lit le français d’abord', () => {
    const prisme = prismeDuMembre({ ...membre('fr'), deviceLocale: 'en-US' });
    expect(prisme.languages).toEqual(['fr', 'en']);
    expect(prisme.locale).toBe('fr');
  });

  test('elle se déduplique : déjà présente, elle n’ajoute rien', () => {
    expect(prismeDuMembre({ ...membre('fr', 'en'), deviceLocale: 'EN' }).languages).toEqual(['fr', 'en']);
  });

  test('servie à un membre SANS aucune langue, elle devient son seul rang (le repli produit ne joue pas)', () => {
    expect(prismeDuMembre({ ...membre(''), deviceLocale: 'it-IT' }).languages).toEqual(['it']);
  });

  test('absente, vide ou nulle : le prisme reste à trois rangs', () => {
    expect(prismeDuMembre({ ...membre('fr', 'en'), deviceLocale: null }).languages).toEqual(['fr', 'en']);
    expect(prismeDuMembre({ ...membre('fr', 'en'), deviceLocale: '' }).languages).toEqual(['fr', 'en']);
    expect(prismeDuMembre(membre('fr', 'en')).languages).toEqual(['fr', 'en']);
  });
});
