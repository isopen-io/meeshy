/**
 * QUI PEUT LANCER UN APPEL — la loi unique des trois clients et de la
 * passerelle (#10207, directive porteur du 2026-10-11).
 *
 * - un invité (sans compte Meeshy) ne lance jamais d'appel ;
 * - une conversation `global` n'a pas d'appel, pour personne ;
 * - une conversation `public` : le créateur, le rang `creator`/`admin` de la
 *   conversation, ou un administrateur plateforme (ADMIN, BIGBOSS) — un
 *   modérateur, de conversation comme de plateforme, n'en lance pas ;
 * - les autres types (`direct`, `group`, `broadcast`) : tout membre, comme
 *   avant. L'appartenance elle-même est vérifiée par l'appelant.
 *
 * Rejoindre un appel déjà en cours n'est pas gouverné ici.
 *
 * @see schema.prisma Participant.role, User.role, Conversation.type
 */

import { isGlobalAdmin, isMemberAdmin, isMemberCreator } from '../types/role-types.js';

export type CallStartContext = {
  readonly conversationType: string;
  readonly viewerIsCreator: boolean;
  readonly viewerConversationRole: string | null | undefined;
  readonly viewerPlatformRole?: string | null;
  readonly viewerIsGuest?: boolean;
};

export const CALL_NOT_ALLOWED_CODE = 'CALL_NOT_ALLOWED' as const;

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
  return true;
}
