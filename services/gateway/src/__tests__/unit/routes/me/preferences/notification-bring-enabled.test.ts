/**
 * « Recevoir des Bring » (#13936, #14407) — `notification.bringEnabled` se RÈGLE par la
 * route de préférences existante, et un document antérieur au réglage se relit « reçu ».
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { PREFERENCE_REGISTRY, parseSubmittedKeys } from '../../../../../routes/me/preferences/preference-registry';

describe('notification.bringEnabled', () => {
  it('la porte d’écriture l’accepte, vrai comme faux, et refuse une chaîne', () => {
    expect(parseSubmittedKeys('notification', { bringEnabled: false })).toEqual({ bringEnabled: false });
    expect(parseSubmittedKeys('notification', { bringEnabled: true })).toEqual({ bringEnabled: true });
    expect(() => parseSubmittedKeys('notification', { bringEnabled: 'non' })).toThrow();
  });

  it('un document antérieur au réglage se relit « reçu »', () => {
    const defaults = PREFERENCE_REGISTRY.notification.defaults as Record<string, unknown>;
    expect(defaults.bringEnabled).toBe(true);
  });
});
