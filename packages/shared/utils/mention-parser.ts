export interface MentionParticipant {
  readonly userId: string;
  readonly username: string;
  readonly displayName: string;
}

// Classe de caractères d'un handle @username (ASCII). Source de vérité unique, alignée sur la
// regex de validation username (`register`/`change-username` : /^[a-zA-Z0-9_-]+$/) : lettres,
// chiffres, underscore ET tiret. `\w` seul manquait le tiret, tronquant `@marie-claire` en
// `marie` — l'utilisateur n'était jamais résolu ni notifié.
export const MENTION_HANDLE_CHARS = '\\w-';

// Classe de caractères d'un nom : lettre/chiffre/underscore/tiret Unicode. Source de vérité unique
// pour les frontières de mention, pour `hasMentions`, ET pour la capture du handle brut de
// `parseMentions` (mode sans participants) — un seul jeu de caractères, zéro drift : ce que
// `hasMentions` signale, le fallback brut l'extrait.
// Le tiret en fait partie : usernames ET displayNames l'autorisent (`Ann-Marie`), donc `@marie`
// ne doit PAS matcher dans `@marie-claire` (frontière droite), et `@marie-claire` est un seul token.
const NAME_CHAR = '[\\p{L}\\p{N}_-]';
// Frontière gauche Unicode — source de vérité unique pour TOUS les chemins de mention
// (`parseMentions`, `hasMentions`, et les helpers de `types/mention.ts` : `extractMentions`,
// `mentionsToLinks`, `MENTION_REGEX`). Un `@` précédé d'un caractère de nom appartient à une
// adresse e-mail (`contact@marie.com`) et n'est PAS une mention. Exportée pour éviter tout drift.
// Requiert le flag `u` sur la regex qui l'utilise (classes `\p{...}`).
export const NAME_BOUNDARY_LEFT = `(?<!${NAME_CHAR})`;
const NAME_BOUNDARY_RIGHT = `(?!${NAME_CHAR})`;

/**
 * Parse les mentions dans un message.
 *
 * Priorité :
 * 1. @DisplayName → résolution exacte sur les participants (insensible casse, plus long en premier).
 *    Frontières Unicode gauche+droite : `@Marie` ne matche PAS `@Marienne` ni `contact@Marie.com`.
 * 2. @username → résolution par username sur les participants (regex `[\w-]{1,30}`, même frontière
 *    gauche Unicode `NAME_BOUNDARY_LEFT` que le path @DisplayName pour ignorer les `@` internes
 *    d'adresses e-mail, y compris après une lettre accentuée/non-latine ; le tiret est capturé pour
 *    résoudre les usernames à tiret type `@marie-claire`).
 * 3. Sans participants → retourne les handles bruts ("@alice"), mode participant-agnostique.
 *    Le handle brut est capturé avec `NAME_CHAR` (Unicode) — la MÊME classe que {@link hasMentions} —
 *    et NON `MENTION_HANDLE_CHARS` (ASCII, aligné sur la validation username). C'est l'invariant
 *    « zéro drift » : sans participants, un `@Владимир` / `@Éric` signalé par `hasMentions` DOIT
 *    être extrait ici. La résolution par username (cas 2) reste en ASCII car un username est
 *    toujours ASCII — un handle non-latin ne matche donc jamais un username et n'est pertinent
 *    que comme handle brut.
 */
export function parseMentions(
  content: string,
  participants: readonly MentionParticipant[]
): string[] {
  if (!content) return [];

  // Cas 3 — mode participant-agnostique : extraction de handles bruts alignée
  // sur `hasMentions` (NAME_CHAR Unicode) pour ne jamais signaler une mention
  // qu'on n'extrait pas.
  if (participants.length === 0) {
    const rawRegex = new RegExp(`${NAME_BOUNDARY_LEFT}@(${NAME_CHAR}{1,30})`, 'gu');
    const raw = new Set<string>();
    for (const match of content.matchAll(rawRegex)) {
      raw.add(match[0]);
    }
    return [...raw];
  }

  const resolved = new Set<string>();

  const sorted = [...participants].sort(
    (a, b) => b.displayName.length - a.displayName.length
  );

  let remaining = content;

  for (const p of sorted) {
    if (!p.displayName) continue;
    const pattern = `${NAME_BOUNDARY_LEFT}@${escapeRegex(p.displayName)}${NAME_BOUNDARY_RIGHT}`;
    const regex = new RegExp(pattern, 'giu');
    if (regex.test(remaining)) {
      resolved.add(p.userId);
      remaining = remaining.replace(new RegExp(pattern, 'giu'), '');
    }
  }

  const handleRegex = new RegExp(`${NAME_BOUNDARY_LEFT}@([${MENTION_HANDLE_CHARS}]{1,30})`, 'gu');
  for (const match of remaining.matchAll(handleRegex)) {
    const rawHandle = match[1];
    if (rawHandle === undefined) continue;
    const handle = rawHandle.toLowerCase();
    const found = sorted.find((p) => p.username.toLowerCase() === handle);
    if (found) {
      resolved.add(found.userId);
    }
  }

  return [...resolved];
}

/**
 * Vérifie si un texte contient au moins une mention (@).
 *
 * Unicode-aware (frontière `\p{L}\p{N}_`) pour rester cohérent avec la détection de
 * `@DisplayName` de `parseMentions` : un `@Éric` / `@André` / `@Владимир` est bien reconnu,
 * là où l'ancien `/@\w/` ASCII les manquait. Un `@` suivi d'un espace (adresse e-mail
 * `test@ domain`) n'est PAS une mention.
 *
 * `NAME_BOUNDARY_LEFT` — même frontière gauche que les DEUX chemins de
 * `parseMentions` (@DisplayName ligne 50, @username ligne 59) : un `@` précédé
 * d'un caractère de nom appartient à une adresse e-mail (`contact@marie.com`) et
 * n'est PAS une mention. Sans ce lookbehind, `hasMentions` signalait une mention
 * que `parseMentions` ne résout jamais — un drift que le docstring interdit.
 */
export function hasMentions(content: string): boolean {
  return new RegExp(`${NAME_BOUNDARY_LEFT}@${NAME_CHAR}`, 'u').test(content);
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
