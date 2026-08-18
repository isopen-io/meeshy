/**
 * Pseudos des participants SANS COMPTE : préfixe `ano_` et glyphe fantôme.
 *
 * Un anonyme et un inscrit se partageaient le même espace de pseudos. La
 * jonction par lien interrogeait donc `User.username` pour savoir si le pseudo
 * demandé était libre, et rendait 409 sinon — un refus sans recours pour
 * quelqu'un dont ce lien est la seule porte d'entrée.
 *
 * Deux mécanismes le remplacent, et ils ne jouent PAS le même rôle :
 *
 *   - `ano_` préfixe le pseudo. Il rend les homonymies improbables et lisibles,
 *     mais il n'est **pas réservé** : un compte peut parfaitement s'appeler
 *     `ano_bob`. Interdire le préfixe aux inscrits aurait échangé une collision
 *     contre un refus d'inscription incompréhensible, pour une désambiguïsation
 *     que le point suivant assure déjà.
 *
 *   - Le GLYPHE FANTÔME est la marque qui dit « sans compte », et il est la
 *     seule autorité sur ce point. Il s'affiche devant le nom ET le pseudo,
 *     partout. Un `ano_bob` inscrit ne le porte pas ; un anonyme le porte
 *     toujours, quel que soit son pseudo.
 *
 * Le glyphe n'est jamais STOCKÉ dans `displayName` ni dans le profil — il est
 * apposé au rendu. Le persister le ferait entrer dans les recherches, les
 * mentions et les comparaisons de pseudo, où il n'a rien à faire.
 */

export const ANONYMOUS_USERNAME_PREFIX = 'ano_';

/** Alphabet des pseudos — miroir de `SecuritySanitizer.sanitizeUsername`. */
const USERNAME_ALPHABET = /[^a-zA-Z0-9_.-]/g;

/** Borne partagée avec `SecuritySanitizer.sanitizeUsername`. */
export const USERNAME_MAX_LENGTH = 50;

const FALLBACK_BASE = 'user';

/**
 * `true` si le pseudo appartient à l'espace réservé. Le préfixe SEUL ne nomme
 * personne et ne compte donc pas.
 */
export function isAnonymousUsername(username: string | null | undefined): boolean {
  if (!username) return false;
  const lower = username.toLowerCase();
  return lower.startsWith(ANONYMOUS_USERNAME_PREFIX) && username.length > ANONYMOUS_USERNAME_PREFIX.length;
}

/** Retire le préfixe s'il est présent, quelle que soit sa casse. */
function stripPrefix(username: string): string {
  return username.toLowerCase().startsWith(ANONYMOUS_USERNAME_PREFIX)
    ? username.slice(ANONYMOUS_USERNAME_PREFIX.length)
    : username;
}

/**
 * Place un pseudo dans l'espace réservé. Idempotent : un pseudo déjà préfixé
 * ressort inchangé plutôt qu'en `ano_ano_…`.
 */
export function toAnonymousUsername(base: string | null | undefined): string {
  const cleaned = (base ?? '').replace(USERNAME_ALPHABET, '').trim();
  const body = stripPrefix(cleaned) || FALLBACK_BASE;
  const room = USERNAME_MAX_LENGTH - ANONYMOUS_USERNAME_PREFIX.length;

  return `${ANONYMOUS_USERNAME_PREFIX}${body.slice(0, room)}`;
}

/**
 * Glyphe des participants sans compte. Marqueur de RENDU : jamais persisté,
 * jamais comparé, jamais indexé.
 */
export const ANONYMOUS_GLYPH = '👻';

/**
 * Appose le glyphe devant un nom ou un pseudo à l'affichage. Idempotent — une
 * vue qui compose deux helpers ne doit pas produire deux fantômes.
 */
export function withAnonymousGlyph(label: string | null | undefined): string {
  const text = (label ?? '').trim();
  if (!text) return ANONYMOUS_GLYPH;
  return text.startsWith(ANONYMOUS_GLYPH) ? text : `${ANONYMOUS_GLYPH} ${text}`;
}

/**
 * Le nom à AFFICHER pour un participant, glyphe compris quand il n'a pas de
 * compte. Point d'entrée unique des vues : `isAnonymous` décide, jamais le
 * pseudo — un compte nommé `ano_bob` ne porte pas le glyphe.
 */
export function displayNameForParticipant(
  label: string | null | undefined,
  isAnonymous: boolean
): string {
  const text = (label ?? '').trim();
  return isAnonymous ? withAnonymousGlyph(text) : text;
}

/**
 * Ajoute un rang de désambiguïsation. C'est la BASE qui est rognée quand la
 * place manque, jamais le suffixe : deux pseudos tronqués au même endroit
 * seraient de nouveau identiques, ce que le rang existe précisément pour éviter.
 */
export function suffixAnonymousUsername(username: string, rank: number): string {
  const suffix = String(rank);
  const body = stripPrefix(username.replace(USERNAME_ALPHABET, ''));
  const room = USERNAME_MAX_LENGTH - ANONYMOUS_USERNAME_PREFIX.length - suffix.length;

  return `${ANONYMOUS_USERNAME_PREFIX}${body.slice(0, Math.max(0, room))}${suffix}`;
}
