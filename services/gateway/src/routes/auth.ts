import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AuthService, LoginCredentials, RegisterData } from '../services/AuthService';
import { SocketIOUser } from '@meeshy/shared/types';
import {
  userSchema,
  sessionSchema,
  sessionMinimalSchema,
  loginRequestSchema,
  registerRequestSchema,
  registerResponseSchema,
  errorResponseSchema,
  validationErrorResponseSchema,
  sessionsListResponseSchema,
  refreshTokenRequestSchema,
  verifyEmailRequestSchema,
  resendVerificationRequestSchema,
  sendPhoneCodeRequestSchema,
  verifyPhoneRequestSchema,
  validateSessionRequestSchema
} from '@meeshy/shared/types';
import {
  AuthSchemas,
  SessionSchemas,
  validateSchema
} from '@meeshy/shared/utils/validation';
import { createUnifiedAuthMiddleware } from '../middleware/auth';
import { getRequestContext } from '../services/GeoIPService';

export async function authRoutes(fastify: FastifyInstance) {
  // Créer une instance du service d'authentification
  const authService = new AuthService(
    (fastify as any).prisma,
    process.env.JWT_SECRET || 'meeshy-secret-key-dev'
  );

  // Route de connexion - using shared schemas from @meeshy/shared/types
  fastify.post('/login', {
    schema: {
      description: 'Authenticate a user with username/email/phone and password. Returns user profile, JWT token, and session token for device management.',
      tags: ['auth'],
      summary: 'User login',
      body: loginRequestSchema,
      response: {
        200: {
          description: 'Successful login - returns user data, tokens, and session info',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                user: userSchema,
                token: { type: 'string', description: 'JWT access token for API authentication' },
                sessionToken: { type: 'string', description: 'Session token for device management (store securely)' },
                session: sessionMinimalSchema,
                expiresIn: { type: 'number', description: 'Token expiration time in seconds', example: 86400 }
              }
            }
          }
        },
        401: errorResponseSchema,
        500: errorResponseSchema
      },
      security: []
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Valider les données avec Zod
      const validatedData = validateSchema(AuthSchemas.login, request.body, 'login');
      const { username, password } = validatedData;
      console.log('[AUTH] Tentative de connexion pour:', username);

      // Capturer le contexte de la requête (IP, géolocalisation, user agent)
      const requestContext = await getRequestContext(request);
      console.log('[AUTH] Contexte:', requestContext.ip, requestContext.geoData?.location || 'Local');

      // Authentifier l'utilisateur avec Prisma et contexte
      // Retourne AuthResult avec user, sessionToken et session
      const authResult = await authService.authenticate({ username, password }, requestContext);

      if (!authResult) {
        console.error('[AUTH] ❌ Échec de connexion pour:', username, '- Identifiants invalides');
        return reply.status(401).send({
          success: false,
          error: 'Identifiants invalides'
        });
      }

      const { user, sessionToken, session, requires2FA, twoFactorToken } = authResult;

      // If 2FA is required, return partial response
      if (requires2FA) {
        console.log('[AUTH] 🔐 2FA requis pour:', user.username);
        return reply.send({
          success: true,
          data: {
            requires2FA: true,
            twoFactorToken, // Client stores this temporarily
            user: {
              id: user.id,
              username: user.username,
              email: user.email,
              firstName: user.firstName,
              lastName: user.lastName,
              displayName: user.displayName,
              avatar: user.avatar
            },
            message: 'Veuillez entrer votre code d\'authentification à deux facteurs'
          }
        });
      }

      console.log('[AUTH] ✅ Connexion réussie pour:', user.username, '(ID:', user.id, ', Session:', session.id, ')');

      // Générer le JWT token
      const jwtToken = authService.generateToken(user);

      // Retourner les informations utilisateur complètes, tokens et session
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
          token: jwtToken,
          sessionToken, // Token de session persistant pour la gestion des appareils
          session: {
            id: session.id,
            deviceType: session.deviceType,
            browserName: session.browserName,
            osName: session.osName,
            location: session.location,
            isMobile: session.isMobile,
            createdAt: session.createdAt
          },
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

  // Route de connexion 2FA - Complete login with 2FA code
  fastify.post<{
    Body: { twoFactorToken: string; code: string }
  }>('/login/2fa', {
    schema: {
      description: 'Complete login with 2FA verification. Called after initial login returns requires2FA: true.',
      tags: ['auth', '2fa'],
      summary: 'Complete 2FA login',
      body: {
        type: 'object',
        required: ['twoFactorToken', 'code'],
        properties: {
          twoFactorToken: { type: 'string', description: 'Temporary token from initial login' },
          code: { type: 'string', minLength: 6, maxLength: 9, description: 'TOTP code (6 digits) or backup code (XXXX-XXXX)' }
        }
      },
      response: {
        200: {
          description: 'Successful 2FA verification - returns full session',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                user: userSchema,
                token: { type: 'string', description: 'JWT access token' },
                sessionToken: { type: 'string', description: 'Session token' },
                session: sessionMinimalSchema,
                expiresIn: { type: 'number', example: 86400 }
              }
            }
          }
        },
        400: errorResponseSchema,
        401: errorResponseSchema
      },
      security: []
    }
  }, async (request, reply) => {
    try {
      const { twoFactorToken, code } = request.body;

      if (!twoFactorToken || !code) {
        return reply.status(400).send({
          success: false,
          error: 'Token 2FA et code requis'
        });
      }

      const requestContext = await getRequestContext(request);
      const result = await authService.completeAuthWith2FA(twoFactorToken, code, requestContext);

      // Check for error response
      if ('success' in result && result.success === false) {
        return reply.status(401).send({
          success: false,
          error: result.error
        });
      }

      // Successful 2FA - return full session
      const authResult = result as { user: SocketIOUser; sessionToken: string; session: any };
      const { user, sessionToken, session } = authResult;

      console.log('[AUTH] ✅ Connexion 2FA réussie pour:', user.username);

      const jwtToken = authService.generateToken(user);

      return reply.send({
        success: true,
        data: {
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            displayName: user.displayName,
            bio: user.bio,
            avatar: user.avatar,
            phoneNumber: user.phoneNumber,
            role: user.role,
            isActive: user.isActive,
            deactivatedAt: user.deactivatedAt,
            systemLanguage: user.systemLanguage,
            regionalLanguage: user.regionalLanguage,
            customDestinationLanguage: user.customDestinationLanguage,
            autoTranslateEnabled: user.autoTranslateEnabled,
            translateToSystemLanguage: user.translateToSystemLanguage,
            translateToRegionalLanguage: user.translateToRegionalLanguage,
            useCustomDestination: user.useCustomDestination,
            isOnline: user.isOnline,
            lastActiveAt: user.lastActiveAt,
            emailVerifiedAt: user.emailVerifiedAt,
            phoneVerifiedAt: user.phoneVerifiedAt,
            twoFactorEnabledAt: user.twoFactorEnabledAt,
            lastPasswordChange: user.lastPasswordChange,
            lastLoginIp: user.lastLoginIp,
            lastLoginLocation: user.lastLoginLocation,
            lastLoginDevice: user.lastLoginDevice,
            profileCompletionRate: user.profileCompletionRate,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
            permissions: user.permissions
          },
          token: jwtToken,
          sessionToken,
          session: {
            id: session.id,
            deviceType: session.deviceType,
            browserName: session.browserName,
            osName: session.osName,
            location: session.location,
            isMobile: session.isMobile,
            createdAt: session.createdAt
          },
          expiresIn: 24 * 60 * 60
        }
      });

    } catch (error) {
      console.error('[AUTH] ❌ Erreur 2FA:', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur lors de la vérification 2FA'
      });
    }
  });

  // Route d'inscription - using shared schemas from @meeshy/shared/types
  fastify.post('/register', {
    schema: {
      description: 'Register a new user account. An email verification will be sent to the provided email address. The user is automatically added to the global "meeshy" conversation.',
      tags: ['auth'],
      summary: 'User registration',
      body: registerRequestSchema,
      response: {
        200: {
          description: 'Account created successfully - verification email sent',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                user: userSchema,
                token: { type: 'string', description: 'JWT access token for API authentication' },
                expiresIn: { type: 'number', description: 'Token expiration time in seconds', example: 86400 }
              }
            }
          }
        },
        400: validationErrorResponseSchema,
        500: errorResponseSchema
      },
      security: []
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Valider les données avec Zod
      const validatedData = validateSchema(AuthSchemas.register, request.body, 'register');

      // Capturer le contexte de la requête (IP, géolocalisation, user agent)
      const requestContext = await getRequestContext(request);
      console.log('[AUTH] Inscription depuis:', requestContext.ip, requestContext.geoData?.location || 'Local');

      // Créer l'utilisateur avec Prisma et contexte d'inscription
      const user = await authService.register(validatedData as RegisterData, requestContext);

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

  // Route pour récupérer les informations de l'utilisateur connecté - using shared schemas
  fastify.get('/me', {
    schema: {
      description: 'Get the current authenticated user profile. Works with both JWT tokens (registered users) and session tokens (anonymous users).',
      tags: ['auth', 'user'],
      summary: 'Get current user profile',
      response: {
        200: {
          description: 'User profile retrieved successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                user: userSchema
              }
            }
          }
        },
        401: errorResponseSchema,
        404: errorResponseSchema
      },
      security: [{ bearerAuth: [] }]
    },
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
      description: 'Refresh an existing JWT token to get a new one',
      tags: ['auth'],
      summary: 'Refresh token',
      body: refreshTokenRequestSchema,
      response: {
        200: {
          description: 'Token refreshed successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                token: { type: 'string', description: 'New JWT token' },
                expiresIn: { type: 'number', description: 'Token expiration in seconds' }
              }
            }
          }
        },
        401: errorResponseSchema,
        404: errorResponseSchema
      },
      security: []
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Valider les données avec Zod
      const validatedData = validateSchema(AuthSchemas.refreshToken, request.body, 'refresh');
      const { token } = validatedData;

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
    schema: {
      description: 'Logout the current user and invalidate the session',
      tags: ['auth'],
      summary: 'User logout',
      headers: {
        type: 'object',
        properties: {
          'x-session-token': { type: 'string', description: 'Session token to invalidate' }
        }
      },
      response: {
        200: {
          description: 'Logout successful',
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                message: { type: 'string' }
              }
            }
          }
        }
      }
    },
    preValidation: [(fastify as any).authenticate]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = (request as any).user.userId;
      const sessionToken = request.headers['x-session-token'] as string | undefined;

      // Mettre à jour le statut en ligne
      await authService.updateOnlineStatus(userId, false);

      // Invalider la session si un token est fourni
      if (sessionToken) {
        const loggedOut = await authService.logout(sessionToken);
        if (loggedOut) {
          console.log('[AUTH] ✅ Session invalidée pour:', userId);
        }
      }

      reply.send({
        success: true,
        data: { message: 'Déconnexion réussie' }
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
      const { InitService } = await import('../services/InitService');
      const initService = new InitService((fastify as any).prisma);
      await initService.initializeDatabase();

      return reply.send({
        success: true,
        data: { message: 'Database initialized successfully' }
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
      description: 'Verify user email address with a token sent via email',
      tags: ['auth'],
      summary: 'Verify email',
      body: verifyEmailRequestSchema,
      response: {
        200: {
          description: 'Email verified successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'object', properties: { message: { type: 'string' } } }
          }
        },
        400: errorResponseSchema,
        500: errorResponseSchema
      },
      security: []
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Valider les données avec Zod
      const validatedData = validateSchema(AuthSchemas.verifyEmail, request.body, 'verify-email');
      const { token, email } = validatedData;

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
        data: { message: 'Votre adresse email a été vérifiée avec succès !' }
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
      description: 'Resend email verification link to user',
      tags: ['auth'],
      summary: 'Resend verification email',
      body: resendVerificationRequestSchema,
      response: {
        200: {
          description: 'Verification email sent (if account exists)',
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'object', properties: { message: { type: 'string' } } }
          }
        },
        400: errorResponseSchema,
        500: errorResponseSchema
      },
      security: []
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Valider les données avec Zod
      const validatedData = validateSchema(AuthSchemas.resendVerification, request.body, 'resend-verification');
      const { email } = validatedData;

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
        data: { message: 'Si un compte existe avec cette adresse email, un email de vérification a été envoyé.' }
      });

    } catch (error) {
      console.error('[AUTH] ❌ Erreur lors du renvoi de vérification:', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur lors de l\'envoi de l\'email'
      });
    }
  });

  // Route pour envoyer un code de vérification SMS
  fastify.post('/send-phone-code', {
    schema: {
      description: 'Send SMS verification code to phone number',
      tags: ['auth'],
      summary: 'Send phone verification code',
      body: sendPhoneCodeRequestSchema,
      response: {
        200: {
          description: 'SMS code sent successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'object', properties: { message: { type: 'string' } } }
          }
        },
        400: errorResponseSchema,
        500: errorResponseSchema
      },
      security: []
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Valider les données avec Zod
      const validatedData = validateSchema(AuthSchemas.sendPhoneCode, request.body, 'send-phone-code');
      const { phoneNumber } = validatedData;

      console.log('[AUTH] Envoi code SMS pour:', phoneNumber);

      const result = await authService.sendPhoneVerificationCode(phoneNumber);

      if (!result.success) {
        console.warn('[AUTH] ❌ Échec envoi code SMS:', result.error);
        return reply.status(400).send({
          success: false,
          error: result.error
        });
      }

      console.log('[AUTH] ✅ Code SMS envoyé');

      return reply.send({
        success: true,
        data: { message: 'Code de vérification envoyé par SMS.' }
      });

    } catch (error) {
      console.error('[AUTH] ❌ Erreur envoi code SMS:', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur lors de l\'envoi du code'
      });
    }
  });

  // Route pour vérifier le numéro de téléphone avec le code SMS
  fastify.post('/verify-phone', {
    schema: {
      description: 'Verify phone number with SMS code',
      tags: ['auth'],
      summary: 'Verify phone number',
      body: verifyPhoneRequestSchema,
      response: {
        200: {
          description: 'Phone number verified successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'object', properties: { message: { type: 'string' } } }
          }
        },
        400: errorResponseSchema,
        500: errorResponseSchema
      },
      security: []
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Valider les données avec Zod
      const validatedData = validateSchema(AuthSchemas.verifyPhone, request.body, 'verify-phone');
      const { phoneNumber, code } = validatedData;

      console.log('[AUTH] Vérification téléphone:', phoneNumber);

      const result = await authService.verifyPhone(phoneNumber, code);

      if (!result.success) {
        console.warn('[AUTH] ❌ Échec vérification téléphone:', result.error);
        return reply.status(400).send({
          success: false,
          error: result.error
        });
      }

      console.log('[AUTH] ✅ Téléphone vérifié');

      return reply.send({
        success: true,
        data: { message: 'Numéro de téléphone vérifié avec succès !' }
      });

    } catch (error) {
      console.error('[AUTH] ❌ Erreur vérification téléphone:', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur lors de la vérification'
      });
    }
  });

  // ==================== Session Management Routes ====================

  // Route pour lister toutes les sessions actives de l'utilisateur - using shared schemas
  fastify.get('/sessions', {
    schema: {
      description: 'List all active sessions for the authenticated user',
      tags: ['auth', 'sessions'],
      summary: 'Get active sessions',
      headers: {
        type: 'object',
        properties: {
          'x-session-token': { type: 'string', description: 'Current session token (optional, to mark current session)' }
        }
      },
      response: {
        200: sessionsListResponseSchema,
        401: errorResponseSchema
      }
    },
    preValidation: [(fastify as any).authenticate]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = (request as any).user.userId;
      const currentToken = request.headers['x-session-token'] as string | undefined;

      console.log('[AUTH] Récupération des sessions pour:', userId);

      const sessions = await authService.getUserActiveSessions(userId, currentToken);

      return reply.send({
        success: true,
        data: {
          sessions: sessions.map(session => ({
            id: session.id,
            deviceType: session.deviceType,
            deviceVendor: session.deviceVendor,
            deviceModel: session.deviceModel,
            osName: session.osName,
            osVersion: session.osVersion,
            browserName: session.browserName,
            browserVersion: session.browserVersion,
            isMobile: session.isMobile,
            ipAddress: session.ipAddress,
            country: session.country,
            city: session.city,
            location: session.location,
            createdAt: session.createdAt,
            lastActivityAt: session.lastActivityAt,
            isCurrentSession: session.isCurrentSession,
            isTrusted: session.isTrusted
          })),
          totalCount: sessions.length
        }
      });

    } catch (error) {
      console.error('[AUTH] ❌ Erreur récupération sessions:', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur lors de la récupération des sessions'
      });
    }
  });

  // Route pour révoquer une session spécifique
  fastify.delete('/sessions/:sessionId', {
    schema: {
      description: 'Revoke a specific session (log out from a specific device)',
      tags: ['auth', 'sessions'],
      summary: 'Revoke a session',
      params: {
        type: 'object',
        required: ['sessionId'],
        properties: {
          sessionId: { type: 'string', description: 'Session ID to revoke' }
        }
      },
      response: {
        200: {
          description: 'Session revoked successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                message: { type: 'string' }
              }
            }
          }
        },
        404: {
          description: 'Session not found',
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: { type: 'string' }
          }
        }
      }
    },
    preValidation: [(fastify as any).authenticate]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = (request as any).user.userId;
      const { sessionId } = request.params as { sessionId: string };

      console.log('[AUTH] Révocation session:', sessionId, 'pour user:', userId);

      // Vérifier que la session appartient à l'utilisateur avant de la révoquer
      const sessions = await authService.getUserActiveSessions(userId);
      const sessionBelongsToUser = sessions.some(s => s.id === sessionId);

      if (!sessionBelongsToUser) {
        return reply.status(404).send({
          success: false,
          error: 'Session non trouvée'
        });
      }

      const revoked = await authService.revokeSession(sessionId);

      if (!revoked) {
        return reply.status(404).send({
          success: false,
          error: 'Impossible de révoquer cette session'
        });
      }

      console.log('[AUTH] ✅ Session révoquée:', sessionId);

      return reply.send({
        success: true,
        data: { message: 'Session révoquée avec succès' }
      });

    } catch (error) {
      console.error('[AUTH] ❌ Erreur révocation session:', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur lors de la révocation de la session'
      });
    }
  });

  // Route pour révoquer toutes les sessions sauf la courante
  fastify.delete('/sessions', {
    schema: {
      description: 'Revoke all sessions except the current one (log out from all other devices)',
      tags: ['auth', 'sessions'],
      summary: 'Revoke all other sessions',
      headers: {
        type: 'object',
        properties: {
          'x-session-token': { type: 'string', description: 'Current session token to keep active' }
        }
      },
      response: {
        200: {
          description: 'Sessions revoked successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                message: { type: 'string' },
                revokedCount: { type: 'number' }
              }
            }
          }
        }
      }
    },
    preValidation: [(fastify as any).authenticate]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = (request as any).user.userId;
      const currentToken = request.headers['x-session-token'] as string | undefined;

      console.log('[AUTH] Révocation de toutes les sessions pour:', userId, '(sauf courante)');

      const revokedCount = await authService.revokeAllSessionsExceptCurrent(userId, currentToken);

      console.log('[AUTH] ✅', revokedCount, 'session(s) révoquée(s)');

      return reply.send({
        success: true,
        data: {
          message: `${revokedCount} session(s) révoquée(s) avec succès`,
          revokedCount
        }
      });

    } catch (error) {
      console.error('[AUTH] ❌ Erreur révocation sessions:', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur lors de la révocation des sessions'
      });
    }
  });

  // Route pour valider un token de session (sans JWT)
  fastify.post('/validate-session', {
    schema: {
      description: 'Validate a session token and get session info',
      tags: ['auth', 'sessions'],
      summary: 'Validate session token',
      body: validateSessionRequestSchema,
      response: {
        200: {
          description: 'Session validation result',
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                valid: { type: 'boolean' },
                session: { ...sessionSchema, nullable: true }
              }
            }
          }
        },
        500: errorResponseSchema
      },
      security: []
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Valider les données avec Zod
      const validatedData = validateSchema(SessionSchemas.validateToken, request.body, 'validate-session');
      const { sessionToken } = validatedData;

      const session = await authService.validateSessionToken(sessionToken);

      if (!session) {
        return reply.send({
          success: true,
          data: {
            valid: false,
            session: null
          }
        });
      }

      return reply.send({
        success: true,
        data: {
          valid: true,
          session: {
            id: session.id,
            userId: session.userId,
            deviceType: session.deviceType,
            browserName: session.browserName,
            osName: session.osName,
            location: session.location,
            isMobile: session.isMobile,
            createdAt: session.createdAt,
            lastActivityAt: session.lastActivityAt,
            isTrusted: session.isTrusted
          }
        }
      });

    } catch (error) {
      console.error('[AUTH] ❌ Erreur validation session:', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur lors de la validation de la session'
      });
    }
  });
}
