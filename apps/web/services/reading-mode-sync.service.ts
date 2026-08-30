/**
 * Client réseau NARROW pour la route G-121 — D-4 / R5-6.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POURQUOI UN FICHIER DÉDIÉ, PAS `user-preferences.service.ts`
 * ═══════════════════════════════════════════════════════════════════════════
 * `UserPreferencesService`/`UserConversationPreferences` (type PARTAGÉ,
 * `@meeshy/shared/types/user-preferences`) ne portent pas `readingMode` —
 * l'ajouter aurait amendé un type que ce lot n'a pas mandat de toucher (la
 * mission D-4 gèle explicitement `ReadingModePreferenceScope` et n'étend
 * aucune loi partagée). Ce fichier parle DIRECTEMENT à
 * `PUT/GET /user-preferences/conversations/:id` — la MÊME route que
 * `UserPreferencesService`, un autre client, aussi narrow que l'écart qu'il
 * comble (deux fonctions, un seul champ).
 *
 * @see services/gateway/src/routes/conversation-preferences.ts (le contrat réel de la route)
 * @see apps/web/stores/reading-mode-preference-store.ts (l'unique appelant de `writeReadingModePreferenceToServer`)
 * @see apps/web/hooks/lentille/use-reading-mode-server-sync.ts (l'unique appelant de `fetchServerReadingModePreference`)
 */
import { apiService } from './api.service';
import { API_ENDPOINTS } from '@meeshy/shared/api/endpoints';
import { ReadingModePreferenceSchema, type ReadingModePreference } from '@meeshy/shared/types/reading-modes';

export interface ServerReadingModePreference {
  readonly value: ReadingModePreference;
  readonly version: number;
}

interface ConversationPreferencesResponseBody {
  readonly readingMode?: unknown;
  readonly version?: unknown;
}

/**
 * `GET /user-preferences/conversations/:id` — la route répond TOUJOURS avec
 * `readingMode`/`version` (défauts `'auto'`/`0` quand rien n'a jamais été
 * écrit, `CONVERSATION_PREFERENCES_DEFAULTS` côté gateway), jamais `404`
 * pour une ligne absente. `null` ici ne veut donc dire QUE deux choses :
 * la requête a échoué (réseau, 401 anonyme — l'appelant ne devrait déjà pas
 * appeler pour une identité anonyme, D-4 point 4), ou le corps a rendu une
 * valeur hors énumération (jamais fabriquée en `'auto'` — une valeur qu'on
 * ne sait pas lire n'est pas une préférence connue).
 */
export async function fetchServerReadingModePreference(
  conversationId: string
): Promise<ServerReadingModePreference | null> {
  const response = await apiService.get<ConversationPreferencesResponseBody>(
    API_ENDPOINTS.userPreferences.conversationsByConversationId(conversationId)
  );
  const body = response?.data;
  if (!body) return null;

  const parsedValue = ReadingModePreferenceSchema.safeParse(body.readingMode);
  if (!parsedValue.success) return null;

  const version = typeof body.version === 'number' ? body.version : 0;
  return { value: parsedValue.data, version };
}

/**
 * `PUT /user-preferences/conversations/:id` — un choix explicite. L'appelant
 * (`reading-mode-preference-store.ts`) est responsable du fire-and-forget et
 * de l'échec silencieux ; cette fonction se contente d'émettre la requête et
 * de laisser toute erreur PROPAGER, pour que l'appelant décide de sa
 * politique plutôt que de la voir imposée ici.
 */
export async function writeReadingModePreferenceToServer(
  conversationId: string,
  value: ReadingModePreference
): Promise<void> {
  await apiService.put(API_ENDPOINTS.userPreferences.conversationsByConversationId(conversationId), { readingMode: value });
}
