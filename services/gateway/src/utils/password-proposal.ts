/**
 * Les propositions de mot de passe d'un administrateur pour un membre (#8051)
 * — QUATRE niveaux, du plus lisible au plus sûr, et UN seul site qui les
 * compose.
 *
 * | niveau | longueur | forme | exemples |
 * |---|---|---|---|
 * | `simple` | 6 | 4 lettres + 2 chiffres, ou lettre doublée + 4 chiffres | `zert34`, `AA4545` |
 * | `easy` | 8 | 4 lettres + 4 chiffres, 4 lettres + lettre doublée + 2 chiffres, ou 4 lettres + 3 chiffres + symbole | `qsdf2334`, `KKYuio55`, `alic345@` |
 * | `medium` | 12 | 4 lettres capitalisées + `.` + 3 alphanumériques + 1 symbole + 3 chiffres | `Zert.k7Q!482` |
 * | `hard` | 16 | aléatoire, sans lien avec le pseudo | `Xq4!mR9…` |
 *
 * Les « 4 lettres » sont une suite de touches voisines au clavier (`zert`,
 * `qsdf`) ou, une fois sur trois, le début du pseudo ; les chiffres sont
 * voisins ou répétés ; l'ordre des morceaux est tiré au hasard.
 *
 * ## Faciles à taper, sans se deviner depuis le pseudo (#8192, #8220)
 *
 * Décisions porteur du 2026-09-27 : les niveaux se complètent de chiffres, le
 * pseudo n'y entre que PARFOIS, et chaque niveau a sa longueur — 6, 8, 12,
 * 16. L'ancienne forme (pseudo + 3 ou 4 chiffres) ne laissait que 512 ou
 * 16 384 secrets à qui connaît le pseudo, qui est public. Le tirage des
 * morceaux ET de leur ordre élargit l'espace, dans la limite de ce qu'une
 * longueur de 6 permet.
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
const WORD_LENGTH = 4;

const KEYBOARD_ROWS = ['azertyuiop', 'qsdfghjkm', 'wxcvbn', 'qwertyuiop', 'asdfghjk', 'zxcvbnm'];
const KEYBOARD_RUNS: readonly string[] = [
  ...new Set(
    KEYBOARD_ROWS.flatMap((row) =>
      Array.from({ length: row.length - WORD_LENGTH + 1 }, (_, start) => row.slice(start, start + WORD_LENGTH)),
    ),
  ),
];

/** La longueur EXACTE de chaque niveau (directive porteur 2026-09-27, #8220). */
export const PASSWORD_LEVEL_LENGTHS: Readonly<Record<PasswordProposalLevel, number>> = {
  simple: 6,
  easy: 8,
  medium: 12,
  hard: 16,
};

export const HARD_PASSWORD_LENGTH = PASSWORD_LEVEL_LENGTHS.hard;
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

const digitsOf = (values: readonly number[]): string => values.join('');

const digit = (random: RandomBelow): number => 2 + random(8);

/** Deux chiffres voisins ou répétés : `55`, `34`, `43`. */
const nearPair = (random: RandomBelow): string => {
  const a = 2 + random(7);
  return digitsOf(pick([[a, a], [a, a + 1], [a + 1, a]], random));
};

/** Trois chiffres voisins ou répétés : `345`, `554`, `464`. */
const nearTriple = (random: RandomBelow): string => {
  const [a, b] = [digit(random), digit(random)];
  const c = 2 + random(6);
  return digitsOf(pick([[c, c + 1, c + 2], [a, a, b], [a, b, a]], random));
};

/** Quatre chiffres voisins ou répétés : `4545`, `2288`, `2334`, `3456`. */
const nearQuad = (random: RandomBelow): string => {
  const [a, b] = [digit(random), digit(random)];
  const c = 2 + random(6);
  const d = 2 + random(5);
  return digitsOf(pick([[a, b, a, b], [a, a, b, b], [c, c + 1, c + 1, c + 2], [d, d + 1, d + 2, d + 3]], random));
};

/** Quatre lettres faciles à taper : une suite de touches voisines, ou — parfois — le début du pseudo. */
const easyWord = (base: string, random: RandomBelow): string => {
  const usesPseudo = base.length >= WORD_LENGTH && random(PSEUDO_ODDS) === 0;
  const word = usesPseudo ? base.slice(0, WORD_LENGTH) : pick(KEYBOARD_RUNS, random);
  return coin(random) ? capitalized(word) : word;
};

const doubledLetter = (random: RandomBelow): string => pick([...PAIR_LETTERS], random).repeat(2);

const symbolOf = (random: RandomBelow): string => pick([...SIMPLE_SYMBOLS], random);

/** Les morceaux dans un ordre tiré au hasard (Fisher-Yates sur une copie). */
const shuffled = (chunks: readonly string[], random: RandomBelow): string =>
  chunks
    .reduce<string[]>((order, chunk, index) => {
      const slot = random(index + 1);
      return [...order.slice(0, slot), chunk, ...order.slice(slot)];
    }, [])
    .join('');

type Shape = (base: string, random: RandomBelow) => string;

const oneOf = (shapes: readonly Shape[]): Shape => (base, random) => pick(shapes, random)(base, random);

const SHAPES: Readonly<Record<PasswordProposalLevel, Shape>> = {
  simple: oneOf([
    (base, random) => shuffled([easyWord(base, random), nearPair(random)], random),
    (_base, random) => shuffled([doubledLetter(random), nearQuad(random)], random),
  ]),
  easy: oneOf([
    (base, random) => shuffled([easyWord(base, random), nearQuad(random)], random),
    (base, random) => shuffled([easyWord(base, random), doubledLetter(random), nearPair(random)], random),
    (base, random) => `${shuffled([easyWord(base, random), nearTriple(random)], random)}${symbolOf(random)}`,
  ]),
  medium: (base, random) =>
    `${capitalized(easyWord(base, random))}.${draw(ALPHANUMERIC, 3, random)}${draw(SYMBOLS, 1, random)}${draw(DIGITS, 3, random)}`,
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
