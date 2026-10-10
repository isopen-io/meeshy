/**
 * « Jeu » (#9490) — `notification.gameEnabled` se LIT et se RÈGLE par la route de préférences
 * existante : la porte d'écriture (`parseSubmittedKeys`, rigoureuse : une clé inconnue est
 * refusée) l'accepte, et la relecture d'un document qui ne l'a jamais porté la sert à `true`.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { PREFERENCE_REGISTRY, parseSubmittedKeys } from '../../../../../routes/me/preferences/preference-registry';

describe('notification.gameEnabled', () => {
  it('la porte d’écriture l’accepte, vrai comme faux — elle ne la prend pas pour une clé inconnue', () => {
    expect(parseSubmittedKeys('notification', { gameEnabled: false })).toEqual({ gameEnabled: false });
    expect(parseSubmittedKeys('notification', { gameEnabled: true })).toEqual({ gameEnabled: true });
  });

  it('un booléen seulement : une chaîne est refusée', () => {
    expect(() => parseSubmittedKeys('notification', { gameEnabled: 'non' })).toThrow();
  });

  it('un document antérieur au réglage se relit « reçu » : le défaut du registre est vrai', () => {
    const defaults = PREFERENCE_REGISTRY.notification.defaults as Record<string, unknown>;
    expect(defaults.gameEnabled).toBe(true);
  });
});
