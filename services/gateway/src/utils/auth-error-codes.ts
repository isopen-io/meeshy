/**
 * Codes d'erreur d'un refus 401 — un code par SENS, jamais un code par site.
 *
 * #4857 — `sendUnauthorized` prenait `code` en OPTION, et 127 des 180 appels
 * de production l'omettaient : `undefined` disparaît à la sérialisation JSON,
 * donc ces refus servaient `{ success, error, message }` sans le seul champ
 * sur lequel un client peut BRANCHER (`api.service.ts:239` lit `code` pour
 * construire `ApiServiceError`). La seule façon de distinguer deux 401 était
 * le filage de chaîne sur une prose française, qui change au premier lot qui
 * reformule.
 *
 * `UNAUTHORIZED` est désormais le DÉFAUT explicite de `sendUnauthorized` (plus
 * jamais `undefined`) — c'est le sens le plus fréquent : aucune créance
 * reconnue du tout (`authContext.isAuthenticated === false`). C'est aussi la
 * valeur que ~50 sites du dépôt posaient déjà explicitement avant ce lot, y
 * compris pour le cas « authentifié en ANONYME, cette route exige un compte »
 * (`posts/sounds.ts`, `posts/hashtag.ts`) — cette convention préexistante
 * n'est PAS réouverte ici : distinguer ce second cas est un lot à part,
 * product-facing (cf. #4808, déjà ouvert sur cette même frontière).
 *
 * Les quatre codes suivants nomment des sens mesurés comme DISTINCTS de
 * « aucune créance » — un jeton ou un mot de passe a été fourni, et refusé
 * pour une raison précise que le générique n'exprime pas :
 *
 * - `SESSION_INVALID` — un jeton de session anonyme/invité a été fourni et ne
 *   résout à rien (expiré, révoqué, ou l'association qu'il désigne a disparu).
 * - `MAGIC_LINK_INVALID` — le jeton de lien magique lui-même est invalide,
 *   expirable ou sa signature ne vérifie pas — distinct d'une SESSION déjà
 *   établie qu'on retrouve révoquée (voir `SESSION_REVOKED`).
 * - `SESSION_REVOKED` — la session NOMMÉE par un jeton par ailleurs valide a
 *   été explicitement invalidée (déconnexion, révocation admin) : le client
 *   doit re-proposer une connexion, pas simplement réessayer.
 * - `INVALID_CREDENTIALS` — un identifiant/mot de passe a été soumis et ne
 *   correspond à aucun compte actif.
 * - `TWO_FACTOR_FAILED` — le second facteur (code TOTP ou de secours) a été
 *   soumis et refusé, ou le jeton temporaire qui le porte est invalide/expiré/
 *   verrouillé — distinct d'`INVALID_CREDENTIALS`, qui porte sur le premier
 *   facteur.
 * - `LINK_SESSION_REQUIRED` — repris tel quel de `links/messages-retrieval.ts`
 *   (#4808) : aucune identité, ni compte ni session invitée, sur une route
 *   qui accepte les deux — un 401 « sec » ne dit pas au client qu'il peut
 *   continuer en anonyme.
 *
 * Un site qui découvre un sens supplémentaire l'ajoute ICI, avec sa liste de
 * sites, plutôt que d'inventer un code local — c'est ce qui a produit la
 * dette d'origine (`'NOT_AUTHENTICATED'` posé comme MESSAGE plutôt que code
 * dans `calls-consultation.ts`, entre autres formes divergentes).
 */
export const AUTH_ERROR_CODES = {
  /** Aucune créance reconnue — JWT et session token absents ou invalides. */
  UNAUTHORIZED: 'UNAUTHORIZED',
  /** Jeton de session anonyme/invité fourni, expiré ou sans résolution. */
  SESSION_INVALID: 'SESSION_INVALID',
  /** Jeton de lien magique invalide, expiré, ou signature non vérifiée. */
  MAGIC_LINK_INVALID: 'MAGIC_LINK_INVALID',
  /** Session nommée par un jeton par ailleurs valide, explicitement révoquée. */
  SESSION_REVOKED: 'SESSION_REVOKED',
  /** Identifiant/mot de passe soumis, ne correspondant à aucun compte actif. */
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  /** Second facteur (TOTP/code de secours) soumis et refusé, ou jeton 2FA invalide/expiré/verrouillé. */
  TWO_FACTOR_FAILED: 'TWO_FACTOR_FAILED',
  /** Aucune identité (compte ou session invitée) sur une route qui accepte les deux. */
  LINK_SESSION_REQUIRED: 'LINK_SESSION_REQUIRED',
} as const;

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[keyof typeof AUTH_ERROR_CODES];
