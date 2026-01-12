/**
 * Types pour les préférences utilisateur des conversations
 * Système personnel - chaque utilisateur a ses propres préférences
 */

/**
 * Préférences utilisateur pour une conversation spécifique
 * Toutes les personnalisations sont spécifiques à l'utilisateur
 */
export interface UserConversationPreferences {
  readonly id: string;
  readonly userId: string;
  readonly conversationId: string;

  // Organisation
  readonly isPinned: boolean;              // Épinglé en haut de la liste
  readonly categoryId?: string;            // Catégorie personnelle
  readonly orderInCategory?: number;       // Ordre dans la catégorie (0 = premier)

  // Notifications
  readonly isMuted: boolean;               // Notifications désactivées
  readonly isArchived: boolean;            // Archivé (caché de la liste principale)

  // Personnalisation
  readonly tags: readonly string[];        // Tags personnels
  readonly customName?: string;            // Nom personnalisé de la conversation
  readonly reaction?: string;              // Réaction/emoji sur la conversation

  // Métadonnées
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Catégorie personnelle d'un utilisateur pour organiser ses conversations
 */
export interface UserConversationCategory {
  readonly id: string;
  readonly userId: string;
  readonly name: string;                   // Nom de la catégorie
  readonly color?: string;                 // Couleur hex (#FF5733)
  readonly icon?: string;                  // Emoji ou icône
  readonly order: number;                  // Ordre d'affichage (0 = premier)
  readonly isExpanded: boolean;            // État de l'accordéon (ouvert/fermé)
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Données pour créer ou mettre à jour des préférences
 */
export interface CreateUserConversationPreferencesRequest {
  readonly conversationId: string;
  readonly isPinned?: boolean;
  readonly categoryId?: string | null;
  readonly orderInCategory?: number;
  readonly isMuted?: boolean;
  readonly isArchived?: boolean;
  readonly tags?: string[];
  readonly customName?: string | null;
  readonly reaction?: string | null;
}

export interface UpdateUserConversationPreferencesRequest {
  readonly isPinned?: boolean;
  readonly categoryId?: string | null;
  readonly orderInCategory?: number;
  readonly isMuted?: boolean;
  readonly isArchived?: boolean;
  readonly tags?: string[];
  readonly customName?: string | null;
  readonly reaction?: string | null;
}

/**
 * Données pour créer ou mettre à jour une catégorie
 */
export interface CreateUserConversationCategoryRequest {
  readonly name: string;
  readonly color?: string;
  readonly icon?: string;
  readonly order?: number;
}

export interface UpdateUserConversationCategoryRequest {
  readonly name?: string;
  readonly color?: string;
  readonly icon?: string;
  readonly order?: number;
  readonly isExpanded?: boolean;
}

/**
 * Réponse du serveur avec les préférences
 */
export interface UserPreferencesResponse {
  readonly success: boolean;
  readonly data: UserConversationPreferences;
}

export interface UserCategoriesResponse {
  readonly success: boolean;
  readonly data: UserConversationCategory[];
}

/**
 * Structure pour organiser les conversations par catégorie dans la liste
 */
export interface ConversationGroup {
  readonly type: 'pinned' | 'uncategorized' | 'category';
  readonly category?: UserConversationCategory;
  readonly conversations: any[]; // Sera typé avec Conversation + UserConversationPreferences
  readonly isExpanded: boolean;
}

// ========== COMMUNITY PREFERENCES ==========

/**
 * Niveau de notification pour une communauté
 */
export type CommunityNotificationLevel = 'all' | 'mentions' | 'none';

/**
 * Préférences utilisateur pour une communauté spécifique
 */
export interface UserCommunityPreferences {
  readonly id: string;
  readonly userId: string;
  readonly communityId: string;

  // Organisation
  readonly isPinned: boolean;              // Épinglé en haut de la liste
  readonly isMuted: boolean;               // Notifications désactivées
  readonly isArchived: boolean;            // Archivé (caché de la liste principale)
  readonly isHidden: boolean;              // Caché sans quitter

  // Notifications
  readonly notificationLevel: CommunityNotificationLevel;

  // Personnalisation
  readonly customName?: string;            // Nom personnalisé de la communauté
  readonly categoryId?: string;            // Catégorie personnelle
  readonly orderInCategory?: number;       // Ordre dans la catégorie

  // Métadonnées
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Données pour créer ou mettre à jour des préférences de communauté
 */
export interface CreateUserCommunityPreferencesRequest {
  readonly communityId: string;
  readonly isPinned?: boolean;
  readonly isMuted?: boolean;
  readonly isArchived?: boolean;
  readonly isHidden?: boolean;
  readonly notificationLevel?: CommunityNotificationLevel;
  readonly customName?: string | null;
  readonly categoryId?: string | null;
  readonly orderInCategory?: number;
}

export interface UpdateUserCommunityPreferencesRequest {
  readonly isPinned?: boolean;
  readonly isMuted?: boolean;
  readonly isArchived?: boolean;
  readonly isHidden?: boolean;
  readonly notificationLevel?: CommunityNotificationLevel;
  readonly customName?: string | null;
  readonly categoryId?: string | null;
  readonly orderInCategory?: number;
}

/**
 * Réponse du serveur avec les préférences de communauté
 */
export interface UserCommunityPreferencesResponse {
  readonly success: boolean;
  readonly data: UserCommunityPreferences;
}
