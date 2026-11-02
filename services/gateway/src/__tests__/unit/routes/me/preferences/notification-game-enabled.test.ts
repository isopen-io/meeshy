/**
 * « Jeu » (#9490) — `notification.gameEnabled` se LIT et se RÈGLE par la route de préférences
 * existante : la porte d'écriture (`parseSubmittedKeys`, rigoureuse : une clé inconnue est
 * refusée) l'accepte, et la relecture d'un document qui ne l'a jamais porté la sert à `true`.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { PREFERENCE_REGISTRY, parseSubmittedKeys } from '../../../../../routes/me/preferences/preference-registry';
import { parseSelection } from '../../../../../routes/me/preferences/preference-selection';

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

describe('notification.gamePhotoEnabled — « Moments à immortaliser » (#10268)', () => {
  it('la lecture du web la nomme dans `fields` : la sélection la connaît, elle n’est pas un champ inconnu', () => {
    const parsed = parseSelection({ fields: 'notification.gameEnabled,notification.gamePhotoEnabled' });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect([...(parsed.selection.fields.get('notification') ?? [])].sort()).toEqual(['gameEnabled', 'gamePhotoEnabled']);
  });

  it('la porte d’écriture l’accepte, vrai comme faux, et refuse une chaîne', () => {
    expect(parseSubmittedKeys('notification', { gamePhotoEnabled: false })).toEqual({ gamePhotoEnabled: false });
    expect(parseSubmittedKeys('notification', { gamePhotoEnabled: true })).toEqual({ gamePhotoEnabled: true });
    expect(() => parseSubmittedKeys('notification', { gamePhotoEnabled: 'non' })).toThrow();
  });

  it('un document antérieur au réglage se relit « reçu »', () => {
    const defaults = PREFERENCE_REGISTRY.notification.defaults as Record<string, unknown>;
    expect(defaults.gamePhotoEnabled).toBe(true);
  });
});
