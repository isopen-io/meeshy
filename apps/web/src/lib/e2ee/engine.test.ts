import { describe, expect, test } from 'bun:test';
import { E2EEEngineVerdict, PRE_KEY_MESSAGE_TYPE, SIGNAL_MESSAGE_TYPE, type EngineBundle, type EngineLocalDevice } from './engine';
import { memoryRecords, testDevice, testEngine } from './test-support/engine';
import { thrown } from './test-support/errors';

const engine = testEngine();
const text = (value: string) => new TextEncoder().encode(value);
const read = (value: Uint8Array) => new TextDecoder().decode(value);

/** Un appareil qui publie un bundle, ses parties privées rangées dans ses enregistrements. */
function publishing(device: EngineLocalDevice, withOneTime = true) {
  const records = memoryRecords();
  const signed = engine.generateSignedPreKey(device.identity, 1, Date.now());
  const kyber = engine.generateKyberPreKey(device.identity, 1, Date.now());
  const oneTime = engine.generatePreKey(7);
  records.apply([
    { kind: 'signedPreKey', key: '1', value: signed.record },
    { kind: 'kyberPreKey', key: '1', value: kyber.record },
    { kind: 'preKey', key: '7', value: oneTime.record },
  ]);
  const bundle: EngineBundle = {
    userId: device.userId,
    deviceId: device.deviceId,
    registrationId: device.registrationId,
    identityKey: engine.identityPublicKey(device.identity),
    signedPreKey: { keyId: 1, publicKey: signed.publicKey, signature: signed.signature },
    kyberPreKey: { keyId: 1, publicKey: kyber.publicKey, signature: kyber.signature },
    preKey: withOneTime ? { keyId: 7, publicKey: oneTime.publicKey } : null,
  };
  return { records, bundle };
}

describe('libsignal en WASM — PQXDH puis Double Ratchet, sans primitive maison', () => {
  test('une session PQXDH ouverte sur un bundle chiffre un PreKeySignalMessage que le destinataire ouvre', () => {
    const alice = testDevice('a'.repeat(24), 1);
    const bob = testDevice('b'.repeat(24), 2);
    const aliceRecords = memoryRecords();
    const bobSide = publishing(bob);

    aliceRecords.apply(engine.startSession(alice, aliceRecords.read, bobSide.bundle, Date.now()));
    const first = engine.encrypt(alice, aliceRecords.read, bob, text('Bonjour Bob'), Date.now());
    aliceRecords.apply(first.writes);
    expect(first.type).toBe(PRE_KEY_MESSAGE_TYPE);

    const opened = engine.decrypt(bob, bobSide.records.read, alice, first.type, first.body);
    bobSide.records.apply(opened.writes);
    expect(read(opened.plaintext)).toBe('Bonjour Bob');
    expect(bobSide.records.read('preKey', '7')).toBeUndefined();
    expect(bobSide.records.read('kyberPreKey', '1')).toBeUndefined();

    const reply = engine.encrypt(bob, bobSide.records.read, alice, text('Salut Alice'), Date.now());
    bobSide.records.apply(reply.writes);
    expect(reply.type).toBe(SIGNAL_MESSAGE_TYPE);
    const back = engine.decrypt(alice, aliceRecords.read, bob, reply.type, reply.body);
    aliceRecords.apply(back.writes);
    expect(read(back.plaintext)).toBe('Salut Alice');
  });

  test('les messages hors ordre se déchiffrent, et un rejeu est refusé', () => {
    const alice = testDevice('a'.repeat(24), 1);
    const bob = testDevice('b'.repeat(24), 2);
    const aliceRecords = memoryRecords();
    const bobSide = publishing(bob, false);
    aliceRecords.apply(engine.startSession(alice, aliceRecords.read, bobSide.bundle, Date.now()));
    const sent = ['un', 'deux', 'trois'].map((word) => {
      const message = engine.encrypt(alice, aliceRecords.read, bob, text(word), Date.now());
      aliceRecords.apply(message.writes);
      return message;
    });
    const order = [2, 0, 1];
    const received = order.map((index) => {
      const message = sent[index]!;
      const opened = engine.decrypt(bob, bobSide.records.read, alice, message.type, message.body);
      bobSide.records.apply(opened.writes);
      return read(opened.plaintext);
    });
    expect(received).toEqual(['trois', 'un', 'deux']);
    const replayed = sent[1]!;
    expect(thrown(() => engine.decrypt(bob, bobSide.records.read, alice, replayed.type, replayed.body))).toBeInstanceOf(E2EEEngineVerdict);
  });

  test('une pré-clé signée dont la signature ne vient pas de l\'identité est refusée par libsignal', () => {
    const alice = testDevice('a'.repeat(24), 1);
    const bob = testDevice('b'.repeat(24), 2);
    const mallory = testDevice('c'.repeat(24), 3);
    const forged = publishing(bob);
    const substituted: EngineBundle = { ...forged.bundle, identityKey: engine.identityPublicKey(mallory.identity) };
    const records = memoryRecords();
    expect(thrown(() => engine.startSession(alice, records.read, substituted, Date.now()))).toBeInstanceOf(E2EEEngineVerdict);
    expect(records.map.size).toBe(0);
  });

  test('un envoi vers un de MES appareils exige la clé épinglée (spec § 3.5)', () => {
    const alice = testDevice('a'.repeat(24), 1);
    const aliceMac = testDevice('a'.repeat(24), 2);
    const records = memoryRecords();
    const mac = publishing(aliceMac);
    expect(thrown(() => engine.startSession(alice, records.read, mac.bundle, Date.now()))).toBeInstanceOf(E2EEEngineVerdict);
    records.apply([{ kind: 'ownDevicePin', key: '2', value: mac.bundle.identityKey }]);
    records.apply(engine.startSession(alice, records.read, mac.bundle, Date.now()));
    expect(engine.sessionRegistrationId(records.read('session', `${'a'.repeat(24)}.2`)!)).toBe(aliceMac.registrationId);
  });

  test('XEdDSA : une signature d\'identité se vérifie sous sa clé publique, et pas sous une autre', () => {
    const device = testDevice('a'.repeat(24), 1);
    const other = testDevice('b'.repeat(24), 1);
    const message = text('meeshy-e2ee-device-binding:v1:x');
    const signature = engine.sign(device.identity, message);
    expect(engine.verify(engine.identityPublicKey(device.identity), message, signature)).toBe(true);
    expect(engine.verify(engine.identityPublicKey(other.identity), message, signature)).toBe(false);
  });
});
