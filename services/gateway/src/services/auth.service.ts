import { PrismaClient } from '@meeshy/shared/prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { SocketIOUser, UserRoleEnum } from '@meeshy/shared/types';
import { normalizeEmail, normalizeUsername, capitalizeName, normalizeDisplayName, normalizePhoneNumber } from '../utils/normalize';
import { emailSchema } from '@meeshy/shared/types/validation';
import { EmailService } from './EmailService';

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
  private emailService: EmailService;
  private frontendUrl: string;

  constructor(prisma: PrismaClient, jwtSecret: string) {
    this.prisma = prisma;
    this.jwtSecret = jwtSecret;
    this.emailService = new EmailService();
    this.frontendUrl = process.env.NEXT_PUBLIC_FRONTEND_URL || process.env.FRONTEND_URL || 'http://localhost:3100';
  }

  /**
   * Generate a secure random token and return both raw and hashed versions
   */
  private generateVerificationToken(): { raw: string; hash: string } {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
    return { raw: rawToken, hash: hashedToken };
  }

  /**
   * Hash a token for comparison
   */
  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
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

      // Check email verification status
      // If not verified, resend verification email
      if (!user.emailVerifiedAt) {
        console.log('[AUTH_SERVICE] ⚠️ Email non vérifié pour:', user.email);
        try {
          await this.resendVerificationEmail(user.email);
        } catch (emailError) {
          console.error('[AUTH_SERVICE] ⚠️ Échec du renvoi de l\'email de vérification:', emailError);
        }
      }

      // Convertir en SocketIOUser (with emailVerifiedAt included)
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

      // Generate email verification token (24h expiry)
      const { raw: verificationToken, hash: verificationTokenHash } = this.generateVerificationToken();
      const tokenExpiryHours = parseInt(process.env.EMAIL_VERIFICATION_TOKEN_EXPIRY || '86400') / 3600; // Default 24h
      const verificationExpiry = new Date(Date.now() + tokenExpiryHours * 60 * 60 * 1000);

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
          lastActiveAt: new Date(),
          // Email verification fields
          emailVerificationToken: verificationTokenHash,
          emailVerificationExpiry: verificationExpiry
        }
      });

      // Send email verification email
      try {
        const verificationLink = `${this.frontendUrl}/auth/verify-email?token=${verificationToken}&email=${encodeURIComponent(normalizedEmail)}`;
        await this.emailService.sendEmailVerification({
          to: normalizedEmail,
          name: normalizedDisplayName,
          verificationLink,
          expiryHours: tokenExpiryHours
        });
        console.log('[AUTH_SERVICE] ✅ Email de vérification envoyé à:', normalizedEmail);
      } catch (emailError) {
        console.error('[AUTH_SERVICE] ⚠️ Échec de l\'envoi de l\'email de vérification:', emailError);
        // Don't fail registration if email fails - user can request a new one
      }

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
   * Verify email with token
   */
  async verifyEmail(token: string, email: string): Promise<{ success: boolean; error?: string }> {
    try {
      const hashedToken = this.hashToken(token);
      const normalizedEmail = email.trim().toLowerCase();

      // Find user with matching token and email
      const user = await this.prisma.user.findFirst({
        where: {
          email: { equals: normalizedEmail, mode: 'insensitive' },
          emailVerificationToken: hashedToken,
          emailVerificationExpiry: { gt: new Date() }
        }
      });

      if (!user) {
        // Check if token expired
        const expiredUser = await this.prisma.user.findFirst({
          where: {
            email: { equals: normalizedEmail, mode: 'insensitive' },
            emailVerificationToken: hashedToken
          }
        });

        if (expiredUser) {
          return { success: false, error: 'Le lien de vérification a expiré. Veuillez en demander un nouveau.' };
        }
        return { success: false, error: 'Lien de vérification invalide.' };
      }

      // Already verified?
      if (user.emailVerifiedAt) {
        return { success: true }; // Already verified, return success
      }

      // Update user as verified
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          emailVerifiedAt: new Date(),
          emailVerificationToken: null,
          emailVerificationExpiry: null
        }
      });

      console.log('[AUTH_SERVICE] ✅ Email vérifié pour:', user.email);
      return { success: true };

    } catch (error) {
      console.error('[AUTH_SERVICE] ❌ Erreur lors de la vérification email:', error);
      return { success: false, error: 'Erreur lors de la vérification.' };
    }
  }

  /**
   * Resend email verification
   */
  async resendVerificationEmail(email: string): Promise<{ success: boolean; error?: string }> {
    try {
      const normalizedEmail = email.trim().toLowerCase();

      // Find user by email
      const user = await this.prisma.user.findFirst({
        where: {
          email: { equals: normalizedEmail, mode: 'insensitive' },
          isActive: true
        }
      });

      if (!user) {
        // Don't reveal if user exists
        return { success: true };
      }

      // Already verified?
      if (user.emailVerifiedAt) {
        return { success: false, error: 'Cette adresse email est déjà vérifiée.' };
      }

      // Generate new token
      const { raw: verificationToken, hash: verificationTokenHash } = this.generateVerificationToken();
      const tokenExpiryHours = parseInt(process.env.EMAIL_VERIFICATION_TOKEN_EXPIRY || '86400') / 3600;
      const verificationExpiry = new Date(Date.now() + tokenExpiryHours * 60 * 60 * 1000);

      // Update user with new token
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          emailVerificationToken: verificationTokenHash,
          emailVerificationExpiry: verificationExpiry
        }
      });

      // Send email
      const verificationLink = `${this.frontendUrl}/auth/verify-email?token=${verificationToken}&email=${encodeURIComponent(normalizedEmail)}`;
      await this.emailService.sendEmailVerification({
        to: normalizedEmail,
        name: user.displayName || `${user.firstName} ${user.lastName}`,
        verificationLink,
        expiryHours: tokenExpiryHours
      });

      console.log('[AUTH_SERVICE] ✅ Email de vérification renvoyé à:', normalizedEmail);
      return { success: true };

    } catch (error) {
      console.error('[AUTH_SERVICE] ❌ Erreur lors du renvoi de l\'email:', error);
      return { success: false, error: 'Erreur lors de l\'envoi de l\'email.' };
    }
  }

  /**
   * Check if user email is verified
   */
  async isEmailVerified(userId: string): Promise<boolean> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { emailVerifiedAt: true }
      });
      return !!user?.emailVerifiedAt;
    } catch (error) {
      console.error('[AUTH_SERVICE] Error checking email verification:', error);
      return false;
    }
  }

  /**
   * Generate a 6-digit verification code
   */
  private generatePhoneCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Send phone verification code via SMS
   * NOTE: This is a placeholder - integrate Twilio/Vonage for production
   */
  async sendPhoneVerificationCode(phoneNumber: string): Promise<{ success: boolean; error?: string }> {
    try {
      const cleanPhone = phoneNumber.replace(/\s+/g, '').trim();

      // Find user by phone number
      const user = await this.prisma.user.findFirst({
        where: {
          phoneNumber: { contains: cleanPhone.replace(/^\+/, ''), mode: 'insensitive' },
          isActive: true
        }
      });

      if (!user) {
        // Don't reveal if phone exists - but we need a user for verification
        console.warn('[AUTH_SERVICE] ⚠️ Numéro non trouvé:', cleanPhone);
        return { success: false, error: 'Numéro de téléphone non associé à un compte.' };
      }

      // Already verified?
      if (user.phoneVerifiedAt) {
        return { success: false, error: 'Ce numéro est déjà vérifié.' };
      }

      // Generate 6-digit code
      const code = this.generatePhoneCode();
      const hashedCode = this.hashToken(code);
      const codeExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      // Update user with code
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          phoneVerificationCode: hashedCode,
          phoneVerificationExpiry: codeExpiry
        }
      });

      // TODO: Integrate SMS provider (Twilio, Vonage, etc.)
      // For now, log the code in development
      console.log('[AUTH_SERVICE] 📱 Code SMS pour', cleanPhone, ':', code);
      console.log('[AUTH_SERVICE] ⚠️ SMS provider not configured - code logged for development');

      // Placeholder for SMS integration:
      // await this.smsService.send({
      //   to: cleanPhone,
      //   message: `Votre code de vérification Meeshy est: ${code}. Il expire dans 10 minutes.`
      // });

      return { success: true };

    } catch (error) {
      console.error('[AUTH_SERVICE] ❌ Erreur envoi code SMS:', error);
      return { success: false, error: 'Erreur lors de l\'envoi du code.' };
    }
  }

  /**
   * Verify phone with SMS code
   */
  async verifyPhone(phoneNumber: string, code: string): Promise<{ success: boolean; error?: string }> {
    try {
      const cleanPhone = phoneNumber.replace(/\s+/g, '').trim();
      const hashedCode = this.hashToken(code);

      // Find user with matching phone and code
      const user = await this.prisma.user.findFirst({
        where: {
          phoneNumber: { contains: cleanPhone.replace(/^\+/, ''), mode: 'insensitive' },
          phoneVerificationCode: hashedCode,
          phoneVerificationExpiry: { gt: new Date() }
        }
      });

      if (!user) {
        // Check if code expired
        const expiredUser = await this.prisma.user.findFirst({
          where: {
            phoneNumber: { contains: cleanPhone.replace(/^\+/, ''), mode: 'insensitive' },
            phoneVerificationCode: hashedCode
          }
        });

        if (expiredUser) {
          return { success: false, error: 'Le code a expiré. Veuillez en demander un nouveau.' };
        }
        return { success: false, error: 'Code invalide.' };
      }

      // Already verified?
      if (user.phoneVerifiedAt) {
        return { success: true }; // Already verified
      }

      // Update user as phone verified
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          phoneVerifiedAt: new Date(),
          phoneVerificationCode: null,
          phoneVerificationExpiry: null
        }
      });

      console.log('[AUTH_SERVICE] ✅ Téléphone vérifié pour:', user.phoneNumber);
      return { success: true };

    } catch (error) {
      console.error('[AUTH_SERVICE] ❌ Erreur vérification téléphone:', error);
      return { success: false, error: 'Erreur lors de la vérification.' };
    }
  }

  /**
   * Check if user phone is verified
   */
  async isPhoneVerified(userId: string): Promise<boolean> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { phoneVerifiedAt: true }
      });
      return !!user?.phoneVerifiedAt;
    } catch (error) {
      console.error('[AUTH_SERVICE] Error checking phone verification:', error);
      return false;
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
