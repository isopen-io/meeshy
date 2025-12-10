/**
 * Schémas de validation renforcés pour Meeshy
 * Assure la sécurité et l'intégrité des données
 */

import { z } from 'zod';
import { isValidEmail } from '../utils/email-validator';

/**
 * Validation stricte du mot de passe
 * - Minimum 12 caractères
 * - Au moins une majuscule
 * - Au moins une minuscule
 * - Au moins un chiffre
 * - Au moins un caractère spécial
 */
export const strongPasswordSchema = z.string()
  .min(12, 'Le mot de passe doit contenir au moins 12 caractères')
  .max(128, 'Le mot de passe ne peut pas dépasser 128 caractères')
  .regex(/[A-Z]/, 'Le mot de passe doit contenir au moins une majuscule')
  .regex(/[a-z]/, 'Le mot de passe doit contenir au moins une minuscule')
  .regex(/[0-9]/, 'Le mot de passe doit contenir au moins un chiffre')
  .regex(/[^A-Za-z0-9]/, 'Le mot de passe doit contenir au moins un caractère spécial (!@#$%^&*...)');

/**
 * Validation stricte de l'email avec validateur personnalisé
 * Rejette les emails invalides comme "debu@", "debute@email", etc.
 */
export const emailSchema = z.string()
  .min(3, 'Email trop court (minimum 3 caractères)')
  .max(255, 'Email trop long (maximum 255 caractères)')
  .trim()
  .toLowerCase()
  .refine((email) => isValidEmail(email), {
    message: 'Format d\'email invalide. Utilisez le format: utilisateur@domaine.com'
  });

/**
 * Validation du numéro de téléphone (format E.164)
 * Exemples valides: +33612345678, +14155552671
 */
export const phoneNumberSchema = z.string()
  .regex(/^\+?[1-9]\d{1,14}$/, 'Format de téléphone invalide (utilisez le format E.164: +33612345678)')
  .optional();

/**
 * Validation du username
 * Le username est préservé tel qu'entré (avec sa capitalisation)
 */
export const usernameSchema = z.string()
  .min(3, 'Le nom d\'utilisateur doit contenir au moins 3 caractères')
  .max(32, 'Le nom d\'utilisateur ne peut pas dépasser 32 caractères')
  .regex(/^[a-zA-Z0-9_-]+$/, 'Le nom d\'utilisateur ne peut contenir que des lettres, chiffres, tirets et underscores')
  .trim();

/**
 * Validation du nom (firstName, lastName)
 */
export const nameSchema = z.string()
  .min(1, 'Le nom est requis')
  .max(50, 'Le nom ne peut pas dépasser 50 caractères')
  .regex(/^[a-zA-ZÀ-ÿ\s'-]+$/, 'Le nom ne peut contenir que des lettres, espaces, apostrophes et tirets')
  .trim();

/**
 * Validation du displayName
 * Préserve la capitalisation, émojis et caractères spéciaux
 * Enlève uniquement les espaces avant/après et les retours à la ligne/tabulations
 */
export const displayNameSchema = z.string()
  .min(2, 'Le nom d\'affichage doit contenir au moins 2 caractères')
  .max(50, 'Le nom d\'affichage ne peut pas dépasser 50 caractères')
  .trim()
  .transform(val => val.replace(/[\n\t]/g, ''))
  .optional();

/**
 * Validation de la bio
 */
export const bioSchema = z.string()
  .max(500, 'La bio ne peut pas dépasser 500 caractères')
  .trim()
  .optional();

/**
 * Validation de l'URL d'avatar
 */
export const avatarUrlSchema = z.string()
  .url('URL d\'avatar invalide')
  .max(2048, 'URL trop longue')
  .optional();

/**
 * Schéma complet de création d'utilisateur avec validation stricte
 */
export const createUserValidationSchema = z.object({
  username: usernameSchema,
  firstName: nameSchema,
  lastName: nameSchema,
  email: emailSchema,
  password: strongPasswordSchema,
  displayName: displayNameSchema,
  bio: bioSchema,
  phoneNumber: phoneNumberSchema,
  role: z.enum(['USER', 'ADMIN', 'MODERATOR', 'BIGBOSS', 'MODO', 'AUDIT', 'ANALYST', 'CREATOR', 'MEMBER']).default('USER'),
  systemLanguage: z.string().length(2, 'Code langue ISO 639-1 requis (2 caractères)').default('en'),
  regionalLanguage: z.string().length(2, 'Code langue ISO 639-1 requis (2 caractères)').default('en')
}).strict();

/**
 * Schéma de mise à jour du profil
 * Tous les champs sont optionnels pour une requête PATCH
 */
export const updateUserProfileValidationSchema = z.object({
  firstName: nameSchema.optional(),
  lastName: nameSchema.optional(),
  displayName: displayNameSchema.optional(),
  bio: bioSchema.optional(),
  systemLanguage: z.string().length(2).optional(),
  regionalLanguage: z.string().length(2).optional(),
  customDestinationLanguage: z.string().length(2).optional(),
  autoTranslateEnabled: z.boolean().optional(),
  translateToSystemLanguage: z.boolean().optional(),
  translateToRegionalLanguage: z.boolean().optional(),
  useCustomDestination: z.boolean().optional()
}).strict();

/**
 * Schéma de changement d'email
 */
export const updateEmailValidationSchema = z.object({
  newEmail: emailSchema,
  password: z.string().min(1, 'Mot de passe requis pour changer l\'email')
}).strict();

/**
 * Schéma de changement de rôle
 */
export const updateRoleValidationSchema = z.object({
  role: z.enum(['USER', 'ADMIN', 'MODERATOR', 'BIGBOSS', 'MODO', 'AUDIT', 'ANALYST', 'CREATOR', 'MEMBER']),
  reason: z.string().min(10, 'Raison requise (minimum 10 caractères)').max(500).optional()
}).strict();

/**
 * Schéma de changement de statut
 */
export const updateStatusValidationSchema = z.object({
  isActive: z.boolean(),
  reason: z.string().min(10, 'Raison requise (minimum 10 caractères)').max(500).optional()
}).strict();

/**
 * Schéma de réinitialisation de mot de passe
 */
export const resetPasswordValidationSchema = z.object({
  newPassword: strongPasswordSchema,
  reason: z.string().min(10, 'Raison requise (minimum 10 caractères)').max(500).optional()
}).strict();

/**
 * Schéma de connexion
 */
export const loginValidationSchema = z.object({
  username: z.string().min(1, 'Nom d\'utilisateur ou email requis').trim(),
  password: z.string().min(1, 'Mot de passe requis')
}).strict();

/**
 * Validation d'ID MongoDB
 */
export const mongoIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'ID MongoDB invalide');

/**
 * Schéma de pagination
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20)
});

/**
 * Helper pour valider et formater les erreurs Zod
 */
export function formatZodErrors(error: z.ZodError): string {
  return error.issues
    .map((err: z.ZodIssue) => `${err.path.join('.')}: ${err.message}`)
    .join(', ');
}

/**
 * Helper pour validation sécurisée
 */
export function safeValidate<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: string } {
  try {
    const validated = schema.parse(data);
    return { success: true, data: validated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: formatZodErrors(error) };
    }
    return { success: false, error: 'Erreur de validation inconnue' };
  }
}
