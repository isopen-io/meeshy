import { canEditMessage } from '@meeshy/shared/utils/conversation-helpers';

import type { Message } from '@/lib/api/types';

import { isMineOf } from './message';

/**
 * « MODIFIER » EST OFFERT SI LE SERVEUR L'ACCEPTERAIT (#10581) — la règle de
 * `admitMessageEdit` (`services/gateway/src/services/messaging/
 * messageEditAdmission.ts`) lue AVANT l'aller-retour, pour qu'un refus ne se
 * découvre pas après avoir réécrit son message.
 *
 * LA FENÊTRE n'est pas réécrite ici : c'est `canEditMessage` de
 * `@meeshy/shared`, la source de vérité des 24 heures.
 *
 * CE QUE CETTE LOI N'OFFRE PAS, alors que le serveur l'admettrait : éditer le
 * message d'un autre au titre d'un rôle global, et dépasser la fenêtre au même
 * titre. La session du web ne garde pas le rôle global (`session.ts`, règle de
 * projection) : faute de le connaître, l'offre reste celle de l'auteur — comme
 * iOS (`MessageActionResolver.primaryActions`, `isMine && canEdit && hasText`).
 *
 * UN INVITÉ n'a pas de compte : la passerelle reconnaît l'auteur par son
 * `User.id`, qu'un invité n'a pas. UN MESSAGE SYSTÈME (l'avis de capture,
 * #9641) ne se réécrit pas. UN MESSAGE CHIFFRÉ de bout en bout ne part pas en
 * clair par cette route (fail-closed, #9224).
 */
export type EditViewer = { readonly id: string; readonly hasAccount: boolean };

export function editOffered(
  message: Pick<Message, 'id' | 'senderId' | 'content' | 'createdAt' | 'deletedAt' | 'expiresAt' | 'isViewOnce' | 'isEncrypted' | 'messageType'>,
  viewer: EditViewer,
  input: { readonly now: number },
): boolean {
  if (!viewer.hasAccount || !isMineOf(message as Message, viewer.id)) return false;
  if (message.id.startsWith('cid_') || message.messageType === 'system') return false;
  if (message.deletedAt != null || message.isViewOnce || message.isEncrypted) return false;
  if (message.expiresAt != null && new Date(message.expiresAt).getTime() <= input.now) return false;
  if (message.content.trim().length === 0) return false;
  return canEditMessage(message.createdAt).canEdit;
}
