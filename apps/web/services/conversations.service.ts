import { apiService } from './api.service';
import { socketIOUserToUser } from '@/utils/user-adapter';
import { UserRoleEnum, MessageType } from '@meeshy/shared/types';
import { generateLinkName } from '@/utils/link-name-generator';
import { authManager } from './auth-manager.service';
import type {
  Conversation,
  Message,
  User,
  UserRole,
  UserPermissions,
  CreateConversationRequest,
  SendMessageRequest,
  PaginationMeta
} from '@meeshy/shared/types';

/**
 * Options de filtrage pour les participants
 */
export interface ParticipantsFilters {
  onlineOnly?: boolean;
  role?: string;
  search?: string;
  limit?: number;
}

export class ConversationsService {
  // OPTIMISATION: Cache amélioré avec TTL plus long
  private conversationsCache: { data: Conversation[], timestamp: number } | null = null;
  private readonly CACHE_DURATION = 120000; // 2 minutes (était 30s)

  // OPTIMISATION: Cache pour les messages par conversation
  private messagesCache: Map<string, { data: Message[], timestamp: number, hasMore: boolean }> = new Map();
  private readonly MESSAGES_CACHE_DURATION = 60000; // 1 minute

  // OPTIMISATION: Cache pour les participants
  private participantsCache: Map<string, { data: User[], timestamp: number }> = new Map();
  private readonly PARTICIPANTS_CACHE_DURATION = 30000; // 30 secondes

  // Gestion des requêtes en cours pour éviter les race conditions
  private pendingRequests: Map<string, AbortController> = new Map();

  /**
   * Convertir un rôle string en UserRoleEnum
   */
  private stringToUserRole(role: string): UserRoleEnum {
    switch (role.toUpperCase()) {
      case 'ADMIN':
        return UserRoleEnum.ADMIN;
      case 'MODERATOR':
        return UserRoleEnum.MODERATOR;
      case 'BIGBOSS':
        return UserRoleEnum.BIGBOSS;
      case 'CREATOR':
        return UserRoleEnum.CREATOR;
      case 'AUDIT':
        return UserRoleEnum.AUDIT;
      case 'ANALYST':
        return UserRoleEnum.ANALYST;
      case 'USER':
        return UserRoleEnum.USER;
      case 'MEMBER':
      default:
        return UserRoleEnum.MEMBER;
    }
  }

  /**
   * Convertir un rôle UserRoleEnum en string pour ConversationParticipant
   */
  private mapUserRoleToString(role: string): 'admin' | 'moderator' | 'member' {
    switch (role.toUpperCase()) {
      case 'ADMIN':
      case 'BIGBOSS':
      case 'CREATOR':
        return 'admin';
      case 'MODERATOR':
      case 'AUDIT':
      case 'ANALYST':
        return 'moderator';
      case 'USER':
      case 'MEMBER':
      default:
        return 'member';
    }
  }

  /**
   * Convertir un type de conversation en format valide
   */
  private mapConversationType(type: string): 'direct' | 'group' | 'anonymous' | 'broadcast' {
    switch (type.toLowerCase()) {
      case 'group':
        return 'group';
      case 'public':
        return 'broadcast'; // Map 'public' vers 'broadcast' pour correspondre aux types TypeScript
      case 'global':
        return 'broadcast'; // Map 'global' vers 'broadcast' pour correspondre aux types TypeScript
      case 'direct':
        return 'direct';
      case 'anonymous':
        return 'anonymous';
      case 'broadcast':
        return 'broadcast';
      default:
        return 'direct';
    }
  }

  /**
   * Convertir un type de conversation en visibility
   */
  private mapConversationVisibility(type: string): 'public' | 'private' | 'restricted' {
    switch (type.toLowerCase()) {
      case 'public':
      case 'global':
        return 'public';
      case 'direct':
      case 'group':
      case 'anonymous':
      default:
        return 'private';
    }
  }

  /**
   * Vérifie si le cache des conversations est valide
   */
  private isCacheValid(): boolean {
    if (!this.conversationsCache) return false;
    return (Date.now() - this.conversationsCache.timestamp) < this.CACHE_DURATION;
  }

  /**
   * Met en cache les conversations
   */
  private setCacheConversations(conversations: Conversation[]): void {
    this.conversationsCache = {
      data: conversations,
      timestamp: Date.now()
    };
  }

  /**
   * Transforme les données d'un message du backend vers le format frontend
   */
  private transformMessageData(backendMessage: unknown): Message {
    const msg = backendMessage as Record<string, unknown>;
    const sender = msg.sender as Record<string, unknown> | undefined;
    const anonymousSender = msg.anonymousSender as Record<string, unknown> | undefined;
    
    // Définir les permissions par défaut une seule fois
    const defaultPermissions = {
      canAccessAdmin: false,
      canManageUsers: false,
      canManageGroups: false,
      canManageConversations: false,
      canViewAnalytics: false,
      canModerateContent: false,
      canViewAuditLogs: false,
      canManageNotifications: false,
      canManageTranslations: false,
    };
    
    // Définir le sender par défaut UNE SEULE FOIS (pour les cas d'échec)
    const defaultSender: User = {
      id: String(msg.senderId || msg.anonymousSenderId) || 'unknown',
      username: 'Unknown User',
      firstName: '',
      lastName: '',
      displayName: 'Utilisateur Inconnu',
      email: 'unknown@example.com',
      phoneNumber: '',
      role: 'USER',
      permissions: defaultPermissions,
      systemLanguage: 'fr',
      regionalLanguage: 'fr',
      customDestinationLanguage: undefined,
      autoTranslateEnabled: false,
      translateToSystemLanguage: false,
      translateToRegionalLanguage: false,
      useCustomDestination: false,
      isOnline: false,
      avatar: undefined,
      createdAt: new Date(),
      lastActiveAt: new Date(),
      isActive: true,
      updatedAt: new Date(),
    };
    
    // Construire l'objet sender en gérant les utilisateurs anonymes
    let finalSender: User;
    
    if (sender) {
      // Utilisateur authentifié
      finalSender = {
        id: String(sender.id) || defaultSender.id,
        username: String(sender.username) || defaultSender.username,
        firstName: String(sender.firstName || ''),
        lastName: String(sender.lastName || ''),
        displayName: String(sender.displayName || sender.username || defaultSender.displayName),
        email: String(sender.email || 'unknown@example.com'),
        phoneNumber: String(sender.phoneNumber || ''),
        role: (sender.role as any) || 'USER',
        permissions: defaultPermissions,
        systemLanguage: String(sender.systemLanguage || 'fr'),
        regionalLanguage: String(sender.regionalLanguage || 'fr'),
        customDestinationLanguage: undefined,
        autoTranslateEnabled: Boolean(sender.autoTranslateEnabled ?? false),
        translateToSystemLanguage: Boolean(sender.translateToSystemLanguage ?? false),
        translateToRegionalLanguage: Boolean(sender.translateToRegionalLanguage ?? false),
        useCustomDestination: Boolean(sender.useCustomDestination ?? false),
        isOnline: Boolean(sender.isOnline ?? false),
        avatar: sender.avatar as string | undefined,
        createdAt: new Date(sender.createdAt as any || Date.now()),
        lastActiveAt: new Date(sender.lastActiveAt as any || Date.now()),
        isActive: Boolean(sender.isActive ?? true),
        updatedAt: new Date(sender.updatedAt as any || Date.now()),
      };
    } else if (anonymousSender) {
      // Utilisateur anonyme - construire un objet User à partir de anonymousSender
      const displayName = `${String(anonymousSender.firstName || '')} ${String(anonymousSender.lastName || '')}`.trim() || 
                         String(anonymousSender.username) || 
                         'Utilisateur anonyme';
      finalSender = {
        id: String(anonymousSender.id) || defaultSender.id,
        username: String(anonymousSender.username) || 'Anonymous',
        firstName: String(anonymousSender.firstName || ''),
        lastName: String(anonymousSender.lastName || ''),
        displayName: displayName,
        email: '',
        phoneNumber: '',
        role: 'USER',
        permissions: defaultPermissions,
        systemLanguage: String(anonymousSender.language || 'fr'),
        regionalLanguage: String(anonymousSender.language || 'fr'),
        customDestinationLanguage: undefined,
        autoTranslateEnabled: false,
        translateToSystemLanguage: false,
        translateToRegionalLanguage: false,
        useCustomDestination: false,
        isOnline: false,
        avatar: undefined,
        createdAt: new Date(),
        lastActiveAt: new Date(),
        isActive: true,
        updatedAt: new Date(),
      };
    } else {
      // Cas d'échec : utiliser le sender par défaut
      finalSender = defaultSender;
    }

    // Transformer les traductions si elles existent
    const translations = Array.isArray(msg.translations) 
      ? msg.translations.map((t: any) => ({
          id: String(t.id || ''),
          messageId: String(msg.id),
          sourceLanguage: String(t.sourceLanguage || msg.originalLanguage || 'fr'),
          targetLanguage: String(t.targetLanguage || ''),
          translatedContent: String(t.translatedContent || ''),
          translationModel: (t.translationModel || 'basic') as 'basic' | 'medium' | 'premium',
          cacheKey: String(t.cacheKey || ''),
          confidenceScore: Number(t.confidenceScore) || undefined,
          createdAt: new Date(String(t.createdAt || new Date())),
          cached: Boolean(t.cached)
        }))
      : [];

    const createdAt = new Date(String(msg.createdAt));
    
    // Transformer les attachments si présents
    const attachments = Array.isArray(msg.attachments)
      ? msg.attachments.map((att: any) => ({
          id: String(att.id || ''),
          messageId: String(msg.id),
          fileName: String(att.fileName || ''),
          originalName: String(att.originalName || att.fileName || ''),
          fileUrl: String(att.fileUrl || ''),
          mimeType: String(att.mimeType || ''),
          fileSize: Number(att.fileSize) || 0,
          thumbnailUrl: att.thumbnailUrl ? String(att.thumbnailUrl) : undefined,
          width: att.width ? Number(att.width) : undefined,
          height: att.height ? Number(att.height) : undefined,
          duration: att.duration ? Number(att.duration) : undefined,
          // Métadonnées audio
          bitrate: att.bitrate ? Number(att.bitrate) : undefined,
          sampleRate: att.sampleRate ? Number(att.sampleRate) : undefined,
          codec: att.codec ? String(att.codec) : undefined,
          channels: att.channels ? Number(att.channels) : undefined,
          // Métadonnées vidéo
          fps: att.fps ? Number(att.fps) : undefined,
          videoCodec: att.videoCodec ? String(att.videoCodec) : undefined,
          // Métadonnées documents
          pageCount: att.pageCount ? Number(att.pageCount) : undefined,
          // Métadonnées code/texte
          lineCount: att.lineCount ? Number(att.lineCount) : undefined,
          // Metadata JSON (audioEffectsTimeline, etc.) - CRITIQUE pour effets audio
          metadata: att.metadata || undefined,
          // Général
          uploadedBy: String(att.uploadedBy || msg.senderId || msg.anonymousSenderId || ''),
          isAnonymous: Boolean(att.isAnonymous),
          createdAt: String(att.createdAt || new Date().toISOString()),
        }))
      : [];
    
    // Transformer replyTo si présent (mais sans récursion infinie - une seule profondeur)
    let replyTo: any = undefined;
    if (msg.replyTo) {
      const replyToMsg = msg.replyTo as Record<string, unknown>;
      const replyToSender = replyToMsg.sender as Record<string, unknown> | undefined;
      const replyToAnonymousSender = replyToMsg.anonymousSender as Record<string, unknown> | undefined;
      
      // Construire le sender pour replyTo (utiliser les mêmes règles)
      let replyToFinalSender;
      if (replyToSender) {
        replyToFinalSender = {
          id: String(replyToSender.id || 'unknown'),
          username: String(replyToSender.username || 'Unknown'),
          displayName: String(replyToSender.displayName || replyToSender.username || 'Unknown'),
          firstName: String(replyToSender.firstName || ''),
          lastName: String(replyToSender.lastName || ''),
        };
      } else if (replyToAnonymousSender) {
        const displayName = `${String(replyToAnonymousSender.firstName || '')} ${String(replyToAnonymousSender.lastName || '')}`.trim() || 
                           String(replyToAnonymousSender.username) || 
                           'Utilisateur anonyme';
        replyToFinalSender = {
          id: String(replyToAnonymousSender.id || 'unknown'),
          username: String(replyToAnonymousSender.username || 'Anonymous'),
          displayName: displayName,
          firstName: String(replyToAnonymousSender.firstName || ''),
          lastName: String(replyToAnonymousSender.lastName || ''),
        };
      } else {
        replyToFinalSender = {
          id: String(replyToMsg.senderId || replyToMsg.anonymousSenderId || 'unknown'),
          username: 'Unknown',
          displayName: 'Utilisateur Inconnu',
          firstName: '',
          lastName: '',
        };
      }
      
      replyTo = {
        id: String(replyToMsg.id),
        content: String(replyToMsg.content),
        senderId: String(replyToMsg.senderId || replyToMsg.anonymousSenderId || ''),
        conversationId: String(replyToMsg.conversationId),
        originalLanguage: String(replyToMsg.originalLanguage || 'fr'),
        messageType: String(replyToMsg.messageType || 'text') as MessageType,
        createdAt: new Date(String(replyToMsg.createdAt)),
        timestamp: new Date(String(replyToMsg.createdAt)),
        sender: replyToFinalSender,
        translations: [],
        isEdited: false,
        isDeleted: false,
        updatedAt: new Date(String(replyToMsg.updatedAt || replyToMsg.createdAt)),
      };
    }
    
    return {
      id: String(msg.id),
      content: String(msg.content),
      senderId: String(msg.senderId || msg.anonymousSenderId || ''),
      conversationId: String(msg.conversationId),
      originalLanguage: msg.originalLanguage ? String(msg.originalLanguage) : 'fr',
      messageType: (String(msg.messageType) || 'text') as MessageType,
      isEdited: Boolean(msg.isEdited),
      isDeleted: Boolean(msg.isDeleted),
      createdAt,
      updatedAt: new Date(String(msg.updatedAt)),
      sender: finalSender,
      translations,
      replyTo,
      attachments: attachments.length > 0 ? attachments : undefined,
      timestamp: createdAt // Alias pour compatibilité
    };
  }

  /**
   * Transforme les données de conversation du backend vers le format frontend
   */
  private transformConversationData(backendConversation: unknown): any {
    const conv = backendConversation as Record<string, unknown>;
    
    return {
      id: String(conv.id),
      type: this.mapConversationType(String(conv.type) || 'direct'),
      visibility: this.mapConversationVisibility(String(conv.type) || 'direct'),
      status: 'active' as const,
      title: conv.title as string,
      description: conv.description as string,
      image: conv.image as string,
      avatar: conv.avatar as string,
      communityId: conv.communityId as string,
      isActive: Boolean(conv.isActive),
      isArchived: Boolean(conv.isArchived),
      isGroup: Boolean(conv.isGroup) || String(conv.type) === 'group',
      isPrivate: Boolean(conv.isPrivate),
      lastMessageAt: conv.lastMessageAt ? new Date(String(conv.lastMessageAt)) : new Date(String(conv.updatedAt)),
      createdAt: new Date(String(conv.createdAt)),
      updatedAt: new Date(String(conv.updatedAt)),
      participants: Array.isArray(conv.members) ? conv.members.map((p: unknown) => {
        const participant = p as Record<string, unknown>;
        const user = participant.user as Record<string, unknown>;
        
        return {
          id: String(participant.id),
          conversationId: String(participant.conversationId),
          userId: String(participant.userId),
          role: this.mapUserRoleToString(String(participant.role || 'MEMBER')),
          canSendMessage: Boolean(participant.canSendMessage ?? true),
          canSendFiles: Boolean(participant.canSendFiles ?? true),
          canSendImages: Boolean(participant.canSendImages ?? true),
          canSendVideos: Boolean(participant.canSendVideos ?? true),
          canSendAudios: Boolean(participant.canSendAudios ?? true),
          canSendLocations: Boolean(participant.canSendLocations ?? true),
          canSendLinks: Boolean(participant.canSendLinks ?? true),
          joinedAt: new Date(String(participant.joinedAt)),
          leftAt: participant.leftAt ? new Date(String(participant.leftAt)) : undefined,
          isActive: Boolean(participant.isActive ?? true),
          user: socketIOUserToUser(user as any)
        };
      }) : [],
      lastMessage: conv.lastMessage ? this.transformMessageData(conv.lastMessage) : undefined,
      unreadCount: Number(conv.unreadCount) || 0
    };
  }

  /**
   * Obtenir toutes les conversations de l'utilisateur (avec pagination optionnelle)
   */
  async getConversations(options: { limit?: number; offset?: number; skipCache?: boolean } = {}): Promise<{
    conversations: Conversation[];
    pagination: {
      limit: number;
      offset: number;
      total: number;
      hasMore: boolean;
    };
  }> {
    const { limit = 20, offset = 0, skipCache = false } = options;
    
    // Vérifier le cache (seulement pour la première page sans offset)
    if (!skipCache && offset === 0 && this.isCacheValid()) {
      return {
        conversations: this.conversationsCache!.data,
        pagination: {
          limit,
          offset: 0,
          total: this.conversationsCache!.data.length,
          hasMore: false
        }
      };
    }
    
    const response = await apiService.get<{ 
      success: boolean; 
      data: unknown[];
      pagination?: {
        limit: number;
        offset: number;
        total: number;
        hasMore: boolean;
      };
    }>('/api/conversations', { limit: limit.toString(), offset: offset.toString() });
    
    if (!response.data.success || !Array.isArray(response.data.data)) {
      throw new Error('Format de réponse invalide pour les conversations');
    }
    
    const conversations = response.data.data.map(conv => this.transformConversationData(conv));
    
    // Mettre en cache les conversations (seulement pour la première page)
    if (offset === 0) {
      this.setCacheConversations(conversations);
    }
    
    return {
      conversations,
      pagination: response.data.pagination || {
        limit,
        offset,
        total: conversations.length,
        hasMore: false
      }
    };
  }

  /**
   * Obtenir une conversation spécifique par ID
   */
  async getConversation(id: string): Promise<Conversation> {
    const response = await apiService.get<{ success: boolean; data: unknown }>(`/api/conversations/${id}`);
    
    if (!response.data.success || !response.data.data) {
      throw new Error('Conversation non trouvée');
    }
    
    // Transformer les données comme pour getConversations
    return this.transformConversationData(response.data.data);
  }

  /**
   * Créer une nouvelle conversation
   */
  async createConversation(data: CreateConversationRequest): Promise<Conversation> {
    const response = await apiService.post<{ success: boolean; data: unknown }>('/api/conversations', data);
    // Transformer les données pour avoir le bon format (participants au lieu de members, etc.)
    return this.transformConversationData(response.data.data);
  }

  /**
   * Supprimer une conversation
   */
  async deleteConversation(id: string): Promise<void> {
    await apiService.delete(`/api/conversations/${id}`);
  }

  /**
   * Obtenir les messages d'une conversation avec pagination standard (offset/limit)
   * Utilise le format de pagination natif du backend : PaginationMeta { total, offset, limit, hasMore }
   *
   * @param conversationId - ID de la conversation
   * @param page - Numéro de page (converti en offset)
   * @param limit - Nombre de messages par page
   * @returns Messages avec métadonnées de pagination
   */
  async getMessages(conversationId: string, page = 1, limit = 20): Promise<{
    messages: Message[];
    total: number;
    hasMore: boolean;
    pagination?: PaginationMeta;
  }> {
    try {
      // Créer un controller pour annuler les requêtes précédentes
      const requestKey = `messages-${conversationId}`;
      const controller = this.createRequestController(requestKey);

      // Convertir page en offset pour le backend
      const offset = (page - 1) * limit;

      const response = await apiService.get<{
        success: boolean;
        data: {
          messages: unknown[];
          userLanguage?: string;
        };
        pagination?: PaginationMeta;
      }>(`/conversations/${conversationId}/messages`, { offset, limit }, {
        signal: controller.signal
      });

      // Nettoyer le controller une fois la requête terminée
      this.pendingRequests.delete(requestKey);

      // Vérifier la structure de la réponse
      if (!response.data?.success || !response.data?.data) {
        console.warn('⚠️ Structure de réponse inattendue:', response.data);
        return {
          messages: [],
          total: 0,
          hasMore: false,
        };
      }

      // Transformer les messages du backend vers le format frontend
      const transformedMessages = (response.data.data.messages || []).map(msg => this.transformMessageData(msg));

      // Utiliser les métadonnées de pagination du backend
      const pagination = response.data.pagination;

      return {
        messages: transformedMessages,
        total: pagination?.total ?? transformedMessages.length,
        hasMore: pagination?.hasMore ?? false,
        pagination,
      };
    } catch (error) {
      // Vérifier si l'erreur est due à l'annulation
      if (error instanceof Error && error.name === 'AbortError') {
        // Retourner une erreur spéciale pour indiquer l'annulation
        throw new Error('REQUEST_CANCELLED');
      }

      console.error('❌ Erreur lors du chargement des messages:', error);
      // Retourner des données par défaut en cas d'erreur
      return {
        messages: [],
        total: 0,
        hasMore: false,
      };
    }
  }

  /**
   * Envoyer un message dans une conversation
   */
  async sendMessage(conversationId: string, data: SendMessageRequest): Promise<Message> {
    const response = await apiService.post<{ success: boolean; data: Message }>(`/api/conversations/${conversationId}/messages`, data);
    return response.data.data;
  }

  /**
   * Marquer une conversation comme lue
   */
  async markAsRead(conversationId: string): Promise<void> {
    await apiService.post(`/api/conversations/${conversationId}/read`);
  }

  /**
   * Ajouter un participant à une conversation
   */
  async addParticipant(conversationId: string, userId: string): Promise<void> {
    await apiService.post(`/api/conversations/${conversationId}/participants`, { userId });
  }

  /**
   * Supprimer un participant d'une conversation
   */
  async removeParticipant(conversationId: string, userId: string): Promise<void> {
    await apiService.delete(`/api/conversations/${conversationId}/participants/${userId}`);
  }

  /**
   * Mettre à jour le rôle d'un participant
   */
  async updateParticipantRole(
    conversationId: string,
    userId: string,
    role: 'ADMIN' | 'MODERATOR' | 'MEMBER'
  ): Promise<void> {
    await apiService.patch(`/api/conversations/${conversationId}/participants/${userId}/role`, { role });
  }

  /**
   * Rechercher dans les conversations
   */
  async searchConversations(query: string): Promise<Conversation[]> {
    const response = await apiService.get<Conversation[]>('/api/conversations/search', { q: query });
    return response.data;
  }

  /**
   * Obtenir les participants d'une conversation
   * OPTIMISATION: Ajout d'un cache pour éviter les requêtes répétées
   */
  async getParticipants(conversationId: string, filters?: ParticipantsFilters): Promise<User[]> {
    try {
      const params: Record<string, string> = {};

      if (filters?.onlineOnly) {
        params.onlineOnly = 'true';
      }

      if (filters?.role) {
        params.role = filters.role;
      }

      if (filters?.search) {
        params.search = filters.search;
      }

      if (filters?.limit) {
        params.limit = filters.limit.toString();
      }

      // OPTIMISATION: Vérifier le cache (seulement pour les requêtes sans filtres spéciaux)
      const cacheKey = `${conversationId}-${JSON.stringify(params)}`;
      const cached = this.participantsCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp) < this.PARTICIPANTS_CACHE_DURATION) {
        return cached.data;
      }

      const response = await apiService.get<{ success: boolean; data: User[] }>(
        `/api/conversations/${conversationId}/participants`,
        params
      );

      const participants = response.data.data || [];

      // OPTIMISATION: Mettre en cache
      this.participantsCache.set(cacheKey, {
        data: participants,
        timestamp: Date.now()
      });

      return participants;
    } catch (error) {
      console.error('[ConversationsService] Erreur lors de la récupération des participants:', error);
      // Retourner un tableau vide en cas d'erreur pour éviter de casser l'interface
      return [];
    }
  }

  /**
   * Obtenir tous les participants d'une conversation (authentifiés et anonymes)
   * Cette méthode utilise l'endpoint /conversations/:conversationId/participants qui retourne tous les participants
   */
  async getAllParticipants(conversationId: string): Promise<{
    authenticatedParticipants: User[];
    anonymousParticipants: Array<{
      id: string;
      username: string;
      firstName: string;
      lastName: string;
      language: string;
      isOnline: boolean;
      joinedAt: string;
      canSendMessages: boolean;
      canSendFiles: boolean;
      canSendImages: boolean;
    }>;
  }> {
    try {

      // Récupérer tous les participants via l'endpoint /api/conversations/:conversationId/participants
      const response = await apiService.get<{
        success: boolean;
        data: Array<User & {
          isAnonymous?: boolean;
          canSendMessages?: boolean;
          canSendFiles?: boolean;
          canSendImages?: boolean;
        }>;
      }>(`/api/conversations/${conversationId}/participants`);


      const allParticipants = response.data.data || [];

      // Séparer les participants authentifiés et anonymes
      const authenticatedParticipants: User[] = [];
      const anonymousParticipants: Array<{
        id: string;
        username: string;
        firstName: string;
        lastName: string;
        language: string;
        isOnline: boolean;
        joinedAt: string;
        canSendMessages: boolean;
        canSendFiles: boolean;
        canSendImages: boolean;
      }> = [];
      
      allParticipants.forEach((participant, index) => {

        if (participant.isAnonymous) {
          anonymousParticipants.push({
            id: participant.id,
            username: participant.username,
            firstName: participant.firstName,
            lastName: participant.lastName,
            language: participant.systemLanguage || 'fr',
            isOnline: participant.isOnline,
            joinedAt: participant.createdAt ? new Date(participant.createdAt).toISOString() : new Date().toISOString(),
            canSendMessages: participant.canSendMessages || false,
            canSendFiles: participant.canSendFiles || false,
            canSendImages: participant.canSendImages || false
          });
        } else {
          authenticatedParticipants.push(participant);
        }
      });


      return {
        authenticatedParticipants,
        anonymousParticipants
      };
    } catch (error) {
      console.error('Erreur lors de la récupération de tous les participants:', error);
      // En cas d'erreur, retourner au moins les participants authentifiés
      const authenticatedParticipants = await this.getParticipants(conversationId);
      return {
        authenticatedParticipants,
        anonymousParticipants: []
      };
    }
  }

  /**
   * Mettre à jour les paramètres d'une conversation
   */
  async updateConversation(id: string, data: Partial<Conversation>): Promise<Conversation> {
    const response = await apiService.patch<Conversation>(`/api/conversations/${id}`, data);
    return response.data;
  }

  /**
   * Créer un lien d'invitation pour une conversation
   */
  async createInviteLink(conversationId: string, linkData?: {
    name?: string;
    description?: string;
    maxUses?: number;
    expiresAt?: string;
    allowAnonymousMessages?: boolean;
    allowAnonymousFiles?: boolean;
    allowAnonymousImages?: boolean;
    allowViewHistory?: boolean;
    requireNickname?: boolean;
    requireEmail?: boolean;
  }): Promise<string> {
    try {
      // Si le nom n'est pas fourni, générer un nom automatique basé sur la conversation
      let linkName = linkData?.name;
      
      if (!linkName) {
        // Récupérer les détails de la conversation pour obtenir le titre
        try {
          const conversation = await this.getConversation(conversationId);
          const conversationTitle = conversation.title || 'Conversation';
          
          // Calculer la durée en jours si expiresAt est fourni
          let durationDays: number | undefined;
          if (linkData?.expiresAt) {
            const expirationDate = new Date(linkData.expiresAt);
            const now = new Date();
            durationDays = Math.ceil((expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          }
          
          // Obtenir la langue de l'utilisateur courant via authManager (source unique)
          const userData = typeof window !== 'undefined' ? authManager.getCurrentUser() : null;
          const userLanguage = userData?.systemLanguage || 'fr';
          
          // Générer le nom du lien automatiquement
          linkName = generateLinkName({
            conversationTitle,
            language: userLanguage,
            durationDays: durationDays || 7,
            maxUses: linkData?.maxUses,
            isPublic: !linkData?.maxUses
          });
        } catch (error) {
          console.warn('Impossible de récupérer les détails de la conversation pour générer le nom du lien:', error);
          linkName = 'Lien d\'invitation';
        }
      }
      
      // Utiliser l'endpoint existant /conversations/:id/new-link
      const response = await apiService.post<{ 
        success: boolean; 
        data: { link: string; code: string; shareLink: any } 
      }>(`/api/conversations/${conversationId}/new-link`, {
        name: linkName,
        description: linkData?.description || 'Rejoignez cette conversation',
        maxUses: linkData?.maxUses,
        expiresAt: linkData?.expiresAt,
        allowAnonymousMessages: linkData?.allowAnonymousMessages ?? true,
        allowAnonymousFiles: linkData?.allowAnonymousFiles ?? false,
        allowAnonymousImages: linkData?.allowAnonymousImages ?? true,
        allowViewHistory: linkData?.allowViewHistory ?? true,
        requireNickname: linkData?.requireNickname ?? true,
        requireEmail: linkData?.requireEmail ?? false
      });
      
      return response.data.data.link;
    } catch (error: any) {
      // Gérer les erreurs spécifiques
      if (error.status === 403) {
        if (error.message?.includes('Accès non autorisé')) {
          throw new Error('Vous n\'êtes pas membre de cette conversation. Seuls les membres peuvent créer des liens de partage.');
        } else if (error.message?.includes('Seuls les administrateurs')) {
          throw new Error('Seuls les administrateurs et modérateurs peuvent créer des liens de partage pour cette conversation.');
        } else {
          throw new Error('Vous n\'avez pas les permissions nécessaires pour créer un lien de partage.');
        }
      } else if (error.status === 404) {
        throw new Error('Conversation non trouvée.');
      } else {
        throw new Error('Erreur lors de la création du lien de partage. Veuillez réessayer.');
      }
    }
  }

  /**
   * Créer une nouvelle conversation avec un lien d'invitation
   */
  async createConversationWithLink(linkData: {
    name?: string;
    description?: string;
    maxUses?: number;
    expiresAt?: string;
    allowAnonymousMessages?: boolean;
    allowAnonymousFiles?: boolean;
    allowAnonymousImages?: boolean;
    allowViewHistory?: boolean;
    requireNickname?: boolean;
    requireEmail?: boolean;
  } = {}): Promise<string> {
    // Créer une nouvelle conversation sans conversationId (le backend créera automatiquement la conversation)
    const response = await apiService.post<{ 
      success: boolean; 
      data: { linkId: string; conversationId: string; shareLink: any } 
    }>('/api/links', {
      // Pas de conversationId - le backend créera une nouvelle conversation
      name: linkData.name || 'Nouvelle conversation',
      description: linkData.description || 'Rejoignez cette conversation',
      maxUses: linkData.maxUses,
      expiresAt: linkData.expiresAt,
      allowAnonymousMessages: linkData.allowAnonymousMessages ?? true,
      allowAnonymousFiles: linkData.allowAnonymousFiles ?? false,
      allowAnonymousImages: linkData.allowAnonymousImages ?? true,
      allowViewHistory: linkData.allowViewHistory ?? true,
      requireNickname: linkData.requireNickname ?? true,
      requireEmail: linkData.requireEmail ?? false
    });
    
    // Retourner le lien complet
    return `${process.env.NEXT_PUBLIC_FRONTEND_URL || 'http://meeshy.me'}/join/${response.data.data.linkId}`;
  }

  /**
   * Annule toutes les requêtes en cours pour un type donné
   */
  private cancelPendingRequest(key: string): void {
    const controller = this.pendingRequests.get(key);
    if (controller) {
      controller.abort();
      this.pendingRequests.delete(key);
    }
  }

  /**
   * Marque tous les messages d'une conversation comme lus
   */
  async markConversationAsRead(conversationId: string): Promise<{
    success: boolean;
    message: string;
    markedCount: number;
  }> {
    const requestKey = `mark-read-${conversationId}`;
    const controller = this.createRequestController(requestKey);
    
    try {
      const response = await apiService.post<{
        success: boolean;
        message: string;
        markedCount: number;
      }>(`/api/conversations/${conversationId}/mark-read`, {});
      
      // Nettoyer le controller une fois la requête terminée
      this.pendingRequests.delete(requestKey);
      
      return response.data;
    } catch (error) {
      this.pendingRequests.delete(requestKey);
      throw error;
    }
  }

  /**
   * Crée un nouveau controller pour une requête
   */
  private createRequestController(key: string): AbortController {
    this.cancelPendingRequest(key);
    const controller = new AbortController();
    this.pendingRequests.set(key, controller);
    return controller;
  }

  /**
   * Obtenir toutes les conversations directes avec un utilisateur spécifique
   */
  async getConversationsWithUser(userId: string): Promise<Conversation[]> {
    try {
      // Récupérer toutes les conversations de l'utilisateur courant
      const { conversations } = await this.getConversations({ skipCache: true });

      // Filtrer pour ne garder que les conversations directes avec cet utilisateur
      const directConversations = conversations.filter(conv => {
        // Vérifier que c'est une conversation directe
        if (conv.type !== 'direct') return false;

        // Vérifier que l'utilisateur ciblé fait partie des participants
        const hasTargetUser = conv.participants?.some(p => p.userId === userId);

        return hasTargetUser;
      });

      // Trier par date de dernière activité (plus récente en premier)
      directConversations.sort((a, b) => {
        const dateA = a.lastActivityAt || a.updatedAt || a.createdAt;
        const dateB = b.lastActivityAt || b.updatedAt || b.createdAt;
        return new Date(dateB).getTime() - new Date(dateA).getTime();
      });

      return directConversations;
    } catch (error) {
      console.error('Erreur lors de la récupération des conversations avec l\'utilisateur:', error);
      return [];
    }
  }
}

export const conversationsService = new ConversationsService();
