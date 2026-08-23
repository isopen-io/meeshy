/**
 * Library Adapter Interfaces for DMA Interoperability
 *
 * Defines interfaces for cryptographic library adapters.
 * Allows swapping between custom implementation and @signalapp/libsignal-client.
 */

/**
 * Signal Protocol Adapter Interface
 *
 * Abstracts Signal Protocol operations to allow different implementations:
 * - 'custom': Our native Node.js crypto implementation
 * - 'libsignal': @signalapp/libsignal-client (production-grade)
 */
export interface ISignalProtocolAdapter {
  /**
   * Generate identity key pair (EC-P256 or Curve25519)
   */
  generateIdentityKeyPair(): Promise<{ publicKey: Buffer; privateKey: Buffer }>;

  /**
   * Generate a batch of pre-keys
   */
  generatePreKeyBatch(count: number): Promise<Array<{ id: number; publicKey: Buffer }>>;

  /**
   * Generate a signed pre-key
   */
  generateSignedPreKey(id: number): Promise<{ id: number; publicKey: Buffer; signature: Buffer }>;

  /**
   * Perform X3DH key agreement
   *
   * Le paquet de pré-clés arrive d'un canal hostile : `theirSignedPreKeySignature`
   * est ce qui rattache la pré-clé signée à `theirIdentityPublic`, et donc la
   * seule chose qui fasse de cet accord un accord AUTHENTIFIÉ. Elle est REQUISE —
   * une implémentation qui ne peut pas la fournir ne peut pas authentifier son
   * pair, et doit échouer plutôt que d'accorder des clés à l'aveugle.
   *
   * La clé éphémère est générée par l'implémentation, jamais fournie par
   * l'appelant : la réemployer d'une session à l'autre détruirait la confidentialité
   * persistante que cette clé existe pour porter. Elle est en revanche RENDUE —
   * l'initiateur doit la transmettre au répondeur, sans quoi le pair ne peut
   * dériver aucun secret et la session est morte-née.
   *
   * `ourRegistrationId` est rendu pour la MÊME raison que la clé éphémère : il
   * entre dans l'`info` du HKDF, donc le pair ne peut rien dériver sans lui. Un
   * résultat qui le tait rend un secret que personne d'autre ne retrouvera.
   */
  performX3DH(params: {
    ourIdentityPrivate: Buffer;
    theirIdentityPublic: Buffer;
    theirSignedPreKeyPublic: Buffer;
    theirSignedPreKeySignature: Buffer;
    theirPreKeyPublic?: Buffer;
  }): Promise<{ rootKey: Buffer; ourEphemeralPublic: Buffer; ourRegistrationId: number }>;

  /**
   * Encrypt a message using AES-256-GCM
   */
  encryptMessage(
    sessionKey: Buffer,
    plaintext: Buffer,
    messageNumber: number
  ): Promise<{
    ciphertext: Buffer;
    iv: Buffer;
    authTag: Buffer;
  }>;

  /**
   * Decrypt a message using AES-256-GCM
   */
  decryptMessage(
    sessionKey: Buffer,
    ciphertext: Buffer,
    iv: Buffer,
    authTag: Buffer
  ): Promise<Buffer>;

  /**
   * Derive message key from chain key (Double Ratchet KDF)
   */
  deriveMessageKey(chainKey: Buffer): Promise<{ messageKey: Buffer; nextChainKey: Buffer }>;

  /**
   * Get implementation type
   */
  getImplementation(): 'libsignal' | 'custom';

  /**
   * Get implementation version
   */
  getVersion(): string;
}

/**
 * Encryption Library Adapter Interface
 *
 * For general-purpose encryption operations.
 */
export interface IEncryptionAdapter {
  /**
   * Encrypt data with AES-256-GCM
   */
  encrypt(plaintext: Buffer, key: Buffer): Promise<{
    ciphertext: Buffer;
    iv: Buffer;
    authTag: Buffer;
  }>;

  /**
   * Decrypt data with AES-256-GCM
   */
  decrypt(ciphertext: Buffer, key: Buffer, iv: Buffer, authTag: Buffer): Promise<Buffer>;

  /**
   * Generate random bytes
   */
  randomBytes(length: number): Buffer;

  /**
   * Derive key using HKDF
   */
  deriveKey(
    inputKeyMaterial: Buffer,
    salt: Buffer,
    info: Buffer,
    length: number
  ): Buffer;
}
