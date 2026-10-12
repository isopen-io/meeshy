import { describe, expect, test } from 'bun:test';

import { catalogPlaceholders } from './i18n-catalog';
import {
  isWorldParticipantCardCatalogLoaded,
  loadWorldParticipantCardCatalog,
  translateWorldParticipantCard,
  type WorldParticipantCardCatalog,
} from './i18n-world-participant-card-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from './inline-interface-language-bootstrap.js';
import type { InterfaceLanguage } from './interface-language';

/**
 * LE CATALOGUE DE LA FICHE D'UN PARTICIPANT DE WORLD WIDE (#10102) — même
 * discipline que `i18n-viewer-engagement-catalog.test.ts` : le français est la
 * source des clés, chacune des sept langues en porte EXACTEMENT les mêmes, avec
 * les mêmes paramètres, sans valeur vide ni recopiée du français.
 */

const loadAll = async (): Promise<ReadonlyArray<readonly [InterfaceLanguage, WorldParticipantCardCatalog]>> =>
  Promise.all(SUPPORTED_INTERFACE_LANGUAGES.map(async (language) => [language, await loadWorldParticipantCardCatalog(language)] as const));

const sorted = (values: Iterable<string>): readonly string[] => [...values].sort();

describe('chaque langue porte toutes les clés du français, et rien d’autre', () => {
  test('les sept langues sont là', () => {
    expect(SUPPORTED_INTERFACE_LANGUAGES.length).toBe(7);
  });

  test('mêmes clés', async () => {
    const french = sorted(Object.keys(await loadWorldParticipantCardCatalog('fr')));
    for (const [language, catalog] of await loadAll()) {
      const keys = sorted(Object.keys(catalog));
      expect({ language, missing: french.filter((key) => !keys.includes(key)) }).toEqual({ language, missing: [] });
      expect({ language, extra: keys.filter((key) => !french.includes(key)) }).toEqual({ language, extra: [] });
    }
  });

  test('chaque valeur est un texte, jamais vide, jamais sa propre clé, avec les paramètres du français', async () => {
    const french = await loadWorldParticipantCardCatalog('fr');
    for (const [language, catalog] of await loadAll()) {
      for (const [key, value] of Object.entries(catalog)) {
        expect({ language, key, empty: value.trim().length === 0 || value === key }).toEqual({ language, key, empty: false });
        const expected = sorted(catalogPlaceholders(french[key as keyof WorldParticipantCardCatalog]));
        expect({ language, key, params: sorted(catalogPlaceholders(value)) }).toEqual({ language, key, params: expected });
      }
    }
  });

  test('les textes affichés sont traduits, pas recopiés du français', async () => {
    const french = await loadWorldParticipantCardCatalog('fr');
    for (const [language, catalog] of await loadAll()) {
      if (language === 'fr') continue;
      for (const key of ['worldCard.title', 'worldCard.kind.anonymous', 'worldCard.withheld', 'worldCard.notRecorded', 'worldCard.open'] as const) {
        expect({ language, key, copied: catalog[key] === french[key] }).toEqual({ language, key, copied: false });
      }
    }
  });
});

describe('translateWorldParticipantCard', () => {
  test('interpole le nom', async () => {
    await loadWorldParticipantCardCatalog('fr');
    expect(isWorldParticipantCardCatalogLoaded('fr')).toBe(true);
    expect(translateWorldParticipantCard('fr', 'worldCard.open', { name: 'Awa' })).toBe('Voir la fiche de Awa');
  });
});
