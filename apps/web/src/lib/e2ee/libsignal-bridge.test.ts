/**
 * Le pont libsignal du web (#17114), en usage : deux appareils web tirent leurs
 * clés, l'un ouvre une session depuis le bundle PUBLIC de l'autre, et ils
 * échangent dans les deux sens. Ce qui part vers le serveur (bundle, enveloppe)
 * ne contient jamais le clair ; une clé d'identité substituée est refusée.
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { LIBSIGNAL_WASM_FILE } from '@/lib/licences/libsignal-engine';

import { openLibsignalBridge, type DeviceIdentity, type LocalDevice, type PublicPreKeyBundle, type SignalAddress } from './libsignal-bridge';

const WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const bridge = await openLibsignalBridge(readFileSync(join(WEB_ROOT, LIBSIGNAL_WASM_FILE)));

const utf8 = (value: string): Uint8Array => new TextEncoder().encode(value);
const text = (raw: Uint8Array): string => new TextDecoder().decode(raw);
const contains = (haystack: Uint8Array, needle: Uint8Array): boolean =>
  haystack.some((_, start) => needle.every((value, offset) => haystack[start + offset] === value));

const rejected = (attempt: Promise<unknown>): Promise<boolean> =>
  attempt.then(
    () => false,
    () => true,
  );

const deviceOf = (identity: DeviceIdentity, address: SignalAddress): LocalDevice => ({
  identityKeyPair: identity.identityKeyPair,
  registrationId: identity.registrationId,
  address,
});

const ALICE: SignalAddress = { name: 'web-alice', deviceId: 1 };
const BOB: SignalAddress = { name: 'web-bob', deviceId: 2 };

const bobWithBundle = async () => {
  const identity = await bridge.generateIdentity();
  const signedPreKey = await bridge.generateSignedPreKey({ identityKeyPair: identity.identityKeyPair, id: 7, now: 1_790_000_000_000 });
  const kyberPreKey = await bridge.generateKyberPreKey({ identityKeyPair: identity.identityKeyPair, id: 8, now: 1_790_000_000_000 });
  const preKey = await bridge.generatePreKey({ id: 9 });
  const bundle: PublicPreKeyBundle = {
    registrationId: identity.registrationId,
    identityKey: identity.identityKey,
    signedPreKey: { id: signedPreKey.id, publicKey: signedPreKey.publicKey, signature: signedPreKey.signature },
    kyberPreKey: { id: kyberPreKey.id, publicKey: kyberPreKey.publicKey, signature: kyberPreKey.signature },
    preKey: { id: preKey.id, publicKey: preKey.publicKey },
  };
  const preKeys = { signedPreKeys: [signedPreKey], kyberPreKeys: [kyberPreKey], preKeys: [preKey], seenBaseKeys: [] };
  return { identity, device: deviceOf(identity, BOB), bundle, preKeys };
};

describe('le pont libsignal du web, entre deux appareils (#17114)', () => {
  test('une session ouverte depuis le bundle public chiffre et déchiffre dans les deux sens (PQXDH puis Double Ratchet)', async () => {
    const bob = await bobWithBundle();
    const alice = deviceOf(await bridge.generateIdentity(), ALICE);

    const started = await bridge.startSession({ local: alice, remote: BOB, remoteIdentity: null, bundle: bob.bundle });
    expect(started.remoteIdentity).toEqual(bob.identity.identityKey);

    const hello = await bridge.seal({ local: alice, remote: BOB, remoteIdentity: started.remoteIdentity, session: started.session, plaintext: utf8('Salut Bob 👋 — depuis le web') });
    expect(hello.message.type).toBe(3);

    const opened = await bridge.open({ local: bob.device, remote: ALICE, remoteIdentity: null, session: null, preKeys: bob.preKeys, message: hello.message });
    expect(text(opened.plaintext)).toBe('Salut Bob 👋 — depuis le web');
    expect({ preKey: opened.usedPreKeyId, kyber: opened.usedKyberPreKeyId }).toEqual({ preKey: 9, kyber: 8 });

    const reply = await bridge.seal({ local: bob.device, remote: ALICE, remoteIdentity: opened.remoteIdentity, session: opened.session, plaintext: utf8('Reçu, le ratchet tourne') });
    expect(reply.message.type).toBe(2);

    const back = await bridge.open({
      local: alice,
      remote: BOB,
      remoteIdentity: hello.remoteIdentity,
      session: hello.session,
      preKeys: { signedPreKeys: [], kyberPreKeys: [], preKeys: [], seenBaseKeys: [] },
      message: reply.message,
    });
    expect(text(back.plaintext)).toBe('Reçu, le ratchet tourne');
    expect(back.usedPreKeyId).toBeNull();
  });

  test('ni le bundle public ni l’enveloppe ne transportent le clair ou une clé privée', async () => {
    const bob = await bobWithBundle();
    const alice = deviceOf(await bridge.generateIdentity(), ALICE);
    const plaintext = utf8('le secret ne voyage jamais en clair');
    const started = await bridge.startSession({ local: alice, remote: BOB, remoteIdentity: null, bundle: bob.bundle });
    const sealed = await bridge.seal({ local: alice, remote: BOB, remoteIdentity: null, session: started.session, plaintext });

    expect(contains(sealed.message.body, plaintext)).toBe(false);
    const published = [bob.bundle.identityKey, bob.bundle.signedPreKey.publicKey, bob.bundle.kyberPreKey.publicKey, bob.bundle.preKey?.publicKey ?? new Uint8Array()];
    expect(published.some((part) => contains(part, bob.identity.identityKeyPair.slice(-32)))).toBe(false);
  });

  test('une identité différente de celle déjà connue est refusée, au bundle comme au message (substitution de clé)', async () => {
    const bob = await bobWithBundle();
    const impostor = await bobWithBundle();
    const alice = deviceOf(await bridge.generateIdentity(), ALICE);

    expect(await rejected(bridge.startSession({ local: alice, remote: BOB, remoteIdentity: bob.identity.identityKey, bundle: impostor.bundle }))).toBe(true);

    const started = await bridge.startSession({ local: alice, remote: BOB, remoteIdentity: bob.identity.identityKey, bundle: bob.bundle });
    const hello = await bridge.seal({ local: alice, remote: BOB, remoteIdentity: started.remoteIdentity, session: started.session, plaintext: utf8('bonjour') });
    const otherAlice = await bridge.generateIdentity();
    expect(await rejected(
      bridge.open({ local: bob.device, remote: ALICE, remoteIdentity: otherAlice.identityKey, session: null, preKeys: bob.preKeys, message: hello.message }),
    )).toBe(true);
  });

  test('un bundle à la signature falsifiée est refusé', async () => {
    const bob = await bobWithBundle();
    const alice = deviceOf(await bridge.generateIdentity(), ALICE);
    const signature = bob.bundle.signedPreKey.signature.map((value, index) => (index === 0 ? value ^ 0x01 : value));
    expect(await rejected(
      bridge.startSession({ local: alice, remote: BOB, remoteIdentity: null, bundle: { ...bob.bundle, signedPreKey: { ...bob.bundle.signedPreKey, signature } } }),
    )).toBe(true);
  });

  test('un premier message rejoué sur la pré-clé Kyber de dernier recours est refusé, vers le même expéditeur comme vers un autre (anti-rejeu)', async () => {
    const bob = await bobWithBundle();
    const alice = deviceOf(await bridge.generateIdentity(), ALICE);
    const lastResort = { ...bob.preKeys, preKeys: [] };
    const started = await bridge.startSession({ local: alice, remote: BOB, remoteIdentity: null, bundle: { ...bob.bundle, preKey: null } });
    const hello = await bridge.seal({ local: alice, remote: BOB, remoteIdentity: null, session: started.session, plaintext: utf8('une seule fois') });

    const opened = await bridge.open({ local: bob.device, remote: ALICE, remoteIdentity: null, session: null, preKeys: lastResort, message: hello.message });
    expect(text(opened.plaintext)).toBe('une seule fois');
    expect({ preKey: opened.usedPreKeyId, kyber: opened.usedKyberPreKeyId, signed: opened.usedSignedPreKeyId }).toEqual({ preKey: null, kyber: 8, signed: 7 });
    expect(opened.usedBaseKey).not.toBeNull();

    const seen = { ...lastResort, seenBaseKeys: [{ kyberPreKeyId: 8, signedPreKeyId: 7, baseKey: opened.usedBaseKey ?? new Uint8Array() }] };
    const MALLORY: SignalAddress = { name: 'mallory', deviceId: 1 };
    expect(await rejected(bridge.open({ local: bob.device, remote: ALICE, remoteIdentity: null, session: null, preKeys: seen, message: hello.message }))).toBe(true);
    expect(await rejected(bridge.open({ local: bob.device, remote: MALLORY, remoteIdentity: null, session: null, preKeys: seen, message: hello.message }))).toBe(true);
  });

  test('une pré-clé à usage unique déjà consommée n’ouvre pas une seconde session', async () => {
    const bob = await bobWithBundle();
    const alice = deviceOf(await bridge.generateIdentity(), ALICE);
    const started = await bridge.startSession({ local: alice, remote: BOB, remoteIdentity: null, bundle: bob.bundle });
    const hello = await bridge.seal({ local: alice, remote: BOB, remoteIdentity: null, session: started.session, plaintext: utf8('premier') });
    const withoutConsumed = { ...bob.preKeys, preKeys: [] };
    expect(await rejected(bridge.open({ local: bob.device, remote: ALICE, remoteIdentity: null, session: null, preKeys: withoutConsumed, message: hello.message }))).toBe(true);
  });
});
