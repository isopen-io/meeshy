/**
 * Double Ratchet Algorithm Implementation
 *
 * Phase 2, Week 5-6: Double Ratchet + Message Encryption
 * Status: IN PROGRESS
 *
 * Double Ratchet provides:
 * - Symmetric ratchet: Forward secrecy per message (KDF chain)
 * - Asymmetric ratchet: Key rotation via DH (DHR)
 * - Out-of-order handling: Skipped message key storage
 * - Perfect forward secrecy: Ephemeral keys per message
 *
 * References:
 * - Signal Protocol Specification: Double Ratchet Algorithm
 * - The Double Ratchet Algorithm (Perrin & Marlinspike)
 */

import * as crypto from 'crypto';
import { createHmac, createHash } from 'crypto';

/**
 * Skipped message key for out-of-order message handling
 */
export interface SkippedMessageKey {
  dhRatchetKey: Buffer; // DH public key that generated this key
  messageNumber: number; // Message number in that DH epoch
  messageKey: Buffer; // The actual message key
  timestamp: Date; // When we generated it
}

/**
 * Double Ratchet session state
 */
export interface DoubleRatchetSession {
  // Ratchet state
  rootKey: Buffer; // Root key (32 bytes)
  chainKeySend: Buffer; // Current send chain key (32 bytes)
  chainKeyReceive: Buffer; // Current receive chain key (32 bytes)

  // DH Ratchet state
  dhRatchetKeyPair?: {
    publicKey: Buffer;
    privateKey: Buffer;
  }; // Our current DH ratchet key pair
  dhRatchetKeyRemote?: Buffer; // Recipient's last DH ratchet key

  // Session state
  messageNumberSend: number; // Next message number we're sending
  messageNumberReceive: number; // Next message number we expect to receive
  previousChainLength: number; // Length of previous send chain
  messagesSent: number; // Total messages sent in this session

  // Out-of-order tracking
  skippedMessageKeys: SkippedMessageKey[]; // Keys for messages we haven't received yet
  maxSkippedKeys: number; // Maximum skipped keys to store (prevent memory attack)
}

/**
 * Message key (used for AES encryption)
 */
export interface MessageKey {
  key: Buffer; // 32-byte key for AES-256-GCM
  messageNumber: number; // Associated message number
  chainKeyIndex: number; // Position in chain key derivation
}

/**
 * Double Ratchet Algorithm
 *
 * Implements symmetric and asymmetric ratcheting for perfect forward secrecy.
 */
export class DoubleRatchet {
  private stats = {
    sessionsActive: 0,
    messagesProcessed: 0,
    symmetricRatchets: 0,
    asymmetricRatchets: 0,
    skippedKeysStored: 0,
    skippedKeysUsed: 0
  };

  constructor() {}

  /**
   * Initialize Double Ratchet session from X3DH result
   *
   * Called after X3DH key agreement to set up the initial ratchet state.
   */
  initializeSession(
    rootKey: Buffer,
    chainKeySend: Buffer,
    chainKeyReceive: Buffer,
    dhRatchetKeyPair?: { publicKey: Buffer; privateKey: Buffer }
  ): DoubleRatchetSession {
    console.log('🔄 Initializing Double Ratchet session');

    const session: DoubleRatchetSession = {
      rootKey,
      chainKeySend,
      chainKeyReceive,
      dhRatchetKeyPair,
      messageNumberSend: 0,
      messageNumberReceive: 0,
      previousChainLength: 0,
      messagesSent: 0,
      skippedMessageKeys: [],
      maxSkippedKeys: 100 // Prevent memory exhaustion from out-of-order messages
    };

    this.stats.sessionsActive++;
    console.log('✅ Double Ratchet session initialized');

    return session;
  }

  /**
   * SYMMETRIC RATCHET: Advance chain key and derive message key
   *
   * Steps:
   * 1. Derive message key from current chain key: HMAC(key, 0x01)
   * 2. Advance chain key: HMAC(key, 0x02)
   * 3. Increment message number
   *
   * This provides forward secrecy: compromising chain key at position N
   * doesn't reveal message keys at positions < N.
   */
  symmetricRatchet(session: DoubleRatchetSession, direction: 'send' | 'receive'): MessageKey {
    const chainKey = direction === 'send' ? session.chainKeySend : session.chainKeyReceive;

    // Step 1: Derive message key
    const messageKey = this.hmacHash(chainKey, Buffer.from([0x01]));

    // Step 2: Advance chain key
    const nextChainKey = this.hmacHash(chainKey, Buffer.from([0x02]));

    // Update session
    if (direction === 'send') {
      session.chainKeySend = nextChainKey;
      const msgNum = session.messageNumberSend;
      session.messageNumberSend++;
      session.messagesSent++;

      console.log(
        `  ✓ Symmetric ratchet (send): message #${msgNum}, new chain key derived`
      );

      return {
        key: messageKey,
        messageNumber: msgNum,
        chainKeyIndex: msgNum
      };
    } else {
      session.chainKeyReceive = nextChainKey;
      const msgNum = session.messageNumberReceive;
      session.messageNumberReceive++;

      console.log(
        `  ✓ Symmetric ratchet (receive): message #${msgNum}, new chain key derived`
      );

      return {
        key: messageKey,
        messageNumber: msgNum,
        chainKeyIndex: msgNum
      };
    }
  }

  /**
   * ASYMMETRIC RATCHET: Perform DH key rotation
   *
   * Steps:
   * 1. Generate new DH key pair
   * 2. Perform DH with recipient's DH ratchet key
   * 3. Derive new root key and chain keys from DH output
   * 4. Reset message counters
   *
   * This is called when:
   * - Initiator: every message (to get immediate PFS)
   * - Responder: only when receiving new DH ratchet key
   *
   * The asymmetric ratchet provides stronger PFS than symmetric ratchet alone.
   */
  asymmetricRatchet(
    session: DoubleRatchetSession,
    remotePublicKey?: Buffer
  ): { rootKey: Buffer; chainKeySend: Buffer; chainKeyReceive: Buffer } {
    console.log('🔄 Performing asymmetric ratchet (DHR)');

    // Step 1: Generate new DH key pair
    const newDHKeyPair = this.generateDHKeyPair();

    // Step 2: Perform DH with remote key (if provided, we're receiving)
    let dhOutput = Buffer.alloc(32);

    if (remotePublicKey) {
      // Responder: DH with initiator's ephemeral key
      dhOutput = this.performDH(session.dhRatchetKeyPair!.privateKey, remotePublicKey);
      session.dhRatchetKeyRemote = remotePublicKey;
    } else {
      // Initiator: DH with our new key and recipient's last key
      if (session.dhRatchetKeyRemote) {
        dhOutput = this.performDH(newDHKeyPair.privateKey, session.dhRatchetKeyRemote);
      }
    }

    // Step 3: Derive new root key and chain keys
    const kdf = this.kdfRatchet(session.rootKey, dhOutput);

    // Update session
    session.rootKey = kdf.rootKey;
    session.chainKeySend = kdf.chainKeySend;
    session.chainKeyReceive = kdf.chainKeyReceive;
    session.dhRatchetKeyPair = newDHKeyPair;
    session.previousChainLength = session.messageNumberSend;
    session.messageNumberSend = 0;
    session.messageNumberReceive = 0;

    this.stats.asymmetricRatchets++;

    console.log('  ✓ Asymmetric ratchet complete: new DH key pair + KDF');

    return {
      rootKey: session.rootKey,
      chainKeySend: session.chainKeySend,
      chainKeyReceive: session.chainKeyReceive
    };
  }

  /**
   * KDF Ratchet: Derive new root key and chain keys from DH output
   *
   * Uses HKDF to securely expand DH output into multiple keys.
   */
  private kdfRatchet(
    rootKey: Buffer,
    dhOutput: Buffer
  ): { rootKey: Buffer; chainKeySend: Buffer; chainKeyReceive: Buffer } {
    // Concatenate root key and DH output
    const rkm = Buffer.concat([rootKey, dhOutput]);

    // HKDF with zero salt
    const salt = Buffer.alloc(32, 0);
    const info = Buffer.from('WhatsApp DMA Double Ratchet');

    // Extract phase
    const prk = createHmac('sha256', salt).update(rkm).digest();

    // Expand phase: derive 96 bytes (root + 2 chain keys)
    const okm = this.hkdfExpand(prk, info, 96);

    return {
      rootKey: okm.subarray(0, 32) as Buffer,
      chainKeySend: okm.subarray(32, 64) as Buffer,
      chainKeyReceive: okm.subarray(64, 96) as Buffer
    };
  }

  /**
   * HKDF Expand (RFC 5869)
   */
  private hkdfExpand(prk: Buffer, info: Buffer, length: number): Buffer {
    const hash = 'sha256';
    const hashLength = 32;
    const n = Math.ceil(length / hashLength);
    const okm: Buffer[] = [];

    let t = Buffer.alloc(0);

    for (let i = 0; i < n; i++) {
      const hmac = createHmac(hash, prk);
      hmac.update(Buffer.concat([t, info, Buffer.from([i + 1])]));
      t = hmac.digest();
      okm.push(t);
    }

    return Buffer.concat(okm).subarray(0, length) as Buffer;
  }

  /**
   * OUT-OF-ORDER MESSAGE HANDLING
   *
   * When we receive a message with messageNumber > expected:
   * 1. Store all skipped message keys
   * 2. Skip ahead in chain
   * 3. Use stored key for out-of-order message
   * 4. Clean up old skipped keys (prevent memory attack)
   *
   * Prevents memory attack: max 100 skipped keys per session
   */
  skipMessageKeys(
    session: DoubleRatchetSession,
    until: number,
    direction: 'send' | 'receive'
  ): void {
    console.log(`⏭️  Skipping message keys up to #${until}`);

    const chainKey = direction === 'send' ? session.chainKeySend : session.chainKeyReceive;
    let currentMessageNumber = direction === 'send' ? session.messageNumberSend : session.messageNumberReceive;

    // Generate and store message keys we're skipping
    while (currentMessageNumber < until) {
      const messageKey = this.hmacHash(chainKey, Buffer.from([0x01]));

      const skipped: SkippedMessageKey = {
        dhRatchetKey: session.dhRatchetKeyPair?.publicKey || Buffer.alloc(0),
        messageNumber: currentMessageNumber,
        messageKey,
        timestamp: new Date()
      };

      session.skippedMessageKeys.push(skipped);
      this.stats.skippedKeysStored++;

      // Advance chain key
      const nextChainKey = this.hmacHash(chainKey, Buffer.from([0x02]));
      if (direction === 'send') {
        session.chainKeySend = nextChainKey;
      } else {
        session.chainKeyReceive = nextChainKey;
      }

      currentMessageNumber++;
    }

    // Cleanup old skipped keys (prevent memory attack)
    // Keep only the most recent maxSkippedKeys
    if (session.skippedMessageKeys.length > session.maxSkippedKeys) {
      const toRemove = session.skippedMessageKeys.length - session.maxSkippedKeys;
      session.skippedMessageKeys.splice(0, toRemove);
    }

    console.log(`  ✓ Stored ${session.skippedMessageKeys.length} skipped message keys`);
  }

  /**
   * Retrieve message key for out-of-order message
   */
  retrieveSkippedMessageKey(
    session: DoubleRatchetSession,
    dhRatchetKey: Buffer,
    messageNumber: number
  ): MessageKey | null {
    console.log(`🔍 Looking for skipped message key #${messageNumber}`);

    const index = session.skippedMessageKeys.findIndex(
      (sk) => sk.dhRatchetKey.equals(dhRatchetKey) && sk.messageNumber === messageNumber
    );

    if (index >= 0) {
      const skipped = session.skippedMessageKeys[index];
      session.skippedMessageKeys.splice(index, 1);
      this.stats.skippedKeysUsed++;

      console.log(`  ✓ Found and removed skipped key for message #${messageNumber}`);

      return {
        key: skipped.messageKey,
        messageNumber: skipped.messageNumber,
        chainKeyIndex: skipped.messageNumber
      };
    }

    console.log(`  ❌ Skipped message key not found`);
    return null;
  }

  /**
   * Get or generate message key for sending
   */
  getMessageKeySend(session: DoubleRatchetSession): MessageKey {
    console.log('📝 Generating message key for sending');
    return this.symmetricRatchet(session, 'send');
  }

  /**
   * Get or generate message key for receiving
   */
  getMessageKeyReceive(
    session: DoubleRatchetSession,
    messageNumber: number
  ): MessageKey | null {
    console.log(`📥 Getting message key for receiving (expected #${session.messageNumberReceive})`);

    // If this is the expected message, advance normally
    if (messageNumber === session.messageNumberReceive) {
      return this.symmetricRatchet(session, 'receive');
    }

    // If message is ahead, skip ahead
    if (messageNumber > session.messageNumberReceive) {
      this.skipMessageKeys(session, messageNumber, 'receive');
      return this.symmetricRatchet(session, 'receive');
    }

    // If message is behind, it's a duplicate or out-of-order
    // This shouldn't happen in normal flow
    console.log(`  ⚠️  Message #${messageNumber} is behind expected #${session.messageNumberReceive}`);
    return null;
  }

  /**
   * Generate DH key pair (EC-P256)
   */
  private generateDHKeyPair(): { publicKey: Buffer; privateKey: Buffer } {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
      publicKeyEncoding: {
        type: 'spki',
        format: 'der'
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'der'
      }
    });

    return {
      publicKey: publicKey as Buffer,
      privateKey: privateKey as Buffer
    };
  }

  /**
   * Perform ECDH
   */
  private performDH(privateKey: Buffer, publicKey: Buffer): Buffer {
    const privateKeyObject = crypto.createPrivateKey({
      key: privateKey,
      format: 'der',
      type: 'pkcs8'
    });

    const publicKeyObject = crypto.createPublicKey({
      key: publicKey,
      format: 'der',
      type: 'spki'
    });

    const sharedSecret = crypto.diffieHellman({
      privateKey: privateKeyObject,
      publicKey: publicKeyObject
    });

    return sharedSecret;
  }

  /**
   * HMAC Hash: HMAC-SHA256
   */
  private hmacHash(key: Buffer, input: Buffer): Buffer {
    return createHmac('sha256', key).update(input).digest();
  }

  /**
   * Get statistics
   */
  getStatistics(): typeof this.stats {
    return { ...this.stats };
  }
}
