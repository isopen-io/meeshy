/**
 * Le scénario sans tête de la coquille (#17116) ne vise que le staging ou une
 * passerelle locale : un hôte de production est refusé avant tout appel.
 */
import { describe, expect, test } from 'bun:test';

import { isRehearsalHost } from './dma-coquille-scenario';

describe('l’hôte visé par le scénario de la coquille', () => {
  ['https://gate.staging.meeshy.me', 'https://staging.meeshy.me', 'http://localhost:3000', 'http://127.0.0.1:3000'].forEach((url) =>
    test(`accepte ${url}`, () => {
      expect(isRehearsalHost(url)).toBe(true);
    }),
  );

  ['https://gate.meeshy.me', 'https://meeshy.me', 'https://notstaging.meeshy.me', 'https://staging.meeshy.me.attacker.example'].forEach((url) =>
    test(`refuse ${url}`, () => {
      expect(isRehearsalHost(url)).toBe(false);
    }),
  );
});
