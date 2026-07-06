export interface MentionParticipant {
  readonly userId: string;
  readonly username: string;
  readonly displayName: string;
}

const NAME_BOUNDARY_LEFT = '(?<![\\p{L}\\p{N}_])';
const NAME_BOUNDARY_RIGHT = '(?![\\p{L}\\p{N}_])';

/**
 * Parse les mentions dans un message.
 *
 * Priorité :
 * 1. @DisplayName → résolution exacte sur les participants (insensible casse, plus long en premier).
 *    Frontières Unicode gauche+droite : `@Marie` ne matche PAS `@Marienne` ni `contact@Marie.com`.
 * 2. @username → résolution par username sur les participants (regex `\w{1,30}`, frontière gauche
 *    pour ignorer les `@` internes d'adresses e-mail).
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
      if (!p.displayName) continue;
      const pattern = `${NAME_BOUNDARY_LEFT}@${escapeRegex(p.displayName)}${NAME_BOUNDARY_RIGHT}`;
      const regex = new RegExp(pattern, 'giu');
      if (regex.test(remaining)) {
        resolved.add(p.userId);
        remaining = remaining.replace(new RegExp(pattern, 'giu'), '');
      }
    }
  }

  const handleRegex = /(?<![\w])@(\w{1,30})/g;
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
