/**
 * Node.js Signal Protocol Store Implementation
 *
 * Implements Signal Protocol stores using in-memory storage.
 * TODO: Replace with database persistence for production.
 */

import { enhancedLogger } from '../utils/logger-enhanced.js';
import {
  ProtocolAddress,
  IdentityKeyPair,
  PublicKey,
  PrivateKey,
  PreKeyRecord,
  SignedPreKeyRecord,
  KyberPreKeyRecord,
  SessionRecord,
  SenderKeyRecord,
  IdentityKeyStore,
  SessionStore,
  PreKeyStore,
  SignedPreKeyStore,
  KyberPreKeyStore,
  SenderKeyStore,
  Direction,
  IdentityChange,
  Uuid,
} from '@signalapp/libsignal-client';

const logger = enhancedLogger.child({ module: 'NodeSignalStores' });

/**
 * In-memory Identity Key Store
 */
export class NodeIdentityKeyStore extends IdentityKeyStore {
  private identityKey: PrivateKey | null = null;
  private registrationId: number;
  private trustedIdentities: Map<string, Uint8Array> = new Map();

  constructor(registrationId: number) {
    super();
    this.registrationId = registrationId;
  }

  async initialize(identityKeyPair: IdentityKeyPair): Promise<void> {
    this.identityKey = identityKeyPair.privateKey;
  }

  async getIdentityKey(): Promise<PrivateKey> {
    if (!this.identityKey) {
      throw new Error('Identity key not initialized');
    }
    return this.identityKey;
  }

  async getLocalRegistrationId(): Promise<number> {
    return this.registrationId;
  }

  /**
   * `IdentityChange`, pas `boolean` — la signature que `IdentityKeyStore`
   * DÉCLARE depuis que libsignal a remplacé le booléen par l'énumération.
   *
   * Ce fichier a porté le booléen sans que rien ne le dise, parce qu'aucun
   * compilateur ne le lisait : il est hors du `include` de `tsconfig.json`, et
   * aucun test ne l'atteint, donc `ts-jest` ne le compilait pas non plus. Le
   * cycle 105 bis l'a fait entrer dans le premier des deux.
   *
   * La correction ne change AUCUNE valeur observable : `NewOrUnchanged` vaut 0
   * et `ReplacedExisting` vaut 1, exactement ce que le booléen produisait par
   * coercition. Ce qui change est que la promesse rendue DIT ce que l'appelant
   * attend, au lieu d'y coïncider par accident.
   */
  async saveIdentity(address: ProtocolAddress, identityKey: PublicKey): Promise<IdentityChange> {
    const key = this.getAddressKey(address);
    const existing = this.trustedIdentities.get(key);
    const newKey = identityKey.serialize();

    if (existing) {
      // Check if identity has changed
      const changed = !this.arraysEqual(existing, newKey);
      if (changed) {
        // Identity key changed - this is a security event
        logger.warn('Identity key changed', { address: `${address.name()}:${address.deviceId()}` });
      }
      this.trustedIdentities.set(key, newKey);
      return changed ? IdentityChange.ReplacedExisting : IdentityChange.NewOrUnchanged;
    } else {
      // First time seeing this identity
      this.trustedIdentities.set(key, newKey);
      return IdentityChange.NewOrUnchanged;
    }
  }

  async isTrustedIdentity(
    address: ProtocolAddress,
    identityKey: PublicKey,
    direction: Direction
  ): Promise<boolean> {
    const key = this.getAddressKey(address);
    const trusted = this.trustedIdentities.get(key);

    if (!trusted) {
      // First time seeing this identity - trust it
      return true;
    }

    // Check if the identity key matches
    return this.arraysEqual(trusted, identityKey.serialize());
  }

  async getIdentity(address: ProtocolAddress): Promise<PublicKey | null> {
    const key = this.getAddressKey(address);
    const identity = this.trustedIdentities.get(key);

    if (!identity) {
      return null;
    }

    return PublicKey.deserialize(Buffer.from(identity));
  }

  private getAddressKey(address: ProtocolAddress): string {
    return `${address.name()}:${address.deviceId()}`;
  }

  private arraysEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }
}

/**
 * In-memory Pre-Key Store
 */
export class NodePreKeyStore extends PreKeyStore {
  private preKeys: Map<number, Uint8Array> = new Map();

  async getPreKey(preKeyId: number): Promise<PreKeyRecord> {
    const record = this.preKeys.get(preKeyId);
    if (!record) {
      throw new Error(`Pre-key ${preKeyId} not found`);
    }
    return PreKeyRecord.deserialize(Buffer.from(record));
  }

  async savePreKey(preKeyId: number, record: PreKeyRecord): Promise<void> {
    this.preKeys.set(preKeyId, record.serialize());
  }

  async removePreKey(preKeyId: number): Promise<void> {
    this.preKeys.delete(preKeyId);
  }
}

/**
 * In-memory Signed Pre-Key Store
 */
export class NodeSignedPreKeyStore extends SignedPreKeyStore {
  private signedPreKeys: Map<number, Uint8Array> = new Map();

  async getSignedPreKey(signedPreKeyId: number): Promise<SignedPreKeyRecord> {
    const record = this.signedPreKeys.get(signedPreKeyId);
    if (!record) {
      throw new Error(`Signed pre-key ${signedPreKeyId} not found`);
    }
    return SignedPreKeyRecord.deserialize(Buffer.from(record));
  }

  async saveSignedPreKey(signedPreKeyId: number, record: SignedPreKeyRecord): Promise<void> {
    this.signedPreKeys.set(signedPreKeyId, record.serialize());
  }
}

/**
 * In-memory Kyber Pre-Key Store
 */
export class NodeKyberPreKeyStore extends KyberPreKeyStore {
  private kyberPreKeys: Map<number, Uint8Array> = new Map();
  private usedKeys: Set<number> = new Set();

  async getKyberPreKey(kyberPreKeyId: number): Promise<KyberPreKeyRecord> {
    const record = this.kyberPreKeys.get(kyberPreKeyId);
    if (!record) {
      throw new Error(`Kyber pre-key ${kyberPreKeyId} not found`);
    }
    return KyberPreKeyRecord.deserialize(Buffer.from(record));
  }

  async saveKyberPreKey(kyberPreKeyId: number, record: KyberPreKeyRecord): Promise<void> {
    this.kyberPreKeys.set(kyberPreKeyId, record.serialize());
  }

  async markKyberPreKeyUsed(kyberPreKeyId: number): Promise<void> {
    this.usedKeys.add(kyberPreKeyId);
  }
}

/**
 * In-memory Session Store
 */
export class NodeSessionStore extends SessionStore {
  private sessions: Map<string, Uint8Array> = new Map();

  async getSession(address: ProtocolAddress): Promise<SessionRecord | null> {
    const key = this.getAddressKey(address);
    const record = this.sessions.get(key);

    if (!record) {
      return null;
    }

    return SessionRecord.deserialize(Buffer.from(record));
  }

  async saveSession(address: ProtocolAddress, record: SessionRecord): Promise<void> {
    const key = this.getAddressKey(address);
    this.sessions.set(key, record.serialize());
  }

  async getExistingSessions(addresses: ProtocolAddress[]): Promise<SessionRecord[]> {
    const records: SessionRecord[] = [];
    for (const address of addresses) {
      const record = await this.getSession(address);
      if (record) {
        records.push(record);
      }
    }
    return records;
  }

  private getAddressKey(address: ProtocolAddress): string {
    return `${address.name()}:${address.deviceId()}`;
  }
}

/**
 * In-memory Sender Key Store
 */
export class NodeSenderKeyStore extends SenderKeyStore {
  private senderKeys: Map<string, Uint8Array> = new Map();

  async saveSenderKey(
    sender: ProtocolAddress,
    distributionId: Uuid,
    record: SenderKeyRecord
  ): Promise<void> {
    const key = this.getSenderKeyKey(sender, distributionId);
    this.senderKeys.set(key, record.serialize());
  }

  async getSenderKey(
    sender: ProtocolAddress,
    distributionId: Uuid
  ): Promise<SenderKeyRecord | null> {
    const key = this.getSenderKeyKey(sender, distributionId);
    const record = this.senderKeys.get(key);

    if (!record) {
      return null;
    }

    return SenderKeyRecord.deserialize(Buffer.from(record));
  }

  private getSenderKeyKey(sender: ProtocolAddress, distributionId: Uuid): string {
    return `${sender.name()}:${sender.deviceId()}:${distributionId}`;
  }
}

/**
 * Create all Signal Protocol stores for Node.js
 *
 * Le paramètre `config: SignalStoreConfig` que cette fonction déclarait n'était
 * lu par aucune de ses lignes, et son type n'existait plus dans
 * `@meeshy/shared/encryption/signal/signal-store-interface` — lequel exporte
 * `SignalProtocolStore` au singulier. Deux imports fantômes que rien ne
 * compilait ; le paramètre part avec eux plutôt que d'être retypé, parce qu'il
 * ne configure rien.
 */
export async function createNodeSignalStores(): Promise<{
  identityStore: NodeIdentityKeyStore;
  preKeyStore: NodePreKeyStore;
  signedPreKeyStore: NodeSignedPreKeyStore;
  kyberPreKeyStore: NodeKyberPreKeyStore;
  sessionStore: NodeSessionStore;
  senderKeyStore: NodeSenderKeyStore;
}> {
  // Generate a random registration ID (1-16380)
  const registrationId = Math.floor(Math.random() * 16380) + 1;

  // Create stores
  const identityStore = new NodeIdentityKeyStore(registrationId);
  const preKeyStore = new NodePreKeyStore();
  const signedPreKeyStore = new NodeSignedPreKeyStore();
  const kyberPreKeyStore = new NodeKyberPreKeyStore();
  const sessionStore = new NodeSessionStore();
  const senderKeyStore = new NodeSenderKeyStore();

  // Generate identity key pair
  const identityKeyPair = IdentityKeyPair.generate();
  await identityStore.initialize(identityKeyPair);

  return {
    identityStore,
    preKeyStore,
    signedPreKeyStore,
    kyberPreKeyStore,
    sessionStore,
    senderKeyStore,
  };
}
