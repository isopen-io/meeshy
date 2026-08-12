/**
 * Génération d'un handle (`username`) automatique pour un participant anonyme
 * quand aucun username n'est fourni à la jonction d'une conversation.
 *
 * Le username est contraint ASCII par tout le système
 * (`SecuritySanitizer.sanitizeUsername` ne conserve que `[a-zA-Z0-9_.-]`), donc
 * on replie d'abord les accents latins (`NFD` + strip des marques `\p{M}` :
 * `José` → `jose`, `Renée` → `renee`) avant de ne garder que `[a-z]` — sinon
 * `é`/`ñ` étaient supprimés purement et simplement (`José` → `jos`).
 *
 * Un nom entièrement non-latin (cyrillique, arabe, CJK) se réduit à vide après
 * repliement ASCII : on retombe alors sur une base neutre `user` pour ne JAMAIS
 * produire un handle dégénéré (`_437`), qui restait le seul identifiant visible
 * du participant. Même root cause que la normalisation de `name-similarity.ts`.
 */

const asciiFold = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z]/g, '');

const FALLBACK_BASE = 'user';

export function generateNickname(firstName: string, lastName: string): string {
  const base = asciiFold(firstName) || FALLBACK_BASE;
  const lastNameInitials = asciiFold(lastName).slice(0, 2);
  const randomSuffix = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `${base}_${lastNameInitials}${randomSuffix}`;
}
