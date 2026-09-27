/**
 * Les propositions de mot de passe d'un administrateur pour un membre (#8051)
 * — QUATRE niveaux, du plus lisible au plus sûr, et UN seul site qui les
 * compose.
 *
 * | niveau | forme | exemple |
 * |---|---|---|
 * | `simple` | lettres voisines au clavier OU le pseudo, parfois une lettre doublée, 4 chiffres proches ou répétés, parfois un symbole | `AA4545zert`, `defi2334@` |
 * | `easy` | le pseudo capitalisé + `-` + 4 chiffres + 1 symbole | `Alice-4821!` |
 * | `medium` | le pseudo capitalisé + `.` + 4 alphanumériques + 1 symbole + 4 chiffres | `Alice.k7Qm!4821` |
 * | `hard` | 20 caractères aléatoires, sans lien avec le pseudo | `Xq4!mR9…` |
 *
 * ## Le niveau simple se tape sans se deviner (#8192)
 *
 * Décision porteur : « simple » se complète de chiffres, et le pseudo n'y
 * entre que PARFOIS. L'ancienne forme (pseudo + 3 chiffres) ne laissait que
 * 512 secrets possibles à qui connaît le pseudo, qui est public. La forme
 * actuelle assemble des morceaux faciles à taper — une suite de touches
 * voisines (`zert`, `qsdf`), une lettre doublée (`AA`), des chiffres proches
 * ou répétés (`4545`, `2334`, `3456`), un symbole — dont le TIRAGE et l'ORDRE
 * sont aléatoires : quelques millions de secrets possibles.
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
const SIMPLE_SYMBOLS = '!?#*@';
const PAIR_LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz';
const PSEUDO_ODDS = 3;

const KEYBOARD_ROWS = ['azertyuiop', 'qsdfghjkm', 'wxcvbn', 'qwertyuiop', 'asdfghjk', 'zxcvbnm'];
const KEYBOARD_RUN_LENGTH = 4;
const KEYBOARD_RUNS: readonly string[] = [
  ...new Set(
    KEYBOARD_ROWS.flatMap((row) =>
      Array.from({ length: row.length - KEYBOARD_RUN_LENGTH + 1 }, (_, start) => row.slice(start, start + KEYBOARD_RUN_LENGTH)),
    ),
  ),
];

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

const pick = <T>(choices: readonly T[], random: RandomBelow): T => choices[random(choices.length)] ?? choices[0]!;

const coin = (random: RandomBelow): boolean => random(2) === 0;

const DIGIT_PATTERNS: ReadonlyArray<(random: RandomBelow) => readonly number[]> = [
  (random) => {
    const [a, b] = [2 + random(8), 2 + random(8)];
    return [a, b, a, b];
  },
  (random) => {
    const [a, b] = [2 + random(8), 2 + random(8)];
    return [a, a, b, b];
  },
  (random) => {
    const a = 2 + random(6);
    return [a, a + 1, a + 1, a + 2];
  },
  (random) => {
    const a = 2 + random(5);
    return [a, a + 1, a + 2, a + 3];
  },
];

const nearDigits = (random: RandomBelow): string => pick(DIGIT_PATTERNS, random)(random).join('');

const simpleWord = (base: string, random: RandomBelow): string => {
  const word = random(PSEUDO_ODDS) === 0 ? base.slice(0, 6) : pick(KEYBOARD_RUNS, random);
  return coin(random) ? capitalized(word) : word;
};

const doubledLetter = (random: RandomBelow): string => pick([...PAIR_LETTERS], random).repeat(2);

const simpleShape = (base: string, random: RandomBelow): string => {
  const word = simpleWord(base, random);
  const digits = nearDigits(random);
  const pair = coin(random) ? doubledLetter(random) : '';
  const symbol = coin(random) ? pick([...SIMPLE_SYMBOLS], random) : '';
  const orders = [`${word}${pair}${digits}`, `${pair}${digits}${word}`, `${digits}${word}${pair}`];
  return `${pick(orders, random)}${symbol}`;
};

const SHAPES: Readonly<Record<PasswordProposalLevel, (base: string, random: RandomBelow) => string>> = {
  simple: simpleShape,
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
