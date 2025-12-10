/**
 * Signal Protocol Store Interface
 *
 * Platform-agnostic interfaces for Signal Protocol storage.
 * Implementations will use database (Node.js) or IndexedDB (Browser).
 */

import type { PreKey, SignedPreKey, SignalKeyPair, Direction, DistributionId } from './signal-types';

export { Direction } from './signal-types';

/**
 * Address for a Signal Protocol session
 */
export interface ProtocolAddress {
  name: string;
  deviceId: number;
}

/**
 * Identity Key Store - manages identity keys
 */
export interface IdentityKeyStore {
  getIdentityKey(): Promise<SignalKeyPair | null>;
  getLocalRegistrationId(): Promise<number>;
  saveIdentity(address: ProtocolAddress, identityKey: Uint8Array): Promise<boolean>;
  isTrustedIdentity(
    address: ProtocolAddress,
    identityKey: Uint8Array,
    direction: Direction
  ): Promise<boolean>;
  getIdentity(address: ProtocolAddress): Promise<Uint8Array | null>;
}

/**
 * Pre-Key Store - manages pre-keys for forward secrecy
 */
export interface PreKeyStore {
  getPreKey(preKeyId: number): Promise<PreKey | null>;
  savePreKey(preKeyId: number, preKey: PreKey): Promise<void>;
  removePreKey(preKeyId: number): Promise<void>;
}

/**
 * Signed Pre-Key Store - manages signed pre-keys
 */
export interface SignedPreKeyStore {
  getSignedPreKey(signedPreKeyId: number): Promise<SignedPreKey | null>;
  saveSignedPreKey(signedPreKeyId: number, signedPreKey: SignedPreKey): Promise<void>;
  removeSignedPreKey(signedPreKeyId: number): Promise<void>;
}

/**
 * Session Store - manages session state
 */
export interface SessionStore {
  loadSession(address: ProtocolAddress): Promise<Uint8Array | null>;
  storeSession(address: ProtocolAddress, record: Uint8Array): Promise<void>;
  getSubDeviceSessions(name: string): Promise<number[]>;
  containsSession(address: ProtocolAddress): Promise<boolean>;
  deleteSession(address: ProtocolAddress): Promise<void>;
  deleteAllSessions(name: string): Promise<void>;
}

/**
 * Sender Key Store - manages sender keys for group messaging
 */
export interface SenderKeyStore {
  storeSenderKey(
    sender: ProtocolAddress,
    distributionId: DistributionId,
    record: Uint8Array
  ): Promise<void>;
  loadSenderKey(
    sender: ProtocolAddress,
    distributionId: DistributionId
  ): Promise<Uint8Array | null>;
}

/**
 * Combined Signal Protocol Store
 */
export interface SignalProtocolStore
  extends IdentityKeyStore,
    PreKeyStore,
    SignedPreKeyStore,
    SessionStore,
    SenderKeyStore {
  // Additional methods for store management
  clear(): Promise<void>;
  getLocalDeviceId(): number;
}

/**
 * Abstract base class for Signal Protocol stores
 */
export abstract class BaseSignalProtocolStore implements SignalProtocolStore {
  protected localDeviceId: number = 1;
  protected localRegistrationId: number = 0;
  protected identityKeyPair: SignalKeyPair | null = null;

  abstract getIdentityKey(): Promise<SignalKeyPair | null>;
  abstract getLocalRegistrationId(): Promise<number>;
  abstract saveIdentity(address: ProtocolAddress, identityKey: Uint8Array): Promise<boolean>;
  abstract isTrustedIdentity(
    address: ProtocolAddress,
    identityKey: Uint8Array,
    direction: Direction
  ): Promise<boolean>;
  abstract getIdentity(address: ProtocolAddress): Promise<Uint8Array | null>;
  abstract getPreKey(preKeyId: number): Promise<PreKey | null>;
  abstract savePreKey(preKeyId: number, preKey: PreKey): Promise<void>;
  abstract removePreKey(preKeyId: number): Promise<void>;
  abstract getSignedPreKey(signedPreKeyId: number): Promise<SignedPreKey | null>;
  abstract saveSignedPreKey(signedPreKeyId: number, signedPreKey: SignedPreKey): Promise<void>;
  abstract removeSignedPreKey(signedPreKeyId: number): Promise<void>;
  abstract loadSession(address: ProtocolAddress): Promise<Uint8Array | null>;
  abstract storeSession(address: ProtocolAddress, record: Uint8Array): Promise<void>;
  abstract getSubDeviceSessions(name: string): Promise<number[]>;
  abstract containsSession(address: ProtocolAddress): Promise<boolean>;
  abstract deleteSession(address: ProtocolAddress): Promise<void>;
  abstract deleteAllSessions(name: string): Promise<void>;
  abstract storeSenderKey(
    sender: ProtocolAddress,
    distributionId: DistributionId,
    record: Uint8Array
  ): Promise<void>;
  abstract loadSenderKey(
    sender: ProtocolAddress,
    distributionId: DistributionId
  ): Promise<Uint8Array | null>;
  abstract clear(): Promise<void>;

  getLocalDeviceId(): number {
    return this.localDeviceId;
  }
}
