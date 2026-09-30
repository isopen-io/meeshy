import { beforeAll, describe, expect, test } from 'bun:test';

import { loadAdminInterfaceCatalog } from '@/lib/i18n-admin-catalog';

import { countryName, languageName, platformLabel, sentenceCase } from './language';

beforeAll(async () => {
  await Promise.all((['fr', 'en', 'ar'] as const).map((language) => loadAdminInterfaceCatalog(language)));
});

describe('languageName — le NOM de la langue, dans la langue d’interface', () => {
  test('un code ISO se dit par son nom', () => {
    expect(languageName('es', 'fr')).toBe('espagnol');
    expect(languageName('es', 'en')).toBe('Spanish');
    expect(languageName('ES', 'fr')).toBe('espagnol');
    expect(languageName('pt-BR', 'fr')).toBe('portugais brésilien');
  });

  test('l’arabe nomme en arabe', () => {
    expect(languageName('es', 'ar')).toBe('الإسبانية');
  });

  test('l’absence se dit « Aucune » — jamais un code', () => {
    expect(languageName(null, 'fr')).toBe('Aucune');
    expect(languageName('', 'fr')).toBe('Aucune');
    expect(languageName(undefined, 'en')).toBe('None');
  });

  test('un code que personne ne connaît ne fuit jamais tel quel', () => {
    expect(languageName('zz-invalid-code!', 'fr')).toBe('Langue inconnue');
    expect(languageName('xx', 'fr')).toBe('Langue inconnue');
  });

  test('sentenceCase ouvre un nom posé seul par une majuscule', () => {
    expect(sentenceCase('espagnol', 'fr')).toBe('Espagnol');
    expect(sentenceCase('', 'fr')).toBe('');
  });
});

describe('countryName et platformLabel', () => {
  test('un pays se dit par son nom', () => {
    expect(countryName('SN', 'fr')).toBe('Sénégal');
    expect(countryName('sn', 'en')).toBe('Senegal');
  });

  test('un pays absent ou invalide se dit « Pays inconnu »', () => {
    expect(countryName(null, 'fr')).toBe('Pays inconnu');
    expect(countryName('ZZZZ', 'fr')).toBe('Pays inconnu');
  });

  test('une plateforme se dit par ce que l’utilisateur tient en main', () => {
    expect(platformLabel('ios', 'fr')).toBe('iPhone / iPad');
    expect(platformLabel('android', 'fr')).toBe('Android');
    expect(platformLabel('web', 'fr')).toBe('Navigateur');
    expect(platformLabel('macos', 'fr')).toBe('Ordinateur');
    expect(platformLabel('qnx', 'fr')).toBe('Plateforme inconnue');
    expect(platformLabel(null, 'fr')).toBe('Plateforme inconnue');
  });
});
