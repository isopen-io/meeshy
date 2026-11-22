import type { QueryClient } from '@tanstack/react-query';

import { patchConversation, patchConversationDetail } from './conversations';
import { removeConversationRow } from './realtime-conversation-gone';

/**
 * L'APPARTENANCE DU LECTEUR, DANS LES DEUX SENS (#11415, #20227) — les
 * événements de participation que la passerelle adresse aussi à la salle
 * `user:<id>` du sujet. Quand l'un NOMME le lecteur (compte ou participant,
 * les deux faces), la conversation dit ce qu'il en est — dans le détail que le
 * fil relit, et dans la liste.
 *
 * | événement | le DÉTAIL | la LIGNE de liste |
 * |---|---|---|
 * | `conversation:participant-left` / `-banned` | `isMember: false` | **elle part** (#20302) |
 * | `conversation:participant-unbanned`, `membershipRestored: true` | `isMember: true` | relecture complète (#20227) |
 *
 * Le détail servi ne porte que des lignes ACTIVES : la ligne du lecteur n'y
 * passe jamais « inactive », elle disparaît. Sans ce puits, le fil ouvert
 * gardait son détail d'avant, et le menu offrait encore « Supprimer pour moi »
 * — que la passerelle refuse en 403 à qui n'est plus participant actif.
 *
 * **Le sens RETOUR est resté absent jusqu'à #20227**, alors qu'iOS et Android
 * appliquaient les deux : un membre débanni gardait `isMember: false`, donc
 * plus de réponse, plus de réaction, plus de « Supprimer pour moi » et des
 * mentions ignorées, PENDANT que les messages continuaient d'arriver (la
 * passerelle le re-rejoint à la room). Et rien ne guérissait seul : la liste se
 * rafraîchit par un delta borné par `Conversation.updatedAt`, qu'un
 * débannissement ne touche pas — seul le réconcilie complet de 15 minutes la
 * repeignait.
 *
 * `membershipRestored` gouverne le retour, JAMAIS l'événement : « le
 * bannissement est levé dans tous les cas ; l'appartenance, non » (le site
 * d'émission le dit). Lever le ban d'un ancien membre ne le fait pas rentrer.
 *
 * FAIL-CLOSED sur la forme, dans les deux sens : une charge sans conversation
 * ni identité, ou qui nomme quelqu'un d'autre, ne change rien. Un bannissement
 * qui nomme le lecteur le laisse hors de la conversation, qu'il ait ou non
 * retiré une appartenance ; un débannissement qui ne RESTAURE pas ne le fait
 * pas rentrer.
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

/**
 * **La LIGNE part, le DÉTAIL reste** (#20302, qui complète #11415).
 *
 * Le détail garde `isMember: false` : c'est lui qui atteint le pixel du fil
 * OUVERT (`menuViewerOf` → `viewerIsActiveMember`), et le fil ne se referme
 * pas sous le lecteur — il dégrade son menu.
 *
 * La LIGNE, elle, s'en va. Le `patchConversation(… isMember: false)` qui
 * vivait ici n'atteignait RIEN : aucun lecteur d'`isMember` ne décide qu'une
 * ligne se rend (ni `applyFilter`, ni `flattenConversationPages`), si bien que
 * la conversation restait dans la liste avec son aperçu et sa pastille,
 * jusqu'à une relecture complète. La passerelle énonce pourtant le contrat sur
 * ses deux sites d'émission — « ses appareils gardaient une ligne que
 * `GET /conversations` ne sert plus … Le retrait côté client est idempotent »
 * (`participant-ban-core.ts`, `leave.ts`) — et iOS
 * (`applyConversationDeleted`) comme Android (`purge`) l'honoraient déjà.
 *
 * Le sens RETOUR n'a rien à défaire : `conversation:participant-unbanned` avec
 * `membershipRestored` relit la liste EN ENTIER (#20227), donc la ligne
 * revient d'elle-même.
 */
export function applyViewerMembershipEnded(queryClient: QueryClient, ended: ViewerMembershipEnded): void {
  patchConversationDetail(queryClient, ended.conversationId, (c) => ({ ...c, isMember: false }));
  removeConversationRow(queryClient, ended.conversationId);
}

/**
 * Le sens RETOUR (#20227) — la MÊME lecture d'identité, plus la condition que
 * le site d'émission impose : `membershipRestored`. Sans elle, lever le ban
 * d'un ancien membre le ferait rentrer dans une conversation qu'il a quittée.
 */
export function viewerMembershipRestoredOf(payload: unknown, viewerId: string): ViewerMembershipEnded | null {
  if (typeof payload !== 'object' || payload === null) return null;
  if ((payload as Readonly<Record<string, unknown>>).membershipRestored !== true) return null;
  return viewerMembershipEndedOf(payload, viewerId);
}

export function applyViewerMembershipRestored(queryClient: QueryClient, restored: ViewerMembershipEnded): void {
  patchConversationDetail(queryClient, restored.conversationId, (c) => ({ ...c, isMember: true }));
  patchConversation(queryClient, restored.conversationId, (c) => ({ ...c, isMember: true }));
}
