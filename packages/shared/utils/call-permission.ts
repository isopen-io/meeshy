/**
 * QUI PEUT LANCER UN APPEL — la loi unique des trois clients et de la
 * passerelle (#10207, directive porteur du 2026-10-11).
 *
 * - un invité (sans compte Meeshy) ne lance jamais d'appel ;
 * - une conversation `global` n'a pas d'appel, pour personne ;
 * - une conversation `public` : le créateur, le rang `creator`/`admin` de la
 *   conversation, ou un administrateur plateforme (ADMIN, BIGBOSS) — un
 *   modérateur, de conversation comme de plateforme, n'en lance pas ;
 * - `direct` et `group` : tout membre, comme avant. L'appartenance elle-même
 *   est vérifiée par l'appelant ;
 * - tout autre type (`broadcast`, inconnu) : personne — la passerelle ne les
 *   a jamais ouverts aux appels, et un type qu'on ne connaît pas échoue fermé.
 *
 * Rejoindre un appel déjà en cours n'est pas gouverné ici.
 *
 * @see schema.prisma Participant.role, User.role, Conversation.type
 */

import type { CALL_ERROR_CODES } from '../types/call-error-codes.js';
import { isGlobalAdmin, isMemberAdmin, isMemberCreator } from '../types/role-types.js';

export type CallStartContext = {
  readonly conversationType: string;
  readonly viewerIsCreator: boolean;
  readonly viewerConversationRole: string | null | undefined;
  readonly viewerPlatformRole?: string | null;
  readonly viewerIsGuest?: boolean;
};

const OPEN_CALL_TYPES: ReadonlySet<string> = new Set(['direct', 'group']);

/* Un LITTÉRAL typé par la table, jamais une lecture de `CALL_ERROR_CODES` :
   les clients qui consomment `canStartCall` (l'en-tête du fil web) n'ont pas à
   embarquer toute la table des codes d'appel (#10207). */
export const CALL_NOT_ALLOWED_CODE: (typeof CALL_ERROR_CODES)['CALL_NOT_ALLOWED'] = 'CALL_NOT_ALLOWED';

function holdsPublicCallRight(context: CallStartContext): boolean {
  if (context.viewerIsCreator) return true;
  const conversationRole = context.viewerConversationRole ?? '';
  if (isMemberCreator(conversationRole) || isMemberAdmin(conversationRole)) return true;
  return isGlobalAdmin(context.viewerPlatformRole ?? '');
}

export function canStartCall(context: CallStartContext): boolean {
  if (context.viewerIsGuest === true) return false;
  const type = context.conversationType.toLowerCase();
  if (type === 'global') return false;
  if (type === 'public') return holdsPublicCallRight(context);
  return OPEN_CALL_TYPES.has(type);
}
