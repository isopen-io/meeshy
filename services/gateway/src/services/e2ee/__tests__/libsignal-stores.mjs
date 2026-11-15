// Les stores libsignal EN MÉMOIRE des appareils de test de la passerelle : un seul
// exemplaire, partagé par `libsignal-device.mjs` (#3706) et le banc des vecteurs
// croisés `libsignal-vectors.mjs` (#17113). Les sessions sont gardées
// sérialisées, comme sur un appareil.
import * as signal from '@signalapp/libsignal-client';

export class Stores {
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
