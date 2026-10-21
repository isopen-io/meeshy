import { useContext, type ComponentProps, type CSSProperties } from 'react';

import { useAuthorRing } from '@/lib/profile-decor/author-ring';
import { avatarMenuEntries } from '@/lib/view/avatar-menu';
import { useSpeaksAsGuest } from '@/lib/view/guest-focus';
import { useAuthorMood, useAuthorMoodPostId } from '@/lib/view/use-author-moods';
import { useAuthorActive, useAuthorFocused, useAuthorHere } from '@/lib/view/use-conversation-viewing';
import { WorldParticipantCardContext } from '@/lib/view/world-participant-card-context';

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
export function AuthorAvatar({
  authorId,
  participant,
  sender,
  ...props
}: ComponentProps<typeof Avatar> & {
  /** L'auteur tel que le MESSAGE le sert (`message.sender`) : son contour
   * équipé (#10713) s'y lit quand les participants chargés ne le portent pas. */
  readonly sender?: unknown;
  /** La clé de l'auteur (`hereKeyOf`) : présent dans la conversation, son avatar
   * porte le point indigo (#8892). */
  readonly authorId?: string | undefined;
  /** Le participant qui a écrit — `id` est `message.senderId`, la clé de sa
   * fiche de World Wide quand le fil l'ouvre à l'équipe (#10102) ; `name`
   * nomme le geste, y compris pour un anonyme dont l'avatar ne porte pas de
   * nom. */
  readonly participant?: { readonly id: string; readonly name: string } | undefined;
}) {
  const here = useAuthorHere(authorId);
  const active = useAuthorActive(authorId);
  const focused = useAuthorFocused(authorId);
  const mood = useAuthorMood(authorId);
  const moodPostId = useAuthorMoodPostId(authorId);
  /* DANS LE FIL, L'HUMEUR NE BOUGE PAS (#10528) — une pastille par message,
     et des dizaines à l'écran. */
  const ring = useAuthorRing(authorId, sender);
  const still = {
    ...(mood === undefined ? {} : { mood, moodStill: true, ...(moodPostId === undefined ? {} : { moodPostId }) }),
    /* LE CONTOUR ÉQUIPÉ (#10713) — servi avec le participant ; sans lui, l'avatar d'avant, à l'octet. */
    ...(ring === null ? {} : { ring }),
  };
  const openDetails = useContext(ConversationDetailsContext);
  const worldCard = useContext(WorldParticipantCardContext);
  const guestFocus = useSpeaksAsGuest();
  const entries = avatarMenuEntries({
    username: props.profileUsername,
    storyRing: props.storyRing,
    details: openDetails !== null,
  });
  /* Sans identité (participant anonyme, message sans pseudo), l'avatar ne
     mène nulle part : il ne prend pas non plus l'appui long, qui revient au
     menu du message. */
  const identified = entries.some((entry) => entry.kind !== 'details');
  const decorated = {
    here: here || props.here === true,
    hereActive: active || props.hereActive === true,
    hereFocused: focused || props.hereFocused === true,
  };

  /* UN VISITEUR SANS COMPTE N'OUVRE AUCUNE FICHE (#10205, directive porteur
     du 2026-10-11) — ni profil, ni story, ni menu : l'avatar reste un visage.
     L'anneau de story part avec la porte, pour ne rien promettre au doigt. */
  if (guestFocus) {
    const { profileUsername: _profile, storyRing: _ring, ...visual } = props;
    return <CardTriggerAvatar {...still} {...visual} {...decorated} />;
  }

  /* LA FICHE DE WORLD WIDE (#10102) — quand le fil l'ouvre (équipe, World
     Wide), toucher l'auteur, compte OU anonyme, ouvre sa fiche de modération
     au lieu du profil : l'avatar devient un BOUTON qui la nomme. Le profil
     d'un compte reste dans le menu de l'appui long. Le geste s'arrête ici :
     il n'ouvre pas le menu du message de la rangée autour. */
  if (worldCard !== null && participant !== undefined && participant.id !== '') {
    const { profileUsername: _profile, storyRing: _ring, name: _name, ...visual } = props;
    return (
      <AvatarMenuTrigger entries={identified ? entries : []} name={participant.name} onOpenDetails={openDetails ?? undefined}>
        <button
          type="button"
          data-world-card-trigger="avatar"
          aria-haspopup="dialog"
          aria-label={worldCard.labelFor(participant.name)}
          {...(props.redundant === true ? { tabIndex: -1 } : {})}
          onClick={(event) => {
            event.stopPropagation();
            worldCard.open(participant.id);
          }}
          className="avatar-profile-link cursor-pointer border-0 bg-transparent p-0 focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ '--avatar-size': `${props.size}px`, outlineColor: 'var(--accent)' } as CSSProperties}
        >
          <CardTriggerAvatar {...still} {...visual} {...decorated} />
        </button>
      </AvatarMenuTrigger>
    );
  }

  return (
    <AvatarMenuTrigger
      entries={identified ? entries : []}
      name={props.name ?? props.profileUsername ?? ''}
      onOpenDetails={openDetails ?? undefined}
    >
      {/* … ET ELLE SE TOUCHE (#10528) : ici l'avatar n'est dans aucun bouton,
          la cible de l'humeur peut se poser à côté de son lien de profil. */}
      <Avatar
        {...still}
        {...(authorId === undefined ? {} : { moodAuthorId: authorId })}
        {...props}
        here={decorated.here}
        hereActive={decorated.hereActive}
        hereFocused={decorated.hereFocused}
      />
    </AvatarMenuTrigger>
  );
}

/**
 * L'AVATAR DANS LE BOUTON DE LA FICHE (#10102) — un RELAIS au sens de
 * `check-avatar-src` : il répand ce que l'hôte lui donne, la photo comprise,
 * et ne choisit rien. L'hôte en a retiré l'identité (`profileUsername`,
 * `storyRing`, `name`) : un lien de profil ne se pose pas dans un bouton.
 */
function CardTriggerAvatar(props: ComponentProps<typeof Avatar>) {
  return <Avatar {...props} />;
}
