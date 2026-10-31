import { authorAccentColor } from '@meeshy/shared/utils/conversation-colors';

import type { StoryPlaybackAuthor } from '@/lib/stories/playback';

import type { BrandingAuthor } from './scene-export-branding-identity';

/**
 * **L'AUTEUR D'UNE STORY EXPORTÉE** (#13997) — lu sur la charge que le serveur
 * a SERVIE (`storyAuthorSelect` : nom, avatar, bannière, présence déjà
 * filtrée par la loi de visibilité) et sur ce que le web détient déjà autour
 * (le lecteur connecté, l'humeur de l'auteur). Rien n'est décidé ici : une
 * présence non servie reste `null`.
 */

export type StoryBrandingContext = {
  /** Le lecteur connecté : s'il est l'auteur, c'est SA story. */
  readonly viewerId?: string | null;
  /** L'humeur courante de l'auteur (`Post.moodEmoji` + son mot), telle que le web la détient. */
  readonly mood?: { readonly emoji: string; readonly message?: string | null } | null;
};

const trimmed = (value: string | null | undefined): string => (typeof value === 'string' ? value.trim() : '');

function presenceOf(author: StoryPlaybackAuthor): BrandingAuthor['presence'] {
  const hasOnline = typeof author.isOnline === 'boolean';
  const hasActive = author.lastActiveAt !== null && author.lastActiveAt !== undefined;
  if (!hasOnline && !hasActive) return null;
  return { isOnline: hasOnline ? (author.isOnline ?? null) : null, lastActiveAt: hasActive ? (author.lastActiveAt ?? null) : null };
}

const nameOf = (author: StoryPlaybackAuthor): string => {
  const display = trimmed(author.displayName);
  if (display !== '') return display;
  const full = [trimmed(author.firstName), trimmed(author.lastName)].filter((part) => part !== '').join(' ');
  return full !== '' ? full : trimmed(author.username);
};

export function brandingAuthorOf(params: { readonly author: StoryPlaybackAuthor | undefined; readonly context: StoryBrandingContext }): BrandingAuthor | null {
  const { author, context } = params;
  if (author === undefined) return null;
  const displayName = nameOf(author);
  if (displayName === '') return null;
  const username = trimmed(author.username);
  const banner = trimmed(author.banner);
  const avatar = trimmed(author.avatar);
  return {
    authorId: author.id,
    displayName,
    username: username === '' ? displayName : username,
    avatarSrc: avatar === '' ? null : avatar,
    bannerSrc: banner === '' ? null : banner,
    accentHex: authorAccentColor(author.id, displayName).replace('#', ''),
    moodEmoji: context.mood?.emoji ?? null,
    moodMessage: context.mood?.message ?? null,
    presence: presenceOf(author),
    self: typeof context.viewerId === 'string' && context.viewerId === author.id,
  };
}
