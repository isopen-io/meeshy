import type { Conversation } from '@/lib/api/types';
import { avatarOf, initialsOf, peerOf } from '@/lib/view/conversation';
import { peerKeyIn, useIsHere, useIsHereActive, useIsHereFocused } from '@/lib/view/use-conversation-viewing';
import { usePresence } from '@/lib/view/use-presence';
import { servedRingOf, useRingDesign } from '@/lib/profile-decor/author-ring';

import { Avatar } from './avatar';

/**
 * **LE VISAGE DE L'EN-TÊTE DES DÉTAILS** (#10944) — celui de l'en-tête du fil
 * (`thread-header.tsx`), un cran plus grand : une conversation DIRECTE porte la
 * présence SERVIE du pair et son point « ici » dans CETTE conversation ; un
 * groupe n'a pas de pair, donc aucun point.
 */
export function ConversationDetailsAvatar({
  conversation,
  viewerId,
  title,
  accent,
}: {
  readonly conversation: Conversation;
  readonly viewerId: string;
  readonly title: string;
  readonly accent: string;
}) {
  const photo = avatarOf(conversation, viewerId);
  const peerKey = peerKeyIn(conversation, viewerId);
  const presence = usePresence(peerOf(conversation, viewerId));
  const here = useIsHere(conversation.id, peerKey);
  const hereActive = useIsHereActive(conversation.id, peerKey);
  const hereFocused = useIsHereFocused(conversation.id, peerKey);
  /* LE CONTOUR DU PAIR D'UN DIRECT (#10946) ; un groupe n'a pas de pair, donc pas de contour. */
  const ring = useRingDesign(servedRingOf(peerOf(conversation, viewerId)));
  return (
    <Avatar
      initials={initialsOf(title)}
      color={accent}
      size={88}
      name={title}
      {...(photo === undefined ? {} : { src: photo })}
      {...(ring === null ? {} : { ring })}
      presence={presence}
      here={here}
      hereActive={hereActive}
      hereFocused={hereFocused}
    />
  );
}
