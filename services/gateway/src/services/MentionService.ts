/**
 * Service de gestion des mentions d'utilisateurs
 *
 * Gère l'extraction, la résolution et la validation des mentions @username
 * dans les messages, ainsi que la suggestion d'utilisateurs pour l'autocomplete.
 */

import { PrismaClient, User, ConversationMember } from '@meeshy/shared/prisma/client';
import { getRedisWrapper, RedisWrapper } from './RedisWrapper';
import { enhancedLogger } from '../utils/logger-enhanced';

// Logger dédié pour MentionService
const logger = enhancedLogger.child({ module: 'MentionService' });


export interface MentionSuggestion {
  id: string;
  username: string;
  displayName: string | null;
  avatar: string | null;
  badge: 'conversation' | 'friend' | 'other';
  inConversation: boolean;
  isFriend: boolean;
}

export interface MentionValidationResult {
  isValid: boolean;
  validUserIds: string[];
  invalidUsernames: string[];
  errors: string[];
}

export class MentionService {
  // Regex pour détecter les mentions @username (lettres, chiffres, underscore)
  private readonly MENTION_REGEX = /@(\w+)/g;

  // Regex stricte pour valider les usernames (alphanumeric + underscore, 1-30 caractères)
  private readonly USERNAME_VALIDATION_REGEX = /^[a-z0-9_]{1,30}$/;

  // Limite de suggestions pour l'autocomplete
  private readonly MAX_SUGGESTIONS = 10;

  // Limite maximale de mentions par message (protection anti-spam)
  private readonly MAX_MENTIONS_PER_MESSAGE = 50;

  // Limite maximale de longueur de contenu à traiter (10KB)
  private readonly MAX_CONTENT_LENGTH = 10000;

  // Cache Redis pour l'autocomplete (TTL: 5 minutes)
  private readonly CACHE_TTL = 300; // 5 minutes en secondes
  private redis: RedisWrapper;

  constructor(
    private readonly prisma: PrismaClient,
    redisUrl?: string
  ) {
    // Use shared singleton instance to avoid multiple Redis connections
    const url = redisUrl || process.env.REDIS_URL || 'redis://localhost:6379';
    this.redis = getRedisWrapper(url);

    const stats = this.redis.getCacheStats();
    logger.info(`[MentionService] Cache initialized in ${stats.mode} mode (Redis available: ${stats.redisAvailable})`);
  }

  /**
   * Génère une clé de cache pour l'autocomplete
   */
  private generateCacheKey(conversationId: string, currentUserId: string, query: string): string {
    const normalizedQuery = query.toLowerCase().trim();
    return `mentions:suggestions:${conversationId}:${currentUserId}:${normalizedQuery}`;
  }

  /**
   * Récupère les suggestions depuis le cache
   */
  private async getCachedSuggestions(
    conversationId: string,
    currentUserId: string,
    query: string
  ): Promise<MentionSuggestion[] | null> {
    try {
      const cacheKey = this.generateCacheKey(conversationId, currentUserId, query);
      const cached = await this.redis.get(cacheKey);

      if (cached) {
        const suggestions: MentionSuggestion[] = JSON.parse(cached);
        logger.info(`[MentionService] Cache HIT for ${cacheKey} (${suggestions.length} suggestions)`);
        return suggestions;
      }

      logger.info(`[MentionService] Cache MISS for ${cacheKey}`);
      return null;
    } catch (error) {
      logger.error('[MentionService] Error reading cache', error);
      return null;
    }
  }

  /**
   * Met en cache les suggestions
   */
  private async cacheSuggestions(
    conversationId: string,
    currentUserId: string,
    query: string,
    suggestions: MentionSuggestion[]
  ): Promise<void> {
    try {
      const cacheKey = this.generateCacheKey(conversationId, currentUserId, query);
      await this.redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(suggestions));
      logger.info(`[MentionService] Cached ${suggestions.length} suggestions for ${cacheKey} (TTL: ${this.CACHE_TTL}s)`);
    } catch (error) {
      logger.error('[MentionService] Error writing cache', error);
    }
  }

  /**
   * Invalide le cache pour une conversation (appelé quand les membres changent)
   */
  async invalidateCacheForConversation(conversationId: string): Promise<void> {

    try {
      const pattern = `mentions:suggestions:${conversationId}:*`;
      const keys = await this.redis.keys(pattern);

      if (keys.length > 0) {
        // Supprimer les clés une par une
        for (const key of keys) {
          await this.redis.del(key);
        }
        logger.info(`[MentionService] Invalidated ${keys.length} cache entries for conversation ${conversationId}`);
      }
    } catch (error) {
      logger.error('[MentionService] Error invalidating cache', error);
    }
  }

  /**
   * Valide qu'un username respecte le format requis
   * @param username - Username à valider (sans @)
   * @returns true si valide, false sinon
   */
  private isValidUsername(username: string): boolean {
    return this.USERNAME_VALIDATION_REGEX.test(username);
  }

  /**
   * Extrait tous les usernames mentionnés (@username) d'un contenu de message
   * SÉCURITÉ: Filtre les mentions invalides et limite le nombre total
   *
   * @param content - Le contenu du message
   * @returns Array des usernames uniques ET VALIDES (sans le @)
   */
  extractMentions(content: string): string[] {
    // Protection: contenu vide ou trop long
    if (!content || content.length > this.MAX_CONTENT_LENGTH) {
      logger.warn(`[MentionService] Content too long or empty: ${content?.length || 0} bytes`);
      return [];
    }

    const mentions = new Set<string>();
    const matches = content.matchAll(this.MENTION_REGEX);

    for (const match of matches) {
      if (match[1]) {
        const username = match[1].toLowerCase(); // Normaliser en minuscules

        // SÉCURITÉ: Valider le format du username
        if (!this.isValidUsername(username)) {
          logger.warn(`[MentionService] Invalid username format ignored: @${username}`);
          continue; // Ignorer silencieusement les mentions invalides
        }

        mentions.add(username);

        // SÉCURITÉ: Limiter le nombre de mentions
        if (mentions.size >= this.MAX_MENTIONS_PER_MESSAGE) {
          logger.warn(`[MentionService] Max mentions limit reached (${this.MAX_MENTIONS_PER_MESSAGE}), truncating`);
          break;
        }
      }
    }

    if (mentions.size > 0) {
      logger.info(`[MentionService] Extracted ${mentions.size} valid mention(s)`);
    }

    return Array.from(mentions);
  }

  /**
   * Résout les usernames en utilisateurs réels
   * @param usernames - Liste des usernames à résoudre
   * @returns Map des usernames vers les utilisateurs trouvés
   */
  async resolveUsernames(usernames: string[]): Promise<Map<string, User>> {
    if (usernames.length === 0) return new Map();

    // Ne pas filtrer sur isActive/deletedAt pour cohérence avec l'autocomplete
    // Si un utilisateur apparaît dans l'autocomplete (membre de conversation),
    // il doit pouvoir être mentionné même s'il est "inactif"

    // Note: mode: 'insensitive' ne fonctionne PAS avec 'in' dans Prisma + MongoDB
    // On doit utiliser $or avec equals pour chaque username
    const users = await this.prisma.user.findMany({
      where: {
        OR: usernames.map(username => ({
          username: {
            equals: username,
            mode: 'insensitive'
          }
        }))
      },
      select: {
        id: true,
        username: true,
        firstName: true,
        lastName: true,
        displayName: true,
        avatar: true
      }
    });

    logger.info('[MentionService] resolveUsernames:', {
      requestedUsernames: usernames,
      foundCount: users.length,
      foundUsernames: users.map(u => u.username)
    });

    const userMap = new Map<string, User>();
    users.forEach(user => {
      // Map avec le username normalisé pour correspondre à l'extraction
      userMap.set(user.username.toLowerCase(), user as User);
    });

    return userMap;
  }

  /**
   * Obtient des suggestions d'utilisateurs pour l'autocomplete
   * avec priorité aux membres de la conversation et aux amis
   * PERFORMANCE: Utilise Redis cache (TTL: 5 minutes)
   *
   * @param conversationId - ID de la conversation
   * @param currentUserId - ID de l'utilisateur qui fait la recherche
   * @param query - Texte de recherche (optionnel)
   * @returns Liste de suggestions triées par pertinence
   */
  async getUserSuggestionsForConversation(
    conversationId: string,
    currentUserId: string,
    query: string = ''
  ): Promise<MentionSuggestion[]> {
    logger.info('[MentionService] getUserSuggestionsForConversation called', {
      conversationId,
      currentUserId,
      query
    });

    // PERFORMANCE: Vérifier le cache d'abord
    const cachedSuggestions = await this.getCachedSuggestions(conversationId, currentUserId, query);
    if (cachedSuggestions) {
      return cachedSuggestions;
    }

    const normalizedQuery = query.toLowerCase().trim();

    // 1. Récupérer les membres de la conversation
    logger.info('[MentionService] Fetching conversation members...');
    let conversationMembers;
    try {
      conversationMembers = await this.prisma.conversationMember.findMany({
        where: {
          conversationId,
          isActive: true,
          userId: { not: currentUserId } // Exclure l'utilisateur actuel
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
              displayName: true,
              avatar: true,
              lastActiveAt: true
            }
          }
        }
        // Note: MongoDB/Prisma ne supporte pas orderBy sur les relations
        // Le tri sera fait après en mémoire
      });
      logger.info(`[MentionService] Found ${conversationMembers.length} conversation members`);
    } catch (err) {
      logger.error('[MentionService] Error fetching conversation members', err);
      throw err;
    }

    // Trier les membres par lastActiveAt de l'utilisateur (en mémoire)
    conversationMembers.sort((a, b) => {
      const aTime = a.user?.lastActiveAt?.getTime() || 0;
      const bTime = b.user?.lastActiveAt?.getTime() || 0;
      return bTime - aTime; // Ordre décroissant (plus récent d'abord)
    });

    // 2. Récupérer les amis de l'utilisateur (via les demandes acceptées)
    logger.info('[MentionService] Fetching friendships...');
    let friendships;
    try {
      friendships = await this.prisma.friendRequest.findMany({
        where: {
          OR: [
            { senderId: currentUserId, status: 'accepted' },
            { receiverId: currentUserId, status: 'accepted' }
          ]
        },
        include: {
          sender: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
              displayName: true,
              avatar: true
            }
          },
          receiver: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
              displayName: true,
              avatar: true
            }
          }
        }
      });
      logger.info(`[MentionService] Found ${friendships.length} friendships`);
    } catch (err) {
      logger.error('[MentionService] Error fetching friendships', err);
      throw err;
    }

    // Construire la liste des amis (exclure l'utilisateur actuel)
    const friends = new Set<string>();
    const friendsMap = new Map<string, User>();

    friendships.forEach(friendship => {
      if (friendship.senderId === currentUserId && friendship.receiver) {
        friends.add(friendship.receiverId);
        friendsMap.set(friendship.receiverId, friendship.receiver as User);
      } else if (friendship.receiverId === currentUserId && friendship.sender) {
        friends.add(friendship.senderId);
        friendsMap.set(friendship.senderId, friendship.sender as User);
      }
    });

    // 3. Construire les suggestions
    const suggestions: MentionSuggestion[] = [];
    const addedUserIds = new Set<string>();

    // Fonction helper pour filtrer les utilisateurs selon la query
    const matchesQuery = (user: User): boolean => {
      if (!normalizedQuery) return true;

      const username = user.username.toLowerCase();
      const displayName = (user.displayName || '').toLowerCase();
      const fullName = `${user.firstName} ${user.lastName}`.toLowerCase();

      return username.includes(normalizedQuery) ||
             displayName.includes(normalizedQuery) ||
             fullName.includes(normalizedQuery);
    };

    // Priorité 1: Membres de la conversation
    for (const member of conversationMembers) {
      if (!member.user) continue;
      if (addedUserIds.has(member.user.id)) continue;
      if (!matchesQuery(member.user as User)) continue;

      const isFriend = friends.has(member.user.id);

      suggestions.push({
        id: member.user.id,
        username: member.user.username,
        displayName: member.user.displayName,
        avatar: member.user.avatar,
        badge: 'conversation',
        inConversation: true,
        isFriend
      });

      addedUserIds.add(member.user.id);

      if (suggestions.length >= this.MAX_SUGGESTIONS) {
        // PERFORMANCE: Mettre en cache avant de retourner
        await this.cacheSuggestions(conversationId, currentUserId, query, suggestions);
        return suggestions;
      }
    }

    // Priorité 2: Amis (qui ne sont pas déjà dans la conversation)
    for (const [friendId, friend] of friendsMap) {
      if (addedUserIds.has(friendId)) continue;
      if (!matchesQuery(friend)) continue;

      suggestions.push({
        id: friend.id,
        username: friend.username,
        displayName: friend.displayName,
        avatar: friend.avatar,
        badge: 'friend',
        inConversation: false,
        isFriend: true
      });

      addedUserIds.add(friendId);

      if (suggestions.length >= this.MAX_SUGGESTIONS) {
        // PERFORMANCE: Mettre en cache avant de retourner
        await this.cacheSuggestions(conversationId, currentUserId, query, suggestions);
        return suggestions;
      }
    }

    // Priorité 3: Recherche globale (si query fournie et pas encore assez de résultats)
    if (normalizedQuery && suggestions.length < this.MAX_SUGGESTIONS) {
      const otherUsers = await this.prisma.user.findMany({
        where: {
          AND: [
            {
              OR: [
                { username: { contains: normalizedQuery, mode: 'insensitive' } },
                { displayName: { contains: normalizedQuery, mode: 'insensitive' } },
                { firstName: { contains: normalizedQuery, mode: 'insensitive' } },
                { lastName: { contains: normalizedQuery, mode: 'insensitive' } }
              ]
            },
            { id: { notIn: Array.from(addedUserIds).concat(currentUserId) } },
            { isActive: true },
            { deletedAt: null }
          ]
        },
        select: {
          id: true,
          username: true,
          firstName: true,
          lastName: true,
          displayName: true,
          avatar: true
        },
        take: this.MAX_SUGGESTIONS - suggestions.length,
        orderBy: {
          username: 'asc'
        }
      });

      otherUsers.forEach(user => {
        suggestions.push({
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          avatar: user.avatar,
          badge: 'other',
          inConversation: false,
          isFriend: false
        });
      });
    }

    // PERFORMANCE: Mettre en cache avant de retourner
    await this.cacheSuggestions(conversationId, currentUserId, query, suggestions);
    return suggestions;
  }

  /**
   * Valide les permissions de mention selon le type de conversation
   *
   * @param conversationId - ID de la conversation
   * @param mentionedUserIds - IDs des utilisateurs à mentionner
   * @param senderId - ID de l'utilisateur qui envoie le message
   * @returns Résultat de validation avec les userIds valides et invalides
   */
  async validateMentionPermissions(
    conversationId: string,
    mentionedUserIds: string[],
    senderId: string
  ): Promise<MentionValidationResult> {
    if (mentionedUserIds.length === 0) {
      return {
        isValid: true,
        validUserIds: [],
        invalidUsernames: [],
        errors: []
      };
    }

    // Récupérer la conversation et ses membres
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        members: {
          where: { isActive: true },
          select: { userId: true }
        }
      }
    });

    if (!conversation) {
      return {
        isValid: false,
        validUserIds: [],
        invalidUsernames: [],
        errors: ['Conversation non trouvée']
      };
    }

    const memberIds = conversation.members.map(m => m.userId);
    const validUserIds: string[] = [];
    const invalidUserIds: string[] = [];
    const errors: string[] = [];

    // Règles de validation selon le type de conversation
    switch (conversation.type) {
      case 'direct':
        // Conversations directes: seulement l'autre participant
        for (const userId of mentionedUserIds) {
          if (memberIds.includes(userId) && userId !== senderId) {
            validUserIds.push(userId);
          } else {
            invalidUserIds.push(userId);
          }
        }
        if (invalidUserIds.length > 0) {
          errors.push('Dans une conversation directe, vous ne pouvez mentionner que votre interlocuteur');
        }
        break;

      case 'group':
        // Conversations de groupe: seulement les membres actuels
        for (const userId of mentionedUserIds) {
          if (memberIds.includes(userId)) {
            validUserIds.push(userId);
          } else {
            invalidUserIds.push(userId);
          }
        }
        if (invalidUserIds.length > 0) {
          errors.push('Vous ne pouvez mentionner que les membres de la conversation');
        }
        break;

      case 'public':
      case 'global':
        // Conversations publiques/globales: tous les utilisateurs enregistrés
        // Ne pas filtrer sur isActive pour cohérence avec l'autocomplete
        const users = await this.prisma.user.findMany({
          where: {
            id: { in: mentionedUserIds }
            // Pas de filtre isActive/deletedAt pour cohérence avec autocomplete
          },
          select: { id: true }
        });

        const existingUserIds = users.map(u => u.id);

        for (const userId of mentionedUserIds) {
          if (existingUserIds.includes(userId)) {
            validUserIds.push(userId);
          } else {
            invalidUserIds.push(userId);
          }
        }

        if (invalidUserIds.length > 0) {
          errors.push('Certains utilisateurs mentionnés n\'existent pas');
        }
        break;

      default:
        errors.push('Type de conversation non reconnu');
        return {
          isValid: false,
          validUserIds: [],
          invalidUsernames: [],
          errors
        };
    }

    return {
      isValid: errors.length === 0,
      validUserIds,
      invalidUsernames: [], // Sera rempli par le service appelant si nécessaire
      errors
    };
  }

  /**
   * Crée les entrées de mention dans la base de données
   *
   * @param messageId - ID du message
   * @param mentionedUserIds - IDs des utilisateurs mentionnés
   */
  async createMentions(messageId: string, mentionedUserIds: string[]): Promise<void> {
    if (mentionedUserIds.length === 0) return;

    // Créer les mentions en parallèle pour de meilleures performances
    // MongoDB avec Prisma ne supporte pas skipDuplicates dans createMany
    await Promise.allSettled(
      mentionedUserIds.map(userId =>
        this.prisma.mention.create({
          data: {
            messageId,
            mentionedUserId: userId
          }
        }).catch((error: any) => {
          // Ignorer les erreurs de doublons (code P2002)
          if (error.code !== 'P2002') {
            logger.error(`Error creating mention for user ${userId}:`, error);
          }
        })
      )
    );
  }

  /**
   * Récupère les mentions pour un message donné
   *
   * @param messageId - ID du message
   * @returns Liste des utilisateurs mentionnés avec leurs informations
   */
  async getMentionsForMessage(messageId: string): Promise<User[]> {
    const mentions = await this.prisma.mention.findMany({
      where: { messageId },
      include: {
        mentionedUser: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            displayName: true,
            avatar: true
          }
        }
      }
    });

    return mentions.map(m => m.mentionedUser as User);
  }

  /**
   * Récupère les mentions récentes pour un utilisateur
   *
   * @param userId - ID de l'utilisateur
   * @param limit - Nombre maximum de mentions à retourner
   * @returns Liste des mentions récentes
   */
  async getRecentMentionsForUser(userId: string, limit: number = 50) {
    const mentions = await this.prisma.mention.findMany({
      where: {
        mentionedUserId: userId
      },
      include: {
        message: {
          select: {
            id: true,
            content: true,
            conversationId: true,
            senderId: true,
            createdAt: true,
            sender: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatar: true
              }
            },
            conversation: {
              select: {
                id: true,
                title: true,
                type: true
              }
            }
          }
        }
      },
      orderBy: {
        mentionedAt: 'desc'
      },
      take: limit
    });

    return mentions;
  }

  /**
   * Vérifie si un utilisateur peut être mentionné dans une conversation
   *
   * @param conversationId - ID de la conversation
   * @param userId - ID de l'utilisateur à mentionner
   * @returns true si l'utilisateur peut être mentionné
   */
  async canMentionUser(conversationId: string, userId: string): Promise<boolean> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { type: true }
    });

    if (!conversation) return false;

    // Pour les conversations publiques/globales, tous les utilisateurs peuvent être mentionnés
    if (conversation.type === 'public' || conversation.type === 'global') {
      const user = await this.prisma.user.findUnique({
        where: { id: userId, isActive: true, deletedAt: null },
        select: { id: true }
      });
      return !!user;
    }

    // Pour les autres types, vérifier l'appartenance à la conversation
    const member = await this.prisma.conversationMember.findFirst({
      where: {
        conversationId,
        userId,
        isActive: true
      }
    });

    return !!member;
  }
}
