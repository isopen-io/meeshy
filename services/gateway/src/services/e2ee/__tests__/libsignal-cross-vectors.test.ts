/**
 * Les VECTEURS CROISÉS libsignal (#17113), banc de la passerelle : le fichier
 * `packages/shared/fixtures/libsignal/cross-platform.vectors.json`, rejoué tel
 * quel par le SDK iOS (`LibsignalCrossPlatformVectorTests`) et `:core:e2ee`
 * Android (`LibsignalCrossPlatformVectorsTest`), s'ouvre ici avec la VRAIE
 * bibliothèque (processus à part, `libsignal-vectors.mjs`) : PQXDH depuis les
 * seules pré-clés, puis des sessions sérialisées rechargées (#9231). La même
 * charge altérée d'un octet est refusée.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';

const FIXTURE = join(__dirname, '../../../../../../packages/shared/fixtures/libsignal/cross-platform.vectors.json');
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
type Report = {
  loaded: string;
  declared: string;
  fresh: string[];
  aliceOpensReply: string;
  bobOpensThird: string;
  tamperedRefused: Record<'preKeyMessage' | 'aliceOpensReply' | 'bobOpensThird', boolean>;
};

const vectors = (): Vectors => JSON.parse(readFileSync(FIXTURE, 'utf8')) as Vectors;
const replay = (): Report => JSON.parse(execFileSync(process.execPath, [BENCH, FIXTURE]).toString()) as Report;

describe('libsignal — les vecteurs croisés partagés avec iOS et Android (#17113)', () => {
  const report = replay();

  it('la passerelle charge la version de libsignal qui a scellé les vecteurs', () => {
    expect(report.loaded).toBe(vectors().libsignal);
    expect(report.declared).toBe(report.loaded);
  });

  it('Bob ouvre les deux PreKeySignalMessage depuis ses seules pré-clés (PQXDH, Kyber, pré-clé unique)', () => {
    const messages = vectors().freshSession.messages;
    expect(messages.map((message) => message.type)).toEqual([3, 3]);
    expect(report.fresh).toEqual(messages.map((message) => message.plaintext));
  });

  it('une session sérialisée à cette version, rechargée, ouvre le SignalMessage suivant, des deux côtés', () => {
    const { aliceOpensReply, bobOpensThird } = vectors().persistedSessions;
    expect([aliceOpensReply.message.type, bobOpensThird.message.type]).toEqual([2, 2]);
    expect(report.aliceOpensReply).toBe(aliceOpensReply.message.plaintext);
    expect(report.bobOpensThird).toBe(bobOpensThird.message.plaintext);
  });

  it('chaque charge altérée d’un octet est refusée', () => {
    expect(report.tamperedRefused).toEqual({ preKeyMessage: true, aliceOpensReply: true, bobOpensThird: true });
  });
});
