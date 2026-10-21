import { describe, expect, test } from 'bun:test';

import { deviceTranslationConsent } from './consent';

const memory = () => {
  const entries = new Map<string, string>();
  return {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => void entries.set(key, value),
    removeItem: (key: string) => void entries.delete(key),
  };
};

describe('deviceTranslationConsent — aucun modèle ne se télécharge sans accord (#9898)', () => {
  test('refusé par défaut, accordé puis retiré', () => {
    const consent = deviceTranslationConsent(memory());
    expect(consent.granted()).toBe(false);
    consent.grant();
    expect(consent.granted()).toBe(true);
    consent.revoke();
    expect(consent.granted()).toBe(false);
  });
});
