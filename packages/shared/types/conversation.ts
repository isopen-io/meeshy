/**
 * Types unifiés pour les conversations Meeshy
 * Harmonisation Gateway ↔ Frontend
 */

import type { SocketIOUser as User, MessageType } from './socketio-events';
import type { AnonymousParticipant } from './anonymous';
import type { Attachment } from './attachment';

/**
 * Rôle utilisateur global (aligné avec schema.prisma User.role)
 * @see shared/schema.prisma ligne 35
 */
export type UserRole = 'USER' | 'ADMIN' | 'MODO' | 'BIGBOSS' | 'AUDIT' | 'ANALYST' | 
  // Aliases pour rétrocompatibilité
  'MODERATOR' | 'CREATOR' | 'MEMBER';

/**
 * Langue parlée avec statistiques
 */
export interface LanguageUsageStats {
  readonly language: string;
  readonly messageCount: number;
  readonly percentage: number;
}

/**
 * Paire de langues pour traduction
 */
export interface LanguagePair {
  readonly from: string;
  readonly to: string;
  readonly count: number;
}

/**
 * Statistiques de traduction
 */
export interface TranslationStatsData {
  readonly totalTranslations: number;
  readonly cacheHitRate: number;             // % traductions depuis cache
  readonly averageTranslationTime: number;   // En ms
  readonly topLanguagePairs: readonly LanguagePair[];
}

/**
 * Statistiques d'une conversation
 */
export interface ConversationStats {
  readonly totalMessages: number;
  readonly totalParticipants: number;
  readonly activeParticipants: number;          // Participants actifs dernières 24h
  readonly messagesLast24h: number;
  readonly messagesLast7days: number;
  readonly averageResponseTime: number;         // En minutes
  readonly topLanguages: readonly LanguageUsageStats[];
  readonly translationStats: TranslationStatsData;
  readonly lastActivity: Date;
  readonly createdAt: Date;
}

/**
 * Types d'identifiants supportés pour une conversation
 * - id: ObjectId MongoDB (TOUJOURS pour API/WebSocket)
 * - identifier: Human-readable (OPTIONNEL pour URLs)
 */
export interface ConversationIdentifiers {
  readonly id: string;           // ObjectId MongoDB - TOUJOURS pour API/WebSocket
  readonly identifier?: string;  // Human-readable - OPTIONNEL pour URLs
}

// ===== MESSAGE TYPES CONSOLIDATED =====

/**
 * Modèle de traduction
 */
export type TranslationModel = 'basic' | 'medium' | 'premium';

/**
 * Type de base pour toutes les traductions
 */
export interface MessageTranslation {
  readonly id: string;
  readonly messageId: string;
  readonly sourceLanguage: string;
  readonly targetLanguage: string;
  readonly translatedContent: string;
  readonly translationModel: TranslationModel;
  readonly cacheKey: string;
  readonly confidenceScore?: number;
  readonly createdAt: Date;
  readonly cached: boolean;
}

/**
 * Informations d'un expéditeur anonyme
 */
export interface AnonymousSenderInfo {
  readonly id: string;
  readonly username: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly language: string;
  readonly isMeeshyer: boolean;
}

/**
 * MESSAGE - Type principal pour toutes les communications
 * Utilisé par :
 * - Gateway (API, WebSocket, Socket.IO)
 * - Frontend (affichage, état)
 * - Translator (traitement)
 */
export interface Message {
  // ===== IDENTIFIANTS =====
  readonly id: string;
  readonly conversationId: string;
  readonly senderId?: string;           // ID utilisateur authentifié
  readonly anonymousSenderId?: string;  // ID utilisateur anonyme

  // ===== CONTENU =====
  readonly content: string;
  readonly originalLanguage: string;
  readonly messageType: MessageType;

  // ===== ÉTAT DU MESSAGE =====
  readonly isEdited: boolean;
  readonly editedAt?: Date;
  readonly isDeleted: boolean;
  readonly deletedAt?: Date;

  // ===== RÉPONSE =====
  readonly replyToId?: string;
  readonly replyTo?: Message;           // Message de réponse (récursif)

  // ===== MÉTADONNÉES =====
  readonly createdAt: Date;
  readonly updatedAt?: Date;

  // ===== EXPÉDITEUR =====
  readonly sender?: User | AnonymousParticipant;

  // ===== TRADUCTIONS =====
  readonly translations: readonly MessageTranslation[];

  // ===== ATTACHMENTS =====
  readonly attachments?: readonly Attachment[];

  // ===== MENTIONS =====
  // Tableau de usernames validés (pas de JOIN) - scalable avec millions d'utilisateurs
  readonly validatedMentions?: readonly string[];

  // ===== COMPATIBILITÉ =====
  readonly timestamp: Date;             // Alias pour createdAt (requis pour compatibilité)

  // ===== PARTICIPANT ANONYME =====
  readonly anonymousSender?: AnonymousSenderInfo;
}

/**
 * Statut de traduction UI
 */
export type UITranslationStatus = 'pending' | 'translating' | 'completed' | 'failed';

/**
 * État de traduction dans l'interface utilisateur
 */
export interface UITranslationState {
  readonly language: string;
  readonly content: string;
  readonly status: UITranslationStatus;
  readonly timestamp: Date;
  readonly confidence?: number;
  readonly model?: TranslationModel;
  readonly error?: string;
  readonly fromCache: boolean;
}

/**
 * Statut de lecture pour un message
 */
export interface MessageReadStatus {
  readonly userId: string;
  readonly readAt: Date;
}

/**
 * MESSAGE AVEC TRADUCTIONS - Message enrichi avec traductions et états UI
 * Utilisé par le Frontend pour l'affichage et la gestion des traductions
 */
export interface MessageWithTranslations extends Message {
  // ===== TRADUCTIONS UI =====
  readonly uiTranslations: readonly UITranslationState[];
  readonly translatingLanguages: Set<string>;
  readonly currentDisplayLanguage: string;
  readonly showingOriginal: boolean;
  readonly originalContent: string;

  // ===== ÉTAT DE LECTURE =====
  readonly readStatus?: readonly MessageReadStatus[];

  // ===== MÉTADONNÉES SUPPLÉMENTAIRES =====
  readonly location?: string;

  // ===== PERMISSIONS UI =====
  readonly canEdit: boolean;
  readonly canDelete: boolean;
  readonly canTranslate: boolean;
  readonly canReply: boolean;
}

/**
 * Type de conversation
 */
export type ConversationType = 'direct' | 'group' | 'public' | 'global' | 'broadcast';

/**
 * Statut de conversation
 */
export type ConversationStatus = 'active' | 'archived' | 'deleted';

/**
 * Visibilité de conversation
 */
export type ConversationVisibility = 'public' | 'private' | 'restricted';

/**
 * Type de lien de conversation
 */
export type ConversationLinkType = 'invite' | 'share' | 'embed';

/**
 * Permissions d'un participant
 */
export interface ParticipantPermissions {
  readonly canInvite: boolean;
  readonly canRemove: boolean;
  readonly canEdit: boolean;
  readonly canDelete: boolean;
  readonly canModerate: boolean;
}

/**
 * Participant d'une conversation
 */
export interface ConversationParticipantInfo {
  readonly userId: string;
  readonly role: UserRole;
  readonly joinedAt: Date;
  readonly isActive: boolean;
  readonly permissions?: ParticipantPermissions;
}

/**
 * Paramètres d'une conversation
 */
export interface ConversationSettings {
  readonly allowAnonymous: boolean;
  readonly requireApproval: boolean;
  readonly maxParticipants?: number;
  readonly autoArchive?: boolean;
  readonly translationEnabled: boolean;
  readonly defaultLanguage?: string;
  readonly allowedLanguages?: readonly string[];
}

/**
 * Lien de partage d'une conversation
 */
export interface ConversationLink {
  readonly id: string;
  readonly type: ConversationLinkType;
  readonly url: string;
  readonly expiresAt?: Date;
  readonly maxUses?: number;
  readonly currentUses: number;
  readonly isActive: boolean;
  readonly createdBy: string;
  readonly createdAt: Date;
}

/**
 * Conversation unifiée
 * Contient TOUS les champs utilisés dans Gateway et Frontend pour compatibilité totale
 */
export interface Conversation {
  // ===== IDENTIFIANTS =====
  readonly id: string;
  readonly identifier?: string;

  // ===== MÉTADONNÉES =====
  readonly title?: string;
  readonly description?: string;
  readonly type: ConversationType;
  readonly status: ConversationStatus;
  readonly visibility: ConversationVisibility;
  readonly image?: string;  // URL de l'image de la conversation
  readonly avatar?: string;  // URL de l'avatar alternatif

  // ===== PARTICIPANTS =====
  readonly participants: readonly ConversationParticipantInfo[];

  // ===== MESSAGES =====
  readonly lastMessage?: Message;
  readonly messageCount?: number;
  readonly unreadCount?: number;

  // ===== STATISTIQUES =====
  readonly stats?: ConversationStats;

  // ===== CONFIGURATION =====
  readonly settings?: ConversationSettings;

  // ===== LIENS ET PARTAGE =====
  readonly links?: readonly ConversationLink[];

  // ===== TIMESTAMPS =====
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly lastActivityAt?: Date;

  // ===== CRÉATEUR =====
  readonly createdBy?: string;
  readonly createdByUser?: User;
}

/**
 * Membre d'une conversation (ThreadMember)
 */
export interface ThreadMember {
  readonly id: string;
  readonly conversationId: string;
  readonly userId: string;
  readonly user: User;
  readonly role: UserRole;
  readonly joinedAt: Date;
  readonly isActive: boolean;
  readonly isAnonymous: boolean;
  readonly permissions?: ParticipantPermissions;
}

/**
 * Traduction individuelle dans TranslationData
 */
export interface TranslationItem {
  readonly targetLanguage: string;
  readonly translatedContent: string;
  readonly confidence?: number;
  readonly model?: TranslationModel;
  readonly fromCache: boolean;
}

/**
 * Données de traduction reçues via Socket.IO
 */
export interface TranslationData {
  readonly messageId: string;
  readonly translations: readonly TranslationItem[];
  readonly timestamp: Date;
}

/**
 * Message traduit pour l'affichage
 */
export interface TranslatedMessage extends Message {
  readonly translatedContent?: string;
  readonly targetLanguage?: string;
  readonly translationConfidence?: number;
  readonly translationModel?: TranslationModel;
  readonly isTranslationCached?: boolean;
}

// ===== SHARE LINK TYPES =====

/**
 * Lien de partage de conversation (alias)
 */
export interface ConversationShareLink {
  readonly id: string;
  readonly type: ConversationLinkType;
  readonly url: string;
  readonly expiresAt?: Date;
  readonly maxUses?: number;
  readonly currentUses: number;
  readonly isActive: boolean;
  readonly createdBy: string;
  readonly createdAt: Date;
  // Permissions anonymes
  readonly allowAnonymousMessages?: boolean;
  readonly allowAnonymousFiles?: boolean;
  readonly allowAnonymousImages?: boolean;
  readonly allowViewHistory?: boolean;
  // Exigences pour rejoindre
  readonly requireAccount?: boolean;
  readonly requireNickname?: boolean;
  readonly requireEmail?: boolean;
  readonly requireBirthday?: boolean;
}

// ===== CONVERSATION PARTICIPANT =====

/**
 * Participant de conversation (alias)
 */
export interface ConversationParticipant {
  readonly userId: string;
  readonly role: UserRole;
  readonly joinedAt: Date;
  readonly isActive: boolean;
  readonly permissions?: ParticipantPermissions;
}

// ===== TYPE ALIASES FOR COMPATIBILITY =====
export type BubbleStreamMessage = MessageWithTranslations;