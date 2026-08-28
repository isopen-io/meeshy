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

  /**
   * v2 (2026-08-28) — `lastSyncedAt` cesse d'être persisté : il répond à une
   * question de SESSION (« cet onglet a-t-il lu des préférences ? »), pas à une
   * question d'historique. Un blob écrit par la v1 en porte encore un, et la
   * fusion par défaut de `persist` le REPOSERAIT dans l'état : c'est exactement
   * ce que la migration retire, sinon un onglet ouvert hors ligne hériterait
   * d'une fraîcheur qu'il n'a pas.
   */
  it('retire un lastSyncedAt hérité de la v1', () => {
    const migrated = migrateUserPreferences({ lastSyncedAt: '2026-08-01T00:00:00.000Z' }, 1);

    expect('lastSyncedAt' in migrated).toBe(false);
  });

  it('retire aussi le lastSyncedAt des blobs les plus anciens, story migrée comprise', () => {
    const migrated = migrateUserPreferences(
      {
        lastSyncedAt: '2026-08-01T00:00:00.000Z',
        story: { defaultVisibility: 'FRIENDS', storyNotificationsEnabled: true },
      },
      0,
    );

    expect('lastSyncedAt' in migrated).toBe(false);
    expect(migrated.story?.defaultVisibility).toBe('PUBLIC');
  });

  it('traite un blob SANS version comme le plus ancien', () => {
    // `persist` transmet `undefined` pour un blob antérieur au versionnage, et
    // `undefined < 1` rend `false` : gardé naïvement, l'état qui a le plus
    // besoin des deux étapes serait le seul à n'en recevoir aucune.
    const migrated = migrateUserPreferences(
      {
        lastSyncedAt: '2026-08-01T00:00:00.000Z',
        story: { defaultVisibility: 'FRIENDS', storyNotificationsEnabled: true },
      },
      undefined,
    );

    expect('lastSyncedAt' in migrated).toBe(false);
    expect(migrated.story?.defaultVisibility).toBe('PUBLIC');
  });

  it("n'invente pas de clé sur un blob déjà à la version courante", () => {
    const migrated = migrateUserPreferences(
      { lastSyncedAt: '2026-08-01T00:00:00.000Z' },
      USER_PREFERENCES_STORE_VERSION,
    );

    expect(migrated.lastSyncedAt).toBe('2026-08-01T00:00:00.000Z');
  });
});
