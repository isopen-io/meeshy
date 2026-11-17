/**
 * LE RENDU du code et de l'accusé — confirmation d'un appareil par code court (#18906, #19154).
 *
 * Spécification `docs/superpowers/specs/2026-11-17-e2ee-ajout-appareil-par-code.md`, § 4.5,
 * encodages publiés de `m.sas.v1` (Matrix) :
 *  - code, emoji : `N = B0‖…‖B5` sur 48 bits ; symbole i (0…6) = `(N >> (42 − 6i)) & 0x3F` ;
 *  - code, chiffres : `(B0<<5 | B1>>3) + 1000`, `((B1&7)<<10 | B2<<2 | B3>>6) + 1000`,
 *    `((B3&63)<<7 | B4>>1) + 1000` ;
 *  - accusé : emoji `A0 >> 2`, `((A0 & 3) << 4) | (A1 >> 4)` ; chiffres `((A0 << 5) | (A1 >> 3)) + 1000`.
 * Les deux rendus viennent des mêmes octets. Ordre gauche → droite imposé partout, arabe compris.
 *
 * L'arithmétique tient dans un `number` : 48 bits < 2⁵³, sans `BigInt`.
 */
import { DEVICE_VERIFICATION_SIZES, DeviceVerificationFormError } from './descriptor.js';
import { SAS_EMOJI_TABLE, type SasEmojiLanguage } from './sas-emoji-table.js';

export const CODE_SYMBOLS = 7;
export const CODE_NUMBERS = 3;
export const ACK_SYMBOLS = 2;
const SYMBOL_BITS = 6;
const SYMBOL_MASK = 0x3f;
const DECIMAL_OFFSET = 1000;

const byteAt = (bytes: Uint8Array, index: number): number => bytes[index] ?? 0;

const sized = (bytes: Uint8Array, size: number, field: string): Uint8Array => {
  if (bytes.length !== size) throw new DeviceVerificationFormError(field);
  return bytes;
};

/** Les 48 bits du code, poids fort d'abord. */
const codeValue = (code: Uint8Array): number =>
  Array.from(sized(code, DEVICE_VERIFICATION_SIZES.code, 'code')).reduce((value, byte) => value * 256 + byte, 0);

/** Les 7 indices (0…63) du code dans la table, de gauche à droite. */
export function codeEmojiIndexes(code: Uint8Array): readonly number[] {
  const value = codeValue(code);
  return Array.from({ length: CODE_SYMBOLS }, (_, i) => Math.floor(value / 2 ** (42 - SYMBOL_BITS * i)) & SYMBOL_MASK);
}

/** Les trois nombres du code (1000 à 9191), dans l'ordre. */
export function codeDecimals(code: Uint8Array): readonly [number, number, number] {
  const b = sized(code, DEVICE_VERIFICATION_SIZES.code, 'code');
  const [b0, b1, b2, b3, b4] = [byteAt(b, 0), byteAt(b, 1), byteAt(b, 2), byteAt(b, 3), byteAt(b, 4)];
  return [
    ((b0 << 5) | (b1 >> 3)) + DECIMAL_OFFSET,
    (((b1 & 7) << 10) | (b2 << 2) | (b3 >> 6)) + DECIMAL_OFFSET,
    (((b3 & 63) << 7) | (b4 >> 1)) + DECIMAL_OFFSET,
  ];
}

/** Les deux indices de l'accusé. */
export function ackEmojiIndexes(ack: Uint8Array): readonly [number, number] {
  const a = sized(ack, DEVICE_VERIFICATION_SIZES.ack, 'ack');
  const [a0, a1] = [byteAt(a, 0), byteAt(a, 1)];
  return [a0 >> 2, ((a0 & 3) << 4) | (a1 >> 4)];
}

/** Le nombre de l'accusé (1000 à 9191). */
export function ackDecimal(ack: Uint8Array): number {
  const a = sized(ack, DEVICE_VERIFICATION_SIZES.ack, 'ack');
  return ((byteAt(a, 0) << 5) | (byteAt(a, 1) >> 3)) + DECIMAL_OFFSET;
}

/**
 * Les 6 octets d'un code dont les 7 symboles sont donnés ; les 6 derniers bits (42 à 47),
 * qu'aucun rendu ne montre, sont repris de `tailBits`. Sert à rendre en chiffres une option
 * du carré (§ 4.9), qui ne change que des symboles.
 */
export function codeFromSymbols(symbols: readonly number[], tailBits: number): Uint8Array {
  if (symbols.length !== CODE_SYMBOLS) throw new DeviceVerificationFormError('symbols');
  const value = symbols.reduce((acc, symbol) => acc * 64 + (symbol & SYMBOL_MASK), 0) * 64 + (tailBits & SYMBOL_MASK);
  return Uint8Array.from({ length: DEVICE_VERIFICATION_SIZES.code }, (_, i) => Math.floor(value / 2 ** (40 - 8 * i)) % 256);
}

/** Les 2 octets d'un accusé dont les 2 symboles sont donnés ; les 4 bits faibles du second octet sont repris de `lowNibble`. */
export function ackFromSymbols(symbols: readonly number[], lowNibble: number): Uint8Array {
  if (symbols.length !== ACK_SYMBOLS) throw new DeviceVerificationFormError('symbols');
  const [s0, s1] = [symbols[0] ?? 0, symbols[1] ?? 0];
  return Uint8Array.of(((s0 & SYMBOL_MASK) << 2) | ((s1 & SYMBOL_MASK) >> 4), ((s1 & 0xf) << 4) | (lowNibble & 0xf));
}

export type RenderedSymbols = {
  readonly indexes: readonly number[];
  readonly emoji: readonly string[];
  readonly names: Readonly<Record<SasEmojiLanguage, readonly string[]>>;
};

const entryAt = (index: number) => {
  const entry = SAS_EMOJI_TABLE[index];
  if (entry === undefined) throw new DeviceVerificationFormError('symbol');
  return entry;
};

/** Les symboles et leurs noms dans les sept langues de la table, dans l'ordre donné. */
export function renderSymbols(indexes: readonly number[]): RenderedSymbols {
  const entries = indexes.map(entryAt);
  const namesIn = (language: SasEmojiLanguage): readonly string[] => entries.map((entry) => entry.names[language]);
  return {
    indexes: [...indexes],
    emoji: entries.map((entry) => entry.emoji),
    names: { fr: namesIn('fr'), en: namesIn('en'), es: namesIn('es'), de: namesIn('de'), it: namesIn('it'), 'pt-BR': namesIn('pt-BR'), ar: namesIn('ar') },
  };
}
