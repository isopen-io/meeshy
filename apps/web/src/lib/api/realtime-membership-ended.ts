import type { QueryClient } from '@tanstack/react-query';

import { patchConversation, patchConversationDetail } from './conversations';

/**
 * LE PUITS DE LA FIN D'APPARTENANCE DU LECTEUR (#11415) —
 * `conversation:participant-left` et `conversation:participant-banned`, que la
 * passerelle adresse aussi à la salle `user:<id>` du partant. Quand l'événement
 * NOMME le lecteur (compte ou participant, les deux faces), la conversation
 * dit `isMember: false` — dans le détail que le fil relit, et dans la liste.
 *
 * Le détail servi ne porte que des lignes ACTIVES : la ligne du lecteur n'y
 * passe jamais « inactive », elle disparaît. Sans ce puits, le fil ouvert
 * gardait son détail d'avant, et le menu offrait encore « Supprimer pour moi »
 * — que la passerelle refuse en 403 à qui n'est plus participant actif.
 *
 * FAIL-CLOSED sur la forme : une charge sans conversation ni identité, ou qui
 * nomme quelqu'un d'autre, ne change rien. Un bannissement qui nomme le lecteur
 * le laisse hors de la conversation, qu'il ait ou non retiré une appartenance.
 */
export type ViewerMembershipEnded = { readonly conversationId: string };

const textOf = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

export function viewerMembershipEndedOf(payload: unknown, viewerId: string): ViewerMembershipEnded | null {
  if (viewerId === '' || typeof payload !== 'object' || payload === null) return null;
  const p = payload as Readonly<Record<string, unknown>>;
  const conversationId = textOf(p.conversationId);
  if (conversationId === null) return null;
  return textOf(p.userId) === viewerId || textOf(p.participantId) === viewerId ? { conversationId } : null;
}

export function applyViewerMembershipEnded(queryClient: QueryClient, ended: ViewerMembershipEnded): void {
  patchConversationDetail(queryClient, ended.conversationId, (c) => ({ ...c, isMember: false }));
  patchConversation(queryClient, ended.conversationId, (c) => ({ ...c, isMember: false }));
}
