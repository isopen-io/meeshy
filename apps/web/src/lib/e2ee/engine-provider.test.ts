import { describe, expect, test } from 'bun:test';

import { e2eeEngineAvailable, E2EEEngineUnavailable, loadE2EEEngine } from './engine-provider';
import { rejected } from './test-support/errors';

describe('sans moteur retenu, le navigateur ne chiffre rien (#14592)', () => {
  test('aucun moteur n\'est embarqué : la porte le dit et le chargement refuse', async () => {
    expect(e2eeEngineAvailable()).toBe(false);
    expect(await rejected(loadE2EEEngine())).toBeInstanceOf(E2EEEngineUnavailable);
  });
});
