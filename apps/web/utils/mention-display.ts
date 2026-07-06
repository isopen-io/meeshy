import type { MentionedUser } from '@meeshy/shared/types/mention';
import { MENTION_HANDLE_CHARS } from '@meeshy/shared/utils/mention-parser';

// Handle @username : lettres/chiffres/underscore/tiret (SSOT MENTION_HANDLE_CHARS) — `\w` seul
// tronquait le rendu de `@marie-claire` en `marie`.
const MENTION_DISPLAY_REGEX = new RegExp(`@([${MENTION_HANDLE_CHARS}]{1,30})`, 'g');

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
