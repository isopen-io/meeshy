/**
 * Classes d'erreur personnalisées pour Meeshy Gateway
 * Fournit des codes d'erreur spécifiques et des messages clairs
 */

export class BaseAppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number, code: string, isOperational = true) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

// ========== AUTHENTIFICATION ==========

export class AuthenticationError extends BaseAppError {
  constructor(message = 'Échec de l\'authentification') {
    super(message, 401, 'AUTH_FAILED');
  }
}

export class InvalidCredentialsError extends BaseAppError {
  constructor(message = 'Identifiants invalides') {
    super(message, 401, 'INVALID_CREDENTIALS');
  }
}

export class TokenExpiredError extends BaseAppError {
  constructor(message = 'Token expiré') {
    super(message, 401, 'TOKEN_EXPIRED');
  }
}

export class TokenInvalidError extends BaseAppError {
  constructor(message = 'Token invalide') {
    super(message, 401, 'TOKEN_INVALID');
  }
}

// ========== AUTORISATION ==========

export class PermissionDeniedError extends BaseAppError {
  constructor(message = 'Permission refusée') {
    super(message, 403, 'PERMISSION_DENIED');
  }
}

export class InsufficientPermissionsError extends BaseAppError {
  constructor(message = 'Permissions insuffisantes pour effectuer cette action') {
    super(message, 403, 'INSUFFICIENT_PERMISSIONS');
  }
}

// ========== RESSOURCES ==========

export class NotFoundError extends BaseAppError {
  constructor(resource: string, identifier?: string) {
    const message = identifier
      ? `${resource} avec l'identifiant ${identifier} non trouvé`
      : `${resource} non trouvé`;
    super(message, 404, 'NOT_FOUND');
  }
}

export class UserNotFoundError extends NotFoundError {
  constructor(identifier?: string) {
    super('Utilisateur', identifier);
    this.code = 'USER_NOT_FOUND';
  }
}

// ========== CONFLITS ==========

export class ConflictError extends BaseAppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
  }
}

export class UserAlreadyExistsError extends ConflictError {
  constructor(field: 'email' | 'username', value: string) {
    super(`Un utilisateur avec ${field === 'email' ? 'cet email' : 'ce nom d\'utilisateur'} existe déjà: ${value}`);
    this.code = 'USER_ALREADY_EXISTS';
  }
}

export class DuplicateEmailError extends ConflictError {
  constructor(email: string) {
    super(`Un compte avec l'email ${email} existe déjà`);
    this.code = 'DUPLICATE_EMAIL';
  }
}

export class DuplicateUsernameError extends ConflictError {
  constructor(username: string) {
    super(`Le nom d'utilisateur ${username} est déjà pris`);
    this.code = 'DUPLICATE_USERNAME';
  }
}

// ========== VALIDATION ==========

export class ValidationError extends BaseAppError {
  public readonly errors: Record<string, string>;

  constructor(message: string, errors: Record<string, string> = {}) {
    super(message, 400, 'VALIDATION_ERROR');
    this.errors = errors;
  }
}

export class InvalidInputError extends ValidationError {
  constructor(field: string, message: string) {
    super(`Champ invalide: ${field}`, { [field]: message });
    this.code = 'INVALID_INPUT';
  }
}

// ========== COMPTE UTILISATEUR ==========

export class UserLockedError extends BaseAppError {
  public readonly lockedUntil?: Date;

  constructor(lockedUntil?: Date) {
    const message = lockedUntil
      ? `Compte verrouillé jusqu'à ${lockedUntil.toLocaleString('fr-FR')}`
      : 'Compte verrouillé';
    super(message, 423, 'USER_LOCKED');
    this.lockedUntil = lockedUntil;
  }
}

export class UserInactiveError extends BaseAppError {
  constructor(message = 'Compte inactif ou désactivé') {
    super(message, 403, 'USER_INACTIVE');
  }
}

export class UserDeletedError extends BaseAppError {
  constructor(message = 'Ce compte a été supprimé') {
    super(message, 410, 'USER_DELETED');
  }
}

export class EmailNotVerifiedError extends BaseAppError {
  constructor(message = 'Veuillez vérifier votre email avant de continuer') {
    super(message, 403, 'EMAIL_NOT_VERIFIED');
  }
}

// ========== RATE LIMITING ==========

export class RateLimitError extends BaseAppError {
  public readonly retryAfter: number; // seconds

  constructor(retryAfter: number) {
    super(`Trop de requêtes. Réessayez dans ${retryAfter} secondes`, 429, 'RATE_LIMIT_EXCEEDED');
    this.retryAfter = retryAfter;
  }
}

export class TooManyLoginAttemptsError extends RateLimitError {
  constructor(retryAfter: number) {
    super(retryAfter);
    this.message = `Trop de tentatives de connexion échouées. Réessayez dans ${retryAfter} secondes`;
    this.code = 'TOO_MANY_LOGIN_ATTEMPTS';
  }
}

// ========== SERVEUR ==========

export class InternalServerError extends BaseAppError {
  constructor(message = 'Erreur interne du serveur', isOperational = false) {
    super(message, 500, 'INTERNAL_SERVER_ERROR', isOperational);
  }
}

export class ServiceUnavailableError extends BaseAppError {
  constructor(service: string) {
    super(`Service ${service} temporairement indisponible`, 503, 'SERVICE_UNAVAILABLE');
  }
}

// ========== PRISMA ERRORS MAPPING ==========

/**
 * Convertit les erreurs Prisma en erreurs personnalisées
 */
export function handlePrismaError(error: any): BaseAppError {
  // Prisma error codes: https://www.prisma.io/docs/reference/api-reference/error-reference

  if (error.code === 'P2002') {
    // Unique constraint violation
    const field = error.meta?.target?.[0];
    if (field === 'email') {
      return new DuplicateEmailError(error.meta?.target?.[1] || 'email');
    }
    if (field === 'username') {
      return new DuplicateUsernameError(error.meta?.target?.[1] || 'username');
    }
    return new ConflictError('Cette valeur existe déjà dans la base de données');
  }

  if (error.code === 'P2025') {
    // Record not found
    return new NotFoundError('Ressource');
  }

  if (error.code === 'P2003') {
    // Foreign key constraint failed
    return new ValidationError('Référence invalide', { reference: 'La ressource référencée n\'existe pas' });
  }

  if (error.code === 'P2032') {
    // Data validation error
    const field = error.meta?.field || 'champ';
    return new ValidationError(`Erreur de validation: ${field}`, { [field]: error.message });
  }

  // Erreur Prisma non gérée
  return new InternalServerError('Erreur de base de données', false);
}

/**
 * Handler d'erreur global pour Fastify
 */
export function errorHandler(error: Error, request: any, reply: any) {
  // Si c'est déjà une erreur personnalisée
  if (error instanceof BaseAppError) {
    return reply.status(error.statusCode).send({
      success: false,
      error: {
        code: error.code,
        message: error.message,
        ...(error instanceof ValidationError && { errors: error.errors }),
        ...(error instanceof RateLimitError && { retryAfter: error.retryAfter }),
        ...(error instanceof UserLockedError && error.lockedUntil && {
          lockedUntil: error.lockedUntil.toISOString()
        })
      }
    });
  }

  // Erreur Prisma
  if (error.name === 'PrismaClientKnownRequestError') {
    const customError = handlePrismaError(error);
    return errorHandler(customError, request, reply);
  }

  // Erreur Zod
  if (error.name === 'ZodError') {
    const zodError = error as any;
    const errors: Record<string, string> = {};
    zodError.errors?.forEach((err: any) => {
      const path = err.path.join('.');
      errors[path] = err.message;
    });
    const validationError = new ValidationError('Données invalides', errors);
    return errorHandler(validationError, request, reply);
  }

  // Erreur non gérée - log et retour 500
  console.error('Unhandled error:', error);
  return reply.status(500).send({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: process.env.NODE_ENV === 'production'
        ? 'Une erreur interne est survenue'
        : error.message
    }
  });
}
