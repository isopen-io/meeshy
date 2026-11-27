import { ROOMS } from '@meeshy/shared/types/socketio-events';

/**
 * La liste d'exclusion d'un signal de salon, exprimée par IDENTITÉ (#16800).
 *
 * Une id de socket ne nomme que ce que CE processus connaît : avec l'adaptateur
 * Redis, la liste `except` voyage jusqu'aux autres nœuds, mais une socket d'un
 * pair attachée ailleurs n'y figurait jamais. La room personnelle
 * `ROOMS.user(id)`, que chaque socket inscrite (et chaque invité, sous l'id de
 * son participant) rejoint à l'authentification AVANT ses rooms de
 * conversation, se résout au contraire sur chaque nœud qui diffuse : tous les
 * appareils du compte sont exclus, où qu'ils soient attachés.
 */
export function identityExclusion(userIds: Iterable<string>): string[] {
  return [...new Set(userIds)].map((id) => ROOMS.user(id));
}
