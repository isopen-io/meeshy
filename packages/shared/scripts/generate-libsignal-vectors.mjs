/**
 * Les VECTEURS CROISÉS de libsignal (#17113) : un échange PQXDH puis Double Ratchet
 * scellé par la vraie bibliothèque, que la passerelle (jest), le SDK iOS
 * (MeeshySDKTests/E2EE) et `:core:e2ee` Android rejouent sur le MÊME fichier.
 *
 *   cd packages/shared && node scripts/generate-libsignal-vectors.mjs
 *
 * Toutes les clés sont des clés de TEST, tirées ici et jamais réutilisées. Le
 * script vérifie lui-même chaque vecteur avant de l'écrire. Une montée de
 * libsignal déplace d'abord le fichier courant dans
 * `fixtures/libsignal/legacy/<ancienne version>.vectors.json` (les trois bancs
 * le rejouent encore, #9231), puis le régénère, et la garde
 * `__tests__/ci/libsignal-version-alignment.test.ts` exige qu'il porte la même
 * version que les quatre déclarations du dépôt.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import * as signal from '@signalapp/libsignal-client';
import { overwriteRefusal } from './libsignal-vectors-overwrite.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUTPUT = join(HERE, '..', 'fixtures', 'libsignal', 'cross-platform.vectors.json');
const VERSION = JSON.parse(
  readFileSync(createRequire(import.meta.url).resolve('@signalapp/libsignal-client/package.json'), 'utf8'),
).version;
const TIMESTAMP = 1_790_000_000_000;

const existingVersion = existsSync(OUTPUT) ? JSON.parse(readFileSync(OUTPUT, 'utf8')).libsignal : undefined;
const refusal = overwriteRefusal({
  existingVersion,
  version: VERSION,
  legacyExists: existingVersion !== undefined && existsSync(join(dirname(OUTPUT), 'legacy', `${existingVersion}.vectors.json`)),
});
if (refusal !== undefined) {
  process.stderr.write(`${refusal}\n`);
  process.exit(1);
}

const b64 = (bytes) => Buffer.from(bytes).toString('base64');
const utf8 = (text) => new TextEncoder().encode(text);
const text = (bytes) => new TextDecoder().decode(bytes);

const memoryStores = (identity, registrationId) => {
  const sessions = new Map();
  const identities = new Map();
  const preKeys = new Map();
  const signedPreKeys = new Map();
  const kyberPreKeys = new Map();
  return {
    sessions,
    preKeys,
    signedPreKeys,
    kyberPreKeys,
    session: new (class extends signal.SessionStore {
      async saveSession(address, record) { sessions.set(address.toString(), record.serialize()); }
      async getSession(address) {
        const raw = sessions.get(address.toString());
        return raw ? signal.SessionRecord.deserialize(raw) : null;
      }
      async getExistingSessions(addresses) { return Promise.all(addresses.map((address) => this.getSession(address))); }
    })(),
    identity: new (class extends signal.IdentityKeyStore {
      async getIdentityKey() { return identity.privateKey; }
      async getLocalRegistrationId() { return registrationId; }
      async saveIdentity(address, key) {
        identities.set(address.toString(), key.serialize());
        return signal.IdentityChange.NewOrUnchanged;
      }
      async isTrustedIdentity() { return true; }
      async getIdentity(address) {
        const raw = identities.get(address.toString());
        return raw ? signal.PublicKey.deserialize(raw) : null;
      }
    })(),
    preKey: new (class extends signal.PreKeyStore {
      async savePreKey(id, record) { preKeys.set(id, record); }
      async getPreKey(id) { return preKeys.get(id); }
      async removePreKey(id) { preKeys.delete(id); }
    })(),
    signedPreKey: new (class extends signal.SignedPreKeyStore {
      async saveSignedPreKey(id, record) { signedPreKeys.set(id, record); }
      async getSignedPreKey(id) { return signedPreKeys.get(id); }
    })(),
    kyberPreKey: new (class extends signal.KyberPreKeyStore {
      async saveKyberPreKey(id, record) { kyberPreKeys.set(id, record); }
      async getKyberPreKey(id) { return kyberPreKeys.get(id); }
      async markKyberPreKeyUsed(id) { kyberPreKeys.delete(id); }
    })(),
  };
};

const device = (name) => {
  const identity = signal.IdentityKeyPair.generate();
  const registrationId = 1 + Math.floor(Math.random() * 0x3fff);
  return {
    name,
    identity,
    registrationId,
    address: signal.ProtocolAddress.new(name, 1),
    stores: memoryStores(identity, registrationId),
  };
};

const ALICE = device('a1'.repeat(12));
const BOB = device('b2'.repeat(12));

const spkPrivate = signal.PrivateKey.generate();
const spkSignature = BOB.identity.privateKey.sign(spkPrivate.getPublicKey().serialize());
const signedPreKey = signal.SignedPreKeyRecord.new(1, TIMESTAMP, spkPrivate.getPublicKey(), spkPrivate, spkSignature);
const kyberPair = signal.KEMKeyPair.generate();
const kyberSignature = BOB.identity.privateKey.sign(kyberPair.getPublicKey().serialize());
const kyberPreKey = signal.KyberPreKeyRecord.new(1, TIMESTAMP, kyberPair, kyberSignature);
const otpPrivate = signal.PrivateKey.generate();
const preKey = signal.PreKeyRecord.new(1, otpPrivate.getPublicKey(), otpPrivate);
BOB.stores.signedPreKeys.set(1, signedPreKey);
BOB.stores.kyberPreKeys.set(1, kyberPreKey);
BOB.stores.preKeys.set(1, preKey);

const bundle = signal.PreKeyBundle.new(
  BOB.registrationId, 1,
  1, otpPrivate.getPublicKey(),
  1, spkPrivate.getPublicKey(), spkSignature,
  BOB.identity.publicKey,
  1, kyberPair.getPublicKey(), kyberSignature,
);
await signal.processPreKeyBundle(bundle, BOB.address, ALICE.address, ALICE.stores.session, ALICE.stores.identity);

const seal = async (from, to, plaintext) => {
  const message = await signal.signalEncrypt(utf8(plaintext), to.address, from.address, from.stores.session, from.stores.identity);
  return { type: message.type(), body: message.serialize(), plaintext };
};

const open = async (to, from, { type, body }) => text(
  type === signal.CiphertextMessageType.PreKey
    ? await signal.signalDecryptPreKey(
        signal.PreKeySignalMessage.deserialize(body), from.address, to.address,
        to.stores.session, to.stores.identity, to.stores.preKey, to.stores.signedPreKey, to.stores.kyberPreKey,
      )
    : await signal.signalDecrypt(signal.SignalMessage.deserialize(body), from.address, to.address, to.stores.session, to.stores.identity),
);

const expectOpened = async (to, from, message) => {
  const opened = await open(to, from, message);
  if (opened !== message.plaintext) throw new Error(`vecteur faux : « ${opened} » au lieu de « ${message.plaintext} »`);
  return message;
};

const sessionOf = (owner, peer) => owner.stores.sessions.get(peer.address.toString());

const first = await expectOpened(BOB, ALICE, await seal(ALICE, BOB, 'Bonjour Bob 👋 — premier message, PQXDH'));
const second = await expectOpened(BOB, ALICE, await seal(ALICE, BOB, 'Toujours avant ta réponse : l’accusé n’est pas encore là'));
const aliceBeforeReply = sessionOf(ALICE, BOB);
const reply = await seal(BOB, ALICE, 'Réponse de Bob : le Double Ratchet tourne');
const bobBeforeThird = sessionOf(BOB, ALICE);
await expectOpened(ALICE, BOB, reply);
const third = await expectOpened(BOB, ALICE, await seal(ALICE, BOB, 'Troisième message d’Alice, après le pas de ratchet'));

if (first.type !== signal.CiphertextMessageType.PreKey || second.type !== signal.CiphertextMessageType.PreKey) {
  throw new Error('les messages d’Alice avant toute réponse doivent être des PreKeySignalMessage');
}
if (reply.type !== signal.CiphertextMessageType.Whisper || third.type !== signal.CiphertextMessageType.Whisper) {
  throw new Error('la réponse et le troisième message doivent être des SignalMessage');
}

const wire = ({ type, body, plaintext }) => ({ type, body: b64(body), plaintext });
const identityOf = (owner) => ({
  name: owner.name,
  deviceId: 1,
  registrationId: owner.registrationId,
  identityKeyPair: b64(owner.identity.serialize()),
});

const vectors = {
  _doc: 'Vecteurs croisés libsignal (#17113). Généré par packages/shared/scripts/generate-libsignal-vectors.mjs — ne pas éditer à la main. Clés de TEST.',
  libsignal: VERSION,
  alice: identityOf(ALICE),
  bob: {
    ...identityOf(BOB),
    signedPreKey: { id: 1, record: b64(signedPreKey.serialize()) },
    kyberPreKey: { id: 1, record: b64(kyberPreKey.serialize()) },
    preKey: { id: 1, record: b64(preKey.serialize()) },
  },
  freshSession: {
    _label: 'Bob, depuis ses seules pré-clés, ouvre les deux PreKeySignalMessage d’Alice (PQXDH, Kyber, pré-clé unique)',
    messages: [wire(first), wire(second)],
  },
  persistedSessions: {
    _label: 'Sessions SÉRIALISÉES à cette version (rétrocompatibilité #9231) : chacune, rechargée, ouvre le SignalMessage suivant',
    aliceOpensReply: { session: b64(aliceBeforeReply), message: wire(reply) },
    bobOpensThird: { session: b64(bobBeforeThird), message: wire(third) },
  },
};

mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, `${JSON.stringify(vectors, null, 2)}\n`);
process.stdout.write(`vecteurs libsignal ${VERSION} écrits dans ${OUTPUT}\n`);
