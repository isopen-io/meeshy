/**
 * Signal Protocol Types
 *
 * Type definitions for Signal Protocol implementation.
 * These types are used for E2EE (End-to-End Encryption) with Signal Protocol.
 */

/**
 * Pre-Key Bundle for initial key exchange
 */
export interface PreKeyBundle {
  registrationId: number;
  deviceId: number;
  preKeyId: number | null;
  preKeyPublic: Uint8Array | null;
  signedPreKeyId: number;
  signedPreKeyPublic: Uint8Array;
  signedPreKeySignature: Uint8Array;
  identityKey: Uint8Array;
  // Kyber post-quantum keys (future-proofing)
  kyberPreKeyId: number | null;
  kyberPreKeyPublic: Uint8Array | null;
  kyberPreKeySignature: Uint8Array | null;
}

/**
 * Signed Pre-Key for key rotation
 */
export interface SignedPreKey {
  keyId: number;
  publicKey: Uint8Array;
  signature: Uint8Array;
}

/**
 * Pre-Key for forward secrecy
 */
export interface PreKey {
  keyId: number;
  publicKey: Uint8Array;
}

/**
 * Identity Key for user identification
 */
export interface IdentityKey {
  publicKey: Uint8Array;
}

/**
 * Key Pair with public and private components
 */
export interface SignalKeyPair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

/**
 * Session state for a conversation
 */
export interface SessionState {
  remoteIdentityKey: Uint8Array;
  localIdentityKey: Uint8Array;
  rootKey: Uint8Array;
  chainKey: Uint8Array;
  messageIndex: number;
}

/**
 * Encrypted message with Signal Protocol
 */
export interface SignalMessage {
  type: 'prekey' | 'whisper';
  registrationId: number;
  deviceId: number;
  ciphertext: Uint8Array;
}

/**
 * Direction for identity key trust decisions
 */
export enum Direction {
  Sending = 0,
  Receiving = 1,
}

/**
 * Trust level for identity keys
 */
export enum TrustLevel {
  Untrusted = 0,
  TrustedUnverified = 1,
  TrustedVerified = 2,
}

/**
 * Result of identity key verification
 */
export interface IdentityKeyVerification {
  trusted: boolean;
  trustLevel: TrustLevel;
  fingerprint: string;
}

/**
 * Distribution ID for sender key groups
 */
export type DistributionId = string;

/**
 * Sender Key distribution message
 */
export interface SenderKeyDistributionMessage {
  distributionId: DistributionId;
  chainId: number;
  iteration: number;
  chainKey: Uint8Array;
  signatureKey: Uint8Array;
}

/**
 * Signal Message Type enum
 */
export enum SignalMessageType {
  PreKey = 1,
  Whisper = 2,
  SenderKey = 3,
  PlainText = 4,
}

/**
 * Signal Session State (extended)
 */
export interface SignalSessionState {
  sessionVersion: number;
  remoteIdentityKey: Uint8Array;
  localIdentityKey: Uint8Array;
  rootKey: Uint8Array;
  previousCounter: number;
  senderChain: {
    senderRatchetKey: Uint8Array;
    senderRatchetKeyPrivate?: Uint8Array;
    chainKey: {
      index: number;
      key: Uint8Array;
    };
  };
  receiverChains: Array<{
    senderRatchetKey: Uint8Array;
    chainKey: {
      index: number;
      key: Uint8Array;
    };
  }>;
  pendingPreKey?: {
    preKeyId: number;
    signedPreKeyId: number;
    baseKey: Uint8Array;
  };
  remoteRegistrationId: number;
  localRegistrationId: number;
}

/**
 * Encrypted message structure from Signal Protocol
 */
export interface SignalEncryptedMessage {
  type: SignalMessageType;
  destinationRegistrationId: number;
  content: Uint8Array;
  // For PreKey messages
  registrationId?: number;
  preKeyId?: number;
  signedPreKeyId?: number;
  baseKey?: Uint8Array;
  identityKey?: Uint8Array;
  // Message metadata
  messageVersion: number;
  counter: number;
  previousCounter: number;
}

/**
 * Hybrid encryption payload for server-translatable E2EE
 * Double encryption: E2EE envelope + Server-accessible content
 */
export interface HybridEncryptedMessage {
  // E2EE layer (only sender/recipient can decrypt)
  e2ee: {
    ciphertext: Uint8Array;
    type: SignalMessageType;
    senderRegistrationId: number;
    recipientRegistrationId: number;
  };
  // Server layer (server can decrypt for translation)
  server?: {
    ciphertext: string; // Base64
    iv: string; // Base64
    authTag: string; // Base64
    keyId: string;
  };
  // Metadata
  mode: 'e2ee' | 'hybrid' | 'server';
  canTranslate: boolean;
  timestamp: number;
}
