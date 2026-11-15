import { describe, expect, test } from 'bun:test';

import { EXTERNAL_INTEROP_DISCLOSURES } from '@meeshy/shared/types/external-interop-compliance';

import { catalogPlaceholders } from './i18n-catalog';
import { loadExternalInteropCatalog, translateExternalInterop, type ExternalInteropCatalog } from './i18n-external-interop-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from './inline-interface-language-bootstrap.js';
import type { InterfaceLanguage } from './interface-language';

/**
 * LE CATALOGUE DE L'INTEROPÉRABILITÉ (#17120) — le français est la source des clés, chaque autre langue en porte
 * EXACTEMENT les mêmes, avec les mêmes paramètres, traduites ; et chaque élément de ce qui part chez Meta
 * (`EXTERNAL_INTEROP_DISCLOSURES`, la liste partagée avec la passerelle) a son libellé : une entrée ajoutée côté
 * serveur sans libellé ne passerait pas sous silence.
 */
const loadAll = async (): Promise<ReadonlyArray<readonly [InterfaceLanguage, ExternalInteropCatalog]>> =>
  Promise.all(SUPPORTED_INTERFACE_LANGUAGES.map(async (language) => [language, await loadExternalInteropCatalog(language)] as const));

const sorted = (values: Iterable<string>): readonly string[] => [...values].sort();

describe('chaque langue porte toutes les clés du français, et rien d’autre', () => {
  test('mêmes clés, mêmes paramètres, aucune valeur vide', async () => {
    const french = await loadExternalInteropCatalog('fr');
    const frenchKeys = sorted(Object.keys(french));
    for (const [language, catalog] of await loadAll()) {
      expect({ language, keys: sorted(Object.keys(catalog)) }).toEqual({ language, keys: frenchKeys });
      for (const [key, value] of Object.entries(catalog)) {
        expect({ language, key, empty: value.trim().length === 0 }).toEqual({ language, key, empty: false });
        const expected = sorted(catalogPlaceholders(french[key as keyof ExternalInteropCatalog]));
        expect({ language, key, params: sorted(catalogPlaceholders(value)) }).toEqual({ language, key, params: expected });
      }
    }
  });

  test('les textes sont traduits, pas recopiés du français', async () => {
    const french = await loadExternalInteropCatalog('fr');
    for (const [language, catalog] of await loadAll()) {
      if (language === 'fr') continue;
      for (const key of ['externalInterop.notice.lead', 'externalInterop.notice.accept', 'externalInterop.report.lead', 'externalInterop.report.done.orientation'] as const) {
        expect({ language, key, copied: catalog[key] === french[key] }).toEqual({ language, key, copied: false });
      }
    }
  });

  test('chaque élément de ce qui part chez Meta a son libellé, dans les sept langues', async () => {
    for (const [language, catalog] of await loadAll()) {
      for (const disclosure of EXTERNAL_INTEROP_DISCLOSURES) {
        expect({ language, disclosure, labelled: `externalInterop.disclosure.${disclosure}` in catalog }).toEqual({ language, disclosure, labelled: true });
      }
    }
  });
});

describe('translateExternalInterop', () => {
  test('interpole la durée de conservation, dans la langue demandée', async () => {
    await loadExternalInteropCatalog('en');
    expect(translateExternalInterop('en', 'externalInterop.notice.retention', { days: '90' })).toContain('90 days');
  });
});
