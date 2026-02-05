import { PrismaClient } from '@meeshy/shared/prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { SocketIOUser, UserRoleEnum } from '@meeshy/shared/types';
import { normalizeEmail, normalizeUsername, capitalizeName, normalizeDisplayName, normalizePhoneWithCountry, normalizePhoneNumber } from '../utils/normalize';
import { RequestContext } from './GeoIPService';
import { emailSchema } from '@meeshy/shared/types/validation';
import { EmailService } from './EmailService';
import { smsService } from './SmsService';
import {
  createSession,
  generateSessionToken,
  validateSession,
  getUserSessions,
  invalidateSession,
  invalidateAllSessions,
  logout as logoutSession,
  initSessionService,
  SessionData
} from './SessionService';
import { maskEmail, maskUsername, maskDisplayName } from './PhonePasswordResetService';
import { enhancedLogger } from '../utils/logger-enhanced';

// Logger dédié pour AuthService
const logger = enhancedLogger.child({ module: 'AuthService' });


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
  phoneCountryCode?: string; // ISO 3166-1 alpha-2 (e.g., "FR", "US")
  systemLanguage?: string;
  regionalLanguage?: string;
  phoneTransferToken?: string; // Token proving SMS verification for phone transfer
  skipPhoneConflictCheck?: boolean; // Set to true when transfer token is validated
}

export interface TokenPayload {
  userId: string;
  username: string;
  role: string;
}

export interface AuthResult {
  user: SocketIOUser;
  sessionToken: string;
  session: SessionData;
  requires2FA?: boolean; // True if 2FA verification is needed
  twoFactorToken?: string; // Temporary token for 2FA flow
}

/**
 * Result of user registration
 * If phoneOwnershipConflict is true, the account was NOT created.
 * The user must choose: login, continue without phone, or transfer.
 */
export interface RegisterResult {
  user?: SocketIOUser; // undefined if phoneOwnershipConflict
  phoneOwnershipConflict?: boolean; // True if phone belongs to another account (account NOT created)
  phoneOwnerInfo?: {
    maskedDisplayName: string;
    maskedUsername: string;
    maskedEmail: string;
    avatarUrl?: string;
    phoneNumber: string;
    phoneCountryCode: string;
  };
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

    // Initialize SessionService with the same prisma client
    initSessionService(prisma);
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
   * @param credentials - Username/email/phone et password
   * @param requestContext - Contexte de la requête (IP, user agent, géolocalisation)
   * @returns AuthResult avec user, sessionToken et session data, ou null si échec
   */
  async authenticate(credentials: LoginCredentials, requestContext?: RequestContext): Promise<AuthResult | null> {
    try {
      // Normaliser l'identifiant selon son type
      const normalizedIdentifier = credentials.username.trim().toLowerCase();
      // Normaliser le téléphone au format E.164 si c'est un numéro
      const normalizedPhone = normalizePhoneNumber(credentials.username);

      logger.info(`[AUTH_SERVICE] Recherche utilisateur avec identifiant normalizedIdentifier=${normalizedIdentifier}`);
      if (normalizedPhone && normalizedPhone !== credentials.username) {
        logger.info(`[AUTH_SERVICE] Téléphone normalisé normalizedPhone=${normalizedPhone}`);
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
        },
        select: {
          id: true,
          username: true,
          password: true,
          email: true,
          phoneNumber: true,
          firstName: true,
          lastName: true,
          displayName: true,
          avatar: true,
          bio: true,
          systemLanguage: true,
          regionalLanguage: true,
          customDestinationLanguage: true,
          role: true,
          isActive: true,
          isOnline: true,
          lastActiveAt: true,
          twoFactorEnabledAt: true,
          twoFactorSecret: true,
          twoFactorBackupCodes: true,
          lastLoginIp: true,
          lastLoginLocation: true,
          lastLoginDevice: true,
          timezone: true,
          emailVerifiedAt: true,
          phoneVerifiedAt: true,
          createdAt: true,
          updatedAt: true
        }
      });

      if (!user) {
        logger.warn(`[AUTH_SERVICE] ❌ Aucun utilisateur trouvé pour normalizedIdentifier=${normalizedIdentifier}`);
        return null;
      }


      // Vérifier le mot de passe
      const passwordValid = await bcrypt.compare(credentials.password, user.password);
      if (!passwordValid) {
        logger.warn(`[AUTH_SERVICE] ❌ Mot de passe invalide pour user.username=${user.username}`);
        return null;
      }

      logger.info(`[AUTH_SERVICE] ✅ Mot de passe valide pour user.username=${user.username}`);

      // Check if 2FA is enabled
      if (user.twoFactorEnabledAt) {

        // Generate a temporary token for 2FA verification
        const twoFactorToken = crypto.randomBytes(32).toString('hex');
        const twoFactorTokenHash = crypto.createHash('sha256').update(twoFactorToken).digest('hex');

        // Store the temporary token (expires in 5 minutes)
        await this.prisma.user.update({
          where: { id: user.id },
          data: {
            // Store hash of the token for security
            phoneVerificationCode: twoFactorTokenHash, // Reusing this field temporarily
            phoneVerificationExpiry: new Date(Date.now() + 5 * 60 * 1000) // 5 minutes
          }
        });

        // Return partial auth result requiring 2FA
        const socketIOUser = this.userToSocketIOUser(user);
        return {
          user: socketIOUser,
          sessionToken: '', // No session token until 2FA verified
          session: {
            id: '',
            userId: user.id,
            deviceType: requestContext?.deviceInfo?.type || 'desktop',
            browserName: requestContext?.deviceInfo?.browser || null,
            osName: requestContext?.deviceInfo?.os || null,
            location: requestContext?.geoData?.location || null,
            isMobile: requestContext?.deviceInfo?.type === 'mobile',
            createdAt: new Date(),
            lastActivityAt: new Date()
          } as SessionData,
          requires2FA: true,
          twoFactorToken // Return the raw token to the client
        };
      }

      // No 2FA - proceed with normal login
      // Mettre à jour la dernière connexion avec contexte
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          isOnline: true,
          lastActiveAt: new Date(),
          // Login tracking (updated on each login)
          lastLoginIp: requestContext?.ip || user.lastLoginIp,
          lastLoginLocation: requestContext?.geoData?.location || user.lastLoginLocation,
          lastLoginDevice: requestContext?.userAgent || user.lastLoginDevice,
          // Update timezone if detected and user hasn't set one
          ...(requestContext?.geoData?.timezone && !user.timezone ? { timezone: requestContext.geoData.timezone } : {})
        }
      });

      // Check email verification status
      // If not verified, resend verification email
      if (!user.emailVerifiedAt) {
        logger.info(`[AUTH_SERVICE] ⚠️ Email non vérifié pour user.email=${user.email}`);
        try {
          await this.resendVerificationEmail(user.email);
        } catch (emailError) {
          logger.error('[AUTH_SERVICE] ⚠️ Échec du renvoi de l\'email de vérification:', emailError);
        }
      }

      // Convertir en SocketIOUser (with emailVerifiedAt included)
      const socketIOUser = this.userToSocketIOUser(user);

      // Create session with device/geo info
      const sessionToken = generateSessionToken();
      const defaultContext: RequestContext = {
        ip: '127.0.0.1',
        userAgent: null,
        geoData: null,
        deviceInfo: null
      };

      const session = await createSession({
        userId: user.id,
        token: sessionToken,
        requestContext: requestContext || defaultContext
      });

      logger.info(`[AUTH_SERVICE] ✅ Session créée pour:', user.username, '- ID session.id=${session.id}`);

      return {
        user: socketIOUser,
        sessionToken,
        session,
        requires2FA: false
      };

    } catch (error) {
      logger.error('[AUTH_SERVICE] ❌ Erreur dans authenticate', error);
      if (error instanceof Error) {
        logger.error(`[AUTH_SERVICE] Détails`, error.message);
      }
      return null;
    }
  }

  /**
   * Complete authentication with 2FA code
   * Called after initial authenticate() returned requires2FA: true
   * @param twoFactorToken - The temporary token from initial auth
   * @param code - The 2FA code (TOTP or backup code)
   * @param requestContext - Request context for session creation
   */
  async completeAuthWith2FA(
    twoFactorToken: string,
    code: string,
    requestContext?: RequestContext
  ): Promise<AuthResult | { success: false; error: string }> {
    try {
      // Hash the token to compare with stored value
      const tokenHash = crypto.createHash('sha256').update(twoFactorToken).digest('hex');

      // Find user with matching token
      const user = await this.prisma.user.findFirst({
        where: {
          phoneVerificationCode: tokenHash,
          phoneVerificationExpiry: { gt: new Date() },
          isActive: true
        },
        select: {
          id: true,
          username: true,
          email: true,
          phoneNumber: true,
          firstName: true,
          lastName: true,
          displayName: true,
          avatar: true,
          bio: true,
          systemLanguage: true,
          regionalLanguage: true,
          customDestinationLanguage: true,
          role: true,
          isActive: true,
          twoFactorEnabledAt: true,
          twoFactorSecret: true,
          twoFactorBackupCodes: true,
          lastLoginIp: true,
          lastLoginLocation: true,
          lastLoginDevice: true,
          timezone: true,
          emailVerifiedAt: true,
          phoneVerifiedAt: true,
          createdAt: true,
          updatedAt: true
        }
      });

      if (!user) {
        logger.warn('[AUTH_SERVICE] ❌ Token 2FA invalide ou expiré');
        return { success: false, error: 'Token 2FA invalide ou expiré. Veuillez vous reconnecter.' };
      }

      // Verify 2FA code
      const cleanCode = code.replace(/-/g, '').toUpperCase();
      let isValid = false;
      let usedBackupCode = false;

      // Try TOTP code first (6 digits)
      if (/^\d{6}$/.test(cleanCode) && user.twoFactorSecret) {
        const speakeasy = await import('speakeasy');
        isValid = speakeasy.default.totp.verify({
          secret: user.twoFactorSecret,
          encoding: 'base32',
          token: cleanCode,
          window: 1
        });
      }

      // Try backup code if TOTP failed (8 alphanumeric chars)
      if (!isValid && /^[A-Z0-9]{8}$/.test(cleanCode)) {
        const backupCodeHash = crypto.createHash('sha256').update(cleanCode).digest('hex');
        const backupCodeIndex = user.twoFactorBackupCodes.indexOf(backupCodeHash);

        if (backupCodeIndex !== -1) {
          // Remove used backup code
          const updatedCodes = [...user.twoFactorBackupCodes];
          updatedCodes.splice(backupCodeIndex, 1);

          await this.prisma.user.update({
            where: { id: user.id },
            data: { twoFactorBackupCodes: updatedCodes }
          });

          isValid = true;
          usedBackupCode = true;
          logger.info(`[AUTH_SERVICE] 🔑 Code de secours utilisé pour:', user.username, '- Restants updatedCodes.length=${updatedCodes.length}`);
        }
      }

      if (!isValid) {
        logger.warn(`[AUTH_SERVICE] ❌ Code 2FA invalide pour user.username=${user.username}`);
        return { success: false, error: 'Code 2FA invalide' };
      }

      logger.info(`[AUTH_SERVICE] ✅ Code 2FA valide pour user.username=${user.username}`);

      // Clear the temporary token and complete login
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          phoneVerificationCode: null,
          phoneVerificationExpiry: null,
          isOnline: true,
          lastActiveAt: new Date(),
          lastLoginIp: requestContext?.ip || user.lastLoginIp,
          lastLoginLocation: requestContext?.geoData?.location || user.lastLoginLocation,
          lastLoginDevice: requestContext?.userAgent || user.lastLoginDevice,
          ...(requestContext?.geoData?.timezone && !user.timezone ? { timezone: requestContext.geoData.timezone } : {})
        }
      });

      // Create full session
      const socketIOUser = this.userToSocketIOUser(user);
      const sessionToken = generateSessionToken();
      const defaultContext: RequestContext = {
        ip: '127.0.0.1',
        userAgent: null,
        geoData: null,
        deviceInfo: null
      };

      const session = await createSession({
        userId: user.id,
        token: sessionToken,
        requestContext: requestContext || defaultContext
      });

      logger.info(`[AUTH_SERVICE] ✅ Session 2FA créée pour:', user.username, '- ID session.id=${session.id}`);

      return {
        user: socketIOUser,
        sessionToken,
        session,
        requires2FA: false
      };

    } catch (error) {
      logger.error('[AUTH_SERVICE] ❌ Erreur dans completeAuthWith2FA', error);
      return { success: false, error: 'Erreur lors de la vérification 2FA' };
    }
  }

  /**
   * Créer un nouveau utilisateur
   * @param data - Données d'inscription
   * @param requestContext - Contexte de la requête (IP, user agent, géolocalisation)
   * @returns RegisterResult with user, and optionally phoneTransferRequired info
   */
  async register(data: RegisterData, requestContext?: RequestContext): Promise<RegisterResult | null> {
    try {
      // Log l'email reçu pour debug (sera retiré après)
      logger.info(`[AUTH_SERVICE] 📧 Email reçu pour inscription: "${data.email}" (length: ${data.email?.length || 0})`);

      // Valider l'email avec Zod AVANT toute opération
      try {
        emailSchema.parse(data.email);
      } catch (zodError: any) {
        const errorMessage = zodError.issues?.[0]?.message || 'Format d\'email invalide';
        logger.error(`[AUTH_SERVICE] ❌ Validation email échouée: "${data.email}" - ${errorMessage}`);
        throw new Error(`Email invalide: ${errorMessage}`);
      }

      // Normaliser les données utilisateur
      const normalizedEmail = normalizeEmail(data.email);
      const normalizedUsername = normalizeUsername(data.username);
      const normalizedFirstName = capitalizeName(data.firstName);
      const normalizedLastName = capitalizeName(data.lastName);
      const normalizedDisplayName = normalizeDisplayName(`${normalizedFirstName} ${normalizedLastName}`);

      // Normaliser le phoneNumber avec libphonenumber-js
      // Utilise le code pays fourni, ou détecte depuis le numéro, ou utilise la géoloc
      let cleanPhoneNumber: string | null = null;
      let phoneCountryCode: string | null = null;

      if (data.phoneNumber && data.phoneNumber.trim() !== '') {
        // Priorité: 1) Code pays explicite, 2) Pays de la géoloc, 3) Défaut FR
        const defaultCountry = data.phoneCountryCode
          || requestContext?.geoData?.country
          || 'FR';

        const phoneResult = normalizePhoneWithCountry(data.phoneNumber, defaultCountry);
        if (phoneResult && phoneResult.isValid) {
          cleanPhoneNumber = phoneResult.phoneNumber;
          phoneCountryCode = phoneResult.countryCode;
        } else {
          throw new Error('Numéro de téléphone invalide');
        }
      }

      // Vérifier si l'username ou l'email existe déjà (pas le téléphone - géré séparément)
      const existingUserByCredentials = await this.prisma.user.findFirst({
        where: {
          OR: [
            { username: { equals: normalizedUsername, mode: 'insensitive' } },
            { email: { equals: normalizedEmail, mode: 'insensitive' } }
          ]
        }
      });

      if (existingUserByCredentials) {
        if (existingUserByCredentials.username.toLowerCase() === normalizedUsername.toLowerCase()) {
          throw new Error('Nom d\'utilisateur déjà utilisé');
        }
        if (existingUserByCredentials.email.toLowerCase() === normalizedEmail.toLowerCase()) {
          throw new Error('Email déjà utilisé');
        }
        throw new Error('Utilisateur déjà existant');
      }

      // Vérifier si le téléphone appartient à un autre compte
      // Si oui, on ne crée PAS le compte et on retourne les infos pour que l'utilisateur choisisse
      // SAUF si skipPhoneConflictCheck=true (transfer token validated)
      if (cleanPhoneNumber && !data.skipPhoneConflictCheck) {
        const existingUserByPhone = await this.prisma.user.findFirst({
          where: {
            phoneNumber: cleanPhoneNumber,
            isActive: true,
            phoneVerifiedAt: { not: null } // Seuls les numéros vérifiés déclenchent le conflit
          },
          select: {
            id: true,
            displayName: true,
            username: true,
            email: true,
            avatar: true
          }
        });

        if (existingUserByPhone) {
          // Le numéro appartient à quelqu'un d'autre
          // On NE crée PAS le compte - l'utilisateur doit choisir
          logger.info('[AUTH_SERVICE] 📱 Phone belongs to another user - returning conflict info (account NOT created)');
          return {
            phoneOwnershipConflict: true,
            phoneOwnerInfo: {
              maskedDisplayName: maskDisplayName(existingUserByPhone.displayName),
              maskedUsername: maskUsername(existingUserByPhone.username),
              maskedEmail: maskEmail(existingUserByPhone.email),
              avatarUrl: existingUserByPhone.avatar || undefined,
              phoneNumber: cleanPhoneNumber,
              phoneCountryCode: phoneCountryCode || 'FR'
            }
          };
        }
      } else if (cleanPhoneNumber && data.skipPhoneConflictCheck) {
        logger.info('[AUTH_SERVICE] 📱 Skipping phone conflict check - transfer token validated');
      }

      // Hasher le mot de passe (bcrypt cost=12 for enhanced security)
      const BCRYPT_COST = 12;
      const hashedPassword = await bcrypt.hash(data.password, BCRYPT_COST);

      // Generate email verification token (24h expiry)
      const { raw: verificationToken, hash: verificationTokenHash } = this.generateVerificationToken();
      const tokenExpiryHours = parseInt(process.env.EMAIL_VERIFICATION_TOKEN_EXPIRY || '86400') / 3600; // Default 24h
      const verificationExpiry = new Date(Date.now() + tokenExpiryHours * 60 * 60 * 1000);

      // Créer l'utilisateur avec les données normalisées et contexte d'inscription
      // Note: Si phoneOwnershipConflict, on a déjà fait un early return plus haut
      const user = await this.prisma.user.create({
        data: {
          username: normalizedUsername,
          password: hashedPassword,
          firstName: normalizedFirstName,
          lastName: normalizedLastName,
          email: normalizedEmail,
          phoneNumber: cleanPhoneNumber,
          phoneCountryCode: phoneCountryCode,
          // Mark phone as verified at registration (allows phone-based password reset)
          phoneVerifiedAt: cleanPhoneNumber ? new Date() : null,
          systemLanguage: data.systemLanguage || 'fr',
          regionalLanguage: data.regionalLanguage || 'fr',
          displayName: normalizedDisplayName,
          isOnline: true,
          lastActiveAt: new Date(),
          // Email verification fields
          emailVerificationToken: verificationTokenHash,
          emailVerificationExpiry: verificationExpiry,
          // Registration context (captured once at signup)
          registrationIp: requestContext?.ip || null,
          registrationLocation: requestContext?.geoData?.location || null,
          registrationDevice: requestContext?.userAgent || null,
          registrationCountry: requestContext?.geoData?.country || null,
          // Set timezone from geolocation if available
          timezone: requestContext?.geoData?.timezone || null,
          // First login tracking
          lastLoginIp: requestContext?.ip || null,
          lastLoginLocation: requestContext?.geoData?.location || null,
          lastLoginDevice: requestContext?.userAgent || null
        }
      });

      // Send email verification email (in user's preferred language)
      try {
        const verificationLink = `${this.frontendUrl}/auth/verify-email?token=${verificationToken}&email=${encodeURIComponent(normalizedEmail)}`;

        const emailResult = await this.emailService.sendEmailVerification({
          to: normalizedEmail,
          name: normalizedDisplayName,
          verificationLink,
          expiryHours: tokenExpiryHours,
          language: data.systemLanguage || 'fr'
        });

        if (emailResult.success) {
          logger.info('[AUTH_SERVICE] ✅ Email de vérification envoyé avec succès!');
          logger.info(`[AUTH_SERVICE] ✅ Provider emailResult.provider=${emailResult.provider}`);
          logger.info(`[AUTH_SERVICE] ✅ Message ID emailResult.messageId=${emailResult.messageId}`);
        } else {
          logger.error('[AUTH_SERVICE] ❌ Échec de l\'envoi:', emailResult.error);
        }
      } catch (emailError) {
        logger.error('[AUTH_SERVICE] ⚠️ Exception lors de l\'envoi de l\'email de vérification:', emailError);
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
          logger.warn('[AUTH] ⚠️ Conversation globale "meeshy" non trouvée - impossible d\'ajouter l\'utilisateur');
        }
      } catch (error) {
        logger.error('[AUTH] ❌ Erreur lors de l\'ajout à la conversation globale:', error);
        // Ne pas faire échouer l'inscription si l'ajout à la conversation échoue
      }

      // Retourner le résultat avec l'utilisateur créé
      // Note: Si phoneOwnershipConflict existait, on a fait un early return plus haut
      return {
        user: this.userToSocketIOUser(user)
      };

    } catch (error) {
      logger.error('Error in register', error);
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
        },
        select: {
          id: true,
          username: true,
          email: true,
          phoneNumber: true,
          firstName: true,
          lastName: true,
          displayName: true,
          avatar: true,
          bio: true,
          systemLanguage: true,
          regionalLanguage: true,
          customDestinationLanguage: true,
          role: true,
          isActive: true,
          isOnline: true,
          lastActiveAt: true,
          twoFactorEnabledAt: true,
          createdAt: true,
          updatedAt: true
        }
      });

      if (!user) {
        return null;
      }

      return this.userToSocketIOUser(user);

    } catch (error) {
      logger.error('Error in getUserById', error);
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
      logger.error('Error verifying token', error);
      return null;
    }
  }

  /**
   * Mettre à jour le statut en ligne d'un utilisateur
   */
  async updateOnlineStatus(userId: string, isOnline: boolean): Promise<void> {
    try {
      const updateData: { isOnline: boolean; lastActiveAt?: Date } = {
        isOnline
      };

      // Only update lastActiveAt when coming online
      if (isOnline) {
        updateData.lastActiveAt = new Date();
      }

      await this.prisma.user.update({
        where: { id: userId },
        data: updateData
      });
    } catch (error) {
      logger.error('Error updating online status', error);
    }
  }

  /**
   * Verify email with token
   */
  async verifyEmail(token: string, email: string): Promise<{ success: boolean; error?: string; alreadyVerified?: boolean; verifiedAt?: Date }> {
    try {
      const hashedToken = this.hashToken(token);
      const normalizedEmail = email.trim().toLowerCase();

      // First, check if user exists with this email
      const existingUser = await this.prisma.user.findFirst({
        where: {
          email: { equals: normalizedEmail, mode: 'insensitive' }
        },
        select: {
          id: true,
          email: true,
          emailVerifiedAt: true,
          emailVerificationToken: true,
          emailVerificationExpiry: true
        }
      });

      // If user exists and email is already verified, return success with verification date
      if (existingUser && existingUser.emailVerifiedAt) {
        logger.info(`[AUTH_SERVICE] ℹ️ Email déjà vérifié pour existingUser.email=${existingUser.email} le existingUser.emailVerifiedAt.toISOString()=${existingUser.emailVerifiedAt.toISOString()}`);
        return {
          success: true,
          alreadyVerified: true,
          verifiedAt: existingUser.emailVerifiedAt
        };
      }

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

      // Update user as verified
      const now = new Date();
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          emailVerifiedAt: now,
          emailVerificationToken: null,
          emailVerificationExpiry: null
        }
      });

      logger.info(`[AUTH_SERVICE] ✅ Email vérifié pour user.email=${user.email}`);
      return { success: true, verifiedAt: now };

    } catch (error) {
      logger.error('[AUTH_SERVICE] ❌ Erreur lors de la vérification email', error);
      return { success: false, error: 'Erreur lors de la vérification.' };
    }
  }

  /**
   * Resend email verification
   */
  async resendVerificationEmail(email: string): Promise<{ success: boolean; error?: string }> {
    try {
      const normalizedEmail = email.trim().toLowerCase();

      // Find user by email (include systemLanguage for i18n)
      const user = await this.prisma.user.findFirst({
        where: {
          email: { equals: normalizedEmail, mode: 'insensitive' },
          isActive: true
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          displayName: true,
          systemLanguage: true,
          emailVerifiedAt: true
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

      // Send email in user's preferred language
      const verificationLink = `${this.frontendUrl}/auth/verify-email?token=${verificationToken}&email=${encodeURIComponent(normalizedEmail)}`;
      await this.emailService.sendEmailVerification({
        to: normalizedEmail,
        name: user.displayName || `${user.firstName} ${user.lastName}`,
        verificationLink,
        expiryHours: tokenExpiryHours,
        language: user.systemLanguage || 'fr'
      });

      logger.info(`[AUTH_SERVICE] ✅ Email de vérification renvoyé à user.email=${normalizedEmail}`);
      return { success: true };

    } catch (error) {
      logger.error('[AUTH_SERVICE] ❌ Erreur lors du renvoi de l\'email:', error);
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
      logger.error('[AUTH_SERVICE] Error checking email verification', error);
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
        logger.warn(`[AUTH_SERVICE] ⚠️ Numéro non trouvé cleanPhone=${cleanPhone}`);
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

      // Send SMS via multi-provider SmsService
      const smsResult = await smsService.sendVerificationCode(user.phoneNumber || cleanPhone, code);

      if (!smsResult.success) {
        logger.error('[AUTH_SERVICE] ❌ Échec envoi SMS', smsResult.error);
      logger.info(`Utilisateur trouvé userId=${user.id}`);
        return { success: false, error: 'Erreur lors de l\'envoi du SMS.' };
      }

      logger.info(`[AUTH_SERVICE] ✅ SMS envoyé via', smsResult.provider, '- messageId smsResult.messageId=${smsResult.messageId}`);
      return { success: true };

    } catch (error) {
      logger.error('[AUTH_SERVICE] ❌ Erreur envoi code SMS', error);
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

      logger.info(`[AUTH_SERVICE] ✅ Téléphone vérifié pour user.phoneNumber=${user.phoneNumber}`);
      return { success: true };

    } catch (error) {
      logger.error('[AUTH_SERVICE] ❌ Erreur vérification téléphone', error);
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
      logger.error('[AUTH_SERVICE] Error checking phone verification', error);
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
   * Note: user.userFeature doit être inclus dans la requête pour les champs de préférences
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
      bio: user.bio,
      avatar: user.avatar,
      role: user.role,
      permissions: this.getUserPermissions({
        ...user,
        role: user.role
      } as SocketIOUser),
      isOnline: user.isOnline,
      lastActiveAt: user.lastActiveAt,
      systemLanguage: user.systemLanguage,
      regionalLanguage: user.regionalLanguage,
      customDestinationLanguage: user.customDestinationLanguage,
      // TODO: Load from UserPreferences.application
      autoTranslateEnabled: true,
      translateToSystemLanguage: true,
      translateToRegionalLanguage: false,
      useCustomDestination: false,
      isActive: user.isActive,
      deactivatedAt: user.deactivatedAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      // Security & verification fields for auth responses
      emailVerifiedAt: user.emailVerifiedAt,
      phoneVerifiedAt: user.phoneVerifiedAt,
      twoFactorEnabledAt: user.twoFactorEnabledAt ?? null,
      lastPasswordChange: user.lastPasswordChange,
      // Login tracking
      lastLoginIp: user.lastLoginIp,
      lastLoginLocation: user.lastLoginLocation,
      lastLoginDevice: user.lastLoginDevice,
      // Profile metadata
      profileCompletionRate: user.profileCompletionRate
    };
  }

  // ==================== Session Management ====================

  /**
   * Validate a session token and return session data
   */
  async validateSessionToken(token: string): Promise<SessionData | null> {
    return validateSession(token);
  }

  /**
   * Get all active sessions for a user
   * @param userId - User ID
   * @param currentToken - Current session token (to mark as current)
   */
  async getUserActiveSessions(userId: string, currentToken?: string): Promise<SessionData[]> {
    return getUserSessions(userId, currentToken);
  }

  /**
   * Revoke a specific session
   * @param sessionId - Session ID to revoke
   * @param reason - Reason for revocation
   */
  async revokeSession(sessionId: string, reason: string = 'user_revoked'): Promise<boolean> {
    return invalidateSession(sessionId, reason);
  }

  /**
   * Revoke all sessions for a user except the current one
   * @param userId - User ID
   * @param currentToken - Current session token to keep active
   */
  async revokeAllSessionsExceptCurrent(userId: string, currentToken?: string): Promise<number> {
    return invalidateAllSessions(userId, currentToken, 'user_revoked_all');
  }

  /**
   * Logout - invalidate the current session
   * @param token - Session token to invalidate
   */
  async logout(token: string): Promise<boolean> {
    const result = await logoutSession(token);
    if (result) {
      logger.info('[AUTH_SERVICE] ✅ Session invalidée (logout)');
    }
    return result;
  }
}
