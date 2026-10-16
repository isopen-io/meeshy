import type { ConversationMember } from '@/lib/api/conversation-members';
import { useRingDesign } from '@/lib/profile-decor/author-ring';
import { initialsOf } from '@/lib/view/conversation';

import { Avatar } from './avatar';

/**
 * **L'AVATAR D'UN MEMBRE** dans la liste des membres (#10713) — avec le contour
 * équipé que la passerelle sert sur la ligne (`ConversationMember.ring`), posé
 * DANS l'empreinte `size` : la rangée ne grandit pas, rien ne se décale. Sans
 * contour, l'avatar d'avant. Une couche animée, s'il y en a une, ne démarre
 * qu'à l'écran et se tait sous « Réduire les animations » (`LottieLayer`).
 */
export function MemberAvatar({ member, accent, size }: { readonly member: ConversationMember; readonly accent: string; readonly size: number }) {
  const ring = useRingDesign(member.ring ?? null);
  return (
    <Avatar
      initials={initialsOf(member.displayName)}
      color={accent}
      size={size}
      {...(member.avatar === undefined ? {} : { src: member.avatar })}
      {...(ring === null ? {} : { ring })}
    />
  );
}
