import type { MentionedUser } from '@meeshy/shared/types/mention';

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
  return content.replace(/@(\w{1,30})/g, (match, username) => {
    const displayName = displayMap.get(username.toLowerCase());
    return displayName ? `@${displayName}` : match;
  });
}
