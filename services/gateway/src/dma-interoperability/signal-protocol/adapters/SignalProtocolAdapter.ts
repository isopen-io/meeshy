/**
 * Signal Protocol Adapter
 *
 * Wraps custom Signal Protocol implementation
 * Can be extended to use @signalapp/libsignal
 */

import { ISignalProtocolAdapter } from '../../adapters/LibraryAdapters';
import { SignalKeyManager } from '../SignalKeyManager';
import { X3DHKeyAgreement } from '../X3DHKeyAgreement';
import { DoubleRatchet } from '../DoubleRatchet';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { SignalProtocolLimits } from '@meeshy/shared/utils/validation';
import * as crypto from 'crypto';

export class SignalProtocolAdapter implements ISignalProtocolAdapter {
  private keyManager: SignalKeyManager;
  private x3dh: X3DHKeyAgreement;
  private doubleRatchet: DoubleRatchet;
  private prisma: PrismaClient;

  /**
   * Create a Signal Protocol adapter
   * @param prisma - PrismaClient for database operations
   * @param masterKey - Optional master encryption key for key storage
   */
  constructor(prisma: PrismaClient, masterKey?: Buffer) {
    this.prisma = prisma;
    this.keyManager = new SignalKeyManager(prisma, masterKey);
    // X3DHKeyAgreement REQUIERT son gestionnaire de clés et son client Prisma :
    // sans eux, `initiatorKeyAgreement` lit `this.keyManager.getIdentityPublicKey()`
    // sur `undefined` et tout accord de clés passant par cet adaptateur lève.
    this.x3dh = new X3DHKeyAgreement(this.keyManager, prisma);
    this.doubleRatchet = new DoubleRatchet();
  }

  /**
   * Set the user ID for this adapter's key manager
   */
  setUserId(userId: string): void {
    this.keyManager.setUserId(userId);
  }

  async generateIdentityKeyPair(): Promise<{ publicKey: Buffer; privateKey: Buffer }> {
    return this.keyManager.generateIdentityKeyPair();
  }

  async generatePreKeyBatch(count: number): Promise<Array<{ id: number; publicKey: Buffer }>> {
    // `generateAndStorePreKeys` est le seul chemin qui ATTRIBUE un id de pré-clé
    // (`getNextPreKeyId`) et le persiste. L'ancien appel visait le générateur brut,
    // qui rend des `KeyPair` sans id : le contrat `{ id, publicKey }` de cet
    // adaptateur sortait avec `id: undefined` sur chaque entrée.
    return this.keyManager.generateAndStorePreKeys(count);
  }

  async generateSignedPreKey(id: number): Promise<{ id: number; publicKey: Buffer; signature: Buffer }> {
    const signedPreKey = await this.keyManager.generateAndStoreSignedPreKey();
    return {
      id: signedPreKey.id,
      publicKey: signedPreKey.publicKey,
      signature: signedPreKey.signature
    };
  }

  async performX3DH(
    ourIdentityPrivate: Buffer,
    ourEphemeralPrivate: Buffer,
    theirIdentityPublic: Buffer,
    theirSignedPreKeyPublic: Buffer,
    theirPreKeyPublic?: Buffer
  ): Promise<Buffer> {
    // Create mock recipient bundle for X3DH
    const recipientBundle = {
      identityKey: theirIdentityPublic,
      signedPreKey: {
        id: 0,
        publicKey: theirSignedPreKeyPublic
      },
      preKey: theirPreKeyPublic ? { id: 0, publicKey: theirPreKeyPublic } : undefined,
      registrationId: 0
    };

    const result = await this.x3dh.initiatorKeyAgreement(recipientBundle as any, ourIdentityPrivate);
    return result.rootKey;
  }

  async encryptMessage(
    sessionKey: Buffer,
    plaintext: Buffer,
    messageNumber: number
  ): Promise<{
    ciphertext: Buffer;
    iv: Buffer;
    authTag: Buffer;
  }> {
    // Nonce de 96 bits : la largeur STANDARD de GCM, celle que déclarent
    // `SignalValidation.validateEncryptedPayload` et `SignalSchemas.encryptedMessage`,
    // et celle qu'emploie tout le reste du dépôt (pièces jointes web et passerelle,
    // `encryption-utils`, `node-crypto-adapter`). Le littéral `16` d'avant produisait
    // un IV que les DEUX gardes partagées rejetaient.
    const iv = crypto.randomBytes(SignalProtocolLimits.AES_GCM_IV_SIZE);
    const cipher = crypto.createCipheriv('aes-256-gcm', sessionKey, iv);
    let ciphertext = cipher.update(plaintext);
    ciphertext = Buffer.concat([ciphertext, cipher.final()]);
    const authTag = cipher.getAuthTag();

    return { ciphertext, iv, authTag };
  }

  async decryptMessage(
    sessionKey: Buffer,
    ciphertext: Buffer,
    iv: Buffer,
    authTag: Buffer
  ): Promise<Buffer> {
    const decipher = crypto.createDecipheriv('aes-256-gcm', sessionKey, iv);
    decipher.setAuthTag(authTag);
    let plaintext = decipher.update(ciphertext);
    plaintext = Buffer.concat([plaintext, decipher.final()]);
    return plaintext;
  }

  async deriveMessageKey(chainKey: Buffer): Promise<{ messageKey: Buffer; nextChainKey: Buffer }> {
    // HMAC-based KDF for Double Ratchet
    const hmac1 = crypto.createHmac('sha256', chainKey);
    hmac1.update(Buffer.from([0x01]));
    const messageKey = hmac1.digest();

    const hmac2 = crypto.createHmac('sha256', chainKey);
    hmac2.update(Buffer.from([0x02]));
    const nextChainKey = hmac2.digest();

    return { messageKey, nextChainKey };
  }

  getImplementation(): 'libsignal' | 'custom' {
    return 'custom';
  }

  getVersion(): string {
    return 'signal-protocol-v3-custom';
  }
}
