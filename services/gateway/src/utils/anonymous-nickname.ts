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

import { randomInt } from 'node:crypto';

import { GUEST_NICKNAME_ADJECTIVES, GUEST_NICKNAME_NOUNS } from './anonymous-nickname-words';

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

const pick = (words: readonly string[]): string => words[randomInt(words.length)] ?? FALLBACK_BASE;

/**
 * Le pseudo d'un invité qui n'a RIEN saisi (directive porteur 2026-10-13) :
 * « Continuer sans compte » ne se refuse plus sur un champ vide que beaucoup
 * ne voyaient pas — la passerelle nomme l'invité elle-même. Un adjectif, un nom
 * (plus de 100 000 couples, `anonymous-nickname-words.ts`) puis un nombre de
 * 3 à 5 chiffres : `BraveOtter4821`.
 */
export function generateGuestNickname(): string {
  return `${pick(GUEST_NICKNAME_ADJECTIVES)}${pick(GUEST_NICKNAME_NOUNS)}${randomInt(100, 100_000)}`;
}

/** Le pseudo automatique d'un invité : tiré de son nom s'il en a donné un, généré sinon. */
export function automaticNickname(firstName: string, lastName: string): string {
  return firstName.trim() === '' && lastName.trim() === ''
    ? generateGuestNickname()
    : generateNickname(firstName, lastName);
}
