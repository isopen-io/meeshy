import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { AuthenticationContext, AuthenticationType } from '@meeshy/shared/types';

interface AuthTestRequest extends FastifyRequest {
  headers: {
    authorization?: string;
    'x-session-token'?: string;
    [key: string]: any;
  };
}

/**
 * Créer le contexte d'authentification robuste
 * Phase 3.1.1 - JWT Token ID = utilisateurs enregistrés, X SESSION TOKEN = utilisateurs anonymes
 */
function createAuthenticationContext(
  authorizationHeader?: string,
  sessionToken?: string
): AuthenticationContext {
  // Extraire le JWT token depuis Authorization header
  const jwtToken = authorizationHeader?.startsWith('Bearer ') 
    ? authorizationHeader.slice(7) 
    : null;

  // Déterminer le type d'authentification
  if (jwtToken) {
    return {
      type: 'jwt' as AuthenticationType,
      jwtToken: jwtToken,
      isAnonymous: false
    };
  } else if (sessionToken) {
    return {
      type: 'session' as AuthenticationType,
      sessionToken: sessionToken,
      isAnonymous: true
    };
  } else {
    return {
      type: 'anonymous' as AuthenticationType,
      isAnonymous: true
    };
  }
}

export async function authTestRoutes(fastify: FastifyInstance) {
  // Endpoint pour tester l'authentification robuste
  fastify.get('/test-auth', async (request: AuthTestRequest, reply: FastifyReply) => {
    try {
      // Créer le contexte d'authentification robuste
      const authContext = createAuthenticationContext(
        request.headers.authorization,
        request.headers['x-session-token']
      );

      // Préparer la réponse de test
      const response = {
        timestamp: new Date().toISOString(),
        authenticationTest: {
          detected: {
            type: authContext.type,
            isAnonymous: authContext.isAnonymous,
            hasJwtToken: !!authContext.jwtToken,
            hasSessionToken: !!authContext.sessionToken
          },
          headers: {
            authorization: request.headers.authorization ? '***PRESENT***' : null,
            sessionToken: request.headers['x-session-token'] ? '***PRESENT***' : null
          }
        },
        interpretation: {
          userType: authContext.isAnonymous ? 'ANONYMOUS_USER' : 'REGISTERED_USER',
          requestType: authContext.type === 'jwt' 
            ? 'JWT_TOKEN_REQUEST' 
            : authContext.type === 'session' 
            ? 'SESSION_TOKEN_REQUEST' 
            : 'UNAUTHENTICATED_REQUEST',
          description: authContext.type === 'jwt' 
            ? 'Requête d\'utilisateur enregistré avec JWT Token ID'
            : authContext.type === 'session'
            ? 'Requête d\'utilisateur anonyme avec X Session Token'
            : 'Requête non authentifiée (anonyme par défaut)'
        },
        implementation: {
          phase: "Phase 3.1.1 - Authentification Robuste",
          requirement: "JWT Token ID = utilisateurs enregistrés, X SESSION TOKEN = utilisateurs anonymes",
          status: "IMPLEMENTED ✅"
        }
      };

      reply.status(200).send(response);

    } catch (error) {
      reply.status(500).send({
        timestamp: new Date().toISOString(),
        error: 'Authentication test failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Endpoint pour tester seulement la détection de type d'authentification
  fastify.get('/test-auth-type', async (request: AuthTestRequest, reply: FastifyReply) => {
    try {
      const authContext = createAuthenticationContext(
        request.headers.authorization,
        request.headers['x-session-token']
      );

      const simpleResponse = {
        type: authContext.type,
        isAnonymous: authContext.isAnonymous,
        userCategory: authContext.isAnonymous ? 'ANONYMOUS' : 'REGISTERED',
        tokenPresent: !!(authContext.jwtToken || authContext.sessionToken)
      };

      reply.status(200).send(simpleResponse);

    } catch (error) {
      reply.status(500).send({
        error: 'Authentication type test failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
}
