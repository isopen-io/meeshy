/**
 * Une langue est traduisible CÔTÉ SERVEUR si et seulement si NLLB-200 la
 * connaît — c'est-à-dire si `LANGUAGE_MAPPINGS`
 * (`services/translator/src/config/settings.py`) lui donne un code.
 *
 * Incident prod 2026-11-01 : la passerelle poussait `byv` (Medumba) au
 * translator, qui ne pouvait pas le servir ; chaque message coûtait cinq
 * pushes sur 2,5 min et un `translation:failed`. La passerelle filtre
 * désormais ses cibles par `isServerTranslatableLanguage`, et ce témoin rougit
 * dès que le catalogue partagé et la table du translator divergent.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { SUPPORTED_LANGUAGES } from '../utils/languages';
import { isServerTranslatableLanguage } from '../utils/server-translatable-language';

const SETTINGS = join(dirname(fileURLToPath(import.meta.url)), '../../../services/translator/src/config/settings.py');

function nllbMappedCodes(): ReadonlySet<string> {
  const source = readFileSync(SETTINGS, 'utf8');
  const start = source.indexOf('LANGUAGE_MAPPINGS = {');
  const body = source.slice(start, source.indexOf('\n}', start));
  return new Set([...body.matchAll(/^\s*'([a-z]+)'\s*:/gm)].map((m) => m[1] as string));
}

describe('isServerTranslatableLanguage', () => {
  it('suit LANGUAGE_MAPPINGS du translator pour chaque langue du catalogue', () => {
    const mapped = nllbMappedCodes();
    const divergent = SUPPORTED_LANGUAGES
      .filter((lang) => isServerTranslatableLanguage(lang.code) !== mapped.has(lang.code))
      .map((lang) => lang.code);
    expect(mapped.size).toBeGreaterThan(50);
    expect(divergent).toEqual([]);
  });

  it('refuse les sept langues camerounaises offertes sans code NLLB-200 (#3659)', () => {
    for (const code of ['bas', 'byv', 'dua', 'ewo', 'fan', 'ksf', 'nnh']) {
      expect(isServerTranslatableLanguage(code)).toBe(false);
    }
  });

  it('accepte une langue servie quelle que soit sa casse', () => {
    expect(isServerTranslatableLanguage('en')).toBe(true);
    expect(isServerTranslatableLanguage(' FR ')).toBe(true);
  });

  it('refuse un code vide, inconnu ou absent', () => {
    expect(isServerTranslatableLanguage(undefined)).toBe(false);
    expect(isServerTranslatableLanguage('')).toBe(false);
    expect(isServerTranslatableLanguage('xx')).toBe(false);
  });
});
