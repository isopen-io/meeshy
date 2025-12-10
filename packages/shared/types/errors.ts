/**
 * Types d'erreurs standardisés pour Meeshy
 * Utilisables dans Gateway et Frontend
 */

/**
 * Codes d'erreur standardisés
 */
export enum ErrorCode {
  // Authentication & Authorization (1xxx)
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  INVALID_TOKEN = 'INVALID_TOKEN',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  
  // Validation (2xxx)
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_INPUT = 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
  
  // Resources (3xxx)
  NOT_FOUND = 'NOT_FOUND',
  CONVERSATION_NOT_FOUND = 'CONVERSATION_NOT_FOUND',
  MESSAGE_NOT_FOUND = 'MESSAGE_NOT_FOUND',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  
  // Permissions (4xxx)
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',
  CANNOT_MODIFY_MESSAGE = 'CANNOT_MODIFY_MESSAGE',
  CANNOT_DELETE_MESSAGE = 'CANNOT_DELETE_MESSAGE',
  CANNOT_ACCESS_CONVERSATION = 'CANNOT_ACCESS_CONVERSATION',
  
  // Business Logic (5xxx)
  ALREADY_EXISTS = 'ALREADY_EXISTS',
  ALREADY_MEMBER = 'ALREADY_MEMBER',
  INVALID_OPERATION = 'INVALID_OPERATION',
  MESSAGE_TOO_OLD = 'MESSAGE_TOO_OLD',
  
  // System (9xxx)
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  TRANSLATION_ERROR = 'TRANSLATION_ERROR',
  SOCKET_ERROR = 'SOCKET_ERROR',
}

/**
 * Messages d'erreur standardisés (français et anglais)
 */
export const ErrorMessages: Record<ErrorCode, { fr: string; en: string }> = {
  // Authentication & Authorization
  [ErrorCode.UNAUTHORIZED]: {
    fr: 'Authentification requise',
    en: 'Authentication required',
  },
  [ErrorCode.FORBIDDEN]: {
    fr: 'Accès refusé',
    en: 'Access denied',
  },
  [ErrorCode.INVALID_TOKEN]: {
    fr: 'Token invalide',
    en: 'Invalid token',
  },
  [ErrorCode.TOKEN_EXPIRED]: {
    fr: 'Token expiré',
    en: 'Token expired',
  },
  
  // Validation
  [ErrorCode.VALIDATION_ERROR]: {
    fr: 'Erreur de validation',
    en: 'Validation error',
  },
  [ErrorCode.INVALID_INPUT]: {
    fr: 'Données invalides',
    en: 'Invalid input',
  },
  [ErrorCode.MISSING_REQUIRED_FIELD]: {
    fr: 'Champ requis manquant',
    en: 'Missing required field',
  },
  
  // Resources
  [ErrorCode.NOT_FOUND]: {
    fr: 'Ressource non trouvée',
    en: 'Resource not found',
  },
  [ErrorCode.CONVERSATION_NOT_FOUND]: {
    fr: 'Conversation non trouvée',
    en: 'Conversation not found',
  },
  [ErrorCode.MESSAGE_NOT_FOUND]: {
    fr: 'Message non trouvé',
    en: 'Message not found',
  },
  [ErrorCode.USER_NOT_FOUND]: {
    fr: 'Utilisateur non trouvé',
    en: 'User not found',
  },
  
  // Permissions
  [ErrorCode.INSUFFICIENT_PERMISSIONS]: {
    fr: 'Permissions insuffisantes',
    en: 'Insufficient permissions',
  },
  [ErrorCode.CANNOT_MODIFY_MESSAGE]: {
    fr: 'Impossible de modifier ce message',
    en: 'Cannot modify this message',
  },
  [ErrorCode.CANNOT_DELETE_MESSAGE]: {
    fr: 'Impossible de supprimer ce message',
    en: 'Cannot delete this message',
  },
  [ErrorCode.CANNOT_ACCESS_CONVERSATION]: {
    fr: 'Accès à la conversation refusé',
    en: 'Cannot access conversation',
  },
  
  // Business Logic
  [ErrorCode.ALREADY_EXISTS]: {
    fr: 'Cette ressource existe déjà',
    en: 'Resource already exists',
  },
  [ErrorCode.ALREADY_MEMBER]: {
    fr: 'Déjà membre de cette conversation',
    en: 'Already member of this conversation',
  },
  [ErrorCode.INVALID_OPERATION]: {
    fr: 'Opération invalide',
    en: 'Invalid operation',
  },
  [ErrorCode.MESSAGE_TOO_OLD]: {
    fr: 'Le message est trop ancien pour être modifié',
    en: 'Message is too old to be modified',
  },
  
  // System
  [ErrorCode.INTERNAL_ERROR]: {
    fr: 'Erreur interne du serveur',
    en: 'Internal server error',
  },
  [ErrorCode.DATABASE_ERROR]: {
    fr: 'Erreur de base de données',
    en: 'Database error',
  },
  [ErrorCode.TRANSLATION_ERROR]: {
    fr: 'Erreur de traduction',
    en: 'Translation error',
  },
  [ErrorCode.SOCKET_ERROR]: {
    fr: 'Erreur de communication temps réel',
    en: 'Real-time communication error',
  },
};

/**
 * Structure d'erreur standardisée
 */
export interface StandardError {
  code: ErrorCode;
  message: string;
  status: number;
  details?: Record<string, unknown>;
  timestamp?: string;
}

/**
 * Map des codes d'erreur vers les status HTTP
 */
export const ErrorStatusMap: Record<ErrorCode, number> = {
  // Authentication & Authorization (401, 403)
  [ErrorCode.UNAUTHORIZED]: 401,
  [ErrorCode.FORBIDDEN]: 403,
  [ErrorCode.INVALID_TOKEN]: 401,
  [ErrorCode.TOKEN_EXPIRED]: 401,
  
  // Validation (400)
  [ErrorCode.VALIDATION_ERROR]: 400,
  [ErrorCode.INVALID_INPUT]: 400,
  [ErrorCode.MISSING_REQUIRED_FIELD]: 400,
  
  // Resources (404)
  [ErrorCode.NOT_FOUND]: 404,
  [ErrorCode.CONVERSATION_NOT_FOUND]: 404,
  [ErrorCode.MESSAGE_NOT_FOUND]: 404,
  [ErrorCode.USER_NOT_FOUND]: 404,
  
  // Permissions (403)
  [ErrorCode.INSUFFICIENT_PERMISSIONS]: 403,
  [ErrorCode.CANNOT_MODIFY_MESSAGE]: 403,
  [ErrorCode.CANNOT_DELETE_MESSAGE]: 403,
  [ErrorCode.CANNOT_ACCESS_CONVERSATION]: 403,
  
  // Business Logic (409, 422)
  [ErrorCode.ALREADY_EXISTS]: 409,
  [ErrorCode.ALREADY_MEMBER]: 409,
  [ErrorCode.INVALID_OPERATION]: 422,
  [ErrorCode.MESSAGE_TOO_OLD]: 422,
  
  // System (500)
  [ErrorCode.INTERNAL_ERROR]: 500,
  [ErrorCode.DATABASE_ERROR]: 500,
  [ErrorCode.TRANSLATION_ERROR]: 500,
  [ErrorCode.SOCKET_ERROR]: 500,
};
