import { z } from 'zod';

/**
 * Schéma pour créer un utilisateur
 */
export const createUserValidationSchema = z.object({
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_-]+$/),
  firstName: z.string().min(1).max(50),
  lastName: z.string().min(1).max(50),
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().max(50).nullable().optional(),
  bio: z.string().max(500).optional(),
  phoneNumber: z.string().max(20).nullable().optional(),
  role: z.string().optional(),
  systemLanguage: z.string().length(2).optional(),
  regionalLanguage: z.string().length(2).nullable().optional(),
});

/**
 * Schéma pour changer l'email
 */
export const updateEmailValidationSchema = z.object({
  newEmail: z.string().email(),
  password: z.string().min(1)
});

/**
 * Schéma pour changer le rôle
 */
export const updateRoleValidationSchema = z.object({
  role: z.string(),
  reason: z.string().min(10).optional()
});

/**
 * Schéma pour changer le statut
 */
export const updateStatusValidationSchema = z.object({
  isActive: z.boolean(),
  reason: z.string().min(10).optional()
});

/**
 * Schéma pour réinitialiser le mot de passe
 */
export const resetPasswordValidationSchema = z.object({
  newPassword: z.string().min(8),
  sendEmail: z.boolean().optional(),
  reason: z.string().optional()
});

/**
 * Fonction utilitaire pour formater les erreurs Zod
 */
export function formatZodErrors(errors: z.ZodError) {
  return errors.errors.map((err) => ({
    path: err.path.join('.'),
    message: err.message
  }));
}

/**
 * Schéma de validation pour la mise à jour d'un utilisateur par un admin
 */
export const updateUserProfileValidationSchema = z.object({
  // Informations personnelles
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_-]+$/).optional(),
  firstName: z.string().min(1).max(50).optional(),
  lastName: z.string().min(1).max(50).optional(),
  displayName: z.string().max(50).nullable().optional(),
  bio: z.string().max(500).optional(),

  // Médias
  avatar: z.string().url().nullable().optional(),
  banner: z.string().url().nullable().optional(),

  // Contact
  email: z.string().email().optional(),
  phoneNumber: z.string().max(20).nullable().optional(),
  phoneCountryCode: z.string().length(2).nullable().optional(), // ISO 3166-1 alpha-2

  // Localisation
  timezone: z.string().nullable().optional(), // IANA timezone

  // Langues
  systemLanguage: z.string().length(2).optional(), // ISO 639-1
  regionalLanguage: z.string().length(2).nullable().optional(),
  customDestinationLanguage: z.string().length(2).nullable().optional(),

  // Voice & GDPR
  birthDate: z.coerce.date().nullable().optional(),
});

export type UpdateUserProfileByAdminDTO = z.infer<typeof updateUserProfileValidationSchema>;

/**
 * Schéma pour vérifier/dévérifier l'email
 */
export const verifyEmailSchema = z.object({
  verified: z.boolean(),
  reason: z.string().min(10).optional()
});

/**
 * Schéma pour vérifier/dévérifier le téléphone
 */
export const verifyPhoneSchema = z.object({
  verified: z.boolean(),
  reason: z.string().min(10).optional()
});

/**
 * Schéma pour activer/désactiver les consentements voice
 */
export const toggleVoiceConsentSchema = z.object({
  consentType: z.enum(['voiceProfile', 'voiceData', 'dataProcessing', 'voiceCloning']),
  enabled: z.boolean(),
  reason: z.string().min(10).optional()
});

/**
 * Schéma pour vérifier l'âge
 */
export const verifyAgeSchema = z.object({
  verified: z.boolean(),
  reason: z.string().min(10).optional()
});
