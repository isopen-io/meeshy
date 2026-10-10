import { describe, expect, test } from 'bun:test';

import { loadLinkFamiliesCatalog, translateLinkFamilies } from './i18n-link-families-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from './inline-interface-language-bootstrap.js';

/**
 * LE CATALOGUE À LA DEMANDE DES FAMILLES DE LIENS (#6408, #6409, #6410) — les
 * sept langues portent les mêmes clés, les mêmes paramètres, et aucun texte vide.
 */

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((found) => found[1]).sort();

describe('les sept langues des familles de liens', () => {
  test('chaque langue porte exactement les clés du français, avec ses paramètres', async () => {
    const french = await loadLinkFamiliesCatalog('fr');
    for (const language of SUPPORTED_INTERFACE_LANGUAGES) {
      const catalog = await loadLinkFamiliesCatalog(language);
      expect(Object.keys(catalog).sort()).toEqual(Object.keys(french).sort());
      for (const [key, text] of Object.entries(catalog)) {
        expect(text.trim().length).toBeGreaterThan(0);
        expect(placeholders(text)).toEqual(placeholders(french[key as keyof typeof french]));
      }
    }
  });

  test('un paramètre se remplit', async () => {
    await loadLinkFamiliesCatalog('fr');
    expect(translateLinkFamilies('fr', 'linkFamilies.tracking.clicks.other', { count: '12' })).toBe('12 clics');
  });
});
