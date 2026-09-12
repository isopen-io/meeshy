import { describe, expect, test } from 'bun:test';

import { httpTransport } from './client';
import { apiConfig } from './config';
import { apiDeps } from './deps';

/**
 * `apiDeps` — l'ADAPTATEUR UNIQUE (#6151) : le SEUL endroit qui résout
 * `apiConfig.source` en dépendances d'appel. Tout consommateur importe cette
 * constante ; personne d'autre ne relit `apiConfig.source`
 * (`scripts/check-api-source.mjs` le garde).
 */
describe('apiDeps — le seul site qui résout apiConfig.source', () => {
  test('porte la source résolue par apiConfig, jamais une seconde lecture divergente', () => {
    expect(apiDeps.source).toBe(apiConfig.source);
  });

  test('porte le transport de production PARTAGÉ — jamais une seconde instance', () => {
    expect(apiDeps.transport).toBe(httpTransport);
  });

  test('constante de MODULE — la même référence à chaque import, jamais recalculée', () => {
    expect(apiDeps).toBe(apiDeps);
  });
});
