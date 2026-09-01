import { PrismaClient } from '@meeshy/shared/prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { generateNumericCode } from '../utils/verification-code';
import { SocketIOUser, UserRoleEnum } from '@meeshy/shared/types';
import { normalizeEmail, normalizeUsername, capitalizeName, normalizeDisplayName, normalizePhoneWithCountry, normalizePhoneNumber } from '../utils/normalize';
import { SecuritySanitizer } from '../utils/sanitize.js';
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
import { recipientLanguage } from '../utils/recipient-language';
import { searchTokensFor } from '../utils/search-tokens';
import { resolveAutoTranslateEnabled } from '../utils/auto-translate-preference';
import {
  isAccountLocked,
  recordFailedLoginAttempt,
  clearFailedLoginAttempts,
  lockIsVisibleTo
} from './LoginAttemptService';
import { UserLockedError } from '../errors/custom-errors';
import {
  ensureGlobalConversationMembership,
  type GlobalMembershipSocketManager,
} from './conversations/ensureGlobalConversationMembership';
import { servedUserPermissions } from './admin/served-permissions';
import {
  signSessionToken,
  verifySessionToken,
  TOKEN_TTL,
  type SessionBoundTokenPayload,
} from './auth/session-jwt';
import {
  mintPendingTwoFactorChallenge,
  pendingTwoFactorWhere,
  clearPendingTwoFactor,
} from './auth/pending-two-factor';
import { AUTH_USER_SELECT } from './auth/auth-user-projection';

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

/**
 * Charge utile d'un JWT — DÉFINIE dans `./auth/session-jwt`, ré-exportée ici
 * pour les appelants historiques. Depuis #4264 elle porte `sid`, l'identifiant
 * de la ligne `UserSession` qui a émis le jeton : sans lui, `POST /refresh` ne
 * pouvait que COMPTER les sessions valides d'un compte, jamais refuser celle
 * qu'on venait de révoquer.
 */
export type TokenPayload = SessionBoundTokenPayload;

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
    avatar?: string;
    phoneNumber: string;
    phoneCountryCode: string;
  };
}

export type AuthServiceOptions = {
  /**
   * Ce qu'il faut du manager Socket.IO pour annoncer une arrivée dans le
   * salon global — voir `GlobalMembershipSocketManager`. Résolu
   * PARESSEUSEMENT, comme `ExpiredMessagesCleanupService` : le manager
   * n'existe pas encore quand les routes s'enregistrent, et une capture
   * retiendrait `null` pour toujours. Absent = pas de socket, l'ajout reste
   * persisté.
   */
  readonly resolveSocketManager?: () => GlobalMembershipSocketManager | null | undefined;
};

export class AuthService {
  private prisma: PrismaClient;
  private jwtSecret: string;
  private emailService: EmailService;
  private frontendUrl: string;
  private readonly resolveSocketManager?: () => GlobalMembershipSocketManager | null | undefined;

  constructor(prisma: PrismaClient, jwtSecret: string, options: AuthServiceOptions = {}) {
    this.prisma = prisma;
    this.jwtSecret = jwtSecret;
    this.resolveSocketManager = options.resolveSocketManager;
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
        // La ligne d'une réponse d'authentification a UN site — `AUTH_USER_SELECT`,
        // qui porte aussi l'état du verrou (#4138). Le mot de passe est le seul
        // ajout de ce chemin : c'est le seul à le confronter (#4554).
        select: {
          ...AUTH_USER_SELECT,
          password: true
        }
      });

      if (!user) {
        logger.warn(`[AUTH_SERVICE] ❌ Aucun utilisateur trouvé pour normalizedIdentifier=${normalizedIdentifier}`);
        return null;
      }


      // Vérifier le mot de passe
      const passwordValid = await bcrypt.compare(credentials.password, user.password);
      if (!passwordValid) {
        // L'échec se COMPTE, et le seuil ferme le compte. Sans cette ligne, les
        // trois colonnes du verrou, l'erreur 423 et le job de déverrouillage
        // décrivaient une protection que rien n'armait (#4138).
        const { lockedUntil } = await recordFailedLoginAttempt(this.prisma, user.id);
        logger.warn(
          `[AUTH_SERVICE] ❌ Mot de passe invalide pour user.username=${user.username}` +
          (lockedUntil ? ` — compte verrouillé jusqu'à ${lockedUntil.toISOString()}` : '')
        );
        return null;
      }

      // Le verrou se lit APRÈS la vérification du mot de passe, et il ne se DIT
      // qu'à qui vient de prouver qu'il connaît ce mot de passe. Le refuser plus
      // tôt fabriquerait un oracle : cinq essais sur un compte inexistant
      // rendent cinq « identifiants invalides », cinq essais sur un compte réel
      // en rendraient un sixième DIFFÉRENT — de quoi énumérer les comptes.
      if (isAccountLocked(user.lockedUntil) && lockIsVisibleTo(passwordValid)) {
        logger.warn(`[AUTH_SERVICE] 🔒 Connexion refusée, compte verrouillé: ${user.username}`);
        throw new UserLockedError(user.lockedUntil ?? undefined);
      }

      if (user.failedLoginAttempts > 0 || user.lockedUntil) {
        await clearFailedLoginAttempts(this.prisma, user.id);
      }

      logger.info(`[AUTH_SERVICE] ✅ Mot de passe valide pour user.username=${user.username}`);

      // Check if 2FA is enabled
      if (user.twoFactorEnabledAt) {

        // Le défi d'étape 2 se compose AILLEURS — `./auth/pending-two-factor`,
        // site unique que le lien magique appelle aussi (#4542).
        const twoFactorToken = await mintPendingTwoFactorChallenge({ prisma: this.prisma, userId: user.id });

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

      logger.info(`[AUTH_SERVICE] ✅ Session créée pour: ${user.username} - ID session.id=${session.id}`);

      return {
        user: socketIOUser,
        sessionToken,
        session,
        requires2FA: false
      };

    } catch (error) {
      // Un verrou n'est pas une PANNE : c'est une décision. L'avaler ici le
      // rendrait indiscernable d'un mot de passe faux, et la personne
      // légitime n'apprendrait jamais pourquoi on la refuse (#4138).
      if (error instanceof UserLockedError) {
        throw error;
      }
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
      // Le défi se lit par son site unique, qui rend `null` quand aucun défi
      // ne PEUT être valide — un jeton vide n'atteint donc jamais la base.
      const challenge = pendingTwoFactorWhere(twoFactorToken);

      if (!challenge) {
        logger.warn('[AUTH_SERVICE] ❌ Token 2FA absent ou vide');
        return { success: false, error: 'Token 2FA invalide ou expiré. Veuillez vous reconnecter.' };
      }

      // Find user with matching token
      const user = await this.prisma.user.findFirst({
        where: {
          ...challenge,
          isActive: true
        },
        // Le MÊME site que `authenticate` : sans lui, cette liste avait perdu
        // `isOnline` et `lastActiveAt`, que `userToSocketIOUser` lit — la
        // présence partait `undefined` de la seconde porte (#4554). Le secret
        // TOTP et les codes de secours sont l'ajout de ce chemin : c'est le
        // seul à les confronter.
        select: {
          ...AUTH_USER_SELECT,
          twoFactorSecret: true,
          twoFactorBackupCodes: true
        }
      });

      if (!user) {
        logger.warn('[AUTH_SERVICE] ❌ Token 2FA invalide ou expiré');
        return { success: false, error: 'Token 2FA invalide ou expiré. Veuillez vous reconnecter.' };
      }

      // Ici, le verrou se DIT : détenir un `twoFactorToken` valide prouve déjà
      // qu'on a passé l'étape du mot de passe, donc l'annonce n'apprend rien
      // qu'on ne sache — contrairement au chemin `/login` (voir `lockIsVisibleTo`).
      if (isAccountLocked(user.lockedUntil)) {
        logger.warn(`[AUTH_SERVICE] 🔒 Second facteur refusé, compte verrouillé: ${user.username}`);
        return { success: false, error: 'Compte temporairement verrouillé après trop de tentatives. Réessayez plus tard.' };
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
          logger.info(`[AUTH_SERVICE] 🔑 Code de secours utilisé pour: ${user.username} - Restants: ${updatedCodes.length}`);
        }
      }

      if (!isValid) {
        // Le code TOTP tourne toutes les trente secondes ; les CODES DE SECOURS,
        // eux, ne tournent pas et n'expirent jamais. Sans ce comptage, ils
        // étaient attaquables indéfiniment (#4138).
        const { lockedUntil } = await recordFailedLoginAttempt(this.prisma, user.id);
        logger.warn(
          `[AUTH_SERVICE] ❌ Code 2FA invalide pour user.username=${user.username}` +
          (lockedUntil ? ` — compte verrouillé jusqu'à ${lockedUntil.toISOString()}` : '')
        );
        return {
          success: false,
          error: lockedUntil
            ? 'Compte temporairement verrouillé après trop de tentatives. Réessayez plus tard.'
            : 'Code 2FA invalide'
        };
      }

      if (user.failedLoginAttempts > 0 || user.lockedUntil) {
        await clearFailedLoginAttempts(this.prisma, user.id);
      }

      logger.info(`[AUTH_SERVICE] ✅ Code 2FA valide pour user.username=${user.username}`);

      // Clear the temporary token and complete login
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          ...clearPendingTwoFactor(),
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

      logger.info(`[AUTH_SERVICE] ✅ Session 2FA créée pour: ${user.username} - ID: ${session.id}`);

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
        // Log détaillé pour debug
        logger.error(`[AUTH_SERVICE] ❌ Zod error details:`, {
          email: data.email,
          emailCharCodes: data.email?.split('').map((c: string) => c.charCodeAt(0)),
          issues: zodError.issues,
          message: zodError.message,
          name: zodError.name
        });
        const errorMessage = zodError.issues?.[0]?.message || 'Format d\'email invalide';
        throw new Error(`Email invalide: ${errorMessage}`);
      }

      // Normaliser les données utilisateur
      const normalizedEmail = normalizeEmail(data.email);
      const normalizedUsername = normalizeUsername(data.username);
      const normalizedFirstName = SecuritySanitizer.sanitizeText(capitalizeName(data.firstName));
      const normalizedLastName = SecuritySanitizer.sanitizeText(capitalizeName(data.lastName));
      const normalizedDisplayName = SecuritySanitizer.sanitizeText(normalizeDisplayName(`${normalizedFirstName} ${normalizedLastName}`));

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
              avatar: existingUserByPhone.avatar || undefined,
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

      // Generate email verification token + OTP code (24h expiry)
      const { raw: verificationToken, hash: verificationTokenHash } = this.generateVerificationToken();
      const verificationCode = this.generatePhoneCode();
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
          // Écrits en MÊME TEMPS que les noms — un compte créé sans jetons
          // serait introuvable jusqu'à sa prochaine modification de profil
          // (#4159). Règle unique : `utils/search-tokens.ts`.
          searchTokens: searchTokensFor({
            username: normalizedUsername,
            displayName: normalizedDisplayName,
            firstName: normalizedFirstName,
            lastName: normalizedLastName,
          }),
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
          emailVerificationCode: verificationCode,
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
          verificationCode,
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

      // Ajouter automatiquement l'utilisateur à la conversation globale
      // "meeshy" — cinquième porte d'entrée, même loi que les quatre autres
      // (`routes/anonymous.ts`, `sharing.ts` ×2, `participants.ts`) : le salon
      // global voit arriver l'inscrit comme n'importe quel fil.
      // `ensureGlobalConversationMembership` est la SOURCE UNIQUE de cet
      // ajout (#3876) — partagée par l'inscription publique, la création
      // d'un compte par un administrateur et le seed (`InitService`).
      try {
        await ensureGlobalConversationMembership(
          { prisma: this.prisma, resolveSocketManager: this.resolveSocketManager },
          { userId: user.id, displayName: user.displayName || user.username }
        );
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
        // Troisième consommateur de `userToSocketIOUser`, et le plus amputé des
        // trois avant #4554 : la réponse du lien magique (`routes/auth/magic-link.ts`,
        // seul appelant) ne portait ni vérification d'email ou de téléphone, ni
        // suivi de connexion, ni changement de contact en attente.
        select: { ...AUTH_USER_SELECT }
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
   * Générer un token JWT, RATTACHÉ à la session qui l'émet — le lien que
   * #4213 n'avait pas : sa garde ne pouvait que COMPTER les sessions valides
   * du compte, si bien que révoquer UNE session laissait le jeton volé passer
   * tant que le propriétaire restait connecté ailleurs, le cas nominal.
   * Émission et butoir de transition : `./auth/session-jwt`.
   */
  generateToken(user: SocketIOUser, sessionId?: string | null): string {
    return signSessionToken({
      user,
      secret: this.jwtSecret,
      sessionId,
      expiresIn: TOKEN_TTL,
    });
  }

  /** Vérifier un token JWT — `null` si expiré ou invalide. Voir `./auth/session-jwt`. */
  verifyToken(token: string): TokenPayload | null {
    return verifySessionToken(token, this.jwtSecret);
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
   * Verify email with token (from email link) or 6-digit code (from mobile app)
   */
  async verifyEmail(tokenOrCode: string, email: string, isCode: boolean = false): Promise<{ success: boolean; error?: string; alreadyVerified?: boolean; verifiedAt?: Date }> {
    try {
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
          emailVerificationCode: true,
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

      if (isCode) {
        // OTP code verification (mobile flow)
        const user = await this.prisma.user.findFirst({
          where: {
            email: { equals: normalizedEmail, mode: 'insensitive' },
            emailVerificationCode: tokenOrCode,
            emailVerificationExpiry: { gt: new Date() }
          }
        });

        if (!user) {
          const expiredUser = await this.prisma.user.findFirst({
            where: {
              email: { equals: normalizedEmail, mode: 'insensitive' },
              emailVerificationCode: tokenOrCode
            }
          });

          if (expiredUser) {
            return { success: false, error: 'Le code de vérification a expiré. Veuillez en demander un nouveau.' };
          }
          return { success: false, error: 'Code de vérification invalide.' };
        }

        const now = new Date();
        await this.prisma.user.update({
          where: { id: user.id },
          data: {
            emailVerifiedAt: now,
            emailVerificationToken: null,
            emailVerificationCode: null,
            emailVerificationExpiry: null
          }
        });

        logger.info(`[AUTH_SERVICE] ✅ Email vérifié par code OTP pour user.email=${user.email}`);
        return { success: true, verifiedAt: now };
      }

      // Token verification (email link flow)
      const hashedToken = this.hashToken(tokenOrCode);
      const user = await this.prisma.user.findFirst({
        where: {
          email: { equals: normalizedEmail, mode: 'insensitive' },
          emailVerificationToken: hashedToken,
          emailVerificationExpiry: { gt: new Date() }
        }
      });

      if (!user) {
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

      const now = new Date();
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          emailVerifiedAt: now,
          emailVerificationToken: null,
          emailVerificationCode: null,
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

      // Generate new token + OTP code
      const { raw: verificationToken, hash: verificationTokenHash } = this.generateVerificationToken();
      const verificationCode = this.generatePhoneCode();
      const tokenExpiryHours = parseInt(process.env.EMAIL_VERIFICATION_TOKEN_EXPIRY || '86400') / 3600;
      const verificationExpiry = new Date(Date.now() + tokenExpiryHours * 60 * 60 * 1000);

      // Update user with new token + code
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          emailVerificationToken: verificationTokenHash,
          emailVerificationCode: verificationCode,
          emailVerificationExpiry: verificationExpiry
        }
      });

      // Send email in user's preferred language
      const verificationLink = `${this.frontendUrl}/auth/verify-email?token=${verificationToken}&email=${encodeURIComponent(normalizedEmail)}`;
      await this.emailService.sendEmailVerification({
        to: normalizedEmail,
        name: user.displayName || `${user.firstName} ${user.lastName}`,
        verificationLink,
        verificationCode,
        expiryHours: tokenExpiryHours,
        language: recipientLanguage(user, 'fr')
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
    // Cryptographically secure 6-digit code (CWE-338) — single source of truth.
    return generateNumericCode();
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

      logger.info(`[AUTH_SERVICE] ✅ SMS envoyé via ${smsResult.provider} - messageId: ${smsResult.messageId}`);
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
  /**
   * Les permissions SERVIES à la connexion — une PROJECTION, plus une copie.
   *
   * ## Ce que cette méthode était
   *
   * Une TROISIÈME définition des permissions, écrite à la main en `switch`, et
   * c'est celle que le web et iOS lisaient : elle voyage dans la charge de
   * `/auth/login`, `/auth/register` et `/auth/magic-link`.
   *
   * Elle donnait `canAccessAdmin: true` à un ANALYST, quand les deux matrices
   * disent `false`. Conséquence pour l'utilisateur : un ANALYST se connecte, le
   * web lui peint la console d'administration, et le serveur lui refuse la
   * moitié des routes — deux réponses différentes à la même question, servies
   * par le même serveur, à deux moments du même parcours (#4152).
   *
   * ## Ce qu'elle est
   *
   * La FORME du fil est conservée — neuf clés, `canManageGroups` compris, que
   * les clients installés décodent. Chaque valeur vient de la matrice centrale.
   * `canManageGroups` projette `canManageCommunities` : c'est le même droit
   * sous le vocabulaire d'avant les communautés.
   */
  /**
   * Les permissions SERVIES à la connexion — une PROJECTION, plus une copie.
   *
   * Cette méthode composait une TROISIÈME définition, en `switch`, et c'est
   * celle que le web et iOS lisaient : elle voyage dans la charge de
   * `/auth/login`, `/auth/register` et `/auth/magic-link`. Elle donnait
   * `canAccessAdmin: true` à un ANALYST, quand les deux matrices disent
   * `false` — le web lui peignait la console d'administration, et le serveur
   * lui refusait la moitié des routes (#4152).
   *
   * La forme du fil est inchangée ; les valeurs viennent de la matrice.
   */
  getUserPermissions(user: SocketIOUser) {
    return servedUserPermissions(user.role);
  }

  /**
   * Convertir un User Prisma en SocketIOUser
   * Note: user.userFeature doit être inclus dans la requête pour les champs de préférences
   *
   * `banner` et `timezone` y sont depuis #4641. Ils manquaient — et c'est la
   * forme de défaut que la garde de #4554 ne peut PAS voir : elle rougit quand
   * ce projecteur lit un champ hors de son `select`, or ici il ne le lisait
   * pas DU TOUT. En aval, `formatUserResponse` écrivait
   * `banner: user.banner || null` sur un `undefined` par construction : tout
   * compte portant une bannière recevait `null` à chaque connexion. Ce que ce
   * projecteur doit porter n'est donc pas seulement ce que ses appelants
   * lisent, mais ce que `userSchema` PROMET à ses clients.
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
      banner: user.banner,
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
      autoTranslateEnabled: resolveAutoTranslateEnabled(user),
      isActive: user.isActive,
      deactivatedAt: user.deactivatedAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      // Security & verification fields for auth responses
      emailVerifiedAt: user.emailVerifiedAt,
      phoneVerifiedAt: user.phoneVerifiedAt,
      pendingEmail: user.pendingEmail,
      pendingPhone: user.pendingPhoneNumber,
      twoFactorEnabledAt: user.twoFactorEnabledAt ?? null,
      lastPasswordChange: user.lastPasswordChange,
      // Login tracking
      lastLoginIp: user.lastLoginIp,
      lastLoginLocation: user.lastLoginLocation,
      lastLoginDevice: user.lastLoginDevice,
      // Profile metadata
      timezone: user.timezone,
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
