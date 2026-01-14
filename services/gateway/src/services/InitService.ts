import { PrismaClient } from '@meeshy/shared/prisma/client';
import { AuthService } from './AuthService';
import { UserRoleEnum } from '@meeshy/shared/types';

export class InitService {
  private prisma: PrismaClient;
  private authService: AuthService;
  private globalConversationId: string;
  private directConversationId: string;
  private groupConversationId: string;
  
  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.authService = new AuthService(prisma, process.env.JWT_SECRET || 'default-jwt-secret');
  }

  /**
   * Initialise la base de données avec les données par défaut
   */
  async initializeDatabase(): Promise<void> {
    const forceReset = process.env.FORCE_DB_RESET === 'true';
    const isProduction = process.env.NODE_ENV === 'production';
    
    // GARDE-FOU CRITIQUE: Empêcher FORCE_DB_RESET=true en production
    if (forceReset && isProduction) {
      const errorMessage = '🚨 ERREUR CRITIQUE: FORCE_DB_RESET=true détecté en PRODUCTION! Ceci supprimerait TOUTES les données!';
      console.error(`[INIT] ${errorMessage}`);
      console.error('[INIT] 🛡️ Protection activée: Réinitialisation bloquée pour protéger les données de production');
      console.error('[INIT] 💡 Si vous devez vraiment réinitialiser en production, contactez un administrateur');
      throw new Error('FORCE_DB_RESET=true est interdit en production pour protéger les données');
    }
    
    if (forceReset) {
      await this.resetDatabase();
    } else {
    }

    try {
      // 1. Créer la conversation globale "meeshy"
      await this.createGlobalConversation();

      // 2. Créer les utilisateurs par défaut
      await this.createDefaultUsers();

      // 3. Créer l'utilisateur André Tabeth
      await this.createAndreTabethUser();

      // 4. Créer les conversations supplémentaires
      await this.createAdditionalConversations();

      // 5. S'assurer que tous les utilisateurs sont membres de la conversation meeshy
      await this.ensureAllUsersInMeeshyConversation();

    } catch (error) {
      console.error('[INIT] ❌ Erreur lors de l\'initialisation:', error);
      console.error('[INIT] 💡 Détails de l\'erreur:', error.message);
      
      // En mode développement, on ne fait pas échouer le serveur
      if (process.env.NODE_ENV === 'development') {
        return;
      }
      
      throw error;
    }
  }

  /**
   * Crée la conversation globale "meeshy"
   */
  private async createGlobalConversation(): Promise<void> {

    try {
      let existingConversation = await this.prisma.conversation.findFirst({
        where: { identifier: 'meeshy' }
      });

      if (existingConversation) {
        return;
      }


      const newConversation = await this.prisma.conversation.create({
        data: {
          identifier: 'meeshy',
          title: 'Meeshy Global',
          description: 'Conversation globale de la communauté Meeshy',
          type: 'global',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      });

      this.globalConversationId = newConversation.id;

    } catch (error) {
      console.error('[INIT] ❌ Erreur lors de la création de la conversation globale:', error);
      throw error;
    }
  }

  /**
   * Crée les utilisateurs par défaut
   */
  private async createDefaultUsers(): Promise<void> {

    try {
      // 1. Créer l'utilisateur Bigboss (Meeshy Sama)
      await this.createBigbossUser();

      // 2. Créer l'utilisateur Admin Manager
      await this.createAdminUser();

    } catch (error) {
      console.error('[INIT] ❌ Erreur lors de la création des utilisateurs par défaut:', error);
      throw error;
    }
  }

  /**
   * Crée l'utilisateur Bigboss (Meeshy Sama) - Partiellement configurable
   */
  private async createBigbossUser(): Promise<void> {
    // Utilisateur fixe avec certains champs configurables
    const username = 'meeshy'; // FIXE
    const password = process.env.MEESHY_PASSWORD || 'bigboss123'; // CONFIGURABLE
    const firstName = 'Meeshy'; // FIXE
    const lastName = 'Sama'; // FIXE
    const email = process.env.MEESHY_EMAIL || 'meeshy@meeshy.me'; // CONFIGURABLE
    const role = 'BIGBOSS'; // FIXE
    const systemLanguage = process.env.MEESHY_SYSTEM_LANGUAGE || 'en'; // CONFIGURABLE
    const regionalLanguage = process.env.MEESHY_REGIONAL_LANGUAGE || 'fr'; // CONFIGURABLE
    const customDestinationLanguage = process.env.MEESHY_CUSTOM_DESTINATION_LANGUAGE || 'pt'; // CONFIGURABLE


    try {
      const existingUser = await this.prisma.user.findFirst({
        where: { username }
      });

      if (existingUser) {
        return;
      }


      // Créer l'utilisateur via l'API de création de compte
      const userData = {
        username,
        password,
        firstName,
        lastName,
        email,
        systemLanguage,
        regionalLanguage,
        customDestinationLanguage
      };

      const result = await this.authService.register(userData);

      if (!result || !result.user) {
        throw new Error('Échec de la création de l\'utilisateur Bigboss');
      }

      const user = result.user;

      // Mettre à jour le rôle vers BIGBOSS (fixe)
      await this.prisma.user.update({
        where: { id: user.id },
        data: { role: UserRoleEnum.BIGBOSS }
      });

      // Ajouter l'utilisateur comme CREATOR de la conversation meeshy
      await this.prisma.conversationMember.create({
        data: {
          conversationId: this.globalConversationId,
          userId: user.id,
          role: 'CREATOR',
          joinedAt: new Date(),
          isActive: true
        }
      });

    } catch (error) {
      console.error(`[INIT] ❌ Erreur lors de la création de l'utilisateur Bigboss "${username}":`, error);
      throw error;
    }
  }

  /**
   * Crée l'utilisateur Admin Manager - Partiellement configurable
   */
  private async createAdminUser(): Promise<void> {
    // Utilisateur fixe avec certains champs configurables
    const username = 'admin'; // FIXE
    const password = process.env.ADMIN_PASSWORD || 'admin123'; // CONFIGURABLE
    const firstName = 'Admin'; // FIXE
    const lastName = 'Manager'; // FIXE
    const email = process.env.ADMIN_EMAIL || 'admin@meeshy.me'; // CONFIGURABLE
    const role = 'ADMIN'; // FIXE
    const systemLanguage = process.env.ADMIN_SYSTEM_LANGUAGE || 'en'; // CONFIGURABLE - Default: English
    const regionalLanguage = process.env.ADMIN_REGIONAL_LANGUAGE || 'fr'; // CONFIGURABLE - Default: French
    const customDestinationLanguage = process.env.ADMIN_CUSTOM_DESTINATION_LANGUAGE || 'es'; // CONFIGURABLE - Default: Spanish


    try {
      const existingUser = await this.prisma.user.findFirst({
        where: { username }
      });

      if (existingUser) {
        
        // Mettre à jour le rôle vers ADMIN et les langues configurables
        await this.prisma.user.update({
          where: { id: existingUser.id },
          data: { 
            role: UserRoleEnum.ADMIN,
            systemLanguage,
            regionalLanguage,
            customDestinationLanguage
          }
        });
        
      } else {

        // Créer l'utilisateur via l'API de création de compte
        const userData = {
          username,
          password,
          firstName,
          lastName,
          email,
          systemLanguage,
          regionalLanguage,
          customDestinationLanguage
        };

        const result = await this.authService.register(userData);

        if (!result || !result.user) {
          throw new Error('Échec de la création de l\'utilisateur Admin');
        }

        // Mettre à jour le rôle vers ADMIN (fixe)
        await this.prisma.user.update({
          where: { id: result.user.id },
          data: { role: UserRoleEnum.ADMIN }
        });
      }

      // Ajouter l'utilisateur à la conversation globale meeshy
      const userId = existingUser ? existingUser.id : (await this.prisma.user.findFirst({ where: { username } }))!.id;
      await this.addUserToMeeshyConversation(userId, username);

    } catch (error) {
      console.error(`[INIT] ❌ Erreur lors de la configuration de l'utilisateur Admin "${username}":`, error);
      throw error;
    }
  }

  /**
   * Réinitialise complètement la base de données
   */
  private async resetDatabase(): Promise<void> {
    
    try {
      // Utiliser $runCommandRaw pour drop les collections directement
      // Ceci évite les problèmes de contraintes de clés étrangères avec les auto-relations
      const collections = [
        'MessageTranslation',
        'MessageStatus',
        'Message',
        'ConversationMember',
        'Conversation',
        'User'
      ];
      
      for (const collection of collections) {
        try {
          await this.prisma.$runCommandRaw({
            drop: collection
          });
        } catch (error: any) {
          // Ignorer l'erreur si la collection n'existe pas (code 26)
          if (error.code !== 26 && error.code !== 'P2010') {
          }
        }
      }
      
    } catch (error) {
      console.error('[INIT] ❌ Erreur lors de la réinitialisation de la base de données:', error);
      throw error;
    }
  }

  /**
   * Crée l'utilisateur André Tabeth - Entièrement configurable
   * Default: ADMIN role with English as primary language
   */
  private async createAndreTabethUser(): Promise<void> {
    // Utilisateur entièrement configurable - Default: ADMIN with English
    const username = process.env.ATABETH_USERNAME || 'atabeth';
    const password = process.env.ATABETH_PASSWORD || 'admin123';
    const firstName = process.env.ATABETH_FIRST_NAME || 'André';
    const lastName = process.env.ATABETH_LAST_NAME || 'Tabeth';
    const email = process.env.ATABETH_EMAIL || 'atabeth@meeshy.me';
    const role = process.env.ATABETH_ROLE || 'ADMIN';  // Default: ADMIN (can manage translations)
    const systemLanguage = process.env.ATABETH_SYSTEM_LANGUAGE || 'en';  // Default: English
    const regionalLanguage = process.env.ATABETH_REGIONAL_LANGUAGE || 'fr';  // Default: French
    const customDestinationLanguage = process.env.ATABETH_CUSTOM_DESTINATION_LANGUAGE || 'es';  // Default: Spanish


    try {
      const existingUser = await this.prisma.user.findFirst({
        where: { username }
      });

      if (existingUser) {
        return;
      }


      // Créer l'utilisateur via l'API de création de compte
      const userData = {
        username,
        password,
        firstName,
        lastName,
        email,
        systemLanguage,
        regionalLanguage,
        customDestinationLanguage
      };

      const result = await this.authService.register(userData);

      if (!result || !result.user) {
        throw new Error('Échec de la création de l\'utilisateur André Tabeth');
      }

      const user = result.user;

      // Mettre à jour le rôle vers la valeur configurée
      await this.prisma.user.update({
        where: { id: user.id },
        data: { role: role as any }
      });

      // Ajouter l'utilisateur à la conversation globale meeshy
      await this.addUserToMeeshyConversation(user.id, username);

    } catch (error) {
      console.error(`[INIT] ❌ Erreur lors de la création de l'utilisateur André Tabeth "${username}":`, error);
      throw error;
    }
  }

  /**
   * Ajoute un utilisateur à la conversation globale meeshy
   */
  private async addUserToMeeshyConversation(userId: string, username: string): Promise<void> {
    try {
      // Récupérer l'ID de la conversation globale
      const globalConversation = await this.prisma.conversation.findFirst({
        where: { identifier: 'meeshy' }
      });

      if (!globalConversation) {
        return;
      }

      // Vérifier si l'utilisateur est déjà membre de la conversation
      const existingMember = await this.prisma.conversationMember.findFirst({
        where: {
          conversationId: globalConversation.id,
          userId: userId
        }
      });

      if (!existingMember) {
        // Déterminer le rôle selon l'utilisateur
        const role = username === 'meeshy' ? 'CREATOR' : 
                    username === 'admin' ? 'ADMIN' : 'MEMBER';
        
        // Ajouter l'utilisateur comme membre de la conversation meeshy
        await this.prisma.conversationMember.create({
          data: {
            conversationId: globalConversation.id,
            userId: userId,
            role: role,
            joinedAt: new Date(),
            isActive: true
          }
        });
        
      } else {
      }
    } catch (error) {
      console.error(`[INIT] ❌ Erreur lors de l'ajout de l'utilisateur "${username}" à la conversation meeshy:`, error);
      throw error;
    }
  }

  /**
   * S'assure que tous les utilisateurs existants sont membres de la conversation meeshy
   */
  private async ensureAllUsersInMeeshyConversation(): Promise<void> {

    try {
      // Récupérer tous les utilisateurs actifs
      const users = await this.prisma.user.findMany({
        where: { isActive: true }
      });

      for (const user of users) {
        await this.addUserToMeeshyConversation(user.id, user.username);
      }

    } catch (error) {
      console.error('[INIT] ❌ Erreur lors de la vérification des membres de la conversation meeshy:', error);
      throw error;
    }
  }

  /**
   * Crée les conversations supplémentaires (directe et de groupe)
   */
  private async createAdditionalConversations(): Promise<void> {

    try {
      // Récupérer les utilisateurs
      const adminUser = await this.prisma.user.findFirst({ where: { username: 'admin' } });
      const atabethUser = await this.prisma.user.findFirst({ where: { username: 'atabeth' } });
      const meeshyUser = await this.prisma.user.findFirst({ where: { username: 'meeshy' } });

      if (!adminUser || !atabethUser || !meeshyUser) {
        return;
      }

      // 1. Créer la conversation directe entre atabeth et admin
      await this.createDirectConversation(atabethUser.id, adminUser.id);

      // 2. Créer la conversation de groupe entre atabeth, admin et meeshy
      await this.createGroupConversation([atabethUser.id, adminUser.id, meeshyUser.id]);

    } catch (error) {
      console.error('[INIT] ❌ Erreur lors de la création des conversations supplémentaires:', error);
      throw error;
    }
  }

  /**
   * Crée une conversation directe entre deux utilisateurs
   */
  private async createDirectConversation(userId1: string, userId2: string): Promise<void> {

    try {
      // Générer un identifiant unique pour la conversation directe
      const identifier = `mshy_${userId1}_${userId2}`;
      
      // Vérifier si la conversation existe déjà
      const existingConversation = await this.prisma.conversation.findFirst({
        where: { identifier }
      });

      if (existingConversation) {
        this.directConversationId = existingConversation.id;
        return;
      }

      // Créer la conversation directe
      const conversation = await this.prisma.conversation.create({
        data: {
          identifier,
          title: 'Conversation directe',
          description: 'Conversation privée entre utilisateurs',
          type: 'direct',
          isActive: true,
          createdAt: new Date()
        }
      });

      this.directConversationId = conversation.id;

      // Ajouter les deux utilisateurs comme membres
      await this.prisma.conversationMember.createMany({
        data: [
          {
            conversationId: conversation.id,
            userId: userId1,
            role: 'ADMIN',
            joinedAt: new Date(),
            isActive: true
          },
          {
            conversationId: conversation.id,
            userId: userId2,
            role: 'ADMIN',
            joinedAt: new Date(),
            isActive: true
          }
        ]
      });

    } catch (error) {
      console.error('[INIT] ❌ Erreur lors de la création de la conversation directe:', error);
      throw error;
    }
  }

  /**
   * Crée une conversation de groupe entre plusieurs utilisateurs
   */
  private async createGroupConversation(userIds: string[]): Promise<void> {

    try {
      // Générer un identifiant unique pour la conversation de groupe
      const identifier = `mshy_meeshy-infrastructure-team-one`;
      
      // Vérifier si la conversation existe déjà
      const existingConversation = await this.prisma.conversation.findFirst({
        where: { identifier }
      });

      if (existingConversation) {
        this.groupConversationId = existingConversation.id;
        return;
      }

      // Créer la conversation de groupe
      const conversation = await this.prisma.conversation.create({
        data: {
          identifier,
          title: 'Meeshy Infrastructure Team One',
          description: 'The initial group of the Meeshy Infrastructure Team',
          type: 'group',
          isActive: true,
          createdAt: new Date()
        }
      });

      this.groupConversationId = conversation.id;

      // Ajouter tous les utilisateurs comme membres
      const membersData = userIds.map((userId, index) => ({
        conversationId: conversation.id,
        userId,
        role: index === 0 ? 'CREATOR' : 'ADMIN', // Premier utilisateur = admin
        joinedAt: new Date(),
        isActive: true
      }));

      await this.prisma.conversationMember.createMany({
        data: membersData
      });

    } catch (error) {
      console.error('[INIT] ❌ Erreur lors de la création de la conversation de groupe:', error);
      throw error;
    }
  }

  /**
   * Vérifie si l'initialisation est nécessaire
   */
  async shouldInitialize(): Promise<boolean> {
    const forceReset = process.env.FORCE_DB_RESET === 'true';
    const isProduction = process.env.NODE_ENV === 'production';
    
    // GARDE-FOU CRITIQUE: Bloquer FORCE_DB_RESET=true en production
    if (forceReset && isProduction) {
      console.error('[INIT] 🚨 FORCE_DB_RESET=true détecté en PRODUCTION - BLOQUÉ pour protection des données');
      return false;
    }
    
    if (forceReset) {
      return true;
    }

    try {
      // Vérifier si la conversation globale existe
      const globalConversation = await this.prisma.conversation.findFirst({
        where: { identifier: 'meeshy' }
      });

      // Vérifier si les utilisateurs par défaut existent
      const bigbossUser = await this.prisma.user.findFirst({
        where: { username: 'meeshy' }
      });

      const adminUser = await this.prisma.user.findFirst({
        where: { username: 'admin' }
      });

      const atabethUser = await this.prisma.user.findFirst({
        where: { username: 'atabeth' }
      });

      // Vérifier si les utilisateurs sont membres de la conversation
      let bigbossMember = null;
      let adminMember = null;

      if (globalConversation && bigbossUser) {
        bigbossMember = await this.prisma.conversationMember.findFirst({
          where: {
            conversationId: globalConversation.id,
            userId: bigbossUser.id
          }
        });
      }

      if (globalConversation && adminUser) {
        adminMember = await this.prisma.conversationMember.findFirst({
          where: {
            conversationId: globalConversation.id,
            userId: adminUser.id
          }
        });
      }

      // Si la conversation globale, les utilisateurs ou leurs appartenances n'existent pas, initialisation nécessaire
      const needsInit = !globalConversation || !bigbossUser || !adminUser || !atabethUser || !bigbossMember || !adminMember;
      
      if (needsInit) {
      } else {
      }
      
      return needsInit;
    } catch (error) {
      console.error('[INIT] ❌ Erreur lors de la vérification de l\'initialisation:', error);
      // En cas d'erreur, on considère qu'une initialisation est nécessaire
      return true;
    }
  }
}
