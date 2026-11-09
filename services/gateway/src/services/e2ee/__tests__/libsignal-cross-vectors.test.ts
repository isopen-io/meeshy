/**
 * Les VECTEURS CROISÉS libsignal (#17113), banc de la passerelle : le fichier
 * `packages/shared/fixtures/libsignal/cross-platform.vectors.json`, rejoué tel
 * quel par le SDK iOS (`LibsignalCrossPlatformVectorTests`) et `:core:e2ee`
 * Android (`LibsignalCrossPlatformVectorsTest`), s'ouvre ici avec la VRAIE
 * bibliothèque (processus à part, `libsignal-vectors.mjs`) : PQXDH depuis les
 * seules pré-clés, puis des sessions sérialisées rechargées (#9231). Les jeux
 * de `legacy/`, scellés par une version ANTÉRIEURE, s'ouvrent de même : une
 * session persistée avant une montée survit à la montée. La même charge
 * altérée d'un octet est refusée, que l'octet soit le premier (version), au
 * milieu du corps ou le dernier (MAC).
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { execFileSync } from 'child_process';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const FIXTURES = join(__dirname, '../../../../../../packages/shared/fixtures/libsignal');
const CURRENT = join(FIXTURES, 'cross-platform.vectors.json');
const LEGACY = join(FIXTURES, 'legacy');
const BENCH = join(__dirname, 'libsignal-vectors.mjs');

type WireMessage = { type: number; body: string; plaintext: string };
type Vectors = {
  libsignal: string;
  freshSession: { messages: WireMessage[] };
  persistedSessions: {
    aliceOpensReply: { session: string; message: WireMessage };
    bobOpensThird: { session: string; message: WireMessage };
  };
};
type TamperedByte = 'version' | 'middle' | 'last';
type Report = {
  loaded: string;
  declared: string;
  fresh: string[];
  aliceOpensReply: string;
  bobOpensThird: string;
  whisperVersionLowBitRefused: Record<'aliceOpensReply' | 'bobOpensThird', boolean>;
  tamperedRefused: Record<TamperedByte, Record<'preKeyMessage' | 'aliceOpensReply' | 'bobOpensThird', boolean>>;
};

const legacyFiles = (): string[] =>
  (existsSync(LEGACY) ? readdirSync(LEGACY) : [])
    .filter((name) => name.endsWith('.vectors.json'))
    .sort()
    .map((name) => join(LEGACY, name));

const vectorsOf = (file: string): Vectors => JSON.parse(readFileSync(file, 'utf8')) as Vectors;
const replay = (file: string): Report => JSON.parse(execFileSync(process.execPath, [BENCH, file]).toString()) as Report;

describe('libsignal — les vecteurs croisés partagés avec iOS et Android (#17113)', () => {
  it('la passerelle charge la version de libsignal qui a scellé les vecteurs courants', () => {
    const report = replay(CURRENT);
    expect(report.loaded).toBe(vectorsOf(CURRENT).libsignal);
    expect(report.declared).toBe(report.loaded);
  });

  it('au moins un jeu scellé par une version antérieure est rejoué (#9231)', () => {
    const current = vectorsOf(CURRENT).libsignal;
    expect(legacyFiles().map((file) => vectorsOf(file).libsignal)).toEqual(
      expect.arrayContaining([expect.not.stringMatching(new RegExp(`^${current.replace(/\./g, '\\.')}$`))]),
    );
  });

  describe.each([CURRENT, ...legacyFiles()].map((file) => [vectorsOf(file).libsignal, file] as const))('jeu scellé en %s', (_version, file) => {
    const vectors = vectorsOf(file);
    const report = replay(file);

    it('Bob ouvre les deux PreKeySignalMessage depuis ses seules pré-clés (PQXDH, Kyber, pré-clé unique)', () => {
      const messages = vectors.freshSession.messages;
      expect(messages.map((message) => message.type)).toEqual([3, 3]);
      expect(report.fresh).toEqual(messages.map((message) => message.plaintext));
    });

    it('une session sérialisée, rechargée par la version courante, ouvre le SignalMessage suivant, des deux côtés', () => {
      const { aliceOpensReply, bobOpensThird } = vectors.persistedSessions;
      expect([aliceOpensReply.message.type, bobOpensThird.message.type]).toEqual([2, 2]);
      expect(report.aliceOpensReply).toBe(aliceOpensReply.message.plaintext);
      expect(report.bobOpensThird).toBe(bobOpensThird.message.plaintext);
    });

    it.each(['version', 'middle', 'last'] as const)('chaque charge altérée d’un octet (%s) est refusée', (byte) => {
      expect(report.tamperedRefused[byte]).toEqual({ preKeyMessage: true, aliceOpensReply: true, bobOpensThird: true });
    });

    it('un SignalMessage au bit bas du premier octet basculé est refusé par son MAC', () => {
      expect(report.whisperVersionLowBitRefused).toEqual({ aliceOpensReply: true, bobOpensThird: true });
    });
  });
});
