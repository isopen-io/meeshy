import type { ComponentProps } from 'react';

import type { ServedProfileDecorItem } from '@meeshy/shared/types/profile-decor';

import { useRingDesign } from '@/lib/profile-decor/author-ring';
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
 * **SON CONTOUR ÉQUIPÉ** (#10946) — `ringRef` est la référence SERVIE avec la
 * personne (`profileDecor.avatarRing`, #10945) ; elle se résout ICI, par le
 * catalogue (`useRingDesign` : embarqué au premier rendu, contrat officiel à
 * son arrivée). C'est le seul point où une référence devient un dessin : les
 * hôtes passent la personne, jamais le dessin. Un `ring` déjà résolu par
 * l'hôte prime. Sans contour, l'avatar d'avant, à l'octet.
 *
 * Un RELAIS au sens de `check-avatar-src` : il répand ce que l'hôte lui donne,
 * la photo comprise, et ne choisit que la présence et le contour.
 */
export function PeerAvatar({ presenceKey, ...props }: ComponentProps<typeof RingedAvatar> & { readonly presenceKey: string | undefined }) {
  const presence = usePresenceOfUser(presenceKey);
  return <RingedAvatar {...props} presence={presence} />;
}

/**
 * **L'AVATAR QUI RÉSOUT SON CONTOUR** (#10946) — la moitié « contour » de
 * `PeerAvatar`, pour les hôtes qui tiennent déjà la présence (une rangée de
 * membres actifs, une pile de visages) et la passent eux-mêmes. La garde de
 * source (`avatar-ring-guard.test.ts`) exige que l'hôte DISE son contour —
 * `ringRef`, même `null`.
 */
export function RingedAvatar({ ringRef, ...props }: ComponentProps<typeof Avatar> & { readonly ringRef?: ServedProfileDecorItem | null | undefined }) {
  const resolved = useRingDesign(ringRef ?? null);
  const ring = props.ring ?? resolved;
  return <Avatar {...props} {...(ring === null ? {} : { ring })} />;
}
