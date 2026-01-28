/**
 * Middleware d'authentification unifié Phase 3.1.1
 * 
 * Centralise l'authentification pour REST et WebSocket
 * - JWT Token = Utilisateurs enregistrés
 * - X-Session-Token = Utilisateurs anonymes
 * - Fournit un contexte complet pour les deux types
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import type { AuthenticationContext, AuthenticationType } from '@meeshy/shared/types';
import jwt from 'jsonwebtoken';
import { StatusService } from '../services/StatusService';

// ===== TYPES UNIFIÉS =====

export interface RegisteredUser {
  id: string;
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  avatar?: string;
  role: string;
  systemLanguage: string;
  regionalLanguage: string;
  customDestinationLanguage?: string;
  isOnline: boolean;
  lastActiveAt: Date;
}

export interface AnonymousUser {
  id: string;  // MongoDB ObjectId du AnonymousParticipant
  sessionToken: string;
  username: string;
  firstName?: string;
  lastName?: string;
  language: string;
  shareLinkId: string;
  permissions: {
    canSendMessages: boolean;
    canSendFiles: boolean;
    canSendImages: boolean;
    canSendVideos: boolean;
    canSendAudios: boolean;
    canSendLocations: boolean;
    canSendLinks: boolean;
  };
}

export interface UnifiedAuthContext {
  // Context général
  type: AuthenticationType;
  isAuthenticated: boolean;
  isAnonymous: boolean;
  
  // Utilisateur enregistré (si JWT)
  registeredUser?: RegisteredUser;
  jwtToken?: string;
  jwtPayload?: any;
  
  // Utilisateur anonyme (si Session)
  anonymousUser?: AnonymousUser;
  sessionToken?: string;
  
  // Métadonnées communes
  userLanguage: string;  // Langue principale de l'utilisateur
  displayName: string;   // Nom d'affichage
  userId: string;        // ID unifié (user.id ou sessionToken)
  
  // Permissions communes
  canSendMessages: boolean;
  hasFullAccess: boolean;  // true pour JWT, basé sur permissions pour session
}

export interface UnifiedAuthRequest extends FastifyRequest {
  authContext: UnifiedAuthContext;
}

// ===== SERVICE D'AUTHENTIFICATION =====

export class AuthMiddleware {
  constructor(
    private prisma: PrismaClient,
    private statusService?: StatusService
  ) {}

  /**
   * Crée le contexte d'authentification unifié
   * Supporte JWT + sessionToken pour "Se souvenir de l'appareil"
   */
  async createAuthContext(
    authorizationHeader?: string,
    sessionToken?: string
  ): Promise<UnifiedAuthContext> {

    // 1. Extraire le JWT token
    const jwtToken = authorizationHeader?.startsWith('Bearer ')
      ? authorizationHeader.slice(7)
      : null;

    // 2. JWT Token = Utilisateur enregistré (peut aussi avoir un sessionToken pour session trusted)
    if (jwtToken) {
      return await this.createRegisteredUserContext(jwtToken, sessionToken);
    }

    // 3. Session Token seul = Utilisateur anonyme
    if (sessionToken) {
      return await this.createAnonymousUserContext(sessionToken);
    }

    // 4. Aucun token = Non authentifié
    return this.createUnauthenticatedContext();
  }

  /**
   * Contexte pour utilisateur enregistré (JWT)
   * Supporte aussi les sessions "trusted" (Se souvenir de l'appareil)
   */
  private async createRegisteredUserContext(jwtToken: string, sessionToken?: string): Promise<UnifiedAuthContext> {
    try {
      // Vérifier le JWT
      let jwtPayload: any;
      let jwtExpired = false;

      try {
        jwtPayload = jwt.verify(jwtToken, process.env.JWT_SECRET!) as any;
      } catch (error) {
        // Si le JWT est expiré MAIS qu'on a un sessionToken, on peut vérifier la session trusted
        if (error instanceof jwt.TokenExpiredError && sessionToken) {
          jwtPayload = jwt.decode(jwtToken) as any;
          jwtExpired = true;
        } else {
          throw error;
        }
      }

      // Si JWT expiré, vérifier si on a une session trusted valide
      if (jwtExpired && sessionToken) {
        const hashedSessionToken = require('crypto').createHash('sha256').update(sessionToken).digest('hex');
        const trustedSession = await this.prisma.userSession.findFirst({
          where: {
            sessionToken: hashedSessionToken,
            userId: jwtPayload.userId,
            isValid: true,
            isTrusted: true,
            expiresAt: {
              gt: new Date()
            }
          }
        });

        if (!trustedSession) {
          // Session trusted non trouvée ou expirée, rejeter
          throw new Error('JWT expired and no valid trusted session found');
        }

        // Mettre à jour lastActivityAt de la session trusted (en arrière-plan)
        this.prisma.userSession.update({
          where: { id: trustedSession.id },
          data: { lastActivityAt: new Date() }
        }).catch(err => {
          console.warn('[UnifiedAuth] Échec mise à jour lastActivityAt session trusted:', err);
        });

        console.log('[UnifiedAuth] ✅ JWT expiré mais session trusted valide - utilisateur:', jwtPayload.userId, '- session prolongée');
      }
      
      // Récupérer l'utilisateur complet
      const user = await this.prisma.user.findUnique({
        where: { id: jwtPayload.userId },
        select: {
          id: true,
          username: true,
          email: true,
          firstName: true,
          lastName: true,
          displayName: true,
          avatar: true,
          role: true,
          systemLanguage: true,
          regionalLanguage: true,
          customDestinationLanguage: true,
          isOnline: true,
          lastActiveAt: true,
          isActive: true,
          createdAt: true,
          updatedAt: true
        }
      });

      if (!user || !user.isActive) {
        throw new Error('User not found or inactive');
      }

      // Mettre à jour lastActiveAt à chaque requête API (activité détectable)
      // Throttling: 5 secondes (léger pour ne pas surcharger la DB)
      if (this.statusService) {
        this.statusService.updateUserLastSeen(user.id);
      }

      // Si on a un sessionToken (session trusted), mettre à jour son lastActivityAt
      if (sessionToken && !jwtExpired) {
        const hashedSessionToken = require('crypto').createHash('sha256').update(sessionToken).digest('hex');
        this.prisma.userSession.update({
          where: {
            sessionToken: hashedSessionToken
          },
          data: {
            lastActivityAt: new Date()
          }
        }).catch(err => {
          // Non-bloquant, on log juste l'erreur
          console.warn('[UnifiedAuth] Échec mise à jour lastActivityAt session trusted:', err);
        });
      }

      // Déterminer la langue principale (priorité: custom > regional > system)
      const userLanguage = user.customDestinationLanguage
        || user.regionalLanguage
        || user.systemLanguage
        || 'en';

      return {
        type: 'jwt',
        isAuthenticated: true,
        isAnonymous: false,

        registeredUser: user as RegisteredUser,
        jwtToken,
        jwtPayload,
        sessionToken: sessionToken || undefined, // Inclure le sessionToken si présent (trusted session)

        userLanguage,
        displayName: user.displayName || `${user.firstName} ${user.lastName}`.trim() || user.username,
        userId: user.id,

        canSendMessages: true,
        hasFullAccess: true
      };

    } catch (error) {
      // Logging maîtrisé selon le type d'erreur JWT
      if (error instanceof jwt.TokenExpiredError) {
        console.warn('[UnifiedAuth] JWT expiré:', new Date(error.expiredAt).toISOString());
      } else if (error instanceof jwt.JsonWebTokenError) {
        console.warn('[UnifiedAuth] JWT invalide:', error.message);
      } else {
        // Erreurs inattendues uniquement
        console.error('[UnifiedAuth] Erreur JWT inattendue:', error);
      }
      throw new Error('Invalid JWT token');
    }
  }

  /**
   * Contexte pour utilisateur anonyme (Session Token)
   */
  private async createAnonymousUserContext(sessionToken: string): Promise<UnifiedAuthContext> {
    try {
      // Récupérer le participant anonyme via session token
      const anonymousParticipant = await this.prisma.anonymousParticipant.findUnique({
        where: { sessionToken },
        select: {
          id: true,
          username: true,
          firstName: true,
          lastName: true,
          language: true,
          shareLinkId: true,
          isActive: true,
          canSendMessages: true,
          canSendFiles: true,
          canSendImages: true,
          shareLink: {
            select: {
              id: true,
              allowAnonymousMessages: true,
              allowAnonymousFiles: true,
              allowAnonymousImages: true
            }
          }
        }
      });

      if (!anonymousParticipant || !anonymousParticipant.isActive) {
        throw new Error('Anonymous participant not found or inactive');
      }

      // Mettre à jour lastActiveAt à chaque requête API (activité détectable)
      // Throttling: 5 secondes (léger pour ne pas surcharger la DB)
      if (this.statusService) {
        this.statusService.updateAnonymousLastSeen(anonymousParticipant.id);
      }

      // Utiliser les permissions du shareLink et du participant
      const shareLink = anonymousParticipant.shareLink;
      
      const anonymousUser: AnonymousUser = {
        id: anonymousParticipant.id,
        sessionToken,
        username: anonymousParticipant.username,
        firstName: anonymousParticipant.firstName || undefined,
        lastName: anonymousParticipant.lastName || undefined,
        language: anonymousParticipant.language,
        shareLinkId: anonymousParticipant.shareLinkId,
        permissions: {
          canSendMessages: anonymousParticipant.canSendMessages && (shareLink?.allowAnonymousMessages ?? true),
          canSendFiles: anonymousParticipant.canSendFiles && (shareLink?.allowAnonymousFiles ?? false),
          canSendImages: anonymousParticipant.canSendImages && (shareLink?.allowAnonymousImages ?? true),
          canSendVideos: false, // Non supporté par défaut
          canSendAudios: false, // Non supporté par défaut
          canSendLocations: false, // Non supporté par défaut
          canSendLinks: false // Non supporté par défaut
        }
      };

      return {
        type: 'session',
        isAuthenticated: true,
        isAnonymous: true,
        
        anonymousUser,
        sessionToken,
        
        userLanguage: anonymousUser.language,
        displayName: anonymousUser.firstName && anonymousUser.lastName 
          ? `${anonymousUser.firstName} ${anonymousUser.lastName}`.trim()
          : anonymousUser.username,
        userId: anonymousParticipant.id, // Utiliser l'ID du participant anonyme
        
        canSendMessages: anonymousUser.permissions.canSendMessages,
        hasFullAccess: false
      };

    } catch (error) {
      // Logging maîtrisé pour les tokens de session
      console.warn('[UnifiedAuth] Session token invalide ou participant inactif');
      throw new Error('Invalid session token');
    }
  }

  /**
   * Contexte pour requête non authentifiée
   */
  private createUnauthenticatedContext(): UnifiedAuthContext {
    return {
      type: 'anonymous',
      isAuthenticated: false,
      isAnonymous: true,
      
      userLanguage: 'fr', // Langue par défaut
      displayName: 'Visiteur',
      userId: 'anonymous',
      
      canSendMessages: false,
      hasFullAccess: false
    };
  }
}

// ===== MIDDLEWARE FASTIFY =====

/**
 * Créer le middleware d'authentification unifié pour Fastify
 */
export function createUnifiedAuthMiddleware(
  prisma: PrismaClient,
  options: {
    requireAuth?: boolean;
    allowAnonymous?: boolean;
    statusService?: StatusService;
  } = {}
) {
  const authMiddleware = new AuthMiddleware(prisma, options.statusService);
  
  return async function unifiedAuth(request: FastifyRequest, reply: FastifyReply) {
    try {
      // Créer le contexte d'authentification
      const authContext = await authMiddleware.createAuthContext(
        request.headers.authorization,
        request.headers['x-session-token'] as string
      );

      // Vérifier les exigences d'authentification
      if (options.requireAuth && !authContext.isAuthenticated) {
        return reply.status(401).send({
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }

      if (!options.allowAnonymous && authContext.isAnonymous && authContext.type !== 'jwt') {
        return reply.status(403).send({
          error: 'Registered user required',
          code: 'REGISTERED_USER_REQUIRED'
        });
      }

      // Attacher le contexte à la requête
      (request as UnifiedAuthRequest).authContext = authContext;
      // Backwards compatibility: some legacy routes expect `request.user` to exist
      // Provide a minimal `user` object derived from the unified context so older
      // handlers (that reference `request.user.userId`) continue to work.
      try {
        (request as any).user = (request as any).user || {};
        if (authContext.isAuthenticated && authContext.userId) {
          (request as any).user.userId = authContext.userId;
          (request as any).user.username = authContext.displayName || (authContext.registeredUser && authContext.registeredUser.username);
          (request as any).user.isAnonymous = !!authContext.isAnonymous;
        } else {
          // Ensure user is at least an object to avoid null deref in legacy code
          (request as any).user.userId = (request as any).user.userId || null;
        }
      } catch (e) {
        // Non-blocking; if this fails, don't prevent request processing
        console.error('[UnifiedAuth] Failed to attach legacy request.user:', e);
      }

      // Additional backwards compatibility: some routes expect `request.auth`
      // Provide a minimal `auth` object with userId for preference routes compatibility
      try {
        (request as any).auth = {
          userId: authContext.userId,
          isAuthenticated: authContext.isAuthenticated,
          isAnonymous: authContext.isAnonymous
        };
      } catch (e) {
        // Non-blocking; if this fails, don't prevent request processing
        console.error('[UnifiedAuth] Failed to attach request.auth:', e);
      }

    } catch (error) {
      // Logging maîtrisé - éviter les stack traces complètes
      const errorMessage = error instanceof Error ? error.message : 'Authentication failed';
      console.warn('[UnifiedAuth] Échec authentification:', errorMessage);

      if (options.requireAuth) {
        return reply.status(401).send({
          error: errorMessage,
          code: 'AUTH_FAILED'
        });
      }

      // Si l'auth n'est pas requise, continuer avec contexte non authentifié
      const authMiddleware = new AuthMiddleware(prisma);
      (request as UnifiedAuthRequest).authContext = await authMiddleware.createAuthContext();
    }
  };
}

// ===== HELPER FUNCTIONS =====

/**
 * Vérifier si l'utilisateur est enregistré
 */
export function isRegisteredUser(authContext: UnifiedAuthContext): boolean {
  return authContext.type === 'jwt' && !authContext.isAnonymous;
}

/**
 * Vérifier si l'utilisateur est anonyme
 */
export function isAnonymousUser(authContext: UnifiedAuthContext): boolean {
  return authContext.type === 'session' && authContext.isAnonymous;
}

/**
 * Obtenir les permissions de l'utilisateur
 */
export function getUserPermissions(authContext: UnifiedAuthContext) {
  if (isRegisteredUser(authContext)) {
    return {
      canSendMessages: true,
      canSendFiles: true,
      canSendImages: true,
      canSendVideos: true,
      canSendAudios: true,
      canSendLocations: true,
      canSendLinks: true,
      hasFullAccess: true
    };
  }
  
  if (isAnonymousUser(authContext) && authContext.anonymousUser) {
    return {
      ...authContext.anonymousUser.permissions,
      hasFullAccess: false
    };
  }
  
  return {
    canSendMessages: false,
    canSendFiles: false,
    canSendImages: false,
    canSendVideos: false,
    canSendAudios: false,
    canSendLocations: false,
    canSendLinks: false,
    hasFullAccess: false
  };
}

// ===== MIDDLEWARE COMPATIBILITÉ (LEGACY) =====

/**
 * Middleware d'authentification basique pour compatibilité
 * @deprecated Utiliser createUnifiedAuthMiddleware à la place
 */
export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  console.warn('[AUTH] authenticate() is deprecated, use createUnifiedAuthMiddleware instead');
  
  try {
    const authHeader = request.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new Error('No authorization header');
    }
    
    const token = authHeader.substring(7);
    
    // En mode développement, utiliser le service d'authentification avec les comptes de test
    if (process.env.NODE_ENV === 'development') {
      const { AuthService } = await import('../services/AuthTestService');
      const decoded = AuthService.verifyToken(token);
      
      if (decoded) {
        const user = AuthService.getUserById(decoded.userId);
        if (user) {
          (request as any).user = {
            userId: user.id,
            username: user.username,
            email: user.email,
            role: user.role
          };
          return;
        }
      }
    }

    // En production, utiliser le JWT standard
    await request.jwtVerify();
    
    const { userId, email, username } = request.user as any;
    if (!userId) {
      throw new Error('Invalid token payload: missing userId');
    }
    (request.user as any).id = userId;
    
  } catch (error) {
    console.error('Authentication failed:', error);
    reply.code(401).send({ 
      success: false,
      message: 'Token invalide ou manquant' 
    });
  }
}

/**
 * Middleware de vérification des rôles
 * @deprecated Utiliser getUserPermissions à la place
 */
export function requireRole(allowedRoles: string | string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
    } catch (error) {
      reply.code(403).send({ error: 'Insufficient permissions' });
    }
  };
}

export const requireAdmin = requireRole(['BIGBOSS', 'ADMIN']);
export const requireModerator = requireRole(['BIGBOSS', 'ADMIN', 'MODERATOR']);
export const requireAnalyst = requireRole(['BIGBOSS', 'ADMIN', 'ANALYST']);

export async function requireEmailVerification(request: FastifyRequest, reply: FastifyReply) {
}

export async function requireActiveAccount(request: FastifyRequest, reply: FastifyReply) {
}
