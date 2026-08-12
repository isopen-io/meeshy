import type { MentionedUser } from '@meeshy/shared/types/mention';
import { MENTION_HANDLE_CHARS, NAME_BOUNDARY_LEFT } from '@meeshy/shared/utils/mention-parser';

// Handle @username : lettres/chiffres/underscore/tiret (SSOT MENTION_HANDLE_CHARS) — `\w` seul
// tronquait le rendu de `@marie-claire` en `marie`.
// Frontière gauche `NAME_BOUNDARY_LEFT` (SSOT `parseMentions`) : un `@` collé après un mot
// appartient à une adresse e-mail (`bob@alice.com`) et ne doit PAS être réécrit en display name.
// Flag `u` requis (classes `\p{...}`).
const MENTION_DISPLAY_REGEX = new RegExp(`${NAME_BOUNDARY_LEFT}@([${MENTION_HANDLE_CHARS}]{1,30})`, 'gu');

export function buildMentionDisplayMap(mentionedUsers: readonly MentionedUser[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const u of mentionedUsers) {
    if (u.displayName && u.displayName !== u.username) {
      map.set(u.username.toLowerCase(), u.displayName);
    }
  }
  return map;
}

export function resolveDisplayContent(content: string, displayMap: Map<string, string>): string {
  return content.replace(MENTION_DISPLAY_REGEX, (match, username) => {
    const displayName = displayMap.get(username.toLowerCase());
    return displayName ? `@${displayName}` : match;
  });
}
