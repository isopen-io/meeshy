import { isDeclaredMinor } from './age.js';
import type { ViewerWriteRestriction } from '../types/conversation.js';

/**
 * Le type de la conversation où la règle des 13-17 ans s'applique : Meeshy
 * Global (`identifier: 'meeshy'`), le salon que tout nouveau compte rejoint.
 * Le TYPE gouverne, pas l'identifiant : c'est lui que la règle d'écriture lit
 * déjà (règle 4 de `conversationWriteAdmission`), et un second salon `global`
 * aurait la même population.
 */
export const GLOBAL_CONVERSATION_TYPE = 'global';

/**
 * La restriction d'écriture du LECTEUR dans une conversation (#9927) —
 * `'minor-global'` pour un mineur déclaré (13-17 ans) dans Global, `null`
 * partout ailleurs. CALCULÉE à chaque lecture depuis `User.birthDate` : aucun
 * état n'est stocké, et la restriction tombe d'elle-même le jour des 18 ans.
 * Un âge non déclaré ne restreint rien (`isDeclaredMinor`).
 */
export function viewerWriteRestrictionOf(params: {
  readonly conversationType: string | null | undefined;
  readonly birthDate: Date | null | undefined;
  readonly now: Date;
}): ViewerWriteRestriction | null {
  if (params.conversationType !== GLOBAL_CONVERSATION_TYPE) return null;
  return isDeclaredMinor(params.birthDate, params.now) ? 'minor-global' : null;
}
