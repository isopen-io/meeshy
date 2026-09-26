/**
 * Les propositions de mot de passe d'un administrateur pour un membre (#8051)
 * — QUATRE niveaux, du plus lisible au plus sûr, et UN seul site qui les
 * compose.
 *
 * | niveau | forme | exemple |
 * |---|---|---|
 * | `simple` | le pseudo (6 lettres au plus) + 3 chiffres | `alice482` |
 * | `easy` | le pseudo capitalisé + `-` + 4 chiffres + 1 symbole | `Alice-4821!` |
 * | `medium` | le pseudo capitalisé + `.` + 4 alphanumériques + 1 symbole + 4 chiffres | `Alice.k7Qm!4821` |
 * | `hard` | 20 caractères aléatoires, sans lien avec le pseudo | `Xq4!mR9…` |
 *
 * ## Pourquoi c'est la passerelle qui compose
 *
 * La robustesse d'un mot de passe est jugée par `validatePasswordStrength`
 * (`zxcvbn`, paliers proportionnels à la longueur), et cette politique n'a
 * qu'UN site. Un secret composé côté client à partir du pseudo pourrait être
 * refusé APRÈS l'aller-retour — exactement le cas que la feuille web
 * s'interdit (le secret s'affiche AVANT d'être appliqué, pour être transmis).
 * Ici, chaque tirage est passé au juge avant d'être servi : ce qui s'affiche
 * ne peut plus être refusé.
 *
 * ## Un pseudo qui ne se laisse pas juger acceptable
 *
 * `password`, `admin`, `azerty`… : quelques bases rendent le niveau `simple`
 * impossible à tenir. Après {@link DRAWS_PER_LEVEL} tirages refusés, on monte
 * d'un niveau (la forme suivante, plus riche), jusqu'au tirage aléatoire qui
 * passe toujours. Le résultat reste un mot de passe SERVI, jamais une erreur.
 *
 * ## Sans `O`, `0`, `l`, `1` ni `I`
 *
 * Un secret se recopie, se dicte, se lit à voix haute. Un caractère confondu
 * se solde par une seconde réinitialisation, donc un second secret en
 * circulation. Même alphabet que l'ancien tirage de la feuille web (#6819).
 */
import { randomInt } from 'node:crypto';
import {
  PASSWORD_PROPOSAL_LEVELS,
  type PasswordProposalLevel,
  type PasswordProposals,
} from '@meeshy/shared/types/admin-password-proposal';
import { validatePasswordStrength } from './password-strength';

export type PasswordProposalSource = {
  readonly username?: string | null;
  readonly displayName?: string | null;
  readonly firstName?: string | null;
};

/** Un entier uniforme dans `[0, max)` — `crypto.randomInt` par défaut, sans biais de modulo. */
export type RandomBelow = (max: number) => number;

export type PasswordAcceptance = (password: string) => boolean;

type ProposalOptions = {
  readonly source: PasswordProposalSource;
  readonly random?: RandomBelow;
  readonly accept?: PasswordAcceptance;
};

const DIGITS = '23456789';
const ALPHANUMERIC = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const SYMBOLS = '!?#*';
const HARD_ALPHABET = `${ALPHANUMERIC}!@#$%^&*_+=?-`;

export const HARD_PASSWORD_LENGTH = 20;
export const DRAWS_PER_LEVEL = 16;
const HARD_DRAWS_CEILING = 64;
const MIN_BASE_LENGTH = 3;
const FALLBACK_BASE = 'meeshy';

const acceptedByPolicy: PasswordAcceptance = (password) => validatePasswordStrength(password).isValid;

const asciiWord = (value: string | null | undefined): string =>
  (value ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

/**
 * Le mot de base — pseudo, puis nom affiché, puis prénom — réduit à
 * `[a-z0-9]` : « Élodie Durand » devient `elodiedurand`. En dessous de trois
 * caractères utiles, la base ne dit rien de la personne et `meeshy` la remplace.
 */
export function passwordBaseOf(source: PasswordProposalSource): string {
  const candidates = [source.username, source.displayName, source.firstName].map(asciiWord);
  return candidates.find((candidate) => candidate.length >= MIN_BASE_LENGTH) ?? FALLBACK_BASE;
}

const draw = (alphabet: string, length: number, random: RandomBelow): string =>
  Array.from({ length }, () => alphabet[random(alphabet.length)] ?? alphabet[0]!).join('');

const capitalized = (word: string): string => `${word.charAt(0).toUpperCase()}${word.slice(1)}`;

const SHAPES: Readonly<Record<PasswordProposalLevel, (base: string, random: RandomBelow) => string>> = {
  simple: (base, random) => `${base.slice(0, 6)}${draw(DIGITS, 3, random)}`,
  easy: (base, random) => `${capitalized(base.slice(0, 8))}-${draw(DIGITS, 4, random)}${draw(SYMBOLS, 1, random)}`,
  medium: (base, random) =>
    `${capitalized(base.slice(0, 8))}.${draw(ALPHANUMERIC, 4, random)}${draw(SYMBOLS, 1, random)}${draw(DIGITS, 4, random)}`,
  hard: (_base, random) => draw(HARD_ALPHABET, HARD_PASSWORD_LENGTH, random),
};

const firstAccepted = (
  level: PasswordProposalLevel,
  base: string,
  random: RandomBelow,
  accept: PasswordAcceptance,
  draws: number,
): string | null => {
  for (let attempt = 0; attempt < draws; attempt += 1) {
    const candidate = SHAPES[level](base, random);
    if (accept(candidate)) return candidate;
  }
  return null;
};

/**
 * Un secret du niveau demandé, DÉJÀ accepté par la politique de robustesse.
 * Un niveau que la base rend intenable monte d'un cran ; le dernier cran est
 * aléatoire et passe toujours.
 */
export function proposePassword(level: PasswordProposalLevel, options: ProposalOptions): string {
  const base = passwordBaseOf(options.source);
  const random = options.random ?? randomInt;
  const accept = options.accept ?? acceptedByPolicy;
  const startIndex = PASSWORD_PROPOSAL_LEVELS.indexOf(level);

  for (const candidateLevel of PASSWORD_PROPOSAL_LEVELS.slice(startIndex)) {
    const draws = candidateLevel === 'hard' ? HARD_DRAWS_CEILING : DRAWS_PER_LEVEL;
    const accepted = firstAccepted(candidateLevel, base, random, accept, draws);
    if (accepted !== null) return accepted;
  }

  throw new Error('No password proposal accepted by the strength policy');
}

/** Les quatre niveaux d'un coup — ce que la route sert à la feuille web. */
export function proposePasswords(options: ProposalOptions): PasswordProposals {
  return {
    simple: proposePassword('simple', options),
    easy: proposePassword('easy', options),
    medium: proposePassword('medium', options),
    hard: proposePassword('hard', options),
  };
}
