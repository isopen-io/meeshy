/**
 * Utilitaires pour la gestion d'erreurs standardisées
 * Utilisables dans Gateway et Frontend
 */

import { ErrorCode, ErrorMessages, ErrorStatusMap, type StandardError } from '../types/errors.js';

/**
 * Classe d'erreur personnalisée pour Meeshy
 */
export class MeeshyError extends Error {
  public readonly code: ErrorCode;
  public readonly status: number;
  public readonly details?: Record<string, unknown>;
  public readonly timestamp: string;

  constructor(
    code: ErrorCode,
    message?: string,
    details?: Record<string, unknown>,
    lang: 'fr' | 'en' = 'en'
  ) {
    const errorMessage = message || ErrorMessages[code][lang];
    super(errorMessage);
    
    this.name = 'MeeshyError';
    this.code = code;
    this.status = ErrorStatusMap[code];
    this.details = details;
    this.timestamp = new Date().toISOString();
    
    // Maintenir la pile d'appels (Node.js uniquement)
    if (typeof (Error as any).captureStackTrace === 'function') {
      (Error as any).captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Convertir en format JSON pour réponse API
   */
  toJSON(): StandardError {
    return {
      code: this.code,
      message: this.message,
      status: this.status,
      details: this.details,
      timestamp: this.timestamp,
    };
  }

  /**
   * Vérifier si l'erreur est une erreur client (4xx)
   */
  isClientError(): boolean {
    return this.status >= 400 && this.status < 500;
  }

  /**
   * Vérifier si l'erreur est une erreur serveur (5xx)
   */
  isServerError(): boolean {
    return this.status >= 500;
  }
}

/**
 * Créer une erreur standardisée rapidement
 */
export function createError(
  code: ErrorCode,
  message?: string,
  details?: Record<string, unknown>,
  lang: 'fr' | 'en' = 'en'
): MeeshyError {
  return new MeeshyError(code, message, details, lang);
}

/**
 * Wrapper pour les opérations asynchrones avec gestion d'erreur
 */
export async function handleAsync<T>(
  operation: () => Promise<T>,
  errorCode: ErrorCode = ErrorCode.INTERNAL_ERROR,
  context?: string
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof MeeshyError) {
      throw error;
    }
    
    const details: Record<string, unknown> = {
      originalError: error instanceof Error ? error.message : String(error),
    };
    
    if (context) {
      details.context = context;
    }
    
    throw createError(errorCode, undefined, details);
  }
}

/**
 * Logger d'erreur standardisé (utiliser uniquement pour les erreurs serveur)
 */
export function logError(error: Error | MeeshyError, context?: string): void {
  const timestamp = new Date().toISOString();
  const prefix = `[ERROR ${timestamp}]`;
  
  if (error instanceof MeeshyError) {
    // Ne logger que les erreurs serveur (5xx)
    if (error.isServerError()) {
      console.error(`${prefix} [${error.code}]`, {
        message: error.message,
        status: error.status,
        details: error.details,
        context,
        stack: error.stack,
      });
    }
  } else {
    // Erreurs non gérées - toujours logger
    console.error(`${prefix} [UNHANDLED]`, {
      message: error.message,
      context,
      stack: error.stack,
    });
  }
}

/**
 * Wrapper pour créer une réponse d'erreur Fastify
 */
export function sendErrorResponse(
  reply: any,
  error: Error | MeeshyError,
  context?: string
): void {
  logError(error, context);
  
  if (error instanceof MeeshyError) {
    reply.status(error.status).send({
      success: false,
      error: error.message,
      code: error.code,
      ...(error.details && { details: error.details }),
    });
  } else {
    // Erreur non gérée - réponse générique
    reply.status(500).send({
      success: false,
      error: ErrorMessages[ErrorCode.INTERNAL_ERROR].fr,
      code: ErrorCode.INTERNAL_ERROR,
    });
  }
}
