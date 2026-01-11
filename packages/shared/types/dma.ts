/**
 * Types pour l'interopérabilité DMA (Digital Markets Act)
 * Alignés avec les modèles Prisma: DMASession, DMAEnrollment, PreKey
 *
 * Ces types gèrent la communication chiffrée avec des plateformes externes
 * comme WhatsApp et Messenger via Signal Protocol X3DH.
 */

// =====================================================
// DMA SESSION
// =====================================================

/**
 * Type de session DMA
 */
export type DMASessionType = 'signal_protocol_x3dh' | 'mls_group';

/**
 * État de session DMA
 */
export type DMASessionState = 'pending' | 'established' | 'expired' | 'revoked';

/**
 * Session DMA pour la communication avec des plateformes externes
 * Aligned with schema.prisma DMASession
 *
 * Gère l'état du Double Ratchet pour les sessions avec WhatsApp/Messenger.
 */
export interface DMASession {
  readonly id: string;

  /** Identifiant de la partie distante (WhatsApp internal ID, Messenger ID, etc.) */
  readonly remotePartyId: string;

  /** Propriétaire de la session (utilisateur Meeshy) */
  readonly userId: string;

  /** Root key de l'accord de clés X3DH (base64 encodé, 32 bytes) */
  readonly rootKey: string;

  /** Clé de chaîne actuelle pour l'envoi (Double Ratchet, base64 encodé, 32 bytes) */
  readonly chainKeySend: string;

  /** Clé de chaîne actuelle pour la réception (Double Ratchet, base64 encodé, 32 bytes) */
  readonly chainKeyReceive: string;

  /** Clé publique DH ratchet (base64 encodé) */
  readonly dhRatchetPublicKey?: string;

  /** Clé privée DH ratchet (chiffrée, base64 encodé) */
  readonly dhRatchetPrivateKey?: string;

  /** Dernière clé DH ratchet de la partie distante (base64 encodé) */
  readonly dhRatchetRemoteKey?: string;

  /** Type de session */
  readonly sessionType: DMASessionType;

  /** État de la session */
  readonly sessionState: DMASessionState;

  /** Compteurs de messages pour le Double Ratchet */
  readonly messageNumberSend: number;
  readonly messageNumberReceive: number;
  readonly previousChainLength: number;

  /** Epoch pour les sessions de groupe MLS */
  readonly epoch: number;

  /** Timestamps */
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly lastUsedAt: Date;
  readonly expiresAt?: Date;
}

/**
 * DTO pour créer une session DMA
 */
export interface CreateDMASessionDTO {
  readonly remotePartyId: string;
  readonly userId: string;
  readonly rootKey: string;
  readonly chainKeySend: string;
  readonly chainKeyReceive: string;
  readonly dhRatchetPublicKey?: string;
  readonly dhRatchetPrivateKey?: string;
  readonly sessionType?: DMASessionType;
  readonly expiresAt?: Date;
}

/**
 * DTO pour mettre à jour une session DMA (ratchet)
 */
export interface UpdateDMASessionDTO {
  readonly rootKey?: string;
  readonly chainKeySend?: string;
  readonly chainKeyReceive?: string;
  readonly dhRatchetPublicKey?: string;
  readonly dhRatchetPrivateKey?: string;
  readonly dhRatchetRemoteKey?: string;
  readonly sessionState?: DMASessionState;
  readonly messageNumberSend?: number;
  readonly messageNumberReceive?: number;
  readonly previousChainLength?: number;
  readonly epoch?: number;
  readonly lastUsedAt?: Date;
}

// =====================================================
// DMA ENROLLMENT
// =====================================================

/**
 * Plateforme DMA supportée
 */
export type DMAPlatform = 'whatsapp' | 'messenger' | 'imessage';

/**
 * Statut d'enrollment DMA
 */
export type DMAEnrollmentStatus = 'active' | 'revoked' | 'expired';

/**
 * Enrollment d'un utilisateur externe pour DMA
 * Aligned with schema.prisma DMAEnrollment
 *
 * Stocke les informations d'identité Signal Protocol pour les utilisateurs externes.
 */
export interface DMAEnrollment {
  readonly id: string;

  /** Identifiant de plateforme externe (WhatsApp internal ID, Messenger ID) */
  readonly whatsappInternalId: string;

  /** Type de plateforme */
  readonly platform: DMAPlatform;

  /** Clé d'identité (partie publique, base64 encodé, 32 bytes) */
  readonly identityKey: string;

  /** Signed pre-key (base64 encodé) */
  readonly signedPreKey: string;

  /** Signature de la signed pre-key (base64 encodé) */
  readonly signedPreKeySignature: string;

  /** ID de la signed pre-key */
  readonly signedPreKeyId: number;

  /** Registration ID pour cet enrollment */
  readonly registrationId: number;

  /** Statut de l'enrollment */
  readonly status: DMAEnrollmentStatus;

  /** Timestamps */
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly lastVerifiedAt: Date;

  /** One-time pre-keys associées */
  readonly preKeys?: readonly DMAPreKey[];
}

/**
 * DTO pour créer un enrollment DMA
 */
export interface CreateDMAEnrollmentDTO {
  readonly whatsappInternalId: string;
  readonly platform?: DMAPlatform;
  readonly identityKey: string;
  readonly signedPreKey: string;
  readonly signedPreKeySignature: string;
  readonly signedPreKeyId: number;
  readonly registrationId?: number;
}

/**
 * DTO pour mettre à jour un enrollment DMA
 */
export interface UpdateDMAEnrollmentDTO {
  readonly signedPreKey?: string;
  readonly signedPreKeySignature?: string;
  readonly signedPreKeyId?: number;
  readonly status?: DMAEnrollmentStatus;
  readonly lastVerifiedAt?: Date;
}

// =====================================================
// DMA PRE-KEY
// =====================================================

/**
 * One-time pre-key pour l'accord de clés X3DH
 * Aligned with schema.prisma PreKey
 *
 * Chaque pre-key ne peut être utilisée qu'une seule fois,
 * puis est marquée comme consommée.
 */
export interface DMAPreKey {
  readonly id: string;

  /** ID de la pre-key (unique dans l'enrollment) */
  readonly preKeyId: number;

  /** Données de la clé publique (base64 encodé) */
  readonly keyData: string;

  /** Si cette clé a été utilisée */
  readonly isUsed: boolean;

  /** Quand la clé a été utilisée */
  readonly usedAt?: Date;

  /** Qui a utilisé cette clé (ID utilisateur Meeshy) */
  readonly usedBy?: string;

  /** Timestamps */
  readonly createdAt: Date;
  readonly expiresAt?: Date;

  /** ID de l'enrollment associé */
  readonly signalEnrollmentId: string;
}

/**
 * DTO pour créer une pre-key DMA
 */
export interface CreateDMAPreKeyDTO {
  readonly signalEnrollmentId: string;
  readonly preKeyId: number;
  readonly keyData: string;
  readonly expiresAt?: Date;
}

/**
 * DTO pour marquer une pre-key comme utilisée
 */
export interface UseDMAPreKeyDTO {
  readonly usedBy: string;
}

/**
 * Lot de pre-keys à uploader
 */
export interface DMAPreKeyBatch {
  readonly enrollmentId: string;
  readonly preKeys: readonly CreateDMAPreKeyDTO[];
}

// =====================================================
// DMA KEY EXCHANGE TYPES
// =====================================================

/**
 * Bundle de clés pour établir une session X3DH avec un utilisateur externe
 */
export interface DMAKeyBundle {
  readonly identityKey: string;
  readonly signedPreKey: string;
  readonly signedPreKeySignature: string;
  readonly signedPreKeyId: number;
  readonly registrationId: number;
  readonly preKey?: {
    readonly id: number;
    readonly publicKey: string;
  };
}

/**
 * Message X3DH initial pour établir une session
 */
export interface DMAX3DHInitMessage {
  readonly identityKey: string;
  readonly ephemeralKey: string;
  readonly preKeyId?: number;
  readonly registrationId: number;
  readonly ciphertext: string;
}

/**
 * État de connexion DMA avec une plateforme
 */
export interface DMAConnectionStatus {
  readonly platform: DMAPlatform;
  readonly isConnected: boolean;
  readonly sessionCount: number;
  readonly lastActivityAt?: Date;
  readonly enrolledUsers: number;
}

// =====================================================
// TYPE GUARDS & UTILITIES
// =====================================================

/**
 * Vérifie si une session DMA est active et utilisable
 */
export function isDMASessionActive(session: DMASession): boolean {
  if (session.sessionState !== 'established') {
    return false;
  }
  if (session.expiresAt && new Date() > session.expiresAt) {
    return false;
  }
  return true;
}

/**
 * Vérifie si un enrollment DMA est actif
 */
export function isDMAEnrollmentActive(enrollment: DMAEnrollment): boolean {
  return enrollment.status === 'active';
}

/**
 * Vérifie si une pre-key DMA est disponible pour utilisation
 */
export function isDMAPreKeyAvailable(preKey: DMAPreKey): boolean {
  if (preKey.isUsed) {
    return false;
  }
  if (preKey.expiresAt && new Date() > preKey.expiresAt) {
    return false;
  }
  return true;
}

/**
 * Vérifie si un enrollment a besoin de nouvelles pre-keys
 */
export function needsMorePreKeys(
  enrollment: DMAEnrollment,
  minPreKeys: number = 10
): boolean {
  if (!enrollment.preKeys) {
    return true;
  }
  const availableKeys = enrollment.preKeys.filter(isDMAPreKeyAvailable);
  return availableKeys.length < minPreKeys;
}

/**
 * Obtient la prochaine pre-key disponible pour un enrollment
 */
export function getNextAvailablePreKey(
  enrollment: DMAEnrollment
): DMAPreKey | null {
  if (!enrollment.preKeys) {
    return null;
  }
  return enrollment.preKeys.find(isDMAPreKeyAvailable) || null;
}
