import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { avatarMenuEntries } from '@/lib/view/avatar-menu';
import { initialsOf } from '@/lib/view/conversation';
import type { ActiveMember } from '@/lib/view/top-active-members';
import type { StoryRingOf } from '@/lib/view/use-author-story-rings';

import { Avatar } from './avatar';
import { AvatarMenuTrigger } from './avatar-menu';

/**
 * **LA PILE DES PARTICIPANTS LES PLUS ACTIFS** (#7830) — dans l'en-tête d'un
 * groupe, jusqu'à trois avatars chevauchés, chacun avec son anneau de story.
 * La sélection est la loi `topActiveMembers` (`lib/view/top-active-members.ts`).
 *
 * LES GESTES, RÈGLE COMMUNE AU WEB ET À iOS (#7831, l'issue jumelle) : le
 * TOUCHER ouvre la story quand elle n'a pas encore été vue, sinon le profil
 * (`identityTarget`, `storyOpens: 'unseen'`) ; l'APPUI LONG ouvre le menu
 * d'avatar (#7828) : Voir le profil · Voir la story (vue ou non) · Détails
 * de la conversation.
 *
 * Le chevauchement ne rogne pas les cibles : chaque lien d'avatar garde sa
 * boîte de 44 px (`.avatar-profile-link`, marges négatives), le premier
 * avatar passe au-dessus du suivant comme il est peint.
 */
const SIZE = 28;
const OVERLAP = 8;

export function ActiveMembersStack({
  members,
  accent,
  storyRingOf,
  onOpenDetails,
}: {
  readonly members: readonly ActiveMember[];
  readonly accent: string;
  readonly storyRingOf?: StoryRingOf | undefined;
  readonly onOpenDetails?: (() => void) | undefined;
}) {
  if (members.length === 0) return null;
  const label = translate(currentInterfaceLanguage(), 'thread.header.active_members');

  return (
    <ul aria-label={label} className="flex shrink-0 items-center" data-active-members>
      {members.map((member, index) => {
        const ring = storyRingOf?.(member.id);
        const entries = avatarMenuEntries({ username: member.username, storyRing: ring, details: onOpenDetails !== undefined });
        return (
          <li
            key={member.id}
            data-active-member={member.id}
            className="relative grid place-items-center"
            style={{ marginInlineStart: index === 0 ? 0 : -OVERLAP, zIndex: members.length - index }}
          >
            <AvatarMenuTrigger entries={entries} name={member.name} onOpenDetails={onOpenDetails}>
              <Avatar
                initials={initialsOf(member.name)}
                color={accent}
                size={SIZE}
                name={member.name}
                {...(member.avatar === undefined ? {} : { src: member.avatar })}
                {...(member.username === undefined ? {} : { profileUsername: member.username })}
                {...(ring === undefined ? {} : { storyRing: ring })}
                storyOpens="unseen"
              />
            </AvatarMenuTrigger>
          </li>
        );
      })}
    </ul>
  );
}
