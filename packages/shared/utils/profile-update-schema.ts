/**
 * Le contrat Zod du `PATCH /users/me` — extrait de `validation.ts` (hors budget), qui le
 * ré-exporte à son adresse historique. Les gardes d'emoji voyagent avec lui : il en est le
 * seul consommateur.
 */
import { z } from 'zod';
import { CITY_MAX_LENGTH, isPlainCityText } from './profile-city.js';
import { RELATION_LEVELS } from '../types/relation.js';
import { customDestinationLanguageCode, supportedLanguageCode } from './validation-primitives.js';

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
