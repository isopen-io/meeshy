import { describe, expect, test } from 'bun:test';

import { CIRCLE_NOTIFY_FAMILIES, RELATION_AUDIENCE_CHOICES } from '@meeshy/shared/utils/relation-levels';

import { loadCircleNotifyCatalog, type CircleNotifyCatalog } from './i18n-circle-notify-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from './inline-interface-language-bootstrap.js';
import type { InterfaceLanguage } from './interface-language';

/**
 * « QUI EST PRÉVENU » (#14063) — le français est la source des clés
 * `circleNotify.*` ; chaque langue en porte exactement les mêmes, aucune
 * valeur vide ni recopiée du français, et chaque action des trois familles
 * partagées a son libellé.
 */

const loadAll = async (): Promise<ReadonlyArray<readonly [InterfaceLanguage, CircleNotifyCatalog]>> =>
  Promise.all(SUPPORTED_INTERFACE_LANGUAGES.map(async (language) => [language, await loadCircleNotifyCatalog(language)] as const));

describe('le catalogue « Qui est prévenu »', () => {
  test('mêmes clés dans les sept langues', async () => {
    const french = Object.keys(await loadCircleNotifyCatalog('fr')).sort();
    for (const [language, catalog] of await loadAll()) {
      expect({ language, keys: Object.keys(catalog).sort() }).toEqual({ language, keys: french });
    }
  });

  test('aucune valeur vide, et les textes affichés sont traduits', async () => {
    const french = await loadCircleNotifyCatalog('fr');
    for (const [language, catalog] of await loadAll()) {
      for (const [key, value] of Object.entries(catalog)) {
        expect({ language, key, empty: value.trim() === '' || value === key }).toEqual({ language, key, empty: false });
      }
      if (language === 'fr') continue;
      for (const key of ['circleNotify.title', 'circleNotify.explain.PUBLIC', 'circleNotify.choice.NOBODY'] as const) {
        expect({ language, key, copied: catalog[key] === french[key] }).toEqual({ language, key, copied: false });
      }
    }
  });

  test('chaque action et chaque famille partagées ont leur libellé, et COMMUNITY/PUBLIC leur explication', async () => {
    const french = (await loadCircleNotifyCatalog('fr')) as Readonly<Record<string, string>>;
    const actions = new Set(Object.values(CIRCLE_NOTIFY_FAMILIES).flatMap((family) => [...family.actions]));
    for (const action of actions) expect({ action, label: french[`circleNotify.action.${action}`] !== undefined }).toEqual({ action, label: true });
    for (const family of Object.keys(CIRCLE_NOTIFY_FAMILIES)) expect(french[`circleNotify.family.${family}`]).toBeDefined();
    expect(RELATION_AUDIENCE_CHOICES).toContain('COMMUNITY');
    expect(french['circleNotify.explain.COMMUNITY']).toBeDefined();
    expect(french['circleNotify.explain.PUBLIC']).toBeDefined();
  });
});
