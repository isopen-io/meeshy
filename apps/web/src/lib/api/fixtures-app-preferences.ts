import type { AppPreferences, PreferencesPatch } from './app-preferences';

/**
 * **LE LECTEUR DE RECETTE, SES RÉGLAGES** (#5563) — servis par le MÊME chemin
 * que la passerelle (`app-preferences.ts`, garde `__FIXTURES__ && source ===
 * 'fixtures'`), élagués de tout build `VITE_DATA_SOURCE=gateway`
 * (`vite.config.ts § FIXTURE_MODULE`). Les défauts sont ceux des schémas de
 * `packages/shared/types/preferences`. Une écriture est tenue en mémoire le
 * temps de l'onglet : le gate navigateur mesure ainsi qu'une bascule optimiste
 * reste après la « réponse ».
 */

const INITIAL: AppPreferences = {
  theme: 'auto',
  pushEnabled: true,
  soundEnabled: true,
  showOnlineStatus: true,
  showLastSeen: true,
  showReadReceipts: true,
  showTypingIndicator: true,
  hideProfileFromSearch: false,
};

const state: { preferences: AppPreferences } = { preferences: INITIAL };

export function fixtureAppPreferences(): AppPreferences {
  return state.preferences;
}

export function fixturePatchAppPreferences(patch: PreferencesPatch): AppPreferences {
  state.preferences = { ...state.preferences, ...patch };
  return state.preferences;
}
