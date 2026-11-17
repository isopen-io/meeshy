/**
 * LE PONT libsignal v2 DU WEB (#18992, #18993, #18994, #18995) — ce que
 * l'enrôlement, la réception et Sesame exigent, par composition de
 * `libsignal-protocol` seulement :
 *
 *  - la preuve de liaison d'un appareil, SIGNÉE par le pont sur le message
 *    EXACT que la passerelle reconstruit (`deviceBindingMessage`, le même que
 *    l'iPhone signe) et vérifiée par le vérificateur de PRODUCTION de la
 *    passerelle (`libsignalSignatureVerifier`, sur `@signalapp/libsignal-client`
 *    natif) ;
 *  - la `registrationId` distante d'une session, et l'en-tête d'un premier
 *    message lu sans le déchiffrer ;
 *  - des erreurs qui portent un `code` stable et disent s'il faut ACQUITTER
 *    l'enveloppe ou RÉESSAYER, sans jamais lire un texte ;
 *  - une clé de base déjà vue qui n'empêche plus de déchiffrer ;
 *  - une session qui ne circule plus par valeur : un BAIL, refusé à un second
 *    contexte du même onglet tant que le premier le tient.
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { deviceBindingMessage } from '@meeshy/shared/types/e2ee-directory';

import { libsignalSignatureVerifier, type LibsignalPublicKeyApi } from '../../../../../services/gateway/src/services/e2ee/signature-verifier';
import { LIBSIGNAL_WASM_FILE } from '@/lib/licences/libsignal-engine';

import {
  LIBSIGNAL_ERROR_DISPOSITION,
  LibsignalBridgeError,
  openLibsignalBridge,
  type DeviceIdentity,
  type DevicePreKeys,
  type LocalDevice,
  type PublicPreKeyBundle,
  type SignalAddress,
} from './libsignal-bridge';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..', '..', '..');
const bridge = await openLibsignalBridge(readFileSync(join(HERE, '..', '..', '..', LIBSIGNAL_WASM_FILE)));
const nativeLibsignal = createRequire(join(REPO, 'services', 'gateway', 'package.json'))('@signalapp/libsignal-client') as LibsignalPublicKeyApi;
const gatewayVerifier = libsignalSignatureVerifier(() => nativeLibsignal);

const utf8 = (value: string): Uint8Array => new TextEncoder().encode(value);
const text = (raw: Uint8Array): string => new TextDecoder().decode(raw);
const b64 = (raw: Uint8Array): string => Buffer.from(raw).toString('base64');

const codeOf = async (attempt: Promise<unknown>): Promise<string> =>
  attempt.then(
    () => 'résolu',
    (error: unknown) => (error instanceof LibsignalBridgeError ? error.code : `non typé : ${String(error)}`),
  );

const deviceOf = (identity: DeviceIdentity, address: SignalAddress): LocalDevice => ({ identityKeyPair: identity.identityKeyPair, registrationId: identity.registrationId, address });

let next = 0;
const address = (name: string): SignalAddress => ({ name: `${name}-${(next += 1)}`, deviceId: 1 });

const withBundle = async (name: string) => {
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
  const preKeys: DevicePreKeys = { signedPreKeys: [signedPreKey], kyberPreKeys: [kyberPreKey], preKeys: [preKey], seenBaseKeys: [] };
  return { identity, device: deviceOf(identity, address(name)), bundle, preKeys };
};

/** Alice ouvre une session vers Bob et lui scelle `messages` dans un même bail. */
const aliceWrites = async (bob: Awaited<ReturnType<typeof withBundle>>, messages: readonly string[], bundle: PublicPreKeyBundle = bob.bundle) => {
  const alice = deviceOf(await bridge.generateIdentity(), address('alice'));
  const sealed = await bridge.withSession({ local: alice, remote: bob.device.address, session: null, remoteIdentity: null }, async (lease) => {
    await lease.startSession({ bundle });
    const out = [];
    for (const message of messages) out.push(await lease.seal({ plaintext: utf8(message) }));
    return out;
  });
  return { alice, sealed };
};

describe('la preuve de liaison — signée par le pont, vérifiée par la passerelle (#18992)', () => {
  test('la signature du message EXACT que la passerelle reconstruit est acceptée par son vérificateur de production', async () => {
    const identity = await bridge.generateIdentity();
    const binding = { userId: '64b0f00000000000000000aa', registrationId: identity.registrationId, identityKey: b64(identity.identityKey), timestamp: 1_790_000_000_123 };
    const message = deviceBindingMessage(binding);
    expect(message).toBe(`meeshy-e2ee-device-binding:v1:64b0f00000000000000000aa:${identity.registrationId}:${b64(identity.identityKey)}:1790000000123`);

    const signature = await bridge.signWithIdentity({ identityKeyPair: identity.identityKeyPair, message: utf8(message) });

    expect(signature).toHaveLength(64);
    expect(await gatewayVerifier.verify({ identityKey: binding.identityKey, message: b64(utf8(message)), signature: b64(signature) })).toBe(true);
    expect(await bridge.verifyWithIdentity({ identityKey: identity.identityKey, message: utf8(message), signature })).toBe(true);
  });

  test('un horodatage décalé d’une milliseconde, ou une autre identité, ne se vérifie pas', async () => {
    const identity = await bridge.generateIdentity();
    const other = await bridge.generateIdentity();
    const binding = { userId: '64b0f00000000000000000aa', registrationId: identity.registrationId, identityKey: b64(identity.identityKey), timestamp: 1_790_000_000_123 };
    const signature = await bridge.signWithIdentity({ identityKeyPair: identity.identityKeyPair, message: utf8(deviceBindingMessage(binding)) });
    const shifted = utf8(deviceBindingMessage({ ...binding, timestamp: binding.timestamp + 1 }));

    expect(await gatewayVerifier.verify({ identityKey: binding.identityKey, message: b64(shifted), signature: b64(signature) })).toBe(false);
    expect(await bridge.verifyWithIdentity({ identityKey: other.identityKey, message: utf8(deviceBindingMessage(binding)), signature })).toBe(false);
  });

  test('XEdDSA est aléatoire : deux signatures du même message diffèrent, et toutes deux se vérifient', async () => {
    const identity = await bridge.generateIdentity();
    const message = utf8('meeshy-e2ee-device-binding:v1:u:1:k:1');
    const first = await bridge.signWithIdentity({ identityKeyPair: identity.identityKeyPair, message });
    const second = await bridge.signWithIdentity({ identityKeyPair: identity.identityKeyPair, message });

    expect(b64(first)).not.toBe(b64(second));
    expect(await bridge.verifyWithIdentity({ identityKey: identity.identityKey, message, signature: second })).toBe(true);
  });
});

describe('Sesame et réception — la génération d’une session, l’en-tête d’un premier message (#18992)', () => {
  test('la `registrationId` distante se lit dans l’enregistrement, des deux côtés', async () => {
    const bob = await withBundle('bob');
    const { alice, sealed } = await aliceWrites(bob, ['bonjour']);
    const [hello] = sealed;
    if (hello === undefined) throw new Error('aucun message scellé');

    expect(await bridge.sessionRemoteRegistrationId(hello.session)).toBe(bob.identity.registrationId);
    const opened = await bridge.withSession({ local: bob.device, remote: alice.address, session: null, remoteIdentity: null }, (lease) => lease.open({ message: hello.message, preKeys: bob.preKeys }));
    expect(await bridge.sessionRemoteRegistrationId(opened.session)).toBe(alice.registrationId);
  });

  test('l’en-tête d’un premier message dit ses pré-clés, la génération et l’identité de l’expéditeur, sans le déchiffrer', async () => {
    const bob = await withBundle('bob');
    const { alice, sealed } = await aliceWrites(bob, ['premier']);
    const [hello] = sealed;
    if (hello === undefined) throw new Error('aucun message scellé');
    const aliceIdentity = await bridge.withSession({ local: bob.device, remote: alice.address, session: null, remoteIdentity: null }, async (lease) => {
      const opened = await lease.open({ message: hello.message, preKeys: bob.preKeys });
      return opened.remoteIdentity;
    });

    const info = await bridge.preKeyMessageInfo(hello.message.body);

    expect(info).toEqual({ registrationId: alice.registrationId, preKeyId: 9, kyberPreKeyId: 8, signedPreKeyId: 7, identityKey: aliceIdentity });
  });

  test('l’en-tête de ce qui n’est pas un premier message est refusé, avec un code qui s’acquitte', async () => {
    const garbage = await bridge.preKeyMessageInfo(utf8('pas un message libsignal')).then(
      () => null,
      (error: unknown) => error,
    );

    expect(garbage).toBeInstanceOf(LibsignalBridgeError);
    expect(garbage instanceof LibsignalBridgeError ? garbage.disposition : null).toBe('acknowledge');
  });
});

describe('les erreurs typées — acquitter ou réessayer, sans lire un texte (#18993)', () => {
  test('chaque cas rend son code et sa conduite', async () => {
    const bob = await withBundle('bob');
    const { alice, sealed } = await aliceWrites(bob, ['un', 'deux']);
    const [first] = sealed;
    if (first === undefined) throw new Error('aucun message scellé');
    const stranger = await bridge.generateIdentity();
    const bobOpens = (preKeys: DevicePreKeys, remoteIdentity: Uint8Array | null = null) =>
      bridge.withSession({ local: bob.device, remote: alice.address, session: null, remoteIdentity }, (lease) => lease.open({ message: first.message, preKeys }));

    expect(await codeOf(bobOpens({ ...bob.preKeys, preKeys: [] }))).toBe('INVALID_PREKEY_ID');
    expect(await codeOf(bobOpens({ ...bob.preKeys, kyberPreKeys: [] }))).toBe('INVALID_KYBER_PREKEY_ID');
    expect(await codeOf(bobOpens(bob.preKeys, stranger.identityKey))).toBe('UNTRUSTED_IDENTITY');

    const opened = await bobOpens(bob.preKeys);
    expect(
      await codeOf(bridge.withSession({ local: bob.device, remote: alice.address, session: opened.session, remoteIdentity: opened.remoteIdentity }, (lease) => lease.open({ message: first.message, preKeys: bob.preKeys }))),
    ).toBe('DUPLICATED_MESSAGE');
    expect(
      await codeOf(bridge.withSession({ local: bob.device, remote: alice.address, session: null, remoteIdentity: null }, (lease) => lease.open({ message: { type: 2, body: utf8('corrompu') }, preKeys: bob.preKeys }))),
    ).toBe('INVALID_MESSAGE');
    expect(
      await codeOf(bridge.withSession({ local: { ...bob.device, identityKeyPair: utf8('pas une paire') }, remote: alice.address, session: null, remoteIdentity: null }, (lease) => lease.open({ message: first.message, preKeys: bob.preKeys }))),
    ).toBe('LOCAL_STATE_INVALID');
  });

  test('la conduite : une identité non approuvée et un état local illisible se RÉESSAIENT, un message invalide ou rejoué s’ACQUITTE', () => {
    expect(LIBSIGNAL_ERROR_DISPOSITION.UNTRUSTED_IDENTITY).toBe('retry');
    expect(LIBSIGNAL_ERROR_DISPOSITION.LOCAL_STATE_INVALID).toBe('retry');
    expect(LIBSIGNAL_ERROR_DISPOSITION.SESSION_BUSY).toBe('retry');
    expect(LIBSIGNAL_ERROR_DISPOSITION.DUPLICATED_MESSAGE).toBe('acknowledge');
    expect(LIBSIGNAL_ERROR_DISPOSITION.INVALID_MESSAGE).toBe('acknowledge');
    expect(LIBSIGNAL_ERROR_DISPOSITION.INVALID_PREKEY_ID).toBe('acknowledge');
    expect(new LibsignalBridgeError('INVALID_MESSAGE', 'x').disposition).toBe('acknowledge');
  });
});

describe('une clé de base déjà vue n’empêche plus de déchiffrer (#18994)', () => {
  test('un doublon persisté n’empêche pas d’ouvrir un message ordinaire, et le rejeu du premier message reste refusé', async () => {
    const bob = await withBundle('bob');
    const lastResort: DevicePreKeys = { ...bob.preKeys, preKeys: [] };
    const { alice, sealed } = await aliceWrites(bob, ['une seule fois', 'ensuite'], { ...bob.bundle, preKey: null });
    const [hello, after] = sealed;
    if (hello === undefined || after === undefined) throw new Error('messages manquants');

    const opened = await bridge.withSession({ local: bob.device, remote: alice.address, session: null, remoteIdentity: null }, (lease) => lease.open({ message: hello.message, preKeys: lastResort }));
    const seen = { kyberPreKeyId: 8, signedPreKeyId: 7, baseKey: opened.usedBaseKey ?? new Uint8Array() };
    const duplicated: DevicePreKeys = { ...lastResort, seenBaseKeys: [seen, { ...seen, baseKey: new Uint8Array(seen.baseKey) }] };

    const next = await bridge.withSession({ local: bob.device, remote: alice.address, session: opened.session, remoteIdentity: opened.remoteIdentity }, (lease) => lease.open({ message: after.message, preKeys: duplicated }));
    expect(text(next.plaintext)).toBe('ensuite');

    expect(await codeOf(bridge.withSession({ local: bob.device, remote: address('mallory'), session: null, remoteIdentity: null }, (lease) => lease.open({ message: hello.message, preKeys: duplicated })))).toBe('INVALID_MESSAGE');
  });
});

describe('le bail de session — la session ne circule plus par valeur, et un second contexte est refusé (#18995)', () => {
  test('deux scellements dans un bail font avancer la chaîne : deux compteurs, deux messages lisibles dans l’ordre', async () => {
    const bob = await withBundle('bob');
    const { alice, sealed } = await aliceWrites(bob, ['même texte', 'même texte']);
    const [first, second] = sealed;
    if (first === undefined || second === undefined) throw new Error('messages manquants');

    expect(b64(first.message.body)).not.toBe(b64(second.message.body));
    const read = await bridge.withSession({ local: bob.device, remote: alice.address, session: null, remoteIdentity: null }, async (lease) => [
      text((await lease.open({ message: first.message, preKeys: bob.preKeys })).plaintext),
      text((await lease.open({ message: second.message, preKeys: bob.preKeys })).plaintext),
    ]);
    expect(read).toEqual(['même texte', 'même texte']);
  });

  test('un second bail sur la même adresse est REFUSÉ tant que le premier est tenu, puis permis', async () => {
    const bob = await withBundle('bob');
    const alice = deviceOf(await bridge.generateIdentity(), address('alice'));
    const peer = { local: alice, remote: bob.device.address, session: null, remoteIdentity: null };

    const first = bridge.leaseSession(peer);
    expect(await codeOf((async () => bridge.leaseSession(peer))())).toBe('SESSION_BUSY');
    first.release();

    const again = bridge.leaseSession(peer);
    again.release();
  });

  test('un bail rendu ne fait plus rien avancer, et le bail de `withSession` se rend même sur un échec', async () => {
    const bob = await withBundle('bob');
    const alice = deviceOf(await bridge.generateIdentity(), address('alice'));
    const peer = { local: alice, remote: bob.device.address, session: null, remoteIdentity: null };
    const lease = bridge.leaseSession(peer);
    await lease.startSession({ bundle: bob.bundle });
    lease.release();

    expect(await codeOf(lease.seal({ plaintext: utf8('trop tard') }))).toBe('SESSION_RELEASED');
    expect(await codeOf(bridge.withSession(peer, () => Promise.reject(new LibsignalBridgeError('PROTOCOL', 'échec simulé'))))).toBe('PROTOCOL');
    bridge.leaseSession(peer).release();
  });

  test('un bail repris sur une session rangée n’a rien de neuf à ranger avant sa première opération', async () => {
    const bob = await withBundle('bob');
    const { alice, sealed } = await aliceWrites(bob, ['un']);
    const [hello] = sealed;
    if (hello === undefined) throw new Error('aucun message scellé');

    await bridge.withSession({ local: alice, remote: bob.device.address, session: hello.session, remoteIdentity: hello.remoteIdentity }, async (lease) => {
      expect(lease.state()).toBeNull();
      const next = await lease.seal({ plaintext: utf8('deux') });
      expect(lease.state()).toEqual({ session: next.session, remoteIdentity: next.remoteIdentity });
    });
  });

  test('l’état rangé après chaque opération est celui du bail — un échec ne le change pas', async () => {
    const bob = await withBundle('bob');
    const alice = deviceOf(await bridge.generateIdentity(), address('alice'));
    await bridge.withSession({ local: alice, remote: bob.device.address, session: null, remoteIdentity: null }, async (lease) => {
      expect(lease.state()).toBeNull();
      const started = await lease.startSession({ bundle: bob.bundle });
      expect(lease.state()).toEqual(started);
      const before = lease.state();
      expect(await codeOf(lease.open({ message: { type: 2, body: utf8('corrompu') }, preKeys: bob.preKeys }))).toBe('INVALID_MESSAGE');
      expect(lease.state()).toEqual(before);
    });
  });
});

/**
 * L'ALÉA DU PONT VIENT DU NAVIGATEUR (#17292, constat WEB-11) — la colle passe
 * `crypto.getRandomValues` au binaire. Une colle qui rendrait un aléa constant
 * rendrait des identités égales : vingt identités tirées doivent toutes différer.
 */
describe('l’aléa du pont', () => {
  test('vingt identités tirées sont vingt identités distinctes', async () => {
    const identities = await Promise.all(Array.from({ length: 20 }, () => bridge.generateIdentity()));

    expect(new Set(identities.map(({ identityKey }) => b64(identityKey))).size).toBe(20);
    expect(new Set(identities.map(({ identityKeyPair }) => b64(identityKeyPair))).size).toBe(20);
  });
});
