/**
 * Consommation du broadcast versionné `USER_PREFERENCES_UPDATED` (scope
 * conversation) pour la préférence de mode de lecture — D-4 / R5-6, point
 * 3(c) du mandat.
 *
 * Pendant web de `MeeshyApp.swift:onReadingModePreferenceChanged` (iOS) :
 *   - MÊME garde — le drapeau du fil (`useReadingModesFlag` ici,
 *     `LentilleFeatureFlag.isReadingModesEnabled` côté iOS) : « écrire sous
 *     drapeau OFF n'aurait aucun lecteur, mais couper la garde ferait
 *     dépendre la synchro d'une future purge plutôt que d'un simple gate au
 *     point d'écriture » — le commentaire iOS s'applique mot pour mot ici ;
 *   - MÊME refus de fabriquer une préférence depuis une chaîne inconnue
 *     (`ReadingModePreference(rawValue:)` optionnel côté Swift ⇔
 *     `ReadingModePreferenceSchema.safeParse` ici) ;
 *   - MÊME magasin unique en sortie : iOS écrit dans
 *     `LentilleReadingModePreferenceCenter.shared` (le magasin scopé
 *     existant, pas un second) ; ici, `useReadingModePreferenceStore.
 *     getState().applyReadingModeUpdate` (le magasin scopé de ce fichier,
 *     D-4 — pas un second canal, cf. mandat point 3).
 *
 * Extrait de `use-socket-cache-sync.ts` en fonction NOMMÉE, testable sans
 * monter le hook géant : la seule chose que ce fichier doit prouver est
 * « flag off ⇒ rien, payload invalide ⇒ rien, sinon `applyReadingModeUpdate`
 * scopé » — un test unitaire direct le montre plus clairement qu'un rendu de
 * hook avec vingt écouteurs mockés autour.
 *
 * @see apps/ios/Meeshy/MeeshyApp.swift (le pendant iOS, même garde)
 * @see apps/web/hooks/queries/use-socket-cache-sync.ts (l'unique appelant)
 * @see apps/web/stores/reading-mode-preference-store.ts (le magasin scopé, `applyReadingModeUpdate`)
 */
import { ReadingModePreferenceSchema } from '@meeshy/shared/types/reading-modes';
import type { UserPreferencesConversationUpdatedEventData } from '@meeshy/shared/types/socketio-events';
import { useReadingModePreferenceStore } from '@/stores/reading-mode-preference-store';

export function applyReadingModePreferenceBroadcast(
  event: UserPreferencesConversationUpdatedEventData,
  isReadingModesFlagActive: boolean
): void {
  if (!isReadingModesFlagActive) return;

  // Un `reset` (DELETE) remet `readingMode` à `'auto'` côté serveur, mais ne
  // porte pas `preferences` (contrat `UserPreferencesConversationUpdatedEventData`
  // — `null` si `reset === true`). `applyReadingModeUpdate('auto', event.
  // version)` reste un choix DÉFENDABLE, mais fabriquerait une valeur que le
  // payload ne porte pas explicitement ; ce chemin est laissé à une décision
  // produit ultérieure plutôt que deviné ici — pas d'effet plus sûr que pas
  // d'effet du tout.
  if (event.reset || !event.preferences) return;

  const parsed = ReadingModePreferenceSchema.safeParse(event.preferences.readingMode);
  if (!parsed.success) return;

  useReadingModePreferenceStore
    .getState()
    .applyReadingModeUpdate(event.conversationId, parsed.data, event.version);
}
