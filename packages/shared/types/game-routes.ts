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

  // --- La vague 2 (#9384 à #9392) : tout est NOUVEAU, rien ne remplace une route actuelle. ---
  /** Consentir à la ligue publique (ou retirer son consentement). POST. */
  leagueConsent: '/me/game/league/consent',
  /** Choisir son pseudonyme de ligue. PUT. */
  leaguePseudonym: '/me/game/league/pseudonym',
  /** Le classement de MON groupe cette semaine, sous pseudonymes. GET. */
  leagueWeek: '/me/game/league/week',
  /** La ligue Amis : le même classement, restreint aux amis acceptés. GET. */
  leagueFriends: '/me/game/league/friends',
  /** Inviter un ami à la mission en duo de la semaine. POST. */
  duoInvite: '/me/game/duo/invite',
  duoAccept: '/me/game/duo/:duoId/accept',
  /** Décliner, annuler ou quitter : un seul geste. POST. */
  duoAbandon: '/me/game/duo/:duoId/abandon',
  /** Réclamer la récompense d'une étape de la saison. POST. */
  seasonClaim: '/me/game/season/steps/:step/claim',
  /** Acheter le Sceau de la saison (10 Meeshes). POST. */
  seasonSeal: '/me/game/season/seal',
  /** Ranger les trophées de la vitrine. PUT. */
  showcaseOrder: '/me/game/showcase/order',
  /** Régler qui voit la vitrine, le rang et le trésor. PUT. */
  showcaseVisibility: '/me/game/visibility',
  /** La vitrine d'un autre membre, selon son réglage. GET. */
  userShowcase: '/users/:userId/game/showcase',
  /** Passer en Prestige au niveau 100. POST. */
  prestige: '/me/game/prestige',
  /** « Jeu masqué » et l'opposition à la ligue Amis : deux interrupteurs. PUT. */
  privacy: '/me/game/privacy',
} as const;

/**
 * L'INTÉGRATION du jeu (#9481) : lire ce que les clients gardaient en mémoire. Une table À PART, pas
 * deux clés de plus dans `GAME_ROUTES` : cette table-là est comparée, clé à clé et en nombre, par les
 * miroirs hors TypeScript (`GameRoutesTests.swift` compte ses 21 entrées) — y ajouter une route ferait
 * rougir un client qui n'a rien à voir avec elle. Les clients qui lisent ces routes les nomment ici.
 */
export const GAME_INTEGRATION_ROUTES = {
  /** Les réglages du jeu (interrupteurs et visibilités), en LECTURE : le chemin de l'écriture (`privacy`), la méthode GET. */
  settings: '/me/game/privacy',
  /** Le jeu d'un autre membre (niveau, palier, rang, trésor, Flamme), selon son réglage. GET. */
  userGame: '/users/:userId/game',
} as const;

export const GAME_INTEGRATION_ROUTE_METHODS = { settings: 'GET', userGame: 'GET' } as const satisfies Record<keyof typeof GAME_INTEGRATION_ROUTES, 'GET'>;

export type GameRouteKey = keyof typeof GAME_ROUTES;

/** La méthode HTTP de chaque route NOUVELLE — les anciennes gardent la leur. */
export const GAME_ROUTE_METHODS = {
  leagueConsent: 'POST',
  leaguePseudonym: 'PUT',
  leagueWeek: 'GET',
  leagueFriends: 'GET',
  duoInvite: 'POST',
  duoAccept: 'POST',
  duoAbandon: 'POST',
  seasonClaim: 'POST',
  seasonSeal: 'POST',
  showcaseOrder: 'PUT',
  showcaseVisibility: 'PUT',
  userShowcase: 'GET',
  prestige: 'POST',
  privacy: 'PUT',
} as const satisfies Partial<Record<GameRouteKey, 'GET' | 'POST' | 'PUT'>>;

export const gameMissionRerollPath = (missionId: string): string =>
  GAME_ROUTES.missionReroll.replace(':missionId', missionId);

export const gameDuoAcceptPath = (duoId: string): string => GAME_ROUTES.duoAccept.replace(':duoId', duoId);
export const gameDuoAbandonPath = (duoId: string): string => GAME_ROUTES.duoAbandon.replace(':duoId', duoId);
export const gameSeasonClaimPath = (step: number): string => GAME_ROUTES.seasonClaim.replace(':step', String(step));
export const gameUserShowcasePath = (userId: string): string => GAME_ROUTES.userShowcase.replace(':userId', userId);
export const gameUserGamePath = (userId: string): string => GAME_INTEGRATION_ROUTES.userGame.replace(':userId', userId);

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

  // --- La vague 2 : un code NOUVEAU par refus, jamais un code actuel réemployé. ---
  /** Niveau record sous 10 : la ligue publique n'est pas ouverte. */
  leagueLocked: 'LEAGUE_LOCKED',
  /** Majorité non vérifiée : fermé en attendant la revue de conformité. */
  leagueMinor: 'LEAGUE_MINOR',
  leagueConsentRequired: 'LEAGUE_CONSENT_REQUIRED',
  leaguePseudonymInvalid: 'LEAGUE_PSEUDONYM_INVALID',
  leaguePseudonymTaken: 'LEAGUE_PSEUDONYM_TAKEN',
  /** Un nom réservé, ou le nom d'utilisateur ou le nom civil de la personne (`checkLeaguePseudonym`). */
  leaguePseudonymForbidden: 'LEAGUE_PSEUDONYM_FORBIDDEN',
  /** Le niveau 20 (record) manque à l'un des deux. */
  duoLocked: 'DUO_LOCKED',
  duoNotFriends: 'DUO_NOT_FRIENDS',
  /** L'un des deux a déjà un duo cette semaine. */
  duoAlreadyActive: 'DUO_ALREADY_ACTIVE',
  duoNotFound: 'DUO_NOT_FOUND',
  /** Le geste n'a pas de sens dans l'état actuel du duo (accepter sa propre invitation, rouvrir un duo terminé). */
  duoTransitionRefused: 'DUO_TRANSITION_REFUSED',
  /** Aucune saison ouverte, ou la saison réclamée est terminée. */
  seasonNotOpen: 'SEASON_NOT_OPEN',
  seasonStepNotFound: 'SEASON_STEP_NOT_FOUND',
  seasonStepLocked: 'SEASON_STEP_LOCKED',
  seasonStepAlreadyClaimed: 'SEASON_STEP_ALREADY_CLAIMED',
  sealAlreadyOwned: 'SEAL_ALREADY_OWNED',
  prestigeLevelTooLow: 'PRESTIGE_LEVEL_TOO_LOW',
  prestigeAtMaximum: 'PRESTIGE_AT_MAXIMUM',
} as const;

export type GameErrorCode = (typeof GAME_ERROR_CODES)[keyof typeof GAME_ERROR_CODES];
