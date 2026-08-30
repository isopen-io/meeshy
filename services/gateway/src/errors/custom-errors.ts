/**
 * Classes d'erreur personnalisées pour Meeshy Gateway
 * Fournit des codes d'erreur spécifiques et des messages clairs
 */

import { enhancedLogger } from '../utils/logger-enhanced.js';

const logger = enhancedLogger.child({ module: 'CustomErrors' });

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
  constructor(resource: string, identifier?: string, code = 'NOT_FOUND') {
    const message = identifier
      ? `${resource} avec l'identifiant ${identifier} non trouvé`
      : `${resource} non trouvé`;
    super(message, 404, code);
  }
}

export class UserNotFoundError extends NotFoundError {
  constructor(identifier?: string) {
    super('Utilisateur', identifier, 'USER_NOT_FOUND');
  }
}

// ========== CONFLITS ==========

export class ConflictError extends BaseAppError {
  constructor(message: string, code = 'CONFLICT') {
    super(message, 409, code);
  }
}

export class UserAlreadyExistsError extends ConflictError {
  constructor(field: 'email' | 'username', value: string) {
    super(`Un utilisateur avec ${field === 'email' ? 'cet email' : 'ce nom d\'utilisateur'} existe déjà: ${value}`, 'USER_ALREADY_EXISTS');
  }
}

export class DuplicateEmailError extends ConflictError {
  constructor(email: string) {
    super(`Un compte avec l'email ${email} existe déjà`, 'DUPLICATE_EMAIL');
  }
}

export class DuplicateUsernameError extends ConflictError {
  constructor(username: string) {
    super(`Le nom d'utilisateur ${username} est déjà pris`, 'DUPLICATE_USERNAME');
  }
}

// ========== VALIDATION ==========

export class ValidationError extends BaseAppError {
  public readonly errors: Record<string, string>;

  constructor(message: string, errors: Record<string, string> = {}, code = 'VALIDATION_ERROR') {
    super(message, 400, code);
    this.errors = errors;
  }
}

export class InvalidInputError extends ValidationError {
  constructor(field: string, message: string) {
    super(`Champ invalide: ${field}`, { [field]: message }, 'INVALID_INPUT');
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
  public readonly retryAfter: number;

  constructor(retryAfter: number, message?: string, code = 'RATE_LIMIT_EXCEEDED') {
    super(message ?? `Trop de requêtes. Réessayez dans ${retryAfter} secondes`, 429, code);
    this.retryAfter = retryAfter;
  }
}

export class TooManyLoginAttemptsError extends RateLimitError {
  constructor(retryAfter: number) {
    super(retryAfter, `Trop de tentatives de connexion échouées. Réessayez dans ${retryAfter} secondes`, 'TOO_MANY_LOGIN_ATTEMPTS');
  }
}

// ========== TRADUCTION ==========

export class TranslationError extends BaseAppError {
  constructor(message = 'Translation failed') {
    super(message, 500, 'TRANSLATION_ERROR');
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
 * `errorHandler` a été SUPPRIMÉ (#4212).
 *
 * Il rendait correctement toute la hiérarchie — code, message, champs propres —
 * et n'était **enregistré nulle part**. Le seul `setErrorHandler` du dépôt vit
 * dans `server.ts`, et il ne connaissait que trois sous-classes sur dix-neuf.
 *
 * Deux handlers dont un mort n'est pas un état tenable : le mort donne
 * l'illusion que la question est traitée, et c'est exactement ce qui a laissé
 * seize sous-classes tomber dans le repli générique pendant toute leur vie.
 *
 * La logique qu'il portait vit désormais dans l'unique handler enregistré,
 * sous une seule branche `instanceof BaseAppError`. Il n'y a plus de forme à
 * recopier : il y a un handler.
 */

/** Le libellé lisible d'une classe d'erreur — `UserLockedError` → `User Locked`. */
export function humanizeErrorName(name: string): string {
  return name
    .replace(/Error$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim() || 'Error';
}

/** La forme SERVIE d'une erreur typée. */
export type TypedErrorBody = {
  readonly success: false;
  readonly error: string;
  readonly code: string;
  readonly message: string;
  readonly statusCode: number;
  readonly errors?: Record<string, string>;
  readonly retryAfter?: number;
  readonly lockedUntil?: string;
};

/**
 * Ce qu'une erreur TYPÉE doit rendre — ou `null` si elle ne l'est pas.
 *
 * ## Pourquoi une fonction PURE, et pas une branche dans le handler
 *
 * Le handler enregistré vit dans une méthode de `MeeshyServer` : on ne peut
 * l'exercer qu'en montant un serveur. Cette décision-ci — quel corps pour
 * quelle classe — se teste classe par classe sans rien monter, et c'est ce que
 * demande le critère : **un témoin par sous-classe**.
 *
 * ## Les messages sortent en PRODUCTION
 *
 * C'est le cœur du correctif. Le repli générique les remplaçait par « An
 * unexpected error occurred » hors développement, et jetait les champs propres
 * à la classe. Ces messages sont RÉDIGÉS pour l'utilisateur — relus classe par
 * classe : aucun ne cite un chemin, une requête, un identifiant interne ni une
 * trace. Les servir est tout l'objet du lot ; ne les servir qu'en
 * développement, c'est n'avoir corrigé personne.
 */
export function typedErrorResponse(error: unknown): TypedErrorBody | null {
  if (!(error instanceof BaseAppError)) return null;

  return {
    success: false,
    // Dérivé du NOM de la classe : trois branches manuscrites portaient ce
    // libellé, et les seize autres classes n'en avaient aucun. Dérivé, il ne
    // peut plus manquer à une classe neuve.
    error: humanizeErrorName(error.name),
    code: error.code,
    message: error.message,
    statusCode: error.statusCode,
    // Les champs PROPRES à la sous-classe — ceux que le repli jetait, et ceux
    // qui portent l'action que l'utilisateur peut entreprendre : quand
    // revenir, combien de temps attendre, quel champ corriger.
    ...(error instanceof ValidationError && { errors: error.errors }),
    ...(error instanceof RateLimitError && { retryAfter: error.retryAfter }),
    ...(error instanceof UserLockedError && error.lockedUntil && {
      lockedUntil: error.lockedUntil.toISOString(),
    }),
  };
}
