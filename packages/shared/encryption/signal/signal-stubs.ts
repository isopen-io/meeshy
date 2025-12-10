/**
 * Signal Library Stubs
 *
 * Type stubs for @signalapp/libsignal-client when the library is not installed.
 * These types allow the code to compile without the native Signal library.
 *
 * When @signalapp/libsignal-client is installed, these types are compatible with
 * the real library types.
 */

// Re-export actual types if library is available, otherwise use stubs
export type {
  PreKeyBundle,
  SignalEncryptedMessage,
  SignalMessageType,
  SignalSessionState,
  HybridEncryptedMessage,
  SessionState,
  SignalMessage,
  Direction,
  TrustLevel,
} from './signal-types';

/**
 * Protocol Address - identifies a user's device
 */
export class ProtocolAddress {
  private _name: string;
  private _deviceId: number;

  constructor(name: string, deviceId: number) {
    this._name = name;
    this._deviceId = deviceId;
  }

  static new(name: string, deviceId: number): ProtocolAddress {
    return new ProtocolAddress(name, deviceId);
  }

  name(): string {
    return this._name;
  }

  deviceId(): number {
    return this._deviceId;
  }
}

/**
 * UUID type for distribution IDs
 */
export class Uuid {
  private _value: string;

  constructor(value: string) {
    this._value = value;
  }

  static fromString(value: string): Uuid {
    return new Uuid(value);
  }

  toString(): string {
    return this._value;
  }
}

/**
 * Private Key
 */
export class PrivateKey {
  private _data: Uint8Array;

  constructor(data: Uint8Array) {
    this._data = data;
  }

  static generate(): PrivateKey {
    const data = new Uint8Array(32);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(data);
    }
    return new PrivateKey(data);
  }

  serialize(): Uint8Array {
    return this._data;
  }

  static deserialize(data: Uint8Array): PrivateKey {
    return new PrivateKey(data);
  }

  getPublicKey(): PublicKey {
    // Placeholder - real implementation uses curve25519
    return new PublicKey(this._data);
  }

  sign(_message: Uint8Array): Uint8Array {
    // Placeholder signature
    return new Uint8Array(64);
  }
}

/**
 * Public Key
 */
export class PublicKey {
  private _data: Uint8Array;

  constructor(data: Uint8Array) {
    this._data = data;
  }

  serialize(): Uint8Array {
    return this._data;
  }

  static deserialize(data: Uint8Array): PublicKey {
    return new PublicKey(data);
  }

  verify(_message: Uint8Array, _signature: Uint8Array): boolean {
    // Placeholder verification
    return true;
  }
}

/**
 * Identity Key Pair
 */
export class IdentityKeyPair {
  publicKey: PublicKey;
  privateKey: PrivateKey;

  constructor(publicKey: PublicKey, privateKey: PrivateKey) {
    this.publicKey = publicKey;
    this.privateKey = privateKey;
  }

  static generate(): IdentityKeyPair {
    const privateKey = PrivateKey.generate();
    const publicKey = privateKey.getPublicKey();
    return new IdentityKeyPair(publicKey, privateKey);
  }

  serialize(): Uint8Array {
    return this.privateKey.serialize();
  }
}

/**
 * Pre-Key Record
 */
export class PreKeyRecord {
  private _id: number;
  private _publicKey: PublicKey;
  private _privateKey: PrivateKey;

  constructor(id: number, keyPair: { publicKey: PublicKey; privateKey: PrivateKey }) {
    this._id = id;
    this._publicKey = keyPair.publicKey;
    this._privateKey = keyPair.privateKey;
  }

  static new(id: number, publicKey: PublicKey, privateKey: PrivateKey): PreKeyRecord {
    return new PreKeyRecord(id, { publicKey, privateKey });
  }

  id(): number {
    return this._id;
  }

  publicKey(): PublicKey {
    return this._publicKey;
  }

  privateKey(): PrivateKey {
    return this._privateKey;
  }

  serialize(): Uint8Array {
    return new Uint8Array(0);
  }

  static deserialize(_data: Uint8Array): PreKeyRecord {
    return new PreKeyRecord(1, {
      publicKey: new PublicKey(new Uint8Array(32)),
      privateKey: new PrivateKey(new Uint8Array(32)),
    });
  }
}

/**
 * Signed Pre-Key Record
 */
export class SignedPreKeyRecord {
  private _id: number;
  private _timestamp: number;
  private _publicKey: PublicKey;
  private _privateKey: PrivateKey;
  private _signature: Uint8Array;

  constructor(
    id: number,
    timestamp: number,
    publicKey: PublicKey,
    privateKey: PrivateKey,
    signature: Uint8Array
  ) {
    this._id = id;
    this._timestamp = timestamp;
    this._publicKey = publicKey;
    this._privateKey = privateKey;
    this._signature = signature;
  }

  static new(
    id: number,
    timestamp: number,
    publicKey: PublicKey,
    privateKey: PrivateKey,
    signature: Uint8Array
  ): SignedPreKeyRecord {
    return new SignedPreKeyRecord(id, timestamp, publicKey, privateKey, signature);
  }

  id(): number {
    return this._id;
  }

  timestamp(): number {
    return this._timestamp;
  }

  publicKey(): PublicKey {
    return this._publicKey;
  }

  privateKey(): PrivateKey {
    return this._privateKey;
  }

  signature(): Uint8Array {
    return this._signature;
  }

  serialize(): Uint8Array {
    return new Uint8Array(0);
  }

  static deserialize(_data: Uint8Array): SignedPreKeyRecord {
    return new SignedPreKeyRecord(
      1,
      Date.now(),
      new PublicKey(new Uint8Array(32)),
      new PrivateKey(new Uint8Array(32)),
      new Uint8Array(64)
    );
  }
}

/**
 * Kyber Pre-Key Record (Post-quantum)
 */
export class KyberPreKeyRecord {
  private _id: number;
  private _timestamp: number;
  private _publicKey: Uint8Array;
  private _secretKey: Uint8Array;
  private _signature: Uint8Array;

  constructor(
    id: number,
    timestamp: number,
    publicKey: Uint8Array,
    secretKey: Uint8Array,
    signature: Uint8Array
  ) {
    this._id = id;
    this._timestamp = timestamp;
    this._publicKey = publicKey;
    this._secretKey = secretKey;
    this._signature = signature;
  }

  id(): number {
    return this._id;
  }

  timestamp(): number {
    return this._timestamp;
  }

  publicKey(): Uint8Array {
    return this._publicKey;
  }

  secretKey(): Uint8Array {
    return this._secretKey;
  }

  signature(): Uint8Array {
    return this._signature;
  }

  serialize(): Uint8Array {
    return new Uint8Array(0);
  }

  static deserialize(_data: Uint8Array): KyberPreKeyRecord {
    return new KyberPreKeyRecord(
      1,
      Date.now(),
      new Uint8Array(32),
      new Uint8Array(32),
      new Uint8Array(64)
    );
  }
}

/**
 * KEM Key Pair (for Kyber)
 */
export class KEMKeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;

  constructor(publicKey: Uint8Array, secretKey: Uint8Array) {
    this.publicKey = publicKey;
    this.secretKey = secretKey;
  }

  static generate(): KEMKeyPair {
    return new KEMKeyPair(new Uint8Array(32), new Uint8Array(32));
  }

  getPublicKey(): Uint8Array {
    return this.publicKey;
  }

  getSecretKey(): Uint8Array {
    return this.secretKey;
  }
}

/**
 * Session Record
 */
export class SessionRecord {
  private _data: Uint8Array;

  constructor(data: Uint8Array = new Uint8Array(0)) {
    this._data = data;
  }

  serialize(): Uint8Array {
    return this._data;
  }

  static deserialize(data: Uint8Array): SessionRecord {
    return new SessionRecord(data);
  }
}

/**
 * Sender Key Record
 */
export class SenderKeyRecord {
  private _data: Uint8Array;

  constructor(data: Uint8Array = new Uint8Array(0)) {
    this._data = data;
  }

  serialize(): Uint8Array {
    return this._data;
  }

  static deserialize(data: Uint8Array): SenderKeyRecord {
    return new SenderKeyRecord(data);
  }
}

/**
 * Pre-Key Signal Message
 */
export class PreKeySignalMessage {
  private _data: Uint8Array;

  constructor(data: Uint8Array) {
    this._data = data;
  }

  serialize(): Uint8Array {
    return this._data;
  }

  static deserialize(data: Uint8Array): PreKeySignalMessage {
    return new PreKeySignalMessage(data);
  }
}

/**
 * Signal Message (Whisper)
 */
export class SignalMessageClass {
  private _data: Uint8Array;

  constructor(data: Uint8Array) {
    this._data = data;
  }

  serialize(): Uint8Array {
    return this._data;
  }

  static deserialize(data: Uint8Array): SignalMessageClass {
    return new SignalMessageClass(data);
  }
}

/**
 * Ciphertext Message
 */
export class CiphertextMessage {
  private _data: Uint8Array;
  private _type: number;

  constructor(data: Uint8Array, type: number = 2) {
    this._data = data;
    this._type = type;
  }

  serialize(): Uint8Array {
    return this._data;
  }

  type(): number {
    return this._type;
  }
}

/**
 * Sender Key Distribution Message
 */
export class SenderKeyDistributionMessage {
  private _distributionId: Uuid;
  private _chainId: number;
  private _iteration: number;

  constructor(distributionId: Uuid, chainId: number, iteration: number) {
    this._distributionId = distributionId;
    this._chainId = chainId;
    this._iteration = iteration;
  }

  distributionId(): Uuid {
    return this._distributionId;
  }

  chainId(): number {
    return this._chainId;
  }

  iteration(): number {
    return this._iteration;
  }

  serialize(): Uint8Array {
    return new Uint8Array(0);
  }
}

// Store interfaces
export interface IdentityKeyStore {
  getIdentityKey(): Promise<PrivateKey>;
  getLocalRegistrationId(): Promise<number>;
  saveIdentity(address: ProtocolAddress, identityKey: PublicKey): Promise<boolean>;
  isTrustedIdentity(
    address: ProtocolAddress,
    identityKey: PublicKey,
    direction: number
  ): Promise<boolean>;
  getIdentity(address: ProtocolAddress): Promise<PublicKey | null>;
}

export interface SessionStore {
  loadSession(address: ProtocolAddress): Promise<SessionRecord | null>;
  storeSession(address: ProtocolAddress, record: SessionRecord): Promise<void>;
}

export interface PreKeyStore {
  loadPreKey(preKeyId: number): Promise<PreKeyRecord>;
  storePreKey(preKeyId: number, record: PreKeyRecord): Promise<void>;
  removePreKey(preKeyId: number): Promise<void>;
}

export interface SignedPreKeyStore {
  loadSignedPreKey(signedPreKeyId: number): Promise<SignedPreKeyRecord>;
  storeSignedPreKey(signedPreKeyId: number, record: SignedPreKeyRecord): Promise<void>;
}

export interface KyberPreKeyStore {
  loadKyberPreKey(kyberPreKeyId: number): Promise<KyberPreKeyRecord>;
  storeKyberPreKey(kyberPreKeyId: number, record: KyberPreKeyRecord): Promise<void>;
  markKyberPreKeyUsed(kyberPreKeyId: number): Promise<void>;
}

export interface SenderKeyStore {
  storeSenderKey(
    sender: ProtocolAddress,
    distributionId: Uuid,
    record: SenderKeyRecord
  ): Promise<void>;
  loadSenderKey(
    sender: ProtocolAddress,
    distributionId: Uuid
  ): Promise<SenderKeyRecord | null>;
}

// Stub functions for Signal Protocol operations
export async function processPreKeyBundle(
  _bundle: any,
  _address: ProtocolAddress,
  _sessionStore: SessionStore,
  _identityStore: IdentityKeyStore
): Promise<void> {
  // Placeholder - real implementation uses libsignal-client
}

export async function signalEncrypt(
  _message: Uint8Array,
  _address: ProtocolAddress,
  _sessionStore: SessionStore,
  _identityStore: IdentityKeyStore
): Promise<CiphertextMessage> {
  return new CiphertextMessage(new Uint8Array(0));
}

export async function signalDecrypt(
  _message: SignalMessageClass,
  _address: ProtocolAddress,
  _sessionStore: SessionStore,
  _identityStore: IdentityKeyStore
): Promise<Uint8Array> {
  return new Uint8Array(0);
}

export async function signalDecryptPreKey(
  _message: PreKeySignalMessage,
  _address: ProtocolAddress,
  _sessionStore: SessionStore,
  _identityStore: IdentityKeyStore,
  _preKeyStore: PreKeyStore,
  _signedPreKeyStore: SignedPreKeyStore,
  _kyberPreKeyStore: KyberPreKeyStore
): Promise<Uint8Array> {
  return new Uint8Array(0);
}

export async function groupEncrypt(
  _message: Uint8Array,
  _sender: ProtocolAddress,
  _distributionId: Uuid,
  _senderKeyStore: SenderKeyStore
): Promise<Uint8Array> {
  return new Uint8Array(0);
}

export async function groupDecrypt(
  _message: Uint8Array,
  _sender: ProtocolAddress,
  _distributionId: Uuid,
  _senderKeyStore: SenderKeyStore
): Promise<Uint8Array> {
  return new Uint8Array(0);
}

export async function processSenderKeyDistributionMessage(
  _sender: ProtocolAddress,
  _message: SenderKeyDistributionMessage,
  _senderKeyStore: SenderKeyStore
): Promise<void> {
  // Placeholder
}
