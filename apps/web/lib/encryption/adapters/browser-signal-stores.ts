/**
 * Browser Signal Protocol Store Implementation
 *
 * Implements Signal Protocol stores using IndexedDB for persistent storage.
 */

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
  PreKeyStore,
  SignedPreKeyStore,
  KyberPreKeyStore,
  SessionStore,
  SenderKeyStore,
  Direction,
  Uuid,
} from '@signalapp/libsignal-client';

import type {
  SignalProtocolStores,
  SignalStoreConfig,
} from '@meeshy/shared/encryption/signal/signal-store-interface';

const DB_NAME = 'MeeshySignalProtocol';
const DB_VERSION = 1;

const STORES = {
  IDENTITY: 'identity',
  PRE_KEYS: 'preKeys',
  SIGNED_PRE_KEYS: 'signedPreKeys',
  KYBER_PRE_KEYS: 'kyberPreKeys',
  SESSIONS: 'sessions',
  SENDER_KEYS: 'senderKeys',
  TRUSTED_IDENTITIES: 'trustedIdentities',
};

/**
 * Open IndexedDB database
 */
async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create object stores
      if (!db.objectStoreNames.contains(STORES.IDENTITY)) {
        db.createObjectStore(STORES.IDENTITY);
      }
      if (!db.objectStoreNames.contains(STORES.PRE_KEYS)) {
        db.createObjectStore(STORES.PRE_KEYS);
      }
      if (!db.objectStoreNames.contains(STORES.SIGNED_PRE_KEYS)) {
        db.createObjectStore(STORES.SIGNED_PRE_KEYS);
      }
      if (!db.objectStoreNames.contains(STORES.KYBER_PRE_KEYS)) {
        db.createObjectStore(STORES.KYBER_PRE_KEYS);
      }
      if (!db.objectStoreNames.contains(STORES.SESSIONS)) {
        db.createObjectStore(STORES.SESSIONS);
      }
      if (!db.objectStoreNames.contains(STORES.SENDER_KEYS)) {
        db.createObjectStore(STORES.SENDER_KEYS);
      }
      if (!db.objectStoreNames.contains(STORES.TRUSTED_IDENTITIES)) {
        db.createObjectStore(STORES.TRUSTED_IDENTITIES);
      }
    };
  });
}

/**
 * Browser Identity Key Store
 */
export class BrowserIdentityKeyStore extends IdentityKeyStore {
  private identityKeyPair: IdentityKeyPair | null = null;
  private registrationId: number;
  private userId: string;

  constructor(userId: string, registrationId: number) {
    super();
    this.userId = userId;
    this.registrationId = registrationId;
  }

  async initialize(identityKeyPair: IdentityKeyPair): Promise<void> {
    this.identityKeyPair = identityKeyPair;

    // Store in IndexedDB
    const db = await openDB();
    const tx = db.transaction([STORES.IDENTITY], 'readwrite');
    const store = tx.objectStore(STORES.IDENTITY);

    await new Promise<void>((resolve, reject) => {
      const request = store.put(
        {
          identityKeyPair: identityKeyPair.serialize(),
          registrationId: this.registrationId,
        },
        this.userId
      );
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    db.close();
  }

  async loadFromStorage(): Promise<void> {
    const db = await openDB();
    const tx = db.transaction([STORES.IDENTITY], 'readonly');
    const store = tx.objectStore(STORES.IDENTITY);

    const data = await new Promise<any>((resolve, reject) => {
      const request = store.get(this.userId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    db.close();

    if (data) {
      this.identityKeyPair = IdentityKeyPair.deserialize(Buffer.from(data.identityKeyPair));
      this.registrationId = data.registrationId;
    }
  }

  async getIdentityKeyPair(): Promise<IdentityKeyPair> {
    if (!this.identityKeyPair) {
      await this.loadFromStorage();
    }

    if (!this.identityKeyPair) {
      throw new Error('Identity key pair not initialized');
    }

    return this.identityKeyPair;
  }

  async getIdentityKey(): Promise<PrivateKey> {
    const keyPair = await this.getIdentityKeyPair();
    return keyPair.privateKey;
  }

  async getLocalRegistrationId(): Promise<number> {
    return this.registrationId;
  }

  async saveIdentity(address: ProtocolAddress, identityKey: PublicKey): Promise<boolean> {
    const key = this.getAddressKey(address);
    const db = await openDB();
    const tx = db.transaction([STORES.TRUSTED_IDENTITIES], 'readwrite');
    const store = tx.objectStore(STORES.TRUSTED_IDENTITIES);

    const existing = await new Promise<Uint8Array | undefined>((resolve, reject) => {
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    const newKey = identityKey.serialize();
    const changed = existing ? !this.arraysEqual(existing, newKey) : false;

    await new Promise<void>((resolve, reject) => {
      const request = store.put(newKey, key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    db.close();

    if (changed) {
      console.warn(`Identity key changed for ${address.name()}:${address.deviceId()}`);
    }

    return changed;
  }

  async isTrustedIdentity(
    address: ProtocolAddress,
    identityKey: PublicKey,
    direction: Direction
  ): Promise<boolean> {
    const key = this.getAddressKey(address);
    const db = await openDB();
    const tx = db.transaction([STORES.TRUSTED_IDENTITIES], 'readonly');
    const store = tx.objectStore(STORES.TRUSTED_IDENTITIES);

    const trusted = await new Promise<Uint8Array | undefined>((resolve, reject) => {
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    db.close();

    if (!trusted) {
      return true; // Trust on first use
    }

    return this.arraysEqual(trusted, identityKey.serialize());
  }

  async getIdentity(address: ProtocolAddress): Promise<PublicKey | null> {
    const key = this.getAddressKey(address);
    const db = await openDB();
    const tx = db.transaction([STORES.TRUSTED_IDENTITIES], 'readonly');
    const store = tx.objectStore(STORES.TRUSTED_IDENTITIES);

    const identity = await new Promise<Uint8Array | undefined>((resolve, reject) => {
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    db.close();

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
 * Browser Pre-Key Store
 */
export class BrowserPreKeyStore extends PreKeyStore {
  async getPreKey(preKeyId: number): Promise<PreKeyRecord> {
    const db = await openDB();
    const tx = db.transaction([STORES.PRE_KEYS], 'readonly');
    const store = tx.objectStore(STORES.PRE_KEYS);

    const record = await new Promise<Uint8Array | undefined>((resolve, reject) => {
      const request = store.get(preKeyId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    db.close();

    if (!record) {
      throw new Error(`Pre-key ${preKeyId} not found`);
    }

    return PreKeyRecord.deserialize(Buffer.from(record));
  }

  async savePreKey(preKeyId: number, record: PreKeyRecord): Promise<void> {
    const db = await openDB();
    const tx = db.transaction([STORES.PRE_KEYS], 'readwrite');
    const store = tx.objectStore(STORES.PRE_KEYS);

    await new Promise<void>((resolve, reject) => {
      const request = store.put(record.serialize(), preKeyId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    db.close();
  }

  async removePreKey(preKeyId: number): Promise<void> {
    const db = await openDB();
    const tx = db.transaction([STORES.PRE_KEYS], 'readwrite');
    const store = tx.objectStore(STORES.PRE_KEYS);

    await new Promise<void>((resolve, reject) => {
      const request = store.delete(preKeyId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    db.close();
  }
}

/**
 * Browser Signed Pre-Key Store
 */
export class BrowserSignedPreKeyStore extends SignedPreKeyStore {
  async getSignedPreKey(signedPreKeyId: number): Promise<SignedPreKeyRecord> {
    const db = await openDB();
    const tx = db.transaction([STORES.SIGNED_PRE_KEYS], 'readonly');
    const store = tx.objectStore(STORES.SIGNED_PRE_KEYS);

    const record = await new Promise<Uint8Array | undefined>((resolve, reject) => {
      const request = store.get(signedPreKeyId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    db.close();

    if (!record) {
      throw new Error(`Signed pre-key ${signedPreKeyId} not found`);
    }

    return SignedPreKeyRecord.deserialize(Buffer.from(record));
  }

  async saveSignedPreKey(signedPreKeyId: number, record: SignedPreKeyRecord): Promise<void> {
    const db = await openDB();
    const tx = db.transaction([STORES.SIGNED_PRE_KEYS], 'readwrite');
    const store = tx.objectStore(STORES.SIGNED_PRE_KEYS);

    await new Promise<void>((resolve, reject) => {
      const request = store.put(record.serialize(), signedPreKeyId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    db.close();
  }
}

/**
 * Browser Kyber Pre-Key Store
 */
export class BrowserKyberPreKeyStore extends KyberPreKeyStore {
  async getKyberPreKey(kyberPreKeyId: number): Promise<KyberPreKeyRecord> {
    const db = await openDB();
    const tx = db.transaction([STORES.KYBER_PRE_KEYS], 'readonly');
    const store = tx.objectStore(STORES.KYBER_PRE_KEYS);

    const record = await new Promise<any>((resolve, reject) => {
      const request = store.get(kyberPreKeyId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    db.close();

    if (!record) {
      throw new Error(`Kyber pre-key ${kyberPreKeyId} not found`);
    }

    return KyberPreKeyRecord.deserialize(Buffer.from(record.data));
  }

  async saveKyberPreKey(kyberPreKeyId: number, record: KyberPreKeyRecord): Promise<void> {
    const db = await openDB();
    const tx = db.transaction([STORES.KYBER_PRE_KEYS], 'readwrite');
    const store = tx.objectStore(STORES.KYBER_PRE_KEYS);

    await new Promise<void>((resolve, reject) => {
      const request = store.put(
        {
          data: record.serialize(),
          used: false,
        },
        kyberPreKeyId
      );
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    db.close();
  }

  async markKyberPreKeyUsed(kyberPreKeyId: number): Promise<void> {
    const db = await openDB();
    const tx = db.transaction([STORES.KYBER_PRE_KEYS], 'readwrite');
    const store = tx.objectStore(STORES.KYBER_PRE_KEYS);

    const record = await new Promise<any>((resolve, reject) => {
      const request = store.get(kyberPreKeyId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    if (record) {
      record.used = true;
      await new Promise<void>((resolve, reject) => {
        const request = store.put(record, kyberPreKeyId);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }

    db.close();
  }
}

/**
 * Browser Session Store
 */
export class BrowserSessionStore extends SessionStore {
  async getSession(address: ProtocolAddress): Promise<SessionRecord | null> {
    const key = this.getAddressKey(address);
    const db = await openDB();
    const tx = db.transaction([STORES.SESSIONS], 'readonly');
    const store = tx.objectStore(STORES.SESSIONS);

    const record = await new Promise<Uint8Array | undefined>((resolve, reject) => {
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    db.close();

    if (!record) {
      return null;
    }

    return SessionRecord.deserialize(Buffer.from(record));
  }

  async saveSession(address: ProtocolAddress, record: SessionRecord): Promise<void> {
    const key = this.getAddressKey(address);
    const db = await openDB();
    const tx = db.transaction([STORES.SESSIONS], 'readwrite');
    const store = tx.objectStore(STORES.SESSIONS);

    await new Promise<void>((resolve, reject) => {
      const request = store.put(record.serialize(), key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    db.close();
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
 * Browser Sender Key Store
 */
export class BrowserSenderKeyStore extends SenderKeyStore {
  async saveSenderKey(
    sender: ProtocolAddress,
    distributionId: Uuid,
    record: SenderKeyRecord
  ): Promise<void> {
    const key = this.getSenderKeyKey(sender, distributionId);
    const db = await openDB();
    const tx = db.transaction([STORES.SENDER_KEYS], 'readwrite');
    const store = tx.objectStore(STORES.SENDER_KEYS);

    await new Promise<void>((resolve, reject) => {
      const request = store.put(record.serialize(), key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    db.close();
  }

  async getSenderKey(
    sender: ProtocolAddress,
    distributionId: Uuid
  ): Promise<SenderKeyRecord | null> {
    const key = this.getSenderKeyKey(sender, distributionId);
    const db = await openDB();
    const tx = db.transaction([STORES.SENDER_KEYS], 'readonly');
    const store = tx.objectStore(STORES.SENDER_KEYS);

    const record = await new Promise<Uint8Array | undefined>((resolve, reject) => {
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    db.close();

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
 * Create all Signal Protocol stores for Browser
 */
export async function createBrowserSignalStores(
  config: SignalStoreConfig
): Promise<SignalProtocolStores> {
  // Generate a random registration ID (1-16380)
  const registrationId = Math.floor(Math.random() * 16380) + 1;

  // Create stores
  const identityStore = new BrowserIdentityKeyStore(config.userId, registrationId);
  const preKeyStore = new BrowserPreKeyStore();
  const signedPreKeyStore = new BrowserSignedPreKeyStore();
  const kyberPreKeyStore = new BrowserKyberPreKeyStore();
  const sessionStore = new BrowserSessionStore();
  const senderKeyStore = new BrowserSenderKeyStore();

  // Try to load existing identity, or generate new one
  try {
    await identityStore.loadFromStorage();
  } catch (error) {
    // Generate new identity key pair
    const identityKeyPair = IdentityKeyPair.generate();
    await identityStore.initialize(identityKeyPair);
  }

  return {
    identityStore,
    preKeyStore,
    signedPreKeyStore,
    kyberPreKeyStore,
    sessionStore,
    senderKeyStore,
  };
}
