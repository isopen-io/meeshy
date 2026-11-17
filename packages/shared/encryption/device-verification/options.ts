/**
 * LES QUATRE OPTIONS EN CARRÉ — la correspondance du code sur les deux écrans (#13043, #19154).
 *
 * Spécification `docs/superpowers/specs/2026-11-17-e2ee-ajout-appareil-par-code.md`, § 4.9 et
 * arbitrage 1. Le répondeur montre QUATRE codes, dont un seul est celui de l'autre écran ;
 * l'initiateur montre quatre accusés. Deux « bits » portés par des positions fixes : le
 * bit 1 par `{0, 1}`, le bit 2 par `{3, 5}` (l'accusé : `{0}` et `{1}`). `options[0]` est le
 * vrai, `options[1]` change le bit 1, `options[2]` le bit 2, `options[3]` les deux ; l'écran
 * montre en position i l'option `options[perm[i]]`.
 *
 * Ordre de lecture des octets du générateur sûr, à l'octet près (vecteurs `options`) :
 *  1. pour chaque position du bit 1, puis du bit 2, par ordre croissant : le premier octet
 *     b < 252 (un octet ≥ 252 est sauté — rejet octet par octet, aucun biais de modulo),
 *     autre symbole `a_p = (s_p + 1 + b mod 63) mod 64` ;
 *  2. puis le premier octet b < 240 : `perm` = la permutation n° (b mod 24) de [0, 1, 2, 3],
 *     dans l'ordre lexicographique.
 *
 * Les options et la position du vrai sont tirées UNE fois par transaction et conservées : ce
 * module ne les émet ni ne les journalise jamais, et ne les retire jamais au sort (§ 4.9) —
 * c'est à l'appelant de les garder avec la transaction.
 */
import { DeviceVerificationFormError } from './descriptor.js';
import { secureRandomBytes } from './sas.js';

export type SquareBits = { readonly bit1: readonly number[]; readonly bit2: readonly number[] };

export const CODE_SQUARE: SquareBits = { bit1: [0, 1], bit2: [3, 5] };
export const ACK_SQUARE: SquareBits = { bit1: [0], bit2: [1] };

const SYMBOL_REJECTION_BOUND = 252;
const PERMUTATION_REJECTION_BOUND = 240;
const OPTIONS = 4;

/** Les 24 permutations de [0, 1, 2, 3], dans l'ordre lexicographique. */
export const SQUARE_PERMUTATIONS: readonly (readonly number[])[] = (() => {
  const walk = (prefix: readonly number[], rest: readonly number[]): (readonly number[])[] =>
    rest.length === 0 ? [prefix] : rest.flatMap((value, index) => walk([...prefix, value], [...rest.slice(0, index), ...rest.slice(index + 1)]));
  return walk([], [0, 1, 2, 3]);
})();

/** Une source d'octets : rend le prochain octet du flux (le générateur sûr, ou un flux fixé par un vecteur). */
export type ByteSource = () => number;

export type SquareOptions = {
  /** L'autre symbole tiré pour chaque position d'un bit. */
  readonly alternatives: Readonly<Record<number, number>>;
  /** Le numéro (0…23) de la permutation tirée. */
  readonly permutation: number;
  readonly order: readonly number[];
  /** Les quatre options, dans l'ordre de l'écran (de haut en bas). */
  readonly displayed: readonly (readonly number[])[];
  /** La position, à l'écran, de l'option juste. */
  readonly correctAt: number;
};

const drawBelow = (next: ByteSource, bound: number): number => {
  for (;;) {
    const byte = next();
    if (!Number.isInteger(byte) || byte < 0 || byte > 255) throw new DeviceVerificationFormError('random');
    if (byte < bound) return byte;
  }
};

/** Construit le carré à partir d'une source d'octets (§ 4.9) : déterministe pour un flux donné. */
export function squareOptions(symbols: readonly number[], square: SquareBits, next: ByteSource): SquareOptions {
  const positions = [...[...square.bit1].sort((a, b) => a - b), ...[...square.bit2].sort((a, b) => a - b)];
  if (positions.some((position) => symbols[position] === undefined)) throw new DeviceVerificationFormError('square');
  const alternatives = positions.reduce<Record<number, number>>(
    (drawn, position) => ({ ...drawn, [position]: ((symbols[position] ?? 0) + 1 + (drawBelow(next, SYMBOL_REJECTION_BOUND) % 63)) % 64 }),
    {},
  );
  const permutation = drawBelow(next, PERMUTATION_REJECTION_BOUND) % SQUARE_PERMUTATIONS.length;
  const variant = (flip1: boolean, flip2: boolean): readonly number[] =>
    symbols.map((symbol, index) =>
      (flip1 && square.bit1.includes(index)) || (flip2 && square.bit2.includes(index)) ? (alternatives[index] ?? symbol) : symbol,
    );
  const options = [variant(false, false), variant(true, false), variant(false, true), variant(true, true)];
  const order = SQUARE_PERMUTATIONS[permutation] ?? [0, 1, 2, 3];
  return {
    alternatives,
    permutation,
    order,
    displayed: order.map((index) => options[index] ?? []),
    correctAt: order.indexOf(0),
  };
}

/** Un flux d'octets lu dans un tableau ; épuisé, il lève (jamais un octet inventé). */
export function byteStream(bytes: Uint8Array): ByteSource {
  const state = { offset: 0 };
  return () => {
    const byte = bytes[state.offset];
    if (byte === undefined) throw new DeviceVerificationFormError('random');
    state.offset += 1;
    return byte;
  };
}

/** Le flux du générateur sûr de la plateforme, lu par blocs. */
export function secureByteSource(blockSize = 32): ByteSource {
  const state: { block: Uint8Array; offset: number } = { block: new Uint8Array(0), offset: 0 };
  return () => {
    if (state.offset >= state.block.length) {
      state.block = secureRandomBytes(blockSize);
      state.offset = 0;
    }
    const byte = state.block[state.offset] ?? 0;
    state.offset += 1;
    return byte;
  };
}

/** Le tirage réel : une fois, à l'entrée en `choosing` (code) ou en `showing` (accusé). */
export const drawSquareOptions = (symbols: readonly number[], square: SquareBits): SquareOptions =>
  squareOptions(symbols, square, secureByteSource());

/** Vrai si une seule position (symbole ou nombre) suffit à isoler une des options : jamais pour un carré (P7). */
export function singleValueIsolates(values: readonly (readonly (string | number)[])[]): boolean {
  const width = values[0]?.length ?? 0;
  return Array.from({ length: width }, (_, position) => values.map((value) => value[position])).some((column) =>
    column.some((cell) => column.filter((other) => other === cell).length === 1),
  );
}

export const SQUARE_OPTION_COUNT = OPTIONS;
