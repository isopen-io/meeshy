/**
 * LES ROUTES DU JEU MEESHY (#9378) — constantes sans dépendance (pas de Zod),
 * pour que le web les importe sans alourdir un chunk d'écran. Les schémas des
 * charges vivent dans `types/game.ts`, qui les ré-exporte.
 *
 * Les chemins sont PUBLICS, sous le préfixe `/api/v1`.
 */

export const GAME_ROUTES = {
  /** Lecture : la charge actuelle, plus le bloc `game` à côté de ses champs. */
  engagement: '/me/engagement',
  /** La frappe existe déjà ; sa réponse est étendue (`meeshMintResponseSchema`). */
  mint: '/me/meesh/mint',
  /** Changer une mission du jour — 1 Meesh, une fois par jour, même difficulté. */
  missionReroll: '/me/game/missions/:missionId/reroll',
  chestClaim: '/me/game/chest/claim',
  /** Acheter UN gel de Flamme (1 Meesh, 2 en réserve au plus). */
  flameFreezes: '/me/game/flame/freezes',
  flameRelight: '/me/game/flame/relight',
  /** Marquer des moments du guide comme vus. */
  guideSeen: '/me/game/guide/seen',
} as const;

export const gameMissionRerollPath = (missionId: string): string =>
  GAME_ROUTES.missionReroll.replace(':missionId', missionId);

/**
 * Codes d'erreur des écritures du jeu (champ `code` de `sendError`). Un refus
 * est un 409 : la requête est bien formée, c'est l'ÉTAT du compte qui la
 * refuse. `INSUFFICIENT_POINTS` est celui de la frappe, déjà servi.
 */
export const GAME_ERROR_CODES = {
  insufficientPoints: 'INSUFFICIENT_POINTS',
  insufficientMeeshes: 'INSUFFICIENT_MEESHES',
  freezeAtMaximum: 'FREEZE_AT_MAXIMUM',
  relightNotAllowed: 'RELIGHT_NOT_ALLOWED',
  missionNotFound: 'MISSION_NOT_FOUND',
  missionRerollExhausted: 'MISSION_REROLL_EXHAUSTED',
  missionRerollUnavailable: 'MISSION_REROLL_UNAVAILABLE',
  missionsLocked: 'MISSIONS_LOCKED',
  chestNotReady: 'CHEST_NOT_READY',
  /** Le `requestId` a déjà servi à une AUTRE écriture (autre dépense, frappe) : refusé sans effet. */
  requestIdConflict: 'REQUEST_ID_CONFLICT',
} as const;

export type GameErrorCode = (typeof GAME_ERROR_CODES)[keyof typeof GAME_ERROR_CODES];
