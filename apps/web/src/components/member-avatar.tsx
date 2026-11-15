import type { ConversationMember } from '@/lib/api/conversation-members';
import { useRingDesign } from '@/lib/profile-decor/author-ring';
import { initialsOf } from '@/lib/view/conversation';
import { useIsHere, useIsHereActive, useIsHereFocused } from '@/lib/view/use-conversation-viewing';
import { usePresenceOfUser } from '@/lib/view/use-presence';

import { Avatar } from './avatar';

/**
 * **L'AVATAR D'UN MEMBRE** dans la liste des membres (#10713) — avec le contour
 * équipé que la passerelle sert sur la ligne (`ConversationMember.ring`), posé
 * DANS l'empreinte `size` : la rangée ne grandit pas, rien ne se décale. Sans
 * contour, l'avatar d'avant. Une couche animée, s'il y en a une, ne démarre
 * qu'à l'écran et se tait sous « Réduire les animations » (`LottieLayer`).
 *
 * **SA PRÉSENCE ET SON « ICI »** (#10944) — la présence vient de la carte
 * vivante, jamais de la ligne : la page des membres est persistée, et la
 * présence d'autrui n'entre dans aucun cache persisté (D-60). Le point « ici »
 * est celui de CETTE conversation (`conversationId`), jamais d'une autre. La
 * clé est celle que la passerelle annonce : le compte, ou la ligne d'un invité.
 */
export function MemberAvatar({
  member,
  accent,
  size,
  conversationId,
}: {
  readonly member: ConversationMember;
  readonly accent: string;
  readonly size: number;
  readonly conversationId: string;
}) {
  const ring = useRingDesign(member.ring ?? null);
  const key = member.userId ?? member.id;
  const presence = usePresenceOfUser(key);
  const here = useIsHere(conversationId, key);
  const hereActive = useIsHereActive(conversationId, key);
  const hereFocused = useIsHereFocused(conversationId, key);
  return (
    <Avatar
      initials={initialsOf(member.displayName)}
      color={accent}
      size={size}
      {...(member.avatar === undefined ? {} : { src: member.avatar })}
      {...(ring === null ? {} : { ring })}
      presence={presence}
      here={here}
      hereActive={hereActive}
      hereFocused={hereFocused}
    />
  );
}
