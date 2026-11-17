// packages/shared/__tests__/device-verification-options.test.ts
//
// #19154 (#18906) — la correspondance du code sur les deux écrans, mesurée sur la référence
// TypeScript : spécification `docs/superpowers/specs/2026-11-17-e2ee-ajout-appareil-par-code.md`,
// § 4.9, arbitrage 1, § 9 (2 bis) et § 9 (3).
//
// Les tirages statistiques lisent un flux d'octets FIXÉ (SHA-256 en mode compteur sur une
// graine publique) : le verdict ne dépend pas de la chance de l'exécution. Le générateur sûr
// de la plateforme est exercé à part.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import {
  ACK_SQUARE,
  ackDecimal,
  ackFromSymbols,
  byteStream,
  CODE_SQUARE,
  codeDecimals,
  codeFromSymbols,
  commitmentOf,
  deriveVerification,
  drawSquareOptions,
  opensCommitment,
  secureRandomBytes,
  singleValueIsolates,
  SQUARE_PERMUTATIONS,
  squareOptions,
  type ByteSource,
  type DeviceDescriptor,
} from '../encryption/device-verification/index.js';

const ACCOUNT = '6745a1b2c3d4e5f601234567';
const CHI2_3DF_1PCT = 11.34;

/** Un flux d'octets déterministe : SHA-256(graine ‖ compteur), bloc après bloc. */
function seededStream(seed: string): ByteSource {
  const state = { block: Buffer.alloc(0), offset: 0, counter: 0 };
  return () => {
    if (state.offset >= state.block.length) {
      state.block = createHash('sha256').update(`${seed}#${state.counter}`).digest();
      state.counter += 1;
      state.offset = 0;
    }
    const byte = state.block[state.offset] ?? 0;
    state.offset += 1;
    return byte;
  };
}

const symbolsFrom = (next: ByteSource, count: number): number[] => Array.from({ length: count }, () => next() & 0x3f);
const bytesFrom = (next: ByteSource, count: number): Uint8Array => Uint8Array.from({ length: count }, () => next());
const keyFrom = (next: ByteSource): string => Buffer.from([0x05, ...bytesFrom(next, 32)]).toString('base64');

const shared = (left: readonly number[], right: readonly number[]): number => left.filter((value, index) => value === right[index]).length;

/** L'option « la plus typique » : celle qui partage le plus de symboles avec les autres (médoïde de Hamming), sans regarder l'autre écran. */
function mostTypical(displayed: readonly (readonly number[])[], next: ByteSource): number {
  const closeness = displayed.map((option) => displayed.reduce((sum, other) => sum + shared(option, other), 0));
  const best = Math.max(...closeness);
  const ties = closeness.map((value, index) => (value === best ? index : -1)).filter((index) => index >= 0);
  return ties[next() % ties.length] ?? 0;
}

const decimalsOfCode = (symbols: readonly number[]) => codeDecimals(codeFromSymbols(symbols, 0));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('la construction du carré (§ 4.9)', () => {
  it('un octet ≥ 252 est sauté pour l’autre symbole, un octet ≥ 240 pour la permutation (rejet sans biais)', () => {
    const symbols = [10, 20, 30, 40, 50, 60, 1];
    const plain = squareOptions(symbols, CODE_SQUARE, byteStream(Uint8Array.of(0, 1, 2, 3, 5)));
    const withRejects = squareOptions(symbols, CODE_SQUARE, byteStream(Uint8Array.of(252, 0, 255, 1, 2, 253, 3, 240, 255, 5)));
    expect(withRejects).toEqual(plain);
    expect(plain.alternatives).toEqual({ 0: 11, 1: 22, 3: 43, 5: 0 });
    expect(plain.permutation).toBe(5);
  });

  it('251 et 239 sont les derniers octets ACCEPTÉS : la borne ne glisse pas d’un cran', () => {
    const symbols = [10, 20, 30, 40, 50, 60, 1];
    const atBounds = squareOptions(symbols, CODE_SQUARE, byteStream(Uint8Array.of(251, 1, 2, 3, 239)));
    expect(atBounds.alternatives).toEqual({ 0: 9, 1: 22, 3: 43, 5: 0 });
    expect(atBounds.permutation).toBe(23);
  });

  it('l’autre symbole n’est jamais le vrai, et la permutation n° k est la k-ième dans l’ordre lexicographique', () => {
    expect(SQUARE_PERMUTATIONS.length).toBe(24);
    expect(SQUARE_PERMUTATIONS[0]).toEqual([0, 1, 2, 3]);
    expect(SQUARE_PERMUTATIONS[19]).toEqual([3, 0, 2, 1]);
    expect(SQUARE_PERMUTATIONS[23]).toEqual([3, 2, 1, 0]);
    const next = seededStream('meeshy-options/alternatives');
    Array.from({ length: 2_000 }).forEach(() => {
      const symbols = symbolsFrom(next, 7);
      const options = squareOptions(symbols, CODE_SQUARE, next);
      Object.entries(options.alternatives).forEach(([position, alternative]) => expect(alternative).not.toBe(symbols[Number(position)]));
    });
  });

  it('un flux épuisé lève : jamais un octet inventé', () => {
    expect(() => squareOptions([1, 2, 3, 4, 5, 6, 7], CODE_SQUARE, byteStream(Uint8Array.of(1, 2, 3)))).toThrow();
  });

  it('l’accusé : quatre accusés distincts dans les deux rendus, aucun symbole seul ne départage', () => {
    const next = seededStream('meeshy-options/ack');
    Array.from({ length: 5_000 }).forEach(() => {
      const ack = bytesFrom(next, 2);
      const symbols = [(ack[0] ?? 0) >> 2, (((ack[0] ?? 0) & 3) << 4) | ((ack[1] ?? 0) >> 4)];
      const options = squareOptions(symbols, ACK_SQUARE, next);
      const decimals = options.displayed.map((option) => ackDecimal(ackFromSymbols(option, (ack[1] ?? 0) & 0x0f)));
      expect(new Set(options.displayed.map((option) => option.join(','))).size).toBe(4);
      expect(new Set(decimals).size).toBe(4);
      expect(singleValueIsolates(options.displayed)).toBe(false);
      expect(decimals[options.correctAt]).toBe(ackDecimal(Uint8Array.from(ack)));
    });
  });
});

describe('§ 9 (2 bis) — 30 000 tirages du carré du code', () => {
  const TRIALS = 30_000;
  const next = seededStream('meeshy-options/30000');
  const draws = Array.from({ length: TRIALS }, () => {
    const symbols = symbolsFrom(next, 7);
    return { symbols, options: squareOptions(symbols, CODE_SQUARE, next) };
  });

  it('la position du code juste est uniforme (χ² à 3 degrés de liberté < 11,34)', () => {
    const counts = [0, 1, 2, 3].map((position) => draws.filter((draw) => draw.options.correctAt === position).length);
    const expected = TRIALS / 4;
    const chi2 = counts.reduce((sum, count) => sum + (count - expected) ** 2 / expected, 0);
    expect(chi2).toBeLessThan(CHI2_3DF_1PCT);
  });

  it('les quatre options sont distinctes dans les deux rendus, et aucun symbole ni aucun nombre seul ne les départage', () => {
    draws.forEach(({ options }) => {
      const decimals = options.displayed.map(decimalsOfCode);
      expect(new Set(options.displayed.map((option) => option.join(','))).size).toBe(4);
      expect(new Set(decimals.map((decimal) => decimal.join(','))).size).toBe(4);
      expect(singleValueIsolates(options.displayed)).toBe(false);
      expect(singleValueIsolates(decimals)).toBe(false);
    });
  });

  it('« l’option la plus typique », sans regarder l’autre écran, trouve le code juste dans 25 % ± 1 % des cas (P7)', () => {
    const typical = seededStream('meeshy-options/typical');
    const hits = draws.filter(({ options }) => mostTypical(options.displayed, typical) === options.correctAt).length;
    expect(Math.abs(hits / TRIALS - 0.25)).toBeLessThan(0.01);
  });

  it('le code juste est toujours parmi les quatre, à la position annoncée', () => {
    draws.forEach(({ symbols, options }) => expect(options.displayed[options.correctAt]).toEqual(symbols));
  });
});

describe('§ 9 (3) — homme du milieu et utilisateur « juste assez »', () => {
  it('sous homme du milieu, l’utilisateur qui ne lit qu’un symbole par bit approuve le fantôme ≈ 2⁻¹² fois, jamais davantage', () => {
    const TRIALS = 200_000;
    const next = seededStream('meeshy-options/just-enough');
    const approved = Array.from({ length: TRIALS }).filter(() => {
      const atResponder = symbolsFrom(next, 7);
      const atInitiator = symbolsFrom(next, 7);
      const options = squareOptions(atResponder, CODE_SQUARE, next);
      const matching = options.displayed.map((option, index) => (option[0] === atInitiator[0] && option[3] === atInitiator[3] ? index : -1)).filter((index) => index >= 0);
      return matching.length === 1 && matching[0] === options.correctAt;
    }).length;
    const rate = approved / TRIALS;
    expect(rate).toBeGreaterThan(2 ** -12 / 2);
    expect(rate).toBeLessThan(2 ** -12 * 2);
  });

  it('toucher sans regarder réussit une fois sur quatre au plus', () => {
    const next = seededStream('meeshy-options/blind');
    const TRIALS = 40_000;
    const hits = Array.from({ length: TRIALS }).filter(() => squareOptions(symbolsFrom(next, 7), CODE_SQUARE, next).correctAt === next() % 4).length;
    expect(Math.abs(hits / TRIALS - 0.25)).toBeLessThan(0.01);
  });

  it('un relais qui substitue clé, descripteur ou aléas n’obtient jamais deux codes identiques, et une révélation forgée est refusée avant le code', async () => {
    const RUNS = 10_000;
    const next = seededStream('meeshy-options/mitm');
    const device = (deviceId: number, platform: DeviceDescriptor['platform']): DeviceDescriptor => ({
      userId: ACCOUNT, deviceId, registrationId: 1 + (next() * 64 + next()) % 16383, identityKey: keyFrom(next), platform,
    });
    for (let run = 0; run < RUNS; run += 1) {
      const initiator = device(1 + (run % 60), 'ios');
      const responder = device(64 + (run % 60), 'android');
      const phantom = device(125, 'ios');
      const tx = bytesFrom(next, 16);
      const nonceI = bytesFrom(next, 32);
      const nonceR = bytesFrom(next, 32);
      const nonceM = bytesFrom(next, 32);
      const atInitiator = await deriveVerification({ tx, initiator, responder: phantom, initiatorNonce: nonceI, responderNonce: nonceM });
      const atResponder = await deriveVerification({ tx, initiator: phantom, responder, initiatorNonce: nonceM, responderNonce: nonceR });
      expect(Buffer.from(atInitiator.code).equals(Buffer.from(atResponder.code))).toBe(false);
      const commitment = await commitmentOf({ tx, initiator, initiatorNonce: nonceI });
      expect(await opensCommitment({ tx, initiator, initiatorNonce: bytesFrom(next, 32), commitment })).toBe(false);
    }
  }, 120_000);
});

describe('le générateur sûr de la plateforme', () => {
  it('le tirage réel construit un carré valide, et deux tirages ne se ressemblent pas', () => {
    const draws = Array.from({ length: 500 }, () => drawSquareOptions([1, 2, 3, 4, 5, 6, 7], CODE_SQUARE));
    draws.forEach((options) => {
      expect(new Set(options.displayed.map((option) => option.join(','))).size).toBe(4);
      expect(singleValueIsolates(options.displayed)).toBe(false);
    });
    expect(new Set(draws.map((options) => `${options.permutation}|${JSON.stringify(options.alternatives)}`)).size).toBeGreaterThan(400);
  });

  it('sans générateur sûr, aucun aléa n’est rendu', () => {
    vi.stubGlobal('crypto', {});
    expect(() => secureRandomBytes(16)).toThrow();
    expect(() => drawSquareOptions([1, 2, 3, 4, 5, 6, 7], CODE_SQUARE)).toThrow();
    vi.unstubAllGlobals();
  });
});

describe('aucun journal ne porte nonce_I ni les options (§ 4.4, § 4.9)', () => {
  it('ni le calcul du code ni le tirage des options n’écrivent quoi que ce soit dans la console', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug', 'trace'] as const).map((method) => vi.spyOn(console, method).mockImplementation(() => undefined));
    const next = seededStream('meeshy-options/silence');
    const initiator: DeviceDescriptor = { userId: ACCOUNT, deviceId: 1, registrationId: 4211, identityKey: keyFrom(next), platform: 'ios', label: 'iPhone' };
    const responder: DeviceDescriptor = { userId: ACCOUNT, deviceId: 2, registrationId: 9054, identityKey: keyFrom(next), platform: 'web' };
    const out = await deriveVerification({ tx: bytesFrom(next, 16), initiator, responder, initiatorNonce: bytesFrom(next, 32), responderNonce: bytesFrom(next, 32) });
    drawSquareOptions([1, 2, 3, 4, 5, 6, 7], CODE_SQUARE);
    await opensCommitment({ tx: bytesFrom(next, 16), initiator, initiatorNonce: bytesFrom(next, 32), commitment: out.commitment });
    spies.forEach((spy) => expect(spy).not.toHaveBeenCalled());
  });
});
