import { describe, expect, test } from 'bun:test';

import { RELATION_RITUAL_CONSENT_KEYS } from '@meeshy/shared/types/socketio-events/relation';

import { MISSING_PIECES } from './relations/circles';
import { loadCirclesCatalog, translateCircles, type CirclesCatalog } from './i18n-circles-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from './inline-interface-language-bootstrap.js';
import type { InterfaceLanguage } from './interface-language';

/**
 * « MES CERCLES » (#13938) — le français est la source des clés `circles.*` ;
 * chaque langue en porte exactement les mêmes, aucune valeur vide ni recopiée
 * du français, mêmes paramètres partout, et chaque partage du rituel et chaque
 * nature d'interaction manquante a son texte.
 */

const loadAll = async (): Promise<ReadonlyArray<readonly [InterfaceLanguage, CirclesCatalog]>> =>
  Promise.all(SUPPORTED_INTERFACE_LANGUAGES.map(async (language) => [language, await loadCirclesCatalog(language)] as const));

const placeholders = (text: string): readonly string[] => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? '').sort();

describe('le catalogue « Mes cercles »', () => {
  test('mêmes clés et mêmes paramètres dans les sept langues', async () => {
    const french = await loadCirclesCatalog('fr');
    for (const [language, catalog] of await loadAll()) {
      expect({ language, keys: Object.keys(catalog).sort() }).toEqual({ language, keys: Object.keys(french).sort() });
      for (const [key, value] of Object.entries(catalog)) {
        expect({ language, key, params: placeholders(value) }).toEqual({ language, key, params: placeholders(french[key as keyof CirclesCatalog]) });
      }
    }
  });

  test('aucune valeur vide, et les phrases sont traduites', async () => {
    const french = await loadCirclesCatalog('fr');
    for (const [language, catalog] of await loadAll()) {
      for (const [key, value] of Object.entries(catalog)) {
        expect({ language, key, empty: value.trim() === '' || value === key }).toEqual({ language, key, empty: false });
      }
      if (language === 'fr') continue;
      for (const key of ['circles.empty.title', 'circles.ritual.consent.intro', 'circles.ritual.lapsed'] as const) {
        expect({ language, key, copied: catalog[key] === french[key] }).toEqual({ language, key, copied: false });
      }
    }
  });

  test('chaque partage du rituel a son titre et son DÉPLIANT, chaque manque son nom', async () => {
    const french = (await loadCirclesCatalog('fr')) as Readonly<Record<string, string>>;
    for (const key of RELATION_RITUAL_CONSENT_KEYS) {
      expect(french[`circles.ritual.consent.${key}`]).toBeDefined();
      expect(french[`circles.ritual.consent.${key}.detail`]).toBeDefined();
    }
    for (const piece of MISSING_PIECES) expect(french[`circles.missing.${piece}`]).toBeDefined();
  });

  test('les paramètres se posent là où la langue le veut', async () => {
    await loadCirclesCatalog('de');
    expect(translateCircles('de', 'circles.action.request', { level: 'Vertrauter' })).toBe('Vertrauter anfragen');
    expect(translateCircles('de', 'circles.progress.weeks', { done: '3', needed: '4' })).toBe('Wochen in Folge: 3 von 4');
  });
});
