import type { ViewerIdentityModel } from '@/components/viewer-chrome';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { ringRefOf } from '@/lib/profile-decor/served-ring';
import { shortRelativeTime } from '@/lib/relative-time';
import { storyRepostCredit, type StoryPlaybackGroup, type StoryPlaybackStory } from '@/lib/stories/playback';
import { initialsOf, participantAvatarOf } from '@/lib/view/conversation';

/**
 * **L'IDENTITÉ D'UN AUTEUR DANS LE LECTEUR** — EXTRAITE de `routes/story.tsx`
 * (§ budget, « on extrait d'abord, on ajoute ensuite », #11198), comportement
 * INCHANGÉ. Le cube inter-auteurs (`story-cube-face.tsx`) nomme la face
 * voisine avec le MÊME libellé que l'en-tête : un auteur qui change de nom en
 * cours de rotation serait un changement d'identité à mi-geste.
 */

/** Le nom affiché — même repli qu'`storyAuthorLabel` (`lib/view/story-tray.ts`),
 * appliqué ici à `StoryPlaybackGroup` (forme distincte de `StoryTrayGroup`,
 * l'ordre de lecture n'étant pas l'ordre du plateau). */
export function authorLabel(group: StoryPlaybackGroup): string {
  const a = group.author;
  if (a === undefined) return '';
  if (group.isMine) return 'Votre story';
  const fullName = [a.firstName, a.lastName].filter((part) => part !== undefined && part !== '').join(' ');
  return a.displayName ?? (fullName !== '' ? fullName : (a.username ?? ''));
}

/* L'IDENTITÉ DE L'AUTEUR — la photo (#6975, même source et même loi que la
   tuile du rail qui a ouvert ce lecteur : passer d'un visage à des initiales
   en ouvrant la story serait un changement d'identité à mi-geste) et l'heure
   SUR SA LIGNE (`StoryViewerView+Header.swift:156-256`, elle qualifie
   l'auteur). L'identité MÈNE AU PROFIL (#7241) — mais PAS sur sa propre
   story : la fiche de soi n'offre aucun geste relationnel. Le CRÉDIT d'une
   republication (#10524) suit la date, jamais dans le canvas, comme
   `StoryViewerView+Header.swift`. */
export function storyViewerIdentity(params: {
  readonly group: StoryPlaybackGroup | undefined;
  readonly story: StoryPlaybackStory | undefined;
  readonly language: InterfaceLanguage;
}): ViewerIdentityModel | null {
  const { group, story, language } = params;
  if (group === undefined || story === undefined) return null;
  const name = authorLabel(group);
  const avatarSrc = participantAvatarOf(group.author);
  const username = group.author?.username;
  const repostCredit = storyRepostCredit(story);
  return {
    name,
    initials: initialsOf(name),
    ...(avatarSrc === undefined ? {} : { avatarSrc }),
    ...(!group.isMine && typeof username === 'string' && username !== '' ? { profileUsername: username } : {}),
    ...(group.isMine ? {} : { presenceKey: group.authorId }),
    ...ringRefOf(group.author),
    time: {
      iso: new Date(story.createdAt).toISOString(),
      label: shortRelativeTime(new Date(story.createdAt), new Date(), language),
    },
    ...(repostCredit === null
      ? {}
      : {
          repost: {
            handle: repostCredit.handle,
            label: repostCredit.handle === null
              ? translate(language, 'story.viewer.repost')
              : translate(language, 'story.viewer.repostOf', { handle: repostCredit.handle }),
          },
        }),
  };
}
