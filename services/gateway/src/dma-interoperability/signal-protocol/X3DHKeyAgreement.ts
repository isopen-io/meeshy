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
import { createHmac, createVerify } from 'crypto';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { SignalKeyManager } from './SignalKeyManager';
import { enhancedLogger } from '../../utils/logger-enhanced';

// Create child logger for this module
const logger = enhancedLogger.child({ module: 'X3DHKeyAgreement' });

/**
 * Refus d'un paquet de pré-clés dont la pré-clé signée n'est pas rattachée à la
 * clé d'identité annoncée.
 *
 * Type propre plutôt qu'`Error` nu : un appelant doit pouvoir distinguer « ce
 * paquet est inauthentique » — qui est un signal d'ATTAQUE, et ne se réessaie
 * pas — d'un accord qui a échoué pour une raison d'exploitation.
 */
export class X3DHSignedPreKeyRejected extends Error {
  constructor(reason: string) {
    super(`X3DH: pré-clé signée refusée — ${reason}`);
    this.name = 'X3DHSignedPreKeyRejected';
  }
}

/**
 * L'identifiant d'enregistrement entre dans l'`info` du HKDF, donc dans les clés.
 * Les deux bouts doivent y mettre le MÊME entier — celui de l'INITIATEUR.
 *
 * Dériver contre un `0` de repli, comme le faisait le répondeur, ne dégrade pas
 * la session : elle fabrique des clés que le pair ne retrouvera JAMAIS. La panne
 * ne se déclare alors qu'au premier déchiffrement, sous les traits d'une
 * authentification GCM rompue — c'est-à-dire sous les traits d'une ATTAQUE.
 * Refuser ici nomme la vraie cause, à l'endroit où elle est encore lisible.
 *
 * La garde est runtime parce que la valeur traverse une frontière que le typage
 * ne couvre pas : elle vient d'une colonne (`DMAEnrollment.registrationId`).
 */
const assertInitiatorRegistrationId = (registrationId: number | undefined): number => {
  if (typeof registrationId !== 'number' || !Number.isInteger(registrationId)) {
    throw new Error(
      "X3DH: impossible de dériver — l'identifiant d'enregistrement de l'initiateur est absent " +
        'ou non entier, or les deux bouts doivent lier le même'
    );
  }

  return registrationId;
};

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
    agreementErrors: 0,
    // Comptés à part d'`agreementErrors` : un refus de signature n'est pas un
    // incident d'exploitation, c'est la trace d'un paquet inauthentique.
    signedPreKeysVerified: 0,
    signedPreKeysRejected: 0
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
      logger.debug('Starting X3DH initiator key agreement');

      // Step 0: AUTHENTIFIER le paquet avant d'en dériver quoi que ce soit.
      //
      // X3DH §3.3 : « Alice verifies the prekey signature and aborts the protocol
      // if verification fails ». C'est la SEULE étape qui rattache la pré-clé
      // signée — reçue d'un annuaire que le protocole suppose hostile — à la clé
      // d'identité, qui est l'unique ancre de confiance de l'accord.
      //
      // Le refus est prononcé AVANT la génération de l'éphémère et avant tout DH :
      // aucun secret ne doit être dérivé contre une clé qu'on n'a pas authentifiée.
      this.assertSignedPreKeyIsAuthentic(recipientBundle);

      // Step 1: Generate ephemeral key pair (ephemeral_key_pair)
      const ephemeralKeyPair = this.generateEphemeralKeyPair();
      logger.debug('Generated ephemeral key pair');

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

      let dh4: Buffer = Buffer.alloc(32);
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
      logger.debug('Performed DH operations and concatenated results', { dhOperations: recipientBundle.preKey ? 4 : 3 });

      // Step 4: HKDF key derivation
      //
      // L'identifiant lié au HKDF est celui de l'INITIATEUR — le nôtre, ici. Les
      // deux bouts doivent y mettre le MÊME entier, sans quoi un secret partagé
      // pourtant identique produit deux jeux de clés étrangers l'un à l'autre ;
      // et c'est le seul des deux que les deux bouts peuvent connaître sans le
      // tenir d'un canal hostile (le répondeur le lit dans l'inscription de
      // l'expéditeur, cf. `responderKeyAgreement`).
      //
      // `recipientBundle.registrationId`, lui, ne voyage QUE dans le paquet de
      // pré-clés — un champ que la signature de la pré-clé signée ne couvre PAS.
      // Le lier donnerait à l'annuaire un levier pour désaccorder deux pairs sans
      // jamais toucher à une signature. Il reste dans le paquet comme étiquette
      // de session ; il n'entre pas dans une dérivation.
      const derived = this.deriveKeys(
        concatenated,
        'WhatsApp DMA Interoperability',
        this.initiatorRegistrationId()
      );

      logger.debug('Derived keys using HKDF');

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

      logger.info('X3DH initiator key agreement complete', { signedPreKeyId: recipientBundle.signedPreKey.id, preKeyUsed });
      return result;
    } catch (error) {
      logger.error('X3DH initiator agreement failed', { err: error });
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
    preKeyId: number | undefined,
    // REQUIS : sans lui aucune clé du pair n'est atteignable (cf.
    // `assertInitiatorRegistrationId`). Un appelant qui ne l'a pas n'a pas de
    // session à ouvrir — il n'a pas un argument par défaut à recevoir.
    initiatorRegistrationId: number
  ): Promise<X3DHResponderResult> {
    try {
      logger.debug('Starting X3DH responder key agreement', { signedPreKeyId, preKeyId, initiatorRegistrationId });

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

      let dh4: Buffer = Buffer.alloc(32);

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
      logger.debug('Performed DH operations and concatenated results', { dhOperations: preKey ? 4 : 3 });

      // HKDF key derivation
      // Note: both parties must use the same registration ID (initiator's)
      // to derive identical shared secrets
      const derived = this.deriveKeys(
        concatenated,
        'WhatsApp DMA Interoperability',
        assertInitiatorRegistrationId(initiatorRegistrationId)
      );

      logger.debug('Derived keys using HKDF');

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

      logger.info('X3DH responder key agreement complete', { signedPreKeyId, preKeyUsed: preKeyId });
      return result;
    } catch (error) {
      logger.error('X3DH responder agreement failed', { err: error });
      this.stats.agreementErrors++;
      throw error;
    }
  }

  /**
   * Notre propre identifiant d'enregistrement, côté initiateur.
   *
   * C'est celui que nous PUBLIONS (`SignalKeyManager.getPublicKeysForPublishing`)
   * et donc celui que le répondeur retrouvera dans notre inscription — la même
   * valeur des deux côtés, ce qu'exige la dérivation.
   */
  private initiatorRegistrationId(): number {
    return assertInitiatorRegistrationId(this.keyManager.getRegistrationId());
  }

  /**
   * Confronte la pré-clé signée du paquet à la clé d'identité qu'il annonce.
   *
   * Le producteur est `SignalKeyManager.generateAndStoreSignedPreKey` : il signe
   * les octets SPKI DER de la pré-clé publique, en ECDSA-SHA256, avec la clé
   * d'identité privée. La vérification lit donc exactement ces octets-là.
   *
   * Fail-closed sur toute la surface : une signature absente, une clé illisible
   * ou une exception d'OpenSSL valent REFUS, jamais laissez-passer. Le retrait de
   * la signature est en pratique la manœuvre la moins chère — bien moins que la
   * forgerie — donc l'absence est traitée exactement comme l'invalidité.
   */
  private assertSignedPreKeyIsAuthentic(bundle: PreKeyBundle): void {
    const reason = this.signedPreKeyRejectionReason(bundle);

    if (reason) {
      this.stats.signedPreKeysRejected++;
      logger.error('SECURITY: X3DH signed pre-key rejected — aborting key agreement', {
        reason,
        signedPreKeyId: bundle?.signedPreKey?.id,
        registrationId: bundle?.registrationId
      });
      throw new X3DHSignedPreKeyRejected(reason);
    }

    this.stats.signedPreKeysVerified++;
  }

  /**
   * Rend la raison du refus, ou `null` si le paquet est authentique.
   */
  private signedPreKeyRejectionReason(bundle: PreKeyBundle): string | null {
    if (!bundle?.identityKey?.length) {
      return "le paquet ne porte aucune clé d'identité";
    }

    if (!bundle.signedPreKey?.publicKey?.length) {
      return 'le paquet ne porte aucune pré-clé signée';
    }

    if (!bundle.signedPreKey.signature?.length) {
      return 'le paquet ne porte aucune signature';
    }

    return this.signatureIsAuthentic(
      bundle.signedPreKey.publicKey,
      bundle.signedPreKey.signature,
      bundle.identityKey
    )
      ? null
      : "la signature ne rattache pas la pré-clé signée à la clé d'identité annoncée";
  }

  /**
   * Vérification ECDSA-SHA256, rendant `false` sur toute anomalie.
   *
   * Une clé d'identité malformée fait lever `createPublicKey` ; une signature
   * malformée fait lever ou rendre `false` selon la nature du défaut. Les deux
   * issues sont le même verdict — le paquet n'est pas authentique — et aucune ne
   * doit remonter à l'appelant sous la forme d'une exception d'OpenSSL.
   */
  private signatureIsAuthentic(
    signedPreKeyPublic: Buffer,
    signature: Buffer,
    identityKey: Buffer
  ): boolean {
    try {
      const identityKeyObject = crypto.createPublicKey({
        key: identityKey,
        format: 'der',
        type: 'spki'
      });

      const verify = createVerify('SHA256');
      verify.update(signedPreKeyPublic);
      return verify.verify(identityKeyObject, signature);
    } catch (error) {
      logger.warn('X3DH signed pre-key signature could not be verified', {
        err: error instanceof Error ? error.message : String(error)
      });
      return false;
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

      logger.debug('Generated 32-byte shared secret', { label });
      return sharedSecret;
    } catch (error) {
      logger.error('DH operation failed', { err: error, label });
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

    logger.debug('HKDF-SHA256 derived 3 keys: rootKey, chainKeySend, chainKeyReceive');

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
    logger.info('Validating X3DH test vectors', { path: testVectorsPath });

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
