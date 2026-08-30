/**
 * Façade de profil : les onze plugins Fastify (mises à jour, identifiants,
 * recherches) ont été découpés par surface dans des fichiers frères (#4284,
 * budget de taille) — `profile-updates.ts`, `profile-credentials.ts`,
 * `profile-lookups.ts`. Ce fichier ne fait que les ré-exporter, pour que
 * `from './profile'` continue de fonctionner partout sans modification.
 */
// Ré-EXPORT, jamais copie. La forme publique d'un profil vit désormais dans
// `public-profile.ts` — les quatre décisions qui doivent voyager ensemble y
// sont tenues au même endroit (#4161). Ces symboles restent atteignables ici
// parce que d'autres modules et leurs témoins les importent par ce chemin :
// un ré-export garde UNE définition, une seconde déclaration en ferait deux.
export {
  deriveVoiceFields,
  withVoiceFields,
  publicUserSelect,
  publicProfileSchema,
  buildPublicProfile,
} from './public-profile';
export type { VoiceModelFields, PublicVoiceFields } from './public-profile';

/**
 * `GET /users/me/test` a été RETIRÉE (#4185) : point de terminaison de test
 * d'authentification, consommé par PERSONNE — ni iOS, ni le SDK, ni le web, ni
 * Android (relevé sur les trois clients). Une route de test exposée en
 * production est une surface d'API qu'il faut garder, documenter et faire
 * évoluer, pour un usage qui n'existe pas.
 */

export { updateUserProfile, updateUserAvatar, updateUserBanner } from './profile-updates';

export { updateUserPassword, updateUsernameBodySchema, updateUsername } from './profile-credentials';

export {
  getUserByUsername,
  getUserById,
  getUserByEmail,
  getUserByIdDedicated,
  getUserByPhone,
} from './profile-lookups';
