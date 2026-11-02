/**
 * LE CROISÉ avec les liaisons OFFICIELLES de libsignal (#14592, spec § 8.5) :
 * un message chiffré par le pont WASM du navigateur s'ouvre dans
 * `@signalapp/libsignal-client` (la même bibliothèque Rust que les liaisons
 * Swift de l'iOS, via Node), et l'inverse. Lancement :
 *   bun test packages/libsignal-wasm/interop
 */
import { describe, expect, test } from 'bun:test';
import { createRequire } from 'node:module';

import { testEngine } from '../../../apps/web/src/lib/e2ee/test-support/engine';
import { memoryRecords } from '../../../apps/web/src/lib/e2ee/test-support/engine';
import type { EngineLocalDevice } from '../../../apps/web/src/lib/e2ee/engine';

const require = createRequire(new URL('../../../services/gateway/package.json', import.meta.url));
const signal = require('@signalapp/libsignal-client') as typeof import('@signalapp/libsignal-client');

const engine = testEngine();
const ALICE = 'a'.repeat(24);
const BOB = 'b'.repeat(24);

/** Un appareil des liaisons officielles, stores en mémoire. */
function officialDevice(userId: string, deviceId: number) {
  const identity = signal.IdentityKeyPair.generate();
  const registrationId = 4321;
  const sessions = new Map<string, signal.SessionRecord>();
  const identities = new Map<string, signal.PublicKey>();
  const preKeys = new Map<number, signal.PreKeyRecord>();
  const signed = new Map<number, signal.SignedPreKeyRecord>();
  const kyber = new Map<number, signal.KyberPreKeyRecord>();
  const key = (address: signal.ProtocolAddress) => `${address.name()}.${address.deviceId()}`;
  class Sessions extends signal.SessionStore {
    async saveSession(address: signal.ProtocolAddress, record: signal.SessionRecord) { sessions.set(key(address), record); }
    async getSession(address: signal.ProtocolAddress) { return sessions.get(key(address)) ?? null; }
    async getExistingSessions(addresses: signal.ProtocolAddress[]) { return addresses.map((a) => sessions.get(key(a))!); }
  }
  class Identities extends signal.IdentityKeyStore {
    async getIdentityKey() { return identity.privateKey; }
    async getLocalRegistrationId() { return registrationId; }
    async saveIdentity(address: signal.ProtocolAddress, publicKey: signal.PublicKey) { identities.set(key(address), publicKey); return signal.IdentityChange.NewOrUnchanged; }
    async isTrustedIdentity() { return true; }
    async getIdentity(address: signal.ProtocolAddress) { return identities.get(key(address)) ?? null; }
  }
  class PreKeys extends signal.PreKeyStore {
    async savePreKey(id: number, record: signal.PreKeyRecord) { preKeys.set(id, record); }
    async getPreKey(id: number) { return preKeys.get(id)!; }
    async removePreKey(id: number) { preKeys.delete(id); }
  }
  class Signed extends signal.SignedPreKeyStore {
    async saveSignedPreKey(id: number, record: signal.SignedPreKeyRecord) { signed.set(id, record); }
    async getSignedPreKey(id: number) { return signed.get(id)!; }
  }
  class Kyber extends signal.KyberPreKeyStore {
    async saveKyberPreKey(id: number, record: signal.KyberPreKeyRecord) { kyber.set(id, record); }
    async getKyberPreKey(id: number) { return kyber.get(id)!; }
    async markKyberPreKeyUsed() {}
  }
  const address = signal.ProtocolAddress.new(userId, deviceId);
  return { identity, registrationId, address, sessions: new Sessions(), identities: new Identities(), preKeys: new PreKeys(), signed: new Signed(), kyber: new Kyber(), signedMap: signed, kyberMap: kyber, preKeyMap: preKeys };
}

describe('le pont WASM et les liaisons officielles de libsignal se lisent l\'un l\'autre', () => {
  test('WASM ouvre une session PQXDH sur un bundle officiel ; l\'officiel déchiffre, répond, et WASM lit la réponse', async () => {
    const bob = officialDevice(BOB, 2);
    const spk = signal.PrivateKey.generate();
    const spkSignature = bob.identity.privateKey.sign(spk.getPublicKey().serialize());
    bob.signedMap.set(1, signal.SignedPreKeyRecord.new(1, Date.now(), spk.getPublicKey(), spk, spkSignature));
    const kem = signal.KEMKeyPair.generate();
    const kemSignature = bob.identity.privateKey.sign(kem.getPublicKey().serialize());
    bob.kyberMap.set(5, signal.KyberPreKeyRecord.new(5, Date.now(), kem, kemSignature));
    const opk = signal.PrivateKey.generate();
    bob.preKeyMap.set(9, signal.PreKeyRecord.new(9, opk.getPublicKey(), opk));

    const alice: EngineLocalDevice = { identity: engine.generateIdentity(), registrationId: 77, userId: ALICE, deviceId: 1 };
    const records = memoryRecords();
    records.apply(engine.startSession(alice, records.read, {
      userId: BOB, deviceId: 2, registrationId: bob.registrationId,
      identityKey: bob.identity.publicKey.serialize(),
      signedPreKey: { keyId: 1, publicKey: spk.getPublicKey().serialize(), signature: spkSignature },
      kyberPreKey: { keyId: 5, publicKey: kem.getPublicKey().serialize(), signature: kemSignature },
      preKey: { keyId: 9, publicKey: opk.getPublicKey().serialize() },
    }, Date.now()));
    const sent = engine.encrypt(alice, records.read, { userId: BOB, deviceId: 2 }, new TextEncoder().encode('{"text":"depuis le web","v":1}'), Date.now());
    records.apply(sent.writes);
    expect(sent.type).toBe(3);

    const aliceAddress = signal.ProtocolAddress.new(ALICE, 1);
    const plaintext = await signal.signalDecryptPreKey(signal.PreKeySignalMessage.deserialize(sent.body as Uint8Array<ArrayBuffer>), aliceAddress, bob.address, bob.sessions, bob.identities, bob.preKeys, bob.signed, bob.kyber);
    expect(new TextDecoder().decode(plaintext)).toBe('{"text":"depuis le web","v":1}');

    const reply = await signal.signalEncrypt(new TextEncoder().encode('depuis libsignal officiel'), aliceAddress, bob.address, bob.sessions, bob.identities);
    expect(reply.type()).toBe(2);
    const opened = engine.decrypt(alice, records.read, { userId: BOB, deviceId: 2 }, 2, reply.serialize());
    expect(new TextDecoder().decode(opened.plaintext)).toBe('depuis libsignal officiel');
  });

  test('l\'officiel ouvre une session sur un bundle publié par WASM ; WASM déchiffre le PreKeySignalMessage', async () => {
    const bob: EngineLocalDevice = { identity: engine.generateIdentity(), registrationId: 88, userId: BOB, deviceId: 3 };
    const records = memoryRecords();
    const spk = engine.generateSignedPreKey(bob.identity, 1, Date.now());
    const kem = engine.generateKyberPreKey(bob.identity, 2, Date.now());
    records.apply([{ kind: 'signedPreKey', key: '1', value: spk.record }, { kind: 'kyberPreKey', key: '2', value: kem.record }]);

    const alice = officialDevice(ALICE, 1);
    const bundle = signal.PreKeyBundle.new(
      bob.registrationId, 3, null, null,
      1, signal.PublicKey.deserialize(spk.publicKey as Uint8Array<ArrayBuffer>), spk.signature as Uint8Array<ArrayBuffer>,
      signal.PublicKey.deserialize(engine.identityPublicKey(bob.identity) as Uint8Array<ArrayBuffer>),
      2, signal.KEMPublicKey.deserialize(kem.publicKey as Uint8Array<ArrayBuffer>), kem.signature as Uint8Array<ArrayBuffer>,
    );
    const bobAddress = signal.ProtocolAddress.new(BOB, 3);
    await signal.processPreKeyBundle(bundle, bobAddress, alice.address, alice.sessions, alice.identities);
    const message = await signal.signalEncrypt(new TextEncoder().encode('depuis iOS (même Rust)'), bobAddress, alice.address, alice.sessions, alice.identities);
    expect(message.type()).toBe(3);
    const opened = engine.decrypt(bob, records.read, { userId: ALICE, deviceId: 1 }, 3, message.serialize());
    expect(new TextDecoder().decode(opened.plaintext)).toBe('depuis iOS (même Rust)');
  });

  test('XEdDSA : une signature du pont se vérifie par l\'officiel, et inversement', () => {
    const identity = engine.generateIdentity();
    const message = new TextEncoder().encode('meeshy-e2ee-device-binding:v1:u:1:k:1');
    const signature = engine.sign(identity, message);
    const publicKey = signal.PublicKey.deserialize(engine.identityPublicKey(identity) as Uint8Array<ArrayBuffer>);
    expect(publicKey.verify(message as Uint8Array<ArrayBuffer>, signature as Uint8Array<ArrayBuffer>)).toBe(true);
    const official = signal.IdentityKeyPair.generate();
    expect(engine.verify(official.publicKey.serialize(), message, official.privateKey.sign(message as Uint8Array<ArrayBuffer>))).toBe(true);
  });
});
