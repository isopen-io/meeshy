import { PrismaClient } from '@meeshy/shared/prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { SocketIOUser, UserRoleEnum } from '@meeshy/shared/types';
import { normalizeEmail, normalizeUsername, capitalizeName, normalizeDisplayName, normalizePhoneNumber } from '../utils/normalize';
import { emailSchema } from '@meeshy/shared/types/validation';

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface RegisterData {
  username: string;
  password: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber?: string;
  systemLanguage?: string;
  regionalLanguage?: string;
}

export interface TokenPayload {
  userId: string;
  username: string;
  role: string;
}

export class AuthService {
  private prisma: PrismaClient;
  private jwtSecret: string;

  constructor(prisma: PrismaClient, jwtSecret: string) {
    this.prisma = prisma;
    this.jwtSecret = jwtSecret;
  }

  /**
   * Authentifier un utilisateur avec username/password
   */
  async authenticate(credentials: LoginCredentials): Promise<SocketIOUser | null> {
    try {
      // Normaliser l'identifiant selon son type
      const normalizedIdentifier = credentials.username.trim().toLowerCase();
      // Normaliser le téléphone au format E.164 si c'est un numéro
      const normalizedPhone = normalizePhoneNumber(credentials.username);

      console.log('[AUTH_SERVICE] Recherche utilisateur avec identifiant:', normalizedIdentifier);
      if (normalizedPhone && normalizedPhone !== credentials.username) {
        console.log('[AUTH_SERVICE] Téléphone normalisé:', normalizedPhone);
      }

      // Rechercher l'utilisateur par username, email ou téléphone
      // Pour le téléphone, on cherche avec le format normalisé E.164
      const user = await this.prisma.user.findFirst({
        where: {
          OR: [
            { username: { equals: normalizedIdentifier, mode: 'insensitive' } },
            { email: { equals: normalizedIdentifier, mode: 'insensitive' } },
            { phoneNumber: normalizedPhone }
          ],
          isActive: true
        }
      });

      if (!user) {
        console.warn('[AUTH_SERVICE] ❌ Aucun utilisateur trouvé pour:', normalizedIdentifier);
        return null;
      }

      console.log('[AUTH_SERVICE] Utilisateur trouvé:', user.username, '- Vérification du mot de passe...');

      // Vérifier le mot de passe
      const passwordValid = await bcrypt.compare(credentials.password, user.password);
      if (!passwordValid) {
        console.warn('[AUTH_SERVICE] ❌ Mot de passe invalide pour:', user.username);
        return null;
      }

      console.log('[AUTH_SERVICE] ✅ Mot de passe valide pour:', user.username);

      // Mettre à jour la dernière connexion
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          isOnline: true,
          lastSeen: new Date(),
          lastActiveAt: new Date()
        }
      });

      // Convertir en SocketIOUser
      return this.userToSocketIOUser(user);

    } catch (error) {
      console.error('[AUTH_SERVICE] ❌ Erreur dans authenticate:', error);
      if (error instanceof Error) {
        console.error('[AUTH_SERVICE] Détails:', error.message, error.stack);
      }
      return null;
    }
  }

  /**
   * Créer un nouveau utilisateur
   */
  async register(data: RegisterData): Promise<SocketIOUser | null> {
    try {
      // Valider l'email avec Zod AVANT toute opération
      try {
        emailSchema.parse(data.email);
      } catch (zodError: any) {
        const errorMessage = zodError.issues?.[0]?.message || 'Format d\'email invalide';
        throw new Error(`Email invalide: ${errorMessage}`);
      }

      // Normaliser les données utilisateur
      const normalizedEmail = normalizeEmail(data.email);
      const normalizedUsername = normalizeUsername(data.username);
      const normalizedFirstName = capitalizeName(data.firstName);
      const normalizedLastName = capitalizeName(data.lastName);
      const normalizedDisplayName = normalizeDisplayName(`${normalizedFirstName} ${normalizedLastName}`);

      // Normaliser le phoneNumber au format E.164 (traiter les chaînes vides comme null)
      const cleanPhoneNumber = data.phoneNumber && data.phoneNumber.trim() !== ''
        ? normalizePhoneNumber(data.phoneNumber)
        : null;

      // Vérifier si l'username, l'email ou le phoneNumber existe déjà (comparaison case-insensitive pour username et email)
      const existingUser = await this.prisma.user.findFirst({
        where: {
          OR: [
            { username: { equals: normalizedUsername, mode: 'insensitive' } },
            { email: { equals: normalizedEmail, mode: 'insensitive' } },
            ...(cleanPhoneNumber ? [{ phoneNumber: cleanPhoneNumber }] : [])
          ]
        }
      });

      if (existingUser) {
        if (existingUser.username.toLowerCase() === normalizedUsername.toLowerCase()) {
          throw new Error('Nom d\'utilisateur déjà utilisé');
        }
        if (existingUser.email.toLowerCase() === normalizedEmail.toLowerCase()) {
          throw new Error('Email déjà utilisé');
        }
        if (cleanPhoneNumber && existingUser.phoneNumber === cleanPhoneNumber) {
          throw new Error('Numéro de téléphone déjà utilisé');
        }
        throw new Error('Utilisateur déjà existant');
      }

      // Hasher le mot de passe (bcrypt cost=12 for enhanced security)
      const BCRYPT_COST = 12;
      const hashedPassword = await bcrypt.hash(data.password, BCRYPT_COST);

      // Créer l'utilisateur avec les données normalisées
      const user = await this.prisma.user.create({
        data: {
          username: normalizedUsername,
          password: hashedPassword,
          firstName: normalizedFirstName,
          lastName: normalizedLastName,
          email: normalizedEmail,
          phoneNumber: cleanPhoneNumber,
          systemLanguage: data.systemLanguage || 'fr',
          regionalLanguage: data.regionalLanguage || 'fr',
          displayName: normalizedDisplayName,
          isOnline: true,
          lastSeen: new Date(),
          lastActiveAt: new Date()
        }
      });

      // Ajouter automatiquement l'utilisateur à la conversation globale "meeshy"
      try {
        const globalConversation = await this.prisma.conversation.findFirst({
          where: { identifier: 'meeshy' }
        });

        if (globalConversation) {
          // Vérifier si l'utilisateur n'est pas déjà membre
          const existingMember = await this.prisma.conversationMember.findFirst({
            where: {
              conversationId: globalConversation.id,
              userId: user.id
            }
          });

          if (!existingMember) {
            await this.prisma.conversationMember.create({
              data: {
                conversationId: globalConversation.id,
                userId: user.id,
                role: 'MEMBER',
                canSendMessage: true,
                canSendFiles: true,
                canSendImages: true,
                canSendVideos: true,
                canSendAudios: true,
                canSendLocations: true,
                canSendLinks: true,
                joinedAt: new Date(),
                isActive: true
              }
            });
          }
        } else {
          console.warn('[AUTH] ⚠️ Conversation globale "meeshy" non trouvée - impossible d\'ajouter l\'utilisateur');
        }
      } catch (error) {
        console.error('[AUTH] ❌ Erreur lors de l\'ajout à la conversation globale:', error);
        // Ne pas faire échouer l'inscription si l'ajout à la conversation échoue
      }

      return this.userToSocketIOUser(user);

    } catch (error) {
      console.error('Error in register:', error);
      return null;
    }
  }

  /**
   * Récupérer un utilisateur par ID
   */
  async getUserById(userId: string): Promise<SocketIOUser | null> {
    try {
      const user = await this.prisma.user.findUnique({
        where: {
          id: userId,
          isActive: true
        }
      });

      if (!user) {
        return null;
      }

      return this.userToSocketIOUser(user);

    } catch (error) {
      console.error('Error in getUserById:', error);
      return null;
    }
  }

  /**
   * Générer un token JWT
   */
  generateToken(user: SocketIOUser): string {
    const payload: TokenPayload = {
      userId: user.id,
      username: user.username,
      role: user.role
    };

    return jwt.sign(payload, this.jwtSecret, {
      expiresIn: '24h'
    });
  }

  /**
   * Vérifier un token JWT
   */
  verifyToken(token: string): TokenPayload | null {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as TokenPayload;
      return decoded;
    } catch (error) {
      console.error('Error verifying token:', error);
      return null;
    }
  }

  /**
   * Mettre à jour le statut en ligne d'un utilisateur
   */
  async updateOnlineStatus(userId: string, isOnline: boolean): Promise<void> {
    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          isOnline,
          lastSeen: new Date(),
          lastActiveAt: isOnline ? new Date() : undefined
        }
      });
    } catch (error) {
      console.error('Error updating online status:', error);
    }
  }

  /**
   * Récupérer les permissions d'un utilisateur
   */
  getUserPermissions(user: SocketIOUser) {
    const role = user.role.toUpperCase() as keyof typeof UserRoleEnum;
    
    // Permissions basées sur le rôle
    const basePermissions = {
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

    switch (role) {
      case UserRoleEnum.BIGBOSS:
        return {
          ...basePermissions,
          canAccessAdmin: true,
          canManageUsers: true,
          canManageGroups: true,
          canManageConversations: true,
          canViewAnalytics: true,
          canModerateContent: true,
          canViewAuditLogs: true,
          canManageNotifications: true,
          canManageTranslations: true,
        };

      case UserRoleEnum.ADMIN:
        return {
          ...basePermissions,
          canAccessAdmin: true,
          canManageUsers: true,
          canManageGroups: true,
          canManageConversations: true,
          canViewAnalytics: true,
          canModerateContent: true,
          canManageNotifications: true,
        };

      case UserRoleEnum.CREATOR:
        return {
          ...basePermissions,
          canAccessAdmin: true,
          canManageUsers: true,
          canManageGroups: true,
          canManageConversations: true,
          canViewAnalytics: true,
          canModerateContent: true,
          canViewAuditLogs: true,
          canManageNotifications: true,
        };

      case UserRoleEnum.MODERATOR:
        return {
          ...basePermissions,
          canAccessAdmin: true,
          canModerateContent: true,
          canManageConversations: true,
        };

      case UserRoleEnum.AUDIT:
        return {
          ...basePermissions,
          canAccessAdmin: true,
          canViewAuditLogs: true,
          canViewAnalytics: true,
        };

      case UserRoleEnum.ANALYST:
        return {
          ...basePermissions,
          canAccessAdmin: true,
          canViewAnalytics: true,
        };

      default:
        return basePermissions;
    }
  }

  /**
   * Convertir un User Prisma en SocketIOUser
   */
  private userToSocketIOUser(user: any): SocketIOUser {
    return {
      id: user.id,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phoneNumber: user.phoneNumber,
      displayName: user.displayName || `${user.firstName} ${user.lastName}`,
      avatar: user.avatar,
      role: user.role,
      permissions: this.getUserPermissions({
        ...user,
        role: user.role
      } as SocketIOUser),
      isOnline: user.isOnline,
      lastSeen: user.lastSeen,
      lastActiveAt: user.lastActiveAt,
      systemLanguage: user.systemLanguage,
      regionalLanguage: user.regionalLanguage,
      customDestinationLanguage: user.customDestinationLanguage,
      autoTranslateEnabled: user.autoTranslateEnabled,
      translateToSystemLanguage: user.translateToSystemLanguage,
      translateToRegionalLanguage: user.translateToRegionalLanguage,
      useCustomDestination: user.useCustomDestination,
      isActive: user.isActive,
      deactivatedAt: user.deactivatedAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };
  }
}
