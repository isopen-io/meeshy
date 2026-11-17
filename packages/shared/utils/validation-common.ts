import { z } from 'zod';
import { ErrorCode } from '../types/errors.js';
import { createError } from './errors.js';
import { OBJECT_ID_REGEX } from './object-id.js';
import { usernameMinLength } from '../types/api-schemas/identity-bounds.js';
import { USERNAME_PATTERN, usernameTooShort } from './validation-primitives.js';

/**
 * Pagination, validation générique et schémas communs (identifiants, pagination, langues).
 * Extrait de `validation.ts` (#19037), qui le ré-exporte.
 */

const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 100;

/**
 * Clamp a query-string `limit` to `[1, MAX_PAGE_LIMIT]`, falling back to the
 * default ONLY when the input is missing or unparsable (`NaN`). An explicit
 * `'0'`/`'-5'` is a real number and floors to 1 — it is never falsy-coerced to
 * the default. Single source shared by both pagination schemas.
 */
function clampLimit(val: string | undefined): number {
  const parsed = parseInt(val ?? '', 10);
  const requested = Number.isNaN(parsed) ? DEFAULT_PAGE_LIMIT : parsed;
  return Math.min(Math.max(1, requested), MAX_PAGE_LIMIT);
}

function clampOffset(val: string | undefined): number {
  const parsed = parseInt(val ?? '', 10);
  return Math.max(0, Number.isNaN(parsed) ? 0 : parsed);
}

/**
 * Valider un schéma Zod et retourner une erreur standardisée
 */
export function validateSchema<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  context?: string
): T {
  const result = schema.safeParse(data);

  if (!result.success) {
    const errors = result.error.issues.map((err) => ({
      path: err.path.join('.'),
      message: err.message,
    }));
    
    throw createError(
      ErrorCode.VALIDATION_ERROR,
      'Données invalides',
      { errors, context }
    );
  }
  
  return result.data;
}

// =============================================================================
// COMMON SCHEMAS
// =============================================================================

/**
 * Schémas de validation réutilisables
 */
export const CommonSchemas = {
  // Pagination — the default is the fallback for MISSING/unparsable input only
  // (`NaN`). An explicit but below-minimum value (`'0'`, `'-5'`) is a real parsed
  // number and must clamp to the floor of 1 — never be falsy-coerced to the
  // default. The former `parseInt(...) || 20` conflated `0` with "absent", so
  // `limit=0` leaked a full page (20) while `limit=-5` clamped to 1. Truly
  // mirrors the gateway's validatePagination (services/gateway/src/utils/pagination.ts).
  pagination: z.object({
    limit: z.string().optional().transform((val) => clampLimit(val)),
    offset: z.string().optional().transform((val) => clampOffset(val)),
  }),

  // Message pagination
  messagePagination: z.object({
    limit: z.string().optional().transform((val) => clampLimit(val)),
    offset: z.string().optional().transform((val) => clampOffset(val)),
    before: z.string().optional(),
  }),
  
  // ID MongoDB — regex issue de la SSOT `utils/object-id.ts`
  mongoId: z.string().regex(OBJECT_ID_REGEX, 'ID MongoDB invalide'),
  
  // Langue — ISO 639-1 (2 lettres) OU ISO 639-3 (3 lettres, ex. 'bas', 'ksf',
  // 'nnh', 'ewo' — langues camerounaises officiellement supportées, préservées
  // verbatim par normalizeLanguageCode), avec sous-tag région BCP-47 optionnel.
  // Le corps `{2}` seul rejetait tout code 639-3 sur sendMessage/editMessage
  // alors que systemLanguage/regionalLanguage (refine isSupportedLanguage) les
  // acceptent — incohérence qui bloquait l'envoi dans une langue supportée.
  // La borne `.max(6)` reflète la longueur MAXIMALE de la regex (`[a-z]{3}` + `-`
  // + `[A-Z]{2}` = 6, ex. `bas-CM`) : un `.max(5)` contredisait la regex et
  // rejetait la forme 639-3 + région, laissant ouverte la même régression pour
  // les codes 3-lettres régionalisés. La regex reste l'unique gardien de forme.
  language: z.string().min(2).max(6).regex(/^[a-z]{2,3}(-[A-Z]{2})?$/, 'Code langue invalide'),
  
  // Type de conversation
  conversationType: z.enum(['direct', 'group', 'public', 'global', 'broadcast']),
  
  // Type de message (aligned with messageTypeEnum)
  messageType: z.enum(['text', 'image', 'file', 'audio', 'video', 'location', 'system']),
  
  // Contenu de message
  messageContent: z.string().min(1, 'Le message ne peut pas être vide').max(10000, 'Message trop long'),
  
  // Titre de conversation
  conversationTitle: z.string().min(1, 'Le titre ne peut pas être vide').max(100, 'Titre trop long'),
  
  // Description
  description: z.string().max(500, 'Description trop longue').optional(),
  
  // Email
  email: z.email('Email invalide'),
  
  // Username
  username: z.string().min(usernameMinLength, usernameTooShort).max(30, 'Username trop long')
    .regex(USERNAME_PATTERN, 'Username invalide'),
  
  // Conversation identifier (custom identifier for conversations)
  conversationIdentifier: z.string()
    .min(1, 'L\'identifiant ne peut pas être vide')
    .max(50, 'Identifiant trop long')
    .regex(/^[a-zA-Z0-9\-_@]*$/, 'L\'identifiant ne peut contenir que des lettres, chiffres, tirets, underscores et @')
    .optional(),
};
