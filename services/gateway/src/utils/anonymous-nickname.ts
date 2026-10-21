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

import { suffixAnonymousUsername, toAnonymousUsername } from '@meeshy/shared/utils/anonymous-username';

import { GUEST_NICKNAME_ADJECTIVES, GUEST_NICKNAME_NOUNS } from './anonymous-nickname-words';

const asciiFold = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z]/g, '');

const FALLBACK_BASE = 'user';

/**
 * Le nombre qui termine TOUT pseudo anonyme (#10602, directive porteur
 * 2026-10-14) : 2 à 5 chiffres, sans zéro de tête. Il laisse d'autres
 * personnes, ou la même qui revient, choisir le même nom sans être refusées.
 */
export const NICKNAME_NUMBER_MIN = 10;
export const NICKNAME_NUMBER_MAX_EXCLUSIVE = 100_000;

const nicknameNumber = (): number => randomInt(NICKNAME_NUMBER_MIN, NICKNAME_NUMBER_MAX_EXCLUSIVE);

const nameBase = (firstName: string, lastName: string): string =>
  `${asciiFold(firstName) || FALLBACK_BASE}_${asciiFold(lastName).slice(0, 2)}`;

const pick = (words: readonly string[]): string => words[randomInt(words.length)] ?? FALLBACK_BASE;

const guestBase = (): string => `${pick(GUEST_NICKNAME_ADJECTIVES)}${pick(GUEST_NICKNAME_NOUNS)}`;

export function generateNickname(firstName: string, lastName: string): string {
  return `${nameBase(firstName, lastName)}${nicknameNumber()}`;
}

/**
 * Le pseudo d'un invité qui n'a RIEN saisi (directive porteur 2026-10-13) :
 * « Continuer sans compte » ne se refuse plus sur un champ vide que beaucoup
 * ne voyaient pas — la passerelle nomme l'invité elle-même. Un adjectif, un nom
 * (plus de 100 000 couples, `anonymous-nickname-words.ts`) puis un nombre de
 * 2 à 5 chiffres : `BraveOtter4821`.
 */
export function generateGuestNickname(): string {
  return `${guestBase()}${nicknameNumber()}`;
}

/** La base d'un pseudo automatique, SANS son nombre : tirée du nom s'il y en a un, générée sinon. */
export function automaticNicknameBase(firstName: string, lastName: string): string {
  return firstName.trim() === '' && lastName.trim() === '' ? guestBase() : nameBase(firstName, lastName);
}

/** Le pseudo automatique d'un invité : tiré de son nom s'il en a donné un, généré sinon. */
export function automaticNickname(firstName: string, lastName: string): string {
  return `${automaticNicknameBase(firstName, lastName)}${nicknameNumber()}`;
}

/**
 * Le pseudo FINAL d'un participant sans compte, saisi comme automatique : la
 * base placée dans l'espace `ano_`, terminée par un nombre tiré à chaque appel.
 * Quand la place manque, c'est la base qui est rognée, jamais le nombre
 * (`suffixAnonymousUsername`). Site UNIQUE de la règle (#10602).
 */
export function numberedAnonymousUsername(base: string): string {
  return suffixAnonymousUsername(toAnonymousUsername(base), nicknameNumber());
}
