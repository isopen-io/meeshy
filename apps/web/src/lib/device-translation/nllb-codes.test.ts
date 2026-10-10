import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { NLLB_CODES } from './nllb-codes';

const SETTINGS = join(dirname(fileURLToPath(import.meta.url)), '../../../../../services/translator/src/config/settings.py');

const serverMappings = (): Record<string, string> => {
  const source = readFileSync(SETTINGS, 'utf8');
  const start = source.indexOf('LANGUAGE_MAPPINGS = {');
  const block = source.slice(start, source.indexOf('\n}', start));
  return Object.fromEntries([...block.matchAll(/'([a-z]{2,3})':\s*'([a-z]{3}_[A-Za-z]{4})'/g)].map((m) => [m[1], m[2]]));
};

describe('NLLB_CODES — la table de l’appareil est celle du serveur (#9898)', () => {
  test('mêmes langues, mêmes codes que LANGUAGE_MAPPINGS du translator', () => {
    const server = serverMappings();
    expect(Object.keys(server).length).toBeGreaterThan(50);
    expect(NLLB_CODES).toEqual(server);
  });

  test('aucune langue camerounaise hors NLLB-200 n’y est inventée', () => {
    for (const code of ['bas', 'byv', 'dua', 'ewo', 'fan', 'ksf', 'nnh']) expect(NLLB_CODES[code]).toBeUndefined();
  });
});
