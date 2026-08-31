import { AUTO_TRANSLATE_PREFERENCE_SELECT } from '../../utils/auto-translate-preference';

/**
 * La ligne `User` dont une réponse d'authentification a besoin — SITE UNIQUE (#4554).
 *
 * ## Ce que l'absence de ce site coûtait
 *
 * TROIS chemins composent un `SocketIOUser` avec `AuthService.userToSocketIOUser`
 * — `authenticate`, `completeAuthWith2FA` et `getUserById` (la porte du lien
 * magique) — et chacun tenait SA liste de colonnes. Elles avaient divergé :
 *
 *  - `completeAuthWith2FA` ne demandait ni `isOnline` ni `lastActiveAt`, que le
 *    lecteur LIT : une connexion à second facteur rendait un `AuthResult` dont
 *    la présence valait `undefined`, et la charge JSON servie par
 *    `POST /auth/login/2fa` perdait purement les deux clés — là où
 *    `POST /auth/login` les porte.
 *  - Les TROIS oubliaient `deactivatedAt`, `lastPasswordChange` et
 *    `profileCompletionRate`, que le lecteur lit aussi et que `userSchema`
 *    (`packages/shared/types/api-schemas.ts`) promet à ses clients.
 *  - `getUserById` oubliait en plus les sept colonnes de vérification et de
 *    suivi de connexion : la réponse du lien magique était la plus amputée des
 *    trois, sans que rien ne le dise.
 *
 * Réaligner trois listes à la main les fait diverger au prochain champ ajouté
 * au lecteur. D'où la constante — même raison d'être que
 * `AUTO_TRANSLATE_PREFERENCE_SELECT`, dont la forme du `select` et la lecture
 * vivent ensemble parce qu'une projection trop étroite rend la lecture
 * impossible EN AVAL, silencieusement.
 *
 * ## Ce qui n'y est PAS, et pourquoi
 *
 * Les SECRETS. `password` (vérifié par `authenticate` seul), `twoFactorSecret`
 * et `twoFactorBackupCodes` (vérifiés par `completeAuthWith2FA` seul) sont
 * ajoutés par le chemin qui doit les confronter, jamais par un site partagé :
 * un site partagé les ferait voyager vers les deux autres chemins, qui n'en
 * ont aucun usage — c'est la question « qu'est-ce qui part À CÔTÉ ? » posée à
 * une projection.
 *
 * `failedLoginAttempts`, `lockedUntil` et `timezone` y sont, eux : ils ne sont
 * pas des secrets, les deux portes de connexion les lisent (verrou, fuseau
 * détecté), et l'état du verrou voyage déjà avec l'utilisateur (#4138).
 *
 * @see services/gateway/src/__tests__/unit/services/auth-result-projection-single-site.test.ts
 */
export const AUTH_USER_SELECT = {
  id: true,
  username: true,
  email: true,
  phoneNumber: true,
  firstName: true,
  lastName: true,
  displayName: true,
  avatar: true,
  bio: true,
  systemLanguage: true,
  regionalLanguage: true,
  customDestinationLanguage: true,
  role: true,
  isActive: true,
  deactivatedAt: true,
  isOnline: true,
  lastActiveAt: true,
  twoFactorEnabledAt: true,
  lastPasswordChange: true,
  emailVerifiedAt: true,
  phoneVerifiedAt: true,
  pendingEmail: true,
  pendingPhoneNumber: true,
  lastLoginIp: true,
  lastLoginLocation: true,
  lastLoginDevice: true,
  timezone: true,
  profileCompletionRate: true,
  createdAt: true,
  updatedAt: true,
  failedLoginAttempts: true,
  lockedUntil: true,
  ...AUTO_TRANSLATE_PREFERENCE_SELECT
} as const;
