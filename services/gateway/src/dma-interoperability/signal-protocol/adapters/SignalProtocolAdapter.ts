/**
 * Signal Protocol Adapter
 *
 * Wraps custom Signal Protocol implementation
 * Can be extended to use @signalapp/libsignal
 */

import { ISignalProtocolAdapter } from '../../adapters/LibraryAdapters';
import { SignalKeyManager } from '../SignalKeyManager';
import { X3DHKeyAgreement, type PreKeyBundle } from '../X3DHKeyAgreement';
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

  async performX3DH(params: {
    ourIdentityPrivate: Buffer;
    theirIdentityPublic: Buffer;
    theirSignedPreKeyPublic: Buffer;
    theirSignedPreKeySignature: Buffer;
    theirPreKeyPublic?: Buffer;
  }): Promise<{ rootKey: Buffer; ourEphemeralPublic: Buffer; ourRegistrationId: number }> {
    // Le paquet porte désormais la SIGNATURE de la pré-clé signée, donc il a la
    // forme complète que `PreKeyBundle` déclare — le `as any` d'avant existait
    // parce que ce contrat-ci n'en transportait pas, et il masquait exactement
    // l'absence du seul champ qui authentifie l'accord. C'est
    // `initiatorKeyAgreement` qui la vérifie : une seule implémentation de la
    // règle, chez celui qui accorde les clés.
    const recipientBundle: PreKeyBundle = {
      identityKey: params.theirIdentityPublic,
      signedPreKey: {
        id: 0,
        publicKey: params.theirSignedPreKeyPublic,
        signature: params.theirSignedPreKeySignature
      },
      preKey: params.theirPreKeyPublic ? { id: 0, publicKey: params.theirPreKeyPublic } : undefined,
      // Étiquette de session, PAS une entrée de dérivation : l'identifiant lié au
      // HKDF est celui de l'initiateur, que `initiatorKeyAgreement` lit sur son
      // propre gestionnaire de clés. Ce `0` était un mensonge de dérivation tant
      // que le paquet décidait des clés ; il n'en est plus un. Ne pas le
      // « réparer » en y injectant l'identifiant du pair : ce champ arrive par un
      // canal hostile et la signature ne le couvre pas.
      registrationId: 0
    };

    const result = await this.x3dh.initiatorKeyAgreement(
      recipientBundle,
      params.ourIdentityPrivate
    );

    // La clé éphémère PUBLIQUE fait partie du résultat : le répondeur en a besoin
    // pour calculer DH2/DH3/DH4. La rendre au seul `rootKey`, comme avant, donnait
    // à l'appelant un secret que son pair ne pouvait par construction jamais
    // retrouver.
    return {
      rootKey: result.rootKey,
      ourEphemeralPublic: result.ephemeralKeyPair.publicKey,
      ourRegistrationId: this.keyManager.getRegistrationId()
    };
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
