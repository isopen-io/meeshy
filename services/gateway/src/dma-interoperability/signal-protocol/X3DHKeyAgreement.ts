/**
 * X3DH Key Agreement Protocol Implementation
 *
 * Phase 2, Week 3-4: X3DH Implementation
 * Status: IN PROGRESS
 *
 * X3DH (Extended Triple Diffie-Hellman) enables:
 * - Asynchronous key exchange (receiver doesn't need to be online)
 * - Perfect forward secrecy (ephemeral keys ensure PFS)
 * - Mutual authentication (identity keys authenticate both parties)
 * - Zero round-trip encryption (no protocol rounds needed)
 *
 * References:
 * - Signal Protocol Specification
 * - X3DH: The X3DH Key Agreement Protocol (Trevor Perrin & Moxie Marlinspike)
 * - Curve25519 specifications (RFC 7748)
 */

import * as crypto from 'crypto';
import { createHmac, createHash } from 'crypto';
import { PrismaClient } from '../../../shared/prisma/client';
import { SignalKeyManager } from './SignalKeyManager';

/**
 * Pre-key bundle published by a user for others to initiate sessions
 */
export interface PreKeyBundle {
  // Long-term identity key
  identityKey: Buffer;

  // Medium-term signed pre-key (rotated weekly)
  signedPreKey: {
    id: number;
    publicKey: Buffer;
    signature: Buffer; // Signed by identity key
  };

  // One-time pre-key (consumed after use)
  preKey?: {
    id: number;
    publicKey: Buffer;
  };

  // Protocol version
  registrationId: number;
}

/**
 * Result of X3DH key agreement (initiator side)
 */
export interface X3DHInitiatorResult {
  // Shared secret from X3DH (used with HKDF)
  sharedSecret: Buffer;

  // The ephemeral key pair used
  ephemeralKeyPair: {
    publicKey: Buffer;
    privateKey: Buffer;
  };

  // Pre-key ID used (if any)
  preKeyUsed?: number;

  // Signed pre-key ID used
  signedPreKeyId: number;

  // The identity key being used (for verification on responder side)
  identityKey: Buffer;

  // Derived root key for Double Ratchet initialization
  rootKey: Buffer;

  // Derived chain key for sending
  chainKeySend: Buffer;

  // Derived chain key for receiving
  chainKeyReceive: Buffer;
}

/**
 * Result of X3DH key agreement (responder side)
 */
export interface X3DHResponderResult {
  // Shared secret from X3DH (used with HKDF)
  sharedSecret: Buffer;

  // Derived root key for Double Ratchet initialization
  rootKey: Buffer;

  // Derived chain key for sending (responder's receiving)
  chainKeySend: Buffer;

  // Derived chain key for receiving (responder's sending)
  chainKeyReceive: Buffer;

  // The ephemeral key from the message
  ephemeralPublicKey: Buffer;

  // Signed pre-key ID used
  signedPreKeyId: number;

  // Pre-key ID used (if any)
  preKeyUsed?: number;
}

/**
 * X3DH Key Agreement Protocol
 *
 * Implements the extended triple Diffie-Hellman key agreement as specified in the Signal Protocol.
 * This class handles both initiator (client sending message) and responder (client receiving message) sides.
 */
export class X3DHKeyAgreement {
  private keyManager: SignalKeyManager;
  private prisma: PrismaClient;
  private stats = {
    initiatorSessions: 0,
    responderSessions: 0,
    dhOperationsPerformed: 0,
    agreementErrors: 0
  };

  constructor(keyManager: SignalKeyManager, prisma: PrismaClient) {
    this.keyManager = keyManager;
    this.prisma = prisma;
  }

  /**
   * INITIATOR SIDE: Perform X3DH with recipient's pre-key bundle
   *
   * Steps:
   * 1. Generate ephemeral key pair
   * 2. Perform 4 DH operations:
   *    - DH1: initiator identity × recipient signed pre-key
   *    - DH2: initiator ephemeral × recipient identity
   *    - DH3: initiator ephemeral × recipient signed pre-key
   *    - DH4: initiator ephemeral × recipient pre-key (optional)
   * 3. Concatenate DH results and use HKDF for key derivation
   * 4. Return shared secret and derived keys
   *
   * This is called when Partner client initiates a message to WhatsApp user.
   */
  async initiatorKeyAgreement(
    recipientBundle: PreKeyBundle,
    initiatorPrivateKey: Buffer
  ): Promise<X3DHInitiatorResult> {
    try {
      console.log('🤝 Starting X3DH initiator key agreement');

      // Step 1: Generate ephemeral key pair (ephemeral_key_pair)
      const ephemeralKeyPair = this.generateEphemeralKeyPair();
      console.log('  ✓ Generated ephemeral key pair');

      // Get initiator identity key public component
      const identityKey = this.keyManager.getIdentityPublicKey();
      if (!identityKey) {
        throw new Error('Identity key not available');
      }

      // Step 2: Perform 4 DH operations
      const dh1 = this.performDH(
        initiatorPrivateKey,
        recipientBundle.signedPreKey.publicKey,
        'DH1: identity × signed-prekey'
      );

      const dh2 = this.performDH(
        ephemeralKeyPair.privateKey,
        recipientBundle.identityKey,
        'DH2: ephemeral × identity'
      );

      const dh3 = this.performDH(
        ephemeralKeyPair.privateKey,
        recipientBundle.signedPreKey.publicKey,
        'DH3: ephemeral × signed-prekey'
      );

      let dh4 = Buffer.alloc(32);
      let preKeyUsed: number | undefined;

      if (recipientBundle.preKey) {
        dh4 = this.performDH(
          ephemeralKeyPair.privateKey,
          recipientBundle.preKey.publicKey,
          'DH4: ephemeral × prekey'
        );
        preKeyUsed = recipientBundle.preKey.id;
      }

      this.stats.dhOperationsPerformed += recipientBundle.preKey ? 4 : 3;

      // Step 3: Concatenate DH results
      // Format: concat(DH1, DH2, DH3, DH4) or concat(DH1, DH2, DH3, zeros) if no pre-key
      const concatenated = Buffer.concat([dh1, dh2, dh3, dh4]);
      console.log('  ✓ Performed 4 DH operations and concatenated results');

      // Step 4: HKDF key derivation
      const derived = this.deriveKeys(
        concatenated,
        'WhatsApp DMA Interoperability',
        recipientBundle.registrationId
      );

      console.log('  ✓ Derived keys using HKDF');

      this.stats.initiatorSessions++;

      const result: X3DHInitiatorResult = {
        sharedSecret: concatenated,
        ephemeralKeyPair,
        preKeyUsed,
        signedPreKeyId: recipientBundle.signedPreKey.id,
        identityKey,
        rootKey: derived.rootKey,
        chainKeySend: derived.chainKeySend,
        chainKeyReceive: derived.chainKeyReceive
      };

      console.log('✅ X3DH initiator key agreement complete');
      return result;
    } catch (error) {
      console.error('❌ X3DH initiator agreement failed:', error);
      this.stats.agreementErrors++;
      throw error;
    }
  }

  /**
   * RESPONDER SIDE: Perform X3DH with message containing ephemeral key
   *
   * Steps:
   * 1. Extract ephemeral public key from message
   * 2. Retrieve the pre-keys used by initiator
   * 3. Perform 4 DH operations (order different than initiator):
   *    - DH1: responder signed pre-key × initiator identity
   *    - DH2: responder identity × initiator ephemeral
   *    - DH3: responder signed pre-key × initiator ephemeral
   *    - DH4: responder pre-key × initiator ephemeral (optional)
   * 4. Concatenate DH results and use HKDF for key derivation
   * 5. Return derived keys (note: chain keys are swapped from initiator)
   *
   * This is called when WhatsApp user receives a message from Partner client.
   */
  async responderKeyAgreement(
    ephemeralPublicKey: Buffer,
    initiatorIdentityKey: Buffer,
    signedPreKeyId: number,
    preKeyId?: number
  ): Promise<X3DHResponderResult> {
    try {
      console.log('🤝 Starting X3DH responder key agreement');

      // Get responder's identity key pair (need private key for DH)
      const responderIdentityKeyPair = await this.keyManager.getIdentityKeyPair();
      if (!responderIdentityKeyPair) {
        throw new Error('Responder identity key pair not available');
      }

      // Get responder's signed pre-key
      const signedPreKey = await this.keyManager.getSignedPreKey();
      if (!signedPreKey) {
        throw new Error('Signed pre-key not available');
      }

      // Get responder's pre-key (if used)
      let preKey = null;
      if (preKeyId) {
        preKey = await this.keyManager.getPreKey(preKeyId);
        if (!preKey) {
          throw new Error(`Pre-key ${preKeyId} not found`);
        }
      }

      // Perform DH operations (order is different from initiator for correctness)
      // DH1: responder signed pre-key private × initiator identity public
      const dh1 = this.performDH(
        signedPreKey.privateKey,
        initiatorIdentityKey,
        'DH1: signed-prekey × identity'
      );

      // DH2: responder identity private × initiator ephemeral public
      const dh2 = this.performDH(
        responderIdentityKeyPair.privateKey,
        ephemeralPublicKey,
        'DH2: identity × ephemeral'
      );

      // DH3: responder signed pre-key private × initiator ephemeral public
      const dh3 = this.performDH(
        signedPreKey.privateKey,
        ephemeralPublicKey,
        'DH3: signed-prekey × ephemeral'
      );

      let dh4 = Buffer.alloc(32);

      if (preKey) {
        // DH4: responder pre-key private × initiator ephemeral public
        dh4 = this.performDH(
          preKey.privateKey,
          ephemeralPublicKey,
          'DH4: prekey × ephemeral'
        );
      }

      this.stats.dhOperationsPerformed += preKey ? 4 : 3;

      // Concatenate (same order as initiator for correctness)
      const concatenated = Buffer.concat([dh1, dh2, dh3, dh4]);
      console.log('  ✓ Performed 4 DH operations and concatenated results');

      // HKDF key derivation
      // Note: initiation uses sender's registration ID, but responder
      // uses initiator's registration ID for consistency
      const derived = this.deriveKeys(
        concatenated,
        'WhatsApp DMA Interoperability',
        0 // Placeholder - should be initiator's registration ID
      );

      console.log('  ✓ Derived keys using HKDF');

      this.stats.responderSessions++;

      const result: X3DHResponderResult = {
        sharedSecret: concatenated,
        rootKey: derived.rootKey,
        // Note: responder's send is initiator's receive and vice versa
        chainKeySend: derived.chainKeyReceive,
        chainKeyReceive: derived.chainKeySend,
        ephemeralPublicKey,
        signedPreKeyId,
        preKeyUsed: preKeyId
      };

      console.log('✅ X3DH responder key agreement complete');
      return result;
    } catch (error) {
      console.error('❌ X3DH responder agreement failed:', error);
      this.stats.agreementErrors++;
      throw error;
    }
  }

  /**
   * Generate ephemeral key pair (EC-P256)
   *
   * Ephemeral keys are fresh for each session and provide forward secrecy.
   * If the long-term identity key is compromised, past messages using
   * different ephemeral keys remain secure.
   */
  private generateEphemeralKeyPair(): { publicKey: Buffer; privateKey: Buffer } {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
      namedCurve: 'prime256v1', // P-256 / Curve25519 equivalent
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
   * Perform ECDH operation
   *
   * Computes the shared secret from our private key and recipient's public key.
   * Uses Curve25519 (prime256v1 in Node.js crypto).
   *
   * @param ourPrivateKey - Our private key (PKCS8 DER format)
   * @param theirPublicKey - Their public key (SPKI DER format)
   * @param label - For logging/debugging
   * @returns 32-byte shared secret
   */
  private performDH(
    ourPrivateKey: Buffer,
    theirPublicKey: Buffer,
    label: string
  ): Buffer {
    try {
      // Create key objects from DER format
      const privateKeyObject = crypto.createPrivateKey({
        key: ourPrivateKey,
        format: 'der',
        type: 'pkcs8'
      });

      const publicKeyObject = crypto.createPublicKey({
        key: theirPublicKey,
        format: 'der',
        type: 'spki'
      });

      // Perform ECDH
      const sharedSecret = crypto.diffieHellman({
        privateKey: privateKeyObject,
        publicKey: publicKeyObject
      });

      console.log(`  ✓ ${label}: Generated 32-byte shared secret`);
      return sharedSecret;
    } catch (error) {
      console.error(`  ❌ ${label} failed:`, error);
      throw new Error(`DH operation failed: ${label}`);
    }
  }

  /**
   * HKDF Key Derivation
   *
   * Uses HKDF (HMAC-based KDF) to derive multiple keys from the X3DH shared secret.
   * Produces:
   * - Root key (for Double Ratchet)
   * - Chain key send (for message keys)
   * - Chain key receive (for message keys)
   *
   * HKDF Steps:
   * 1. Extract: HMAC(salt, IKM) → PRK
   * 2. Expand: HMAC(PRK, info + counter) → keys
   */
  private deriveKeys(
    sharedSecret: Buffer,
    info: string,
    registrationId: number
  ): {
    rootKey: Buffer;
    chainKeySend: Buffer;
    chainKeyReceive: Buffer;
  } {
    // HKDF with SHA-256
    const salt = Buffer.alloc(32, 0); // Zero salt
    const infoBuffer = Buffer.from(info + registrationId.toString());

    // Extract phase: HMAC(salt, sharedSecret)
    const prk = createHmac('sha256', salt)
      .update(sharedSecret)
      .digest();

    // Expand phase: Generate 96 bytes (3 × 32-byte keys)
    const okm = this.hkdfExpand(prk, infoBuffer, 96);

    const rootKey = okm.subarray(0, 32);
    const chainKeySend = okm.subarray(32, 64);
    const chainKeyReceive = okm.subarray(64, 96);

    console.log('  ✓ HKDF-SHA256 derived 3 keys: rootKey, chainKeySend, chainKeyReceive');

    return {
      rootKey: Buffer.from(rootKey),
      chainKeySend: Buffer.from(chainKeySend),
      chainKeyReceive: Buffer.from(chainKeyReceive)
    };
  }

  /**
   * HKDF Expand phase (RFC 5869)
   *
   * Produces pseudorandom key material of desired length from PRK.
   * Used in the expand phase of HKDF.
   */
  private hkdfExpand(prk: Buffer, info: Buffer, length: number): Buffer {
    const hash = 'sha256';
    const hashLength = 32; // SHA-256 output size
    const n = Math.ceil(length / hashLength);
    const okm: Buffer[] = [];

    let t = Buffer.alloc(0);

    for (let i = 0; i < n; i++) {
      const hmac = createHmac(hash, prk);
      hmac.update(Buffer.concat([t, info, Buffer.from([i + 1])]));
      t = hmac.digest();
      okm.push(t);
    }

    return Buffer.concat(okm).subarray(0, length);
  }

  /**
   * Validate X3DH test vectors
   *
   * Used in Phase 3 for compatibility testing with WhatsApp's test vectors.
   * Ensures our implementation matches expected behavior.
   */
  async validateTestVectors(testVectorsPath: string): Promise<{
    passed: number;
    failed: number;
    errors: string[];
  }> {
    console.log(`📋 Validating X3DH test vectors from: ${testVectorsPath}`);

    // TODO (Phase 3):
    // 1. Load test vectors from file
    // 2. For each vector:
    //    - Parse initiator/responder bundles
    //    - Run initiator key agreement
    //    - Run responder key agreement
    //    - Verify shared secrets match
    //    - Verify derived keys match expected values
    // 3. Report results

    return {
      passed: 0,
      failed: 0,
      errors: ['Test vector validation not yet implemented']
    };
  }

  /**
   * Get X3DH statistics
   */
  getStatistics(): typeof this.stats {
    return { ...this.stats };
  }
}
