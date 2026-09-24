import { useContext, type ComponentProps } from 'react';

import { avatarMenuEntries } from '@/lib/view/avatar-menu';

import { Avatar } from './avatar';
import { AvatarMenuTrigger, ConversationDetailsContext } from './avatar-menu';

/**
 * **L'AVATAR D'UN AUTEUR DANS LE FIL** (#7828) — `Avatar`, plus son menu
 * d'appui long. Le toucher ne change pas (story, sinon profil — la loi
 * `identityTarget` que `Avatar` applique) ; l'appui long, le clic droit et la
 * touche menu ouvrent le menu de la PERSONNE, jamais celui du message que la
 * rangée porte autour.
 *
 * Une enveloppe plutôt qu'une capacité de plus sur `Avatar` : `Avatar` est
 * appelé comme une fonction PURE par au moins un témoin (voir son doc-comment
 * sur `src`), et ce menu a besoin d'état et d'un contexte.
 */
export function AuthorAvatar(props: ComponentProps<typeof Avatar>) {
  const openDetails = useContext(ConversationDetailsContext);
  const entries = avatarMenuEntries({
    username: props.profileUsername,
    storyRing: props.storyRing,
    details: openDetails !== null,
  });
  /* Sans identité (participant anonyme, message sans pseudo), l'avatar ne
     mène nulle part : il ne prend pas non plus l'appui long, qui revient au
     menu du message. */
  const identified = entries.some((entry) => entry.kind !== 'details');

  return (
    <AvatarMenuTrigger
      entries={identified ? entries : []}
      name={props.name ?? props.profileUsername ?? ''}
      onOpenDetails={openDetails ?? undefined}
    >
      <Avatar {...props} />
    </AvatarMenuTrigger>
  );
}
