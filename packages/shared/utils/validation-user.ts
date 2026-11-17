import { z } from 'zod';
import { isProfileImageReference } from './profile-image-reference.js';
import { CITY_MAX_LENGTH, isPlainCityText } from './profile-city.js';
import { RELATION_LEVELS } from '../types/relation.js';
import { usernameMaxLength, usernameMinLength } from '../types/api-schemas/identity-bounds.js';
import { customDestinationLanguageCode, supportedLanguageCode, USERNAME_PATTERN, usernameTooLong, usernameTooShort } from './validation-primitives.js';

/**
 * Schémas d’utilisateur, détection d’emoji, URL http(s) et mises à jour de profil.
 * Extrait de `validation.ts` (#19037), qui le ré-exporte.
 */

// =============================================================================
// USER SCHEMAS
// =============================================================================

/**
 * Rôles utilisateur
 */
export const userRoleEnum = z.enum([
  'USER', 'ADMIN', 'MODO', 'BIGBOSS', 'AUDIT', 'ANALYST',
  'MODERATOR', 'CREATOR', 'MEMBER'
]);

/**
 * Schémas pour la validation des utilisateurs
 */
export const UserSchemas = {
  // Permissions utilisateur
  permissions: z.object({
    canAccessAdmin: z.boolean(),
    canManageUsers: z.boolean(),
    canManageGroups: z.boolean(),
    canManageConversations: z.boolean(),
    canViewAnalytics: z.boolean(),
    canModerateContent: z.boolean(),
    canViewAuditLogs: z.boolean(),
    canManageNotifications: z.boolean(),
    canManageTranslations: z.boolean(),
  }),

  // User minimal (pour listes et références)
  minimal: z.object({
    id: z.string(),
    userId: z.string().nullable().optional(),
    username: z.string(),
    displayName: z.string(),
    avatar: z.string().nullable().optional(),
    isOnline: z.boolean().optional(),
  }),

  // User complet (réponse API)
  full: z.object({
    id: z.string(),
    username: z.string(),
    email: z.email().optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    displayName: z.string().optional(),
    bio: z.string().nullable().optional(),
    avatar: z.string().nullable().optional(),
    phoneNumber: z.string().nullable().optional(),
    phoneCountryCode: z.string().nullable().optional(),
    role: userRoleEnum.optional(),
    isActive: z.boolean().optional(),
    deactivatedAt: z.iso.datetime().nullable().optional(),
    systemLanguage: z.string().optional(),
    regionalLanguage: z.string().optional(),
    customDestinationLanguage: z.string().nullable().optional(),
    autoTranslateEnabled: z.boolean().optional(),
    isOnline: z.boolean().optional(),
    lastActiveAt: z.iso.datetime().nullable().optional(),
    emailVerifiedAt: z.iso.datetime().nullable().optional(),
    phoneVerifiedAt: z.iso.datetime().nullable().optional(),
    twoFactorEnabledAt: z.iso.datetime().nullable().optional(),
    lastPasswordChange: z.iso.datetime().nullable().optional(),
    lastLoginIp: z.string().nullable().optional(),
    lastLoginLocation: z.string().nullable().optional(),
    lastLoginDevice: z.string().nullable().optional(),
    timezone: z.string().nullable().optional(),
    profileCompletionRate: z.number().nullable().optional(),
    createdAt: z.iso.datetime().optional(),
    updatedAt: z.iso.datetime().optional(),
  }),

  // Mise à jour du profil
  update: z.object({
    firstName: z.string().min(1).max(50).optional(),
    lastName: z.string().min(1).max(50).optional(),
    displayName: z.string().min(1).max(100).optional(),
    bio: z.string().max(500).optional(),
    avatar: z.url().optional(),
    phoneNumber: z.string().optional(),
    systemLanguage: supportedLanguageCode.optional(),
    regionalLanguage: supportedLanguageCode.optional(),
    customDestinationLanguage: customDestinationLanguageCode.nullable().optional(),
    autoTranslateEnabled: z.boolean().optional(),
    timezone: z.string().optional(),
  }),
};

// =============================================================================
// EMOJI VALIDATION UTILITIES
// =============================================================================

/**
 * Regex pour détecter les emojis Unicode
 */
export const EMOJI_REGEX = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F1E6}-\u{1F1FF}]/u;

/**
 * Vérifie si une chaîne contient des emojis
 */
export function containsEmoji(text: string): boolean {
  return EMOJI_REGEX.test(text);
}

/**
 * Refinement Zod pour rejeter les emojis
 */
const noEmoji = (val: string | undefined) => {
  if (!val) return true;
  return !containsEmoji(val);
};

const HTTP_PROTOCOLS = new Set(['http:', 'https:']);

/**
 * Vérifie qu'une valeur est une URL web navigable (http/https uniquement).
 *
 * `z.url()` et `new URL()` se contentent de PARSER : `javascript:alert(1)`,
 * `data:text/html,...` et `file:///etc/passwd` passent tous les deux. Toute
 * destination qu'un utilisateur fournit et qu'un autre finira par ouvrir doit
 * donc être contrainte sur le schéma, sans quoi le lien devient un vecteur
 * d'exécution de script sur notre origine.
 *
 * Source de vérité pour la règle « URL sortante sûre » côté TypeScript.
 */
export function isHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0) return false;
  try {
    return HTTP_PROTOCOLS.has(new URL(value).protocol);
  } catch {
    return false;
  }
}

/**
 * Schéma Zod réutilisable pour une destination web fournie par un utilisateur.
 */
export const httpUrlSchema = z.string().refine(isHttpUrl, 'URL invalide : http(s) uniquement');

// =============================================================================
// USER UPDATE SCHEMAS (for routes)
// =============================================================================

/**
 * Schéma de validation pour la mise à jour du profil utilisateur
 * Avec validation stricte (rejette les champs inconnus)
 *
 * #4184 — `email` et `phoneNumber` sont ABSENTS d'ICI par construction, et
 * `.strict()` (dernière ligne) transforme cette absence en REFUS EXPLICITE
 * (Zod lève, le handler répond 400) plutôt qu'en simple silence. Cette route
 * écrivait ces deux champs DIRECTEMENT en base sur simple appel authentifié —
 * sans jeton ni code envoyé à la NOUVELLE adresse, et sans jamais remettre
 * `emailVerifiedAt` / `phoneVerifiedAt` à `null` — alors qu'une preuve de
 * possession n'était qu'à un fichier de là (`contact-change.ts`). Le coût :
 * une session courte (volée, fixée) suffisait à un attaquant pour poser SA
 * propre adresse, déclencher une réinitialisation de mot de passe dessus, et
 * prendre le compte en entier — le tout en un seul appel HTTP, sans jamais
 * prouver la possession de quoi que ce soit. Le changement de contact passe
 * désormais EXCLUSIVEMENT par `POST /users/me/change-email` / `/change-phone`
 * (`services/gateway/src/routes/users/contact-change.ts`), qui exigent cette
 * preuve avant d'écrire. Ne JAMAIS réintroduire ces deux clés ici — les
 * gardes ci-dessous (`__tests__/validation.test.ts`, même paquet) et
 * `unit/routes/users/profile.test.ts` (gateway, describe « email/phoneNumber
 * are not writable via this route ») rougissent sous cette mutation précise,
 * schéma AJV frère `updateUserRequestSchema`
 * (`packages/shared/types/api-schemas.ts`) compris.
 */
export const updateUserProfileSchema = z.object({
  // Les noms gardent le minimum d'AVANT (#13825, rétrocompatibilité) : l'iOS
  // publié renvoie prénom, nom et nom affiché INCHANGÉS à chaque
  // enregistrement, et un compte hérité « A » doit pouvoir changer sa bio. La
  // borne de 2 s'applique aux seuls noms CHANGÉS, dans le handler
  // (`services/gateway/src/utils/identity-name-floor.ts`).
  firstName: z.string().min(1).optional().refine(noEmoji, {
    message: 'Le prénom ne peut pas contenir d\'emojis'
  }),
  lastName: z.string().min(1).optional().refine(noEmoji, {
    message: 'Le nom ne peut pas contenir d\'emojis'
  }),
  displayName: z.string().optional(), // Autorise les emojis dans displayName
  bio: z.string().max(500).optional(),
  systemLanguage: supportedLanguageCode.optional(),
  // Chaîne vide autorisée = effacement de la langue secondaire (mirror de
  // customDestinationLanguage). resolveUserLanguage traite '' comme absent.
  regionalLanguage: z.union([z.literal(''), supportedLanguageCode]).optional(),
  customDestinationLanguage: z
    .union([z.literal(''), z.null(), customDestinationLanguageCode])
    .optional(),
  autoTranslateEnabled: z.boolean().optional(),
  voicePublic: z.boolean().optional(),
  // #18862 : la ville DÉCLARÉE et le cercle qui la lit. Vide / null = effacement.
  city: z.union([z.string().max(CITY_MAX_LENGTH).refine(isPlainCityText, { message: 'La ville ne peut contenir ni balise ni caractère de contrôle' }), z.null()]).optional(),
  cityCircle: z.union([z.enum(RELATION_LEVELS), z.null()]).optional(),
}).strict();

export { isProfileImageReference };

/**
 * Schéma de validation pour l'upload d'avatar
 */
export const updateAvatarSchema = z.object({
  avatar: z.string()
    .refine(
      (val) => !val.startsWith('data:'),
      'Avatar must be a file URL, not a base64 data URI'
    )
    .refine(
      isProfileImageReference,
      'Avatar must be an HTTP(S) URL, an API path or an uploaded file path'
    )
}).strict();

/**
 * Schéma de validation pour l'upload de bannière
 */
export const updateBannerSchema = z.object({
  banner: z.string().refine(
    isProfileImageReference,
    'Format bannière invalide. Doit être une URL HTTP(S), un chemin API ou un fichier téléversé'
  )
}).strict();

/**
 * Schéma de validation pour le changement de username
 */
export const updateUsernameSchema = z.object({
  newUsername: z.string()
    .min(usernameMinLength, usernameTooShort)
    .max(usernameMaxLength, usernameTooLong)
    .regex(USERNAME_PATTERN, 'Username invalide (lettres, chiffres, - et _ uniquement)'),
  currentPassword: z.string().min(1, 'Mot de passe requis pour confirmer le changement')
}).strict();
