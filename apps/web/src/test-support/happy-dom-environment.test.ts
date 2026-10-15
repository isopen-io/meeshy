import { describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered } from './happy-dom-environment';

describe('l’environnement happy-dom des tests', () => {
  test('un lien target="_blank" cliqué n’ouvre aucune page enfant — aucun fetch réel ne part après les tests', () => {
    ensureHappyDomRegistered();
    const settings = (globalThis.window as unknown as { happyDOM: { settings: { navigation: { disableChildPageNavigation: boolean } } } })
      .happyDOM.settings;
    expect(settings.navigation.disableChildPageNavigation).toBe(true);
  });
});
