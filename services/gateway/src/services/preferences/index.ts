/**
 * Preferences Service Module
 *
 * Trois modules, une donnée : le résolveur de lecture (`privacy-storage`), sa
 * mémoïsation et sa purge (`privacy-cache`), et sa diffusion aux autres
 * appareils (`preferences-broadcast`). Aucune classe, aucune instance — les
 * routes importent des fonctions.
 *
 * L'ancien `PreferencesService` a été supprimé au cycle 48. Il était
 * intégralement orphelin ET restait le dernier écrivain du rangement
 * clé/valeur hérité `UserPreference`, alors que tous les lecteurs sont passés
 * au document `UserPreferences.privacy` au cycle 46 : le garder, c'était
 * garder le moyen tout prêt de recréer la divergence que ce cycle-là a fermée.
 */

export { loadStoredPrivacyPreferences } from './privacy-storage';
export type { StoredPrivacyPreferences } from './privacy-storage';
export {
  loadPrivacyPreferencesCached,
  invalidatePrivacyPreferences,
  clearPrivacyPreferencesCache,
  privacyPreferencesCacheSize,
} from './privacy-cache';
export {
  PREFERENCE_CATEGORIES,
  emitPreferenceCategoryUpdated,
} from './preferences-broadcast';
export type { PreferenceCategory } from './preferences-broadcast';
