import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AuthService, LoginCredentials, RegisterData } from '../services/auth.service';
import { SocketIOUser } from '@meeshy/shared/types';
import { createUnifiedAuthMiddleware } from '../middleware/auth';

export async function authRoutes(fastify: FastifyInstance) {
  // Créer une instance du service d'authentification
  const authService = new AuthService(
    (fastify as any).prisma,
    process.env.JWT_SECRET || 'meeshy-secret-key-dev'
  );

  // Route de connexion
  fastify.post('/login', {
    schema: {
      body: {
        type: 'object',
        required: ['username', 'password'],
        properties: {
          username: { type: 'string', minLength: 2, maxLength: 16 },
          password: { type: 'string', minLength: 1 }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { username, password } = request.body as LoginCredentials;
      console.log('[AUTH] Tentative de connexion pour:', username);

      // Authentifier l'utilisateur avec Prisma
      const user = await authService.authenticate({ username, password });

      if (!user) {
        console.error('[AUTH] ❌ Échec de connexion pour:', username, '- Identifiants invalides');
        return reply.status(401).send({
          success: false,
          error: 'Identifiants invalides'
        });
      }

      console.log('[AUTH] ✅ Connexion réussie pour:', user.username, '(ID:', user.id, ')');

      // Générer le token
      const token = authService.generateToken(user);
      
      // Retourner les informations utilisateur complètes et le token
      reply.send({
        success: true,
        data: {
          user: {
            // Identité de base
            id: user.id,
            username: user.username,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            displayName: user.displayName,
            bio: user.bio,
            avatar: user.avatar,
            phoneNumber: user.phoneNumber,

            // Rôle et statut
            role: user.role,
            isActive: user.isActive,
            deactivatedAt: user.deactivatedAt,

            // Paramètres de traduction
            systemLanguage: user.systemLanguage,
            regionalLanguage: user.regionalLanguage,
            customDestinationLanguage: user.customDestinationLanguage,
            autoTranslateEnabled: user.autoTranslateEnabled,
            translateToSystemLanguage: user.translateToSystemLanguage,
            translateToRegionalLanguage: user.translateToRegionalLanguage,
            useCustomDestination: user.useCustomDestination,

            // Statut de présence
            isOnline: user.isOnline,
            lastSeen: user.lastSeen,
            lastActiveAt: user.lastActiveAt,

            // Sécurité visible (statuts de vérification)
            emailVerifiedAt: user.emailVerifiedAt,
            phoneVerifiedAt: user.phoneVerifiedAt,
            twoFactorEnabledAt: user.twoFactorEnabledAt,
            lastPasswordChange: user.lastPasswordChange,

            // Tracking des connexions (pour dashboard sécurité)
            lastLoginIp: user.lastLoginIp,
            lastLoginLocation: user.lastLoginLocation,
            lastLoginDevice: user.lastLoginDevice,

            // Métadonnées
            profileCompletionRate: user.profileCompletionRate,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,

            // Permissions calculées
            permissions: user.permissions
          },
          token,
          expiresIn: 24 * 60 * 60 // 24 heures en secondes
        }
      });
      
    } catch (error) {
      console.error('[AUTH] ❌ Erreur serveur lors de la connexion:', error);
      if (error instanceof Error) {
        console.error('[AUTH] Détails de l\'erreur:', error.message, error.stack);
      }
      reply.status(500).send({
        success: false,
        error: 'Erreur lors de la connexion'
      });
    }
  });

  // Route d'inscription
  fastify.post('/register', {
    schema: {
      body: {
        type: 'object',
        required: ['username', 'password', 'firstName', 'lastName', 'email'],
        properties: {
          username: { type: 'string', minLength: 2, maxLength: 16 },
          password: { type: 'string', minLength: 1 },
          firstName: { type: 'string', minLength: 1 },
          lastName: { type: 'string', minLength: 1 },
          email: { type: 'string', pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$' },
          phoneNumber: { type: 'string' },
          systemLanguage: { type: 'string' },
          regionalLanguage: { type: 'string' }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const registerData = request.body as RegisterData;
      
      // Créer l'utilisateur avec Prisma
      const user = await authService.register(registerData);
      
      if (!user) {
        return reply.status(400).send({
          success: false,
          error: 'Erreur lors de la création du compte'
        });
      }
      
      // Générer le token
      const token = authService.generateToken(user);
      
      reply.send({
        success: true,
        data: {
          user: {
            // Identité de base
            id: user.id,
            username: user.username,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            displayName: user.displayName,
            bio: user.bio,
            avatar: user.avatar,
            phoneNumber: user.phoneNumber,

            // Rôle et statut
            role: user.role,
            isActive: user.isActive,
            deactivatedAt: user.deactivatedAt,

            // Paramètres de traduction
            systemLanguage: user.systemLanguage,
            regionalLanguage: user.regionalLanguage,
            customDestinationLanguage: user.customDestinationLanguage,
            autoTranslateEnabled: user.autoTranslateEnabled,
            translateToSystemLanguage: user.translateToSystemLanguage,
            translateToRegionalLanguage: user.translateToRegionalLanguage,
            useCustomDestination: user.useCustomDestination,

            // Statut de présence
            isOnline: user.isOnline,
            lastSeen: user.lastSeen,
            lastActiveAt: user.lastActiveAt,

            // Sécurité visible (statuts de vérification)
            emailVerifiedAt: user.emailVerifiedAt,
            phoneVerifiedAt: user.phoneVerifiedAt,
            twoFactorEnabledAt: user.twoFactorEnabledAt,
            lastPasswordChange: user.lastPasswordChange,

            // Tracking des connexions (pour dashboard sécurité)
            lastLoginIp: user.lastLoginIp,
            lastLoginLocation: user.lastLoginLocation,
            lastLoginDevice: user.lastLoginDevice,

            // Métadonnées
            profileCompletionRate: user.profileCompletionRate,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,

            // Permissions calculées
            permissions: user.permissions
          },
          token,
          expiresIn: 24 * 60 * 60
        }
      });
      
    } catch (error) {
      console.error('[GATEWAY] Error in register:', error);
      
      // Gestion spécifique des erreurs de validation
      if (error instanceof Error) {
        const errorMessage = error.message;
        if (errorMessage.includes('déjà utilisé')) {
          return reply.status(400).send({
            success: false,
            error: errorMessage
          });
        }
      }
      
      reply.status(500).send({
        success: false,
        error: 'Erreur lors de la création du compte'
      });
    }
  });

  // Route pour récupérer les informations de l'utilisateur connecté
  fastify.get('/me', {
    preValidation: [createUnifiedAuthMiddleware((fastify as any).prisma, { requireAuth: true })]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as any).authContext;
      
      if (!authContext.isAuthenticated) {
        return reply.status(401).send({
          success: false,
          error: 'Non authentifié'
        });
      }

      // Si c'est un utilisateur enregistré (JWT)
      if (authContext.type === 'jwt' && authContext.registeredUser) {
        const user = authContext.registeredUser;
        const permissions = authService.getUserPermissions(user as any);
        
        return reply.send({
          success: true,
          data: {
            user: {
              // Identité de base
              id: user.id,
              username: user.username,
              email: user.email,
              firstName: user.firstName,
              lastName: user.lastName,
              displayName: user.displayName,
              bio: user.bio,
              avatar: user.avatar,
              phoneNumber: user.phoneNumber,

              // Rôle et statut
              role: user.role,
              isActive: user.isActive,
              deactivatedAt: user.deactivatedAt,

              // Paramètres de traduction
              systemLanguage: user.systemLanguage,
              regionalLanguage: user.regionalLanguage,
              customDestinationLanguage: user.customDestinationLanguage,
              autoTranslateEnabled: user.autoTranslateEnabled,
              translateToSystemLanguage: user.translateToSystemLanguage,
              translateToRegionalLanguage: user.translateToRegionalLanguage,
              useCustomDestination: user.useCustomDestination,

              // Statut de présence
              isOnline: user.isOnline,
              lastSeen: user.lastActiveAt,
              lastActiveAt: user.lastActiveAt,

              // Sécurité visible (statuts de vérification)
              emailVerifiedAt: user.emailVerifiedAt,
              phoneVerifiedAt: user.phoneVerifiedAt,
              twoFactorEnabledAt: user.twoFactorEnabledAt,
              lastPasswordChange: user.lastPasswordChange,

              // Tracking des connexions (pour dashboard sécurité)
              lastLoginIp: user.lastLoginIp,
              lastLoginLocation: user.lastLoginLocation,
              lastLoginDevice: user.lastLoginDevice,

              // Métadonnées
              profileCompletionRate: user.profileCompletionRate,
              createdAt: user.createdAt,
              updatedAt: user.updatedAt,

              // Permissions calculées
              permissions
            }
          }
        });
      }

      // Si c'est un utilisateur anonyme (Session)
      if (authContext.type === 'session' && authContext.anonymousUser) {
        const anonymousUser = authContext.anonymousUser;
        
        return reply.send({
          success: true,
          data: {
            user: {
              id: authContext.userId,
              username: anonymousUser.username,
              email: null,
              firstName: anonymousUser.firstName,
              lastName: anonymousUser.lastName,
              displayName: authContext.displayName,
              avatar: null,
              role: 'ANONYMOUS',
              systemLanguage: anonymousUser.language,
              regionalLanguage: anonymousUser.language,
              customDestinationLanguage: null,
              autoTranslateEnabled: false,
              translateToSystemLanguage: false,
              translateToRegionalLanguage: false,
              useCustomDestination: false,
              isOnline: true,
              lastSeen: new Date(),
              lastActiveAt: new Date(),
              isActive: true,
              createdAt: new Date(),
              updatedAt: new Date(),
              permissions: anonymousUser.permissions
            }
          }
        });
      }

      return reply.status(404).send({
        success: false,
        error: 'Utilisateur non trouvé'
      });
      
    } catch (error) {
      console.error('[GATEWAY] Error in /auth/me:', error);
      reply.status(500).send({
        success: false,
        error: 'Erreur lors de la récupération du profil'
      });
    }
  });

  // Route pour rafraîchir un token
  fastify.post('/refresh', {
    schema: {
      body: {
        type: 'object',
        required: ['token'],
        properties: {
          token: { type: 'string', minLength: 1 }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { token } = request.body as { token: string };
      
      // Vérifier le token
      const decoded = authService.verifyToken(token);
      
      if (!decoded) {
        return reply.status(401).send({
          success: false,
          error: 'Token invalide ou expiré'
        });
      }
      
      // Récupérer l'utilisateur
      const user = await authService.getUserById(decoded.userId);
      
      if (!user) {
        return reply.status(404).send({
          success: false,
          error: 'Utilisateur non trouvé'
        });
      }
      
      // Générer un nouveau token
      const newToken = authService.generateToken(user);
      
      reply.send({
        success: true,
        data: {
          token: newToken,
          expiresIn: 24 * 60 * 60 // 24 heures en secondes
        }
      });
      
    } catch (error) {
      console.error('[GATEWAY] Error in /auth/refresh:', error);
      reply.status(500).send({
        success: false,
        error: 'Erreur lors du rafraîchissement du token'
      });
    }
  });

  // Route de déconnexion
  fastify.post('/logout', {
    preValidation: [(fastify as any).authenticate]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = (request as any).user.userId;
      
      // Mettre à jour le statut en ligne
      await authService.updateOnlineStatus(userId, false);
      
      reply.send({
        success: true,
        message: 'Déconnexion réussie'
      });
      
    } catch (error) {
      console.error('[GATEWAY] Error in logout:', error);
      reply.status(500).send({
        success: false,
        error: 'Erreur lors de la déconnexion'
      });
    }
  });

  // Route pour vérifier la disponibilité d'un username, email ou téléphone
  fastify.get('/check-availability', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          username: { type: 'string' },
          email: { type: 'string' },
          phoneNumber: { type: 'string' }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { username, email, phoneNumber } = request.query as {
        username?: string;
        email?: string;
        phoneNumber?: string;
      };

      if (!username && !email && !phoneNumber) {
        return reply.status(400).send({
          success: false,
          error: 'Username, email ou numéro de téléphone requis'
        });
      }

      const prisma = (fastify as any).prisma;
      const { normalizePhoneNumber } = await import('../utils/normalize');
      const result: {
        usernameAvailable?: boolean;
        emailAvailable?: boolean;
        phoneNumberAvailable?: boolean;
      } = {};

      // Vérifier le username (comparaison case-insensitive)
      if (username) {
        const normalizedUsername = username.trim();
        const existingUser = await prisma.user.findFirst({
          where: {
            username: {
              equals: normalizedUsername,
              mode: 'insensitive'
            }
          }
        });
        result.usernameAvailable = !existingUser;
      }

      // Vérifier l'email (comparaison case-insensitive)
      if (email) {
        const normalizedEmail = email.trim().toLowerCase();
        const existingUser = await prisma.user.findFirst({
          where: {
            email: {
              equals: normalizedEmail,
              mode: 'insensitive'
            }
          }
        });
        result.emailAvailable = !existingUser;
      }

      // Vérifier le numéro de téléphone (format E.164)
      if (phoneNumber) {
        const normalizedPhone = normalizePhoneNumber(phoneNumber);
        const existingUser = await prisma.user.findFirst({
          where: {
            phoneNumber: normalizedPhone
          }
        });
        result.phoneNumberAvailable = !existingUser;
      }

      return reply.send({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('[GATEWAY] Error checking availability:', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur lors de la vérification'
      });
    }
  });

  // Route pour forcer l'initialisation (temporaire)
  fastify.post('/force-init', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { InitService } = await import('../services/init.service');
      const initService = new InitService((fastify as any).prisma);
      await initService.initializeDatabase();

      return reply.send({
        success: true,
        message: 'Database initialized successfully'
      });
    } catch (error) {
      console.error('[GATEWAY] Error during forced initialization:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to initialize database'
      });
    }
  });

  // Route pour vérifier l'email avec un token
  fastify.post('/verify-email', {
    schema: {
      body: {
        type: 'object',
        required: ['token', 'email'],
        properties: {
          token: { type: 'string', minLength: 1 },
          email: { type: 'string', pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$' }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { token, email } = request.body as { token: string; email: string };

      console.log('[AUTH] Tentative de vérification email pour:', email);

      const result = await authService.verifyEmail(token, email);

      if (!result.success) {
        console.warn('[AUTH] ❌ Échec de vérification email:', result.error);
        return reply.status(400).send({
          success: false,
          error: result.error
        });
      }

      console.log('[AUTH] ✅ Email vérifié avec succès pour:', email);

      return reply.send({
        success: true,
        message: 'Votre adresse email a été vérifiée avec succès !'
      });

    } catch (error) {
      console.error('[AUTH] ❌ Erreur lors de la vérification email:', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur lors de la vérification'
      });
    }
  });

  // Route pour renvoyer l'email de vérification
  fastify.post('/resend-verification', {
    schema: {
      body: {
        type: 'object',
        required: ['email'],
        properties: {
          email: { type: 'string', pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$' }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { email } = request.body as { email: string };

      console.log('[AUTH] Demande de renvoi de vérification pour:', email);

      const result = await authService.resendVerificationEmail(email);

      if (!result.success) {
        // If already verified, return specific error
        if (result.error?.includes('déjà vérifiée')) {
          return reply.status(400).send({
            success: false,
            error: result.error
          });
        }
      }

      // Always return success to prevent email enumeration
      console.log('[AUTH] ✅ Email de vérification envoyé (si compte existe)');

      return reply.send({
        success: true,
        message: 'Si un compte existe avec cette adresse email, un email de vérification a été envoyé.'
      });

    } catch (error) {
      console.error('[AUTH] ❌ Erreur lors du renvoi de vérification:', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur lors de l\'envoi de l\'email'
      });
    }
  });
}
