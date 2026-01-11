/**
 * Types pour le stockage des clés Signal Protocol en base de données
 * Alignés avec les modèles Prisma: SignalPreKeyBundle, ConversationPublicKey
 *
 * Ces types représentent la persistance des clés Signal Protocol,
 * distincts des types de protocole dans encryption/signal/.
 */

// =====================================================
// SIGNAL PRE-KEY BUNDLE (Database Model)
// =====================================================

/**
 * Bundle de pré-clés Signal Protocol stocké en base de données
 * Aligned with schema.prisma SignalPreKeyBundle
 *
 * Ce modèle stocke toutes les clés nécessaires pour établir
 * une session E2EE avec un utilisateur.
 */
export interface SignalPreKeyBundle {
  readonly id: string;
  readonly userId: string;

  /** Clé d'identité (partie publique, base64 encodé, 32 bytes) */
  readonly identityKey: string;

  /**
   * Clé d'identité (partie privée, chiffrée + base64 encodé)
   * Chiffrée avec la clé maître du serveur (AES-256-GCM)
   */
  readonly identityKeyPrivate?: string;

  /** Registration ID (nombre aléatoire de 14 bits, unique par appareil) */
  readonly registrationId: number;

  /** Device ID (pour le support multi-appareils) */
  readonly deviceId: number;

  /** One-time pre-key (consommée après première utilisation) */
  readonly preKeyId?: number;
  readonly preKeyPublic?: string; // Base64 encodé

  /** Signed pre-key (rotation périodique, typiquement hebdomadaire) */
  readonly signedPreKeyId: number;
  readonly signedPreKeyPublic: string; // Base64 encodé
  readonly signedPreKeySignature: string; // Base64 encodé

  /** Signed pre-key private (chiffrée + base64 encodé) */
  readonly signedPreKeyPrivate?: string;

  /** Kyber post-quantum pre-key (future-proofing) */
  readonly kyberPreKeyId?: number;
  readonly kyberPreKeyPublic?: string; // Base64 encodé
  readonly kyberPreKeySignature?: string; // Base64 encodé

  /**
   * Pool de pré-clés one-time (JSON array)
   * Chaque entrée: { id: number, publicKey: string, privateKey: string (encrypted), createdAt: string }
   */
  readonly preKeyPool?: string;

  /** Si ce bundle est actif */
  readonly isActive: boolean;

  /** Timestamps */
  readonly createdAt: Date;
  readonly lastRotatedAt: Date;
}

/**
 * Entrée dans le pool de pré-clés
 */
export interface PreKeyPoolEntry {
  readonly id: number;
  readonly publicKey: string; // Base64 encodé
  readonly privateKey: string; // Chiffré + base64 encodé
  readonly createdAt: string; // ISO 8601
}

/**
 * DTO pour créer un bundle de pré-clés
 */
export interface CreateSignalPreKeyBundleDTO {
  readonly userId: string;
  readonly identityKey: string;
  readonly identityKeyPrivate?: string;
  readonly registrationId: number;
  readonly deviceId?: number;
  readonly signedPreKeyId: number;
  readonly signedPreKeyPublic: string;
  readonly signedPreKeySignature: string;
  readonly signedPreKeyPrivate?: string;
  readonly preKeyId?: number;
  readonly preKeyPublic?: string;
  readonly preKeyPool?: string;
}

/**
 * DTO pour mettre à jour un bundle (rotation de clés)
 */
export interface UpdateSignalPreKeyBundleDTO {
  readonly signedPreKeyId?: number;
  readonly signedPreKeyPublic?: string;
  readonly signedPreKeySignature?: string;
  readonly signedPreKeyPrivate?: string;
  readonly preKeyId?: number;
  readonly preKeyPublic?: string;
  readonly preKeyPool?: string;
  readonly kyberPreKeyId?: number;
  readonly kyberPreKeyPublic?: string;
  readonly kyberPreKeySignature?: string;
  readonly isActive?: boolean;
}

/**
 * Bundle public pour l'échange de clés (envoyé aux autres utilisateurs)
 */
export interface PublicSignalPreKeyBundle {
  readonly userId: string;
  readonly identityKey: string;
  readonly registrationId: number;
  readonly deviceId: number;
  readonly signedPreKeyId: number;
  readonly signedPreKeyPublic: string;
  readonly signedPreKeySignature: string;
  readonly preKeyId?: number;
  readonly preKeyPublic?: string;
  readonly kyberPreKeyId?: number;
  readonly kyberPreKeyPublic?: string;
  readonly kyberPreKeySignature?: string;
}

// =====================================================
// CONVERSATION PUBLIC KEY
// =====================================================

/**
 * Type de clé publique de conversation
 */
export type ConversationKeyType = 'identity' | 'preKey' | 'signedPreKey';

/**
 * Clé publique par utilisateur/conversation
 * Aligned with schema.prisma ConversationPublicKey
 *
 * Stocke les clés publiques pour chaque participant d'une conversation E2EE.
 */
export interface ConversationPublicKey {
  readonly id: string;

  /** Utilisateur propriétaire de cette clé */
  readonly userId: string;

  /** Conversation concernée */
  readonly conversationId: string;

  /** Type de clé (identity, preKey, signedPreKey) */
  readonly keyType: ConversationKeyType;

  /** La clé publique (base64 encodé) */
  readonly publicKey: string;

  /** Identifiant de clé (pour preKey et signedPreKey) */
  readonly keyId?: number;

  /** Signature (pour les signed pre-keys) */
  readonly signature?: string;

  /** Timestamps */
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * DTO pour créer une clé publique de conversation
 */
export interface CreateConversationPublicKeyDTO {
  readonly userId: string;
  readonly conversationId: string;
  readonly keyType: ConversationKeyType;
  readonly publicKey: string;
  readonly keyId?: number;
  readonly signature?: string;
}

/**
 * DTO pour mettre à jour une clé publique
 */
export interface UpdateConversationPublicKeyDTO {
  readonly publicKey?: string;
  readonly keyId?: number;
  readonly signature?: string;
}

/**
 * Collection de clés pour un participant de conversation
 */
export interface ConversationParticipantKeys {
  readonly userId: string;
  readonly conversationId: string;
  readonly identityKey?: ConversationPublicKey;
  readonly signedPreKey?: ConversationPublicKey;
  readonly preKey?: ConversationPublicKey;
}

/**
 * Toutes les clés d'une conversation (tous les participants)
 */
export interface ConversationKeysCollection {
  readonly conversationId: string;
  readonly participants: readonly ConversationParticipantKeys[];
}

// =====================================================
// TYPE GUARDS & UTILITIES
// =====================================================

/**
 * Vérifie si un bundle de pré-clés est valide pour établir une session
 */
export function isValidPreKeyBundle(bundle: SignalPreKeyBundle): boolean {
  return !!(
    bundle.identityKey &&
    bundle.signedPreKeyPublic &&
    bundle.signedPreKeySignature &&
    bundle.registrationId > 0 &&
    bundle.isActive
  );
}

/**
 * Vérifie si un bundle a besoin de rotation (plus de 7 jours)
 */
export function needsKeyRotation(bundle: SignalPreKeyBundle, daysThreshold: number = 7): boolean {
  const daysSinceRotation = (Date.now() - bundle.lastRotatedAt.getTime()) / (1000 * 60 * 60 * 24);
  return daysSinceRotation >= daysThreshold;
}

/**
 * Convertit un SignalPreKeyBundle en PublicSignalPreKeyBundle (pour l'envoi)
 */
export function toPublicBundle(bundle: SignalPreKeyBundle): PublicSignalPreKeyBundle {
  return {
    userId: bundle.userId,
    identityKey: bundle.identityKey,
    registrationId: bundle.registrationId,
    deviceId: bundle.deviceId,
    signedPreKeyId: bundle.signedPreKeyId,
    signedPreKeyPublic: bundle.signedPreKeyPublic,
    signedPreKeySignature: bundle.signedPreKeySignature,
    preKeyId: bundle.preKeyId,
    preKeyPublic: bundle.preKeyPublic,
    kyberPreKeyId: bundle.kyberPreKeyId,
    kyberPreKeyPublic: bundle.kyberPreKeyPublic,
    kyberPreKeySignature: bundle.kyberPreKeySignature,
  };
}
