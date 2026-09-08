import type { ConversationReadingMode, ReadingModePreference } from '@meeshy/shared/types/reading-modes';

import type { Transport } from '../net/transport';

/**
 * LE PORT SERVEUR (D-10) — ce fichier définit la FORME du câblage réseau,
 * jamais le réseau lui-même : `transport` est un paramètre INJECTABLE, et le
 * câblage réel (fetch authentifié vers la passerelle + écoute
 * `user:preferences-updated`) appartient au travail `staging` du tour. Aucun
 * endpoint n'est inventé — les deux routes copiées existent déjà :
 *
 *   - lecture  : `GET /api/v1/user-preferences/conversations/:conversationId`
 *     (`services/gateway/src/routes/conversation-preferences.ts:191`)
 *   - écriture : `PUT /api/v1/user-preferences/conversations/:conversationId`
 *     (`conversation-preferences.ts:349`), corps `{ readingMode }` seul —
 *     les autres champs restent inchangés (l.393-404).
 *
 * `Transport` est désormais PARTAGÉ (`../net/transport.ts`, #5559 §5.1) : un
 * second domaine (`api/preferences.ts`) écrit vers la passerelle, et un
 * `Transport` par domaine aurait été la jumelle divergente que le dépôt
 * interdit. Réexporté ici pour que les consommateurs existants de ce module
 * (`import type { Transport } from './sync'`) n'aient rien à changer.
 */
export type { Transport } from '../net/transport';

/**
 * Compose la requête EXACTE de la route PUT (§3.2) : la méthode, le chemin et
 * le corps `{ readingMode }` seul — jamais un second champ, jamais une forme
 * reconstruite ailleurs.
 */
export function pushPreference(
  transport: Transport,
  conversationId: string,
  preference: ReadingModePreference,
): Promise<unknown> {
  return transport({
    method: 'PUT',
    path: `/api/v1/user-preferences/conversations/${conversationId}`,
    body: { readingMode: preference },
  });
}

export type LocalPreferenceState = {
  /** `null` = rien de collant, l'orchestrateur décide (`auto`). */
  readonly mode: ConversationReadingMode | null;
  readonly version: number;
};

/**
 * Charge de `user:preferences-updated`, réduite à ce que ce port consomme
 * (`UserPreferencesConversationUpdatedEventData`,
 * `packages/shared/types/socketio-events/preferences.ts:60-68`).
 */
export type RemotePreferenceUpdate = {
  readonly version: number;
  readonly reset: boolean;
  readonly readingMode: ConversationReadingMode | null;
};

/**
 * L'ARBITRAGE documenté §3.3/route PUT : `incoming.version <= local ⇒ drop`.
 * Un événement en retard (rejeu, doublon, course entre deux onglets) ne doit
 * jamais écraser une valeur plus fraîche.
 */
export function applyRemotePreference(
  local: LocalPreferenceState,
  incoming: RemotePreferenceUpdate,
): LocalPreferenceState {
  if (incoming.version <= local.version) return local;
  if (incoming.reset) return { mode: null, version: incoming.version };
  return { mode: incoming.readingMode, version: incoming.version };
}
