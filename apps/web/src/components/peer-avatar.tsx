import type { ComponentProps } from 'react';

import { usePresenceOfUser } from '@/lib/view/use-presence';

import { Avatar } from './avatar';

/**
 * **L'AVATAR D'UNE PERSONNE CONNUE PAR SON IDENTIFIANT** (#10944) — l'auteur
 * d'un post, d'un commentaire, d'une notification, un destinataire, un membre :
 * la charge ne porte pas sa présence, la carte vivante (`presence-store.ts`)
 * est la seule que la passerelle a SERVIE à ce lecteur. Absente ⇒ aucun point.
 *
 * `presenceKey` est REQUIS, même `undefined` : soi, un groupe, une personne
 * sans compte n'ont pas de clé, et l'hôte le DIT plutôt que de l'oublier.
 *
 * Un RELAIS au sens de `check-avatar-src` : il répand ce que l'hôte lui donne,
 * la photo comprise, et ne choisit que la présence.
 */
export function PeerAvatar({ presenceKey, ...props }: ComponentProps<typeof Avatar> & { readonly presenceKey: string | undefined }) {
  const presence = usePresenceOfUser(presenceKey);
  return <Avatar {...props} presence={presence} />;
}
