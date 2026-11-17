import { preferenceEntryOf } from './preferences';
import type { Conversation } from './types';

/**
 * **LA VERSION DES PRÉFÉRENCES DU LECTEUR ARBITRE LA DIFFUSION ET LA RELECTURE**
 * (#18925). La passerelle incrémente `UserConversationPreferences.version` à
 * chaque écriture, remise à zéro comprise (`conversation-preferences.ts`), et
 * la sert à deux endroits : `user:preferences-updated`, et — depuis #18925 —
 * `userPreferences[0]` de `GET /conversations` et de `GET /conversations/:id`
 * (0 pour une ligne jamais écrite). La plus récente gagne, dans les deux sens,
 * jamais un recul :
 *
 * - une diffusion dont la version n'excède pas celle que la ligne en cache
 *   porte est ignorée (`conversation-preferences-sync.ts`), et une diffusion
 *   appliquée pose sa version sur la ligne ;
 * - une relecture REST dont la ligne porte une version PLUS ANCIENNE que celle
 *   du cache garde les préférences du cache (`withNewestPreferences`, appelée
 *   par la liste et par la fiche) — le reste de la ligne est celui servi ;
 * - sans version d'un côté (un serveur antérieur, une ligne jamais versionnée),
 *   la ligne servie passe, comme avant.
 */
export function preferencesVersionOf(conversation: Conversation | undefined): number | undefined {
  const version = conversation === undefined ? undefined : preferenceEntryOf(conversation)?.['version'];
  return typeof version === 'number' && Number.isFinite(version) ? version : undefined;
}

export function withNewestPreferences(served: Conversation, held: Conversation | undefined): Conversation {
  const heldVersion = preferencesVersionOf(held);
  const servedVersion = preferencesVersionOf(served);
  if (held === undefined || heldVersion === undefined || servedVersion === undefined || servedVersion >= heldVersion) return served;
  return { ...served, userPreferences: held.userPreferences };
}
