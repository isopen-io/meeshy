/**
 * Les VECTEURS CROISÉS libsignal (#17113), banc du WEB (#17114) : le fichier
 * `packages/shared/fixtures/libsignal/cross-platform.vectors.json`, scellé par
 * la passerelle et rejoué par le SDK iOS et `:core:e2ee` Android, s'ouvre ici
 * avec le pont WASM de libsignal, le même que charge le navigateur. Les jeux de
 * `legacy/` (sessions sérialisées par une version antérieure, #9231) aussi.
 * Une charge altérée d'un octet est refusée.
 */
import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { WEB_LIBSIGNAL_ENGINE } from '@/lib/licences/libsignal-engine';

import { openLibsignalBridge, type LibsignalBridge, type PreKeyEntry, type SignalAddress, type WireMessage } from './libsignal-bridge';
import { LIBSIGNAL_WASM_FILE } from './libsignal-wasm-file';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, '..', '..', '..', '..', '..', 'packages', 'shared', 'fixtures', 'libsignal');
const CURRENT = join(FIXTURES, 'cross-platform.vectors.json');
const LEGACY = join(FIXTURES, 'legacy');

type VectorMessage = { readonly type: number; readonly body: string; readonly plaintext: string };
type VectorParty = { readonly name: string; readonly deviceId: number; readonly registrationId: number; readonly identityKeyPair: string };
type VectorRecord = { readonly id: number; readonly record: string };
type Vectors = {
  readonly libsignal: string;
  readonly alice: VectorParty;
  readonly bob: VectorParty & { readonly signedPreKey: VectorRecord; readonly kyberPreKey: VectorRecord; readonly preKey: VectorRecord };
  readonly freshSession: { readonly messages: readonly VectorMessage[] };
  readonly persistedSessions: {
    readonly aliceOpensReply: { readonly session: string; readonly message: VectorMessage };
    readonly bobOpensThird: { readonly session: string; readonly message: VectorMessage };
  };
};

const bytes = (base64: string): Uint8Array => new Uint8Array(Buffer.from(base64, 'base64'));
const text = (raw: Uint8Array): string => new TextDecoder().decode(raw);
const vectorsOf = (file: string): Vectors => JSON.parse(readFileSync(file, 'utf8')) as Vectors;
const legacyFiles = (): readonly string[] =>
  (existsSync(LEGACY) ? readdirSync(LEGACY) : [])
    .filter((name) => name.endsWith('.vectors.json'))
    .sort()
    .map((name) => join(LEGACY, name));

const bridge: LibsignalBridge = await openLibsignalBridge(readFileSync(join(HERE, '..', '..', '..', LIBSIGNAL_WASM_FILE)));

const addressOf = (party: VectorParty): SignalAddress => ({ name: party.name, deviceId: party.deviceId });
const localOf = (party: VectorParty) => ({ identityKeyPair: bytes(party.identityKeyPair), registrationId: party.registrationId, address: addressOf(party) });
const wire = (message: VectorMessage): WireMessage => ({ type: message.type === 3 ? 3 : 2, body: bytes(message.body) });
const entry = (record: VectorRecord): PreKeyEntry => ({ id: record.id, record: bytes(record.record) });
const bobPreKeys = (vectors: Vectors) => ({
  signedPreKeys: [entry(vectors.bob.signedPreKey)],
  kyberPreKeys: [entry(vectors.bob.kyberPreKey)],
  preKeys: [entry(vectors.bob.preKey)],
});

const flip = (message: WireMessage, at: (length: number) => number, mask: number): WireMessage => {
  const target = at(message.body.length);
  return { type: message.type, body: message.body.map((value, index) => (index === target ? value ^ mask : value)) };
};

const refused = async (attempt: () => Promise<unknown>): Promise<boolean> => {
  try {
    await attempt();
    return false;
  } catch {
    return true;
  }
};

const openFresh = async (vectors: Vectors): Promise<readonly string[]> => {
  const [first, second] = vectors.freshSession.messages;
  if (first === undefined || second === undefined) throw new Error('deux PreKeySignalMessage attendus');
  const local = localOf(vectors.bob);
  const remote = addressOf(vectors.alice);
  const opened = await bridge.open({ local, remote, session: null, remoteIdentity: null, preKeys: bobPreKeys(vectors), message: wire(first) });
  const next = await bridge.open({ local, remote, session: opened.session, remoteIdentity: opened.remoteIdentity, preKeys: bobPreKeys(vectors), message: wire(second) });
  return [text(opened.plaintext), text(next.plaintext)];
};

const openPersisted = async (owner: VectorParty, peer: VectorParty, persisted: { readonly session: string; readonly message: VectorMessage }, message?: WireMessage) =>
  text(
    (
      await bridge.open({
        local: localOf(owner),
        remote: addressOf(peer),
        session: bytes(persisted.session),
        remoteIdentity: null,
        preKeys: { signedPreKeys: [], kyberPreKeys: [], preKeys: [] },
        message: message ?? wire(persisted.message),
      })
    ).plaintext,
  );

const TAMPERED: Readonly<Record<'version' | 'middle' | 'last', { readonly at: (length: number) => number; readonly mask: number }>> = {
  version: { at: () => 0, mask: 0x10 },
  middle: { at: (length) => Math.floor(length / 2), mask: 0x01 },
  last: { at: (length) => length - 1, mask: 0x01 },
};

describe('libsignal sur le web — les vecteurs croisés de la passerelle, iOS et Android (#17114)', () => {
  test('le pont charge la version qui a scellé les vecteurs courants, celle que l’écran Licences annonce', () => {
    expect(bridge.version).toBe(vectorsOf(CURRENT).libsignal);
    expect(WEB_LIBSIGNAL_ENGINE?.version).toBe(bridge.version);
  });

  test('au moins un jeu scellé par une version antérieure est rejoué (#9231)', () => {
    expect(legacyFiles().map((file) => vectorsOf(file).libsignal)).toContainEqual(expect.not.stringMatching(`^${bridge.version}$`));
  });

  describe.each([CURRENT, ...legacyFiles()].map((file) => [vectorsOf(file).libsignal, file] as const))('jeu scellé en %s', (_version, file) => {
    const vectors = vectorsOf(file);
    const { aliceOpensReply, bobOpensThird } = vectors.persistedSessions;

    test('Bob ouvre les deux PreKeySignalMessage depuis ses seules pré-clés (PQXDH, Kyber, pré-clé unique)', async () => {
      expect(await openFresh(vectors)).toEqual(vectors.freshSession.messages.map((message) => message.plaintext));
    });

    test('une session sérialisée, rechargée par le web, ouvre le SignalMessage suivant, des deux côtés', async () => {
      expect(await openPersisted(vectors.alice, vectors.bob, aliceOpensReply)).toBe(aliceOpensReply.message.plaintext);
      expect(await openPersisted(vectors.bob, vectors.alice, bobOpensThird)).toBe(bobOpensThird.message.plaintext);
    });

    test.each(Object.keys(TAMPERED) as readonly (keyof typeof TAMPERED)[])('chaque charge altérée d’un octet (%s) est refusée', async (byte) => {
      const { at, mask } = TAMPERED[byte];
      const [first] = vectors.freshSession.messages;
      if (first === undefined) throw new Error('un PreKeySignalMessage attendu');
      const local = localOf(vectors.bob);
      expect({
        preKeyMessage: await refused(() =>
          bridge.open({ local, remote: addressOf(vectors.alice), session: null, remoteIdentity: null, preKeys: bobPreKeys(vectors), message: flip(wire(first), at, mask) }),
        ),
        aliceOpensReply: await refused(() => openPersisted(vectors.alice, vectors.bob, aliceOpensReply, flip(wire(aliceOpensReply.message), at, mask))),
        bobOpensThird: await refused(() => openPersisted(vectors.bob, vectors.alice, bobOpensThird, flip(wire(bobOpensThird.message), at, mask))),
      }).toEqual({ preKeyMessage: true, aliceOpensReply: true, bobOpensThird: true });
    });
  });
});
