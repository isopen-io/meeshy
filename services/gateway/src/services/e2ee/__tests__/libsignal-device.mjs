// Un « appareil » libsignal RÉEL pour les tests d'intégration de la passerelle (#3706).
//
// `@signalapp/libsignal-client` est un module ESM à binaire natif que Jest ne
// sait pas charger (il le remplace par un simulacre dans `jest.setup.js`). Ce
// script tourne donc dans un processus Node à part :
//   - `node libsignal-device.mjs verify <identité> <message> <signature>` :
//     vérification XEdDSA, imprime `true` ou `false` ;
//   - `node libsignal-device.mjs serve` : lit des commandes JSON ligne à ligne
//     sur stdin et répond une ligne JSON par commande. Les clés privées restent
//     dans CE processus ; seules les parties publiques en sortent.
import { createInterface } from 'node:readline';
import * as signal from '@signalapp/libsignal-client';

const b64 = (bytes) => Buffer.from(bytes).toString('base64');
const bytes = (base64) => new Uint8Array(Buffer.from(base64, 'base64'));

class Stores {
  constructor(identity, registrationId) {
    this.identity = identity;
    this.registrationId = registrationId;
    this.sessions = new Map();
    this.identities = new Map();
    this.preKeys = new Map();
    this.signedPreKeys = new Map();
    this.kyberPreKeys = new Map();
    const self = this;
    this.session = new (class extends signal.SessionStore {
      async saveSession(address, record) { self.sessions.set(address.toString(), record.serialize()); }
      async getSession(address) {
        const raw = self.sessions.get(address.toString());
        return raw ? signal.SessionRecord.deserialize(raw) : null;
      }
      async getExistingSessions(addresses) { return Promise.all(addresses.map((address) => this.getSession(address))); }
    })();
    this.identityStore = new (class extends signal.IdentityKeyStore {
      async getIdentityKey() { return self.identity.privateKey; }
      async getLocalRegistrationId() { return self.registrationId; }
      async saveIdentity(address, key) {
        const known = self.identities.get(address.toString());
        self.identities.set(address.toString(), key.serialize());
        return known && Buffer.compare(Buffer.from(known), Buffer.from(key.serialize())) !== 0
          ? signal.IdentityChange.ReplacedExisting
          : signal.IdentityChange.NewOrUnchanged;
      }
      async isTrustedIdentity() { return true; }
      async getIdentity(address) {
        const raw = self.identities.get(address.toString());
        return raw ? signal.PublicKey.deserialize(raw) : null;
      }
    })();
    this.preKeyStore = new (class extends signal.PreKeyStore {
      async savePreKey(id, record) { self.preKeys.set(id, record); }
      async getPreKey(id) { return self.preKeys.get(id); }
      async removePreKey(id) { self.preKeys.delete(id); }
    })();
    this.signedPreKeyStore = new (class extends signal.SignedPreKeyStore {
      async saveSignedPreKey(id, record) { self.signedPreKeys.set(id, record); }
      async getSignedPreKey(id) { return self.signedPreKeys.get(id); }
    })();
    this.kyberStore = new (class extends signal.KyberPreKeyStore {
      async saveKyberPreKey(id, record) { self.kyberPreKeys.set(id, record); }
      async getKyberPreKey(id) { return self.kyberPreKeys.get(id); }
      async markKyberPreKeyUsed() {}
    })();
  }
}

const devices = new Map();

function createDevice({ name, oneTime = 3 }) {
  const identity = signal.IdentityKeyPair.generate();
  const registrationId = 1 + Math.floor(Math.random() * 16000);
  const stores = new Stores(identity, registrationId);
  const sign = (publicBytes) => identity.privateKey.sign(publicBytes);
  const now = Date.now();

  const spkPrivate = signal.PrivateKey.generate();
  const spkPublic = spkPrivate.getPublicKey().serialize();
  const spkSignature = sign(spkPublic);
  stores.signedPreKeys.set(1, signal.SignedPreKeyRecord.new(1, now, spkPrivate.getPublicKey(), spkPrivate, spkSignature));

  const kyber = (id) => {
    const pair = signal.KEMKeyPair.generate();
    const publicBytes = pair.getPublicKey().serialize();
    const signature = sign(publicBytes);
    stores.kyberPreKeys.set(id, signal.KyberPreKeyRecord.new(id, now, pair, signature));
    return { keyId: id, publicKey: b64(publicBytes), signature: b64(signature) };
  };
  const ec = (id) => {
    const priv = signal.PrivateKey.generate();
    stores.preKeys.set(id, signal.PreKeyRecord.new(id, priv.getPublicKey(), priv));
    return { keyId: id, publicKey: b64(priv.getPublicKey().serialize()) };
  };

  devices.set(name, stores);
  return {
    registrationId,
    identityKey: b64(identity.publicKey.serialize()),
    signedPreKey: { keyId: 1, publicKey: b64(spkPublic), signature: b64(spkSignature) },
    kyberLastResort: kyber(1000),
    oneTimePreKeys: Array.from({ length: oneTime }, (_, index) => ec(index + 1)),
    kyberPreKeys: Array.from({ length: oneTime }, (_, index) => kyber(index + 1)),
    platform: 'ios',
  };
}

async function encrypt({ from, fromAddress, toAddress, bundle, plaintext }) {
  const stores = devices.get(from);
  const local = signal.ProtocolAddress.new(fromAddress.name, fromAddress.deviceId);
  const remote = signal.ProtocolAddress.new(toAddress.name, toAddress.deviceId);
  if (bundle) {
    const preKeyBundle = signal.PreKeyBundle.new(
      bundle.registrationId,
      bundle.deviceId,
      bundle.preKey ? bundle.preKey.keyId : null,
      bundle.preKey ? signal.PublicKey.deserialize(bytes(bundle.preKey.publicKey)) : null,
      bundle.signedPreKey.keyId,
      signal.PublicKey.deserialize(bytes(bundle.signedPreKey.publicKey)),
      bytes(bundle.signedPreKey.signature),
      signal.PublicKey.deserialize(bytes(bundle.identityKey)),
      bundle.kyberPreKey.keyId,
      signal.KEMPublicKey.deserialize(bytes(bundle.kyberPreKey.publicKey)),
      bytes(bundle.kyberPreKey.signature),
    );
    await signal.processPreKeyBundle(preKeyBundle, remote, local, stores.session, stores.identityStore);
  }
  const message = await signal.signalEncrypt(new TextEncoder().encode(plaintext), remote, local, stores.session, stores.identityStore);
  return { type: message.type(), body: b64(message.serialize()) };
}

async function decrypt({ to, toAddress, fromAddress, type, body }) {
  const stores = devices.get(to);
  const local = signal.ProtocolAddress.new(toAddress.name, toAddress.deviceId);
  const remote = signal.ProtocolAddress.new(fromAddress.name, fromAddress.deviceId);
  const plain = type === signal.CiphertextMessageType.PreKey
    ? await signal.signalDecryptPreKey(
        signal.PreKeySignalMessage.deserialize(bytes(body)), remote, local,
        stores.session, stores.identityStore, stores.preKeyStore, stores.signedPreKeyStore, stores.kyberStore,
      )
    : await signal.signalDecrypt(signal.SignalMessage.deserialize(bytes(body)), remote, local, stores.session, stores.identityStore);
  return { plaintext: new TextDecoder().decode(plain) };
}

const commands = { create: createDevice, encrypt, decrypt };

if (process.argv[2] === 'verify') {
  const [identityKey, message, signature] = process.argv.slice(3);
  let valid = false;
  try {
    valid = signal.PublicKey.deserialize(bytes(identityKey)).verify(bytes(message), bytes(signature));
  } catch {
    valid = false;
  }
  process.stdout.write(valid ? 'true' : 'false');
} else {
  const lines = createInterface({ input: process.stdin });
  lines.on('line', async (line) => {
    const { id, command, args } = JSON.parse(line);
    try {
      const result = await commands[command](args);
      process.stdout.write(`${JSON.stringify({ id, result })}\n`);
    } catch (error) {
      process.stdout.write(`${JSON.stringify({ id, error: String(error && error.message ? error.message : error) })}\n`);
    }
  });
}
