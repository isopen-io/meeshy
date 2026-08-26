/**
 * Règle produit 2026-08-23 — les publications naissent PUBLIQUES.
 *
 * Le défaut d'audience des stories vit dans un store PERSISTÉ (localStorage) :
 * changer `DEFAULT_STORY_PREFERENCES` ne suffit pas, les navigateurs déjà
 * ouverts rejoueraient l'ancien `FRIENDS` gravé dans leur stockage. La
 * migration de version est donc la condition de l'« application immédiate ».
 *
 * Elle ne réécrit QUE l'ancien défaut : une valeur choisie par l'utilisateur
 * (aujourd'hui via `updateStory`) n'est jamais écrasée.
 */
import { act } from '@testing-library/react';

const mockGetAuthToken = jest.fn();

jest.mock('@/services/auth-manager.service', () => ({
  authManager: {
    getAuthToken: (...args: unknown[]) => mockGetAuthToken(...args),
  },
}));

jest.mock('@/lib/config', () => ({
  buildApiUrl: (path: string) => `https://api.meeshy.test/api/v1${path}`,
}));

global.fetch = jest.fn();

import {
  useUserPreferencesStore,
  resetUserPreferences,
  migrateUserPreferences,
  USER_PREFERENCES_STORE_VERSION,
} from '@/stores/user-preferences-store';

describe('story default visibility', () => {
  it('defaults to PUBLIC for a fresh store', () => {
    act(() => { resetUserPreferences(); });
    expect(useUserPreferencesStore.getState().story.defaultVisibility).toBe('PUBLIC');
  });

  it('is still user-settable to a narrower audience', () => {
    act(() => { resetUserPreferences(); });
    act(() => { useUserPreferencesStore.getState().updateStory({ defaultVisibility: 'FRIENDS' }); });
    expect(useUserPreferencesStore.getState().story.defaultVisibility).toBe('FRIENDS');
  });
});

describe('migrateUserPreferences', () => {
  it('rewrites the legacy FRIENDS default to PUBLIC for already-persisted browsers', () => {
    const migrated = migrateUserPreferences(
      { story: { defaultVisibility: 'FRIENDS', storyNotificationsEnabled: false } },
      0,
    );
    expect(migrated.story).toEqual({ defaultVisibility: 'PUBLIC', storyNotificationsEnabled: false });
  });

  it('leaves a deliberately narrowed audience untouched', () => {
    const migrated = migrateUserPreferences(
      { story: { defaultVisibility: 'PRIVATE', storyNotificationsEnabled: true } },
      0,
    );
    expect(migrated.story?.defaultVisibility).toBe('PRIVATE');
  });

  it('does not touch a state already at the current version', () => {
    const migrated = migrateUserPreferences(
      { story: { defaultVisibility: 'FRIENDS', storyNotificationsEnabled: true } },
      USER_PREFERENCES_STORE_VERSION,
    );
    expect(migrated.story?.defaultVisibility).toBe('FRIENDS');
  });

  it('survives a persisted state that carries no story block', () => {
    expect(() => migrateUserPreferences({ lastSyncedAt: null }, 0)).not.toThrow();
    expect(migrateUserPreferences({ lastSyncedAt: null }, 0).story).toBeUndefined();
  });
});
