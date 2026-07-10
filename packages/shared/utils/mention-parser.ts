export interface MentionParticipant {
  readonly userId: string;
  readonly username: string;
  readonly displayName: string;
}

/**
 * Parse les mentions dans un message.
 *
 * Priorité :
 * 1. @DisplayName → résolution exacte sur les participants (insensible casse, plus long en premier)
 * 2. @username → résolution par username sur les participants (regex \w+)
 * 3. Sans participants → retourne les handles bruts ("@alice")
 */
export function parseMentions(
  content: string,
  participants: readonly MentionParticipant[]
): string[] {
  if (!content) return [];

  const resolved = new Set<string>();

  const sorted = [...participants].sort(
    (a, b) => b.displayName.length - a.displayName.length
  );

  let remaining = content;

  if (sorted.length > 0) {
    for (const p of sorted) {
      const escaped = escapeRegex(p.displayName);
      const regex = new RegExp(`@${escaped}`, 'gi');
      if (regex.test(remaining)) {
        resolved.add(p.userId);
        remaining = remaining.replace(new RegExp(`@${escaped}`, 'gi'), '');
      }
    }
  }

  const handleRegex = /@(\w{1,30})/g;
  for (const match of remaining.matchAll(handleRegex)) {
    const rawHandle = match[1];
    if (rawHandle === undefined) continue;
    const handle = rawHandle.toLowerCase();
    const found = sorted.find((p) => p.username.toLowerCase() === handle);
    if (found) {
      resolved.add(found.userId);
    } else if (participants.length === 0) {
      resolved.add(match[0]);
    }
  }

  return [...resolved];
}

/**
 * Vérifie si un texte contient au moins une mention (@)
 */
export function hasMentions(content: string): boolean {
  return /@\w/.test(content);
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
