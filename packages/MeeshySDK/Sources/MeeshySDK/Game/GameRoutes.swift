import Foundation

// MARK: - Les refus et l'en-tête de version du Jeu Meeshy (#9378, #9535)
//
// Les CHEMINS ne vivent plus ici : le client du jeu appelle le catalogue généré
// (`MeEndpoint.game*`, `UsersEndpoint.byUserIdGame*`), et `GameRoutesTests` compare
// ses chemins à `packages/shared/types/game-routes.ts` (`GAME_ROUTES`,
// `GAME_INTEGRATION_ROUTES`). Une table jumelle de plus était une route de plus à
// renommer aux deux endroits sans que rien ne rougisse.

public enum GameRoutes {
    /// L'en-tête par lequel un client déclare ce qu'il sait du jeu : un entier, 2 pour la vague 2.
    /// Absent, illisible ou inférieur à 2, la passerelle sert l'ancien comportement.
    public static let versionHeader = "X-Meeshy-Game-Version"
    /// La vague que ce binaire sait lire.
    public static let waveVersion = 2
}

/// Codes d'erreur des écritures du jeu (champ `code` de la réponse). Un refus est
/// un 409 : la requête est bien formée, c'est l'ÉTAT du compte qui la refuse.
public enum GameErrorCode: String, CaseIterable, Sendable, Hashable {
    case insufficientPoints = "INSUFFICIENT_POINTS"
    case insufficientMeeshes = "INSUFFICIENT_MEESHES"
    case freezeAtMaximum = "FREEZE_AT_MAXIMUM"
    case relightNotAllowed = "RELIGHT_NOT_ALLOWED"
    case missionNotFound = "MISSION_NOT_FOUND"
    case missionRerollExhausted = "MISSION_REROLL_EXHAUSTED"
    case missionRerollUnavailable = "MISSION_REROLL_UNAVAILABLE"
    case missionsLocked = "MISSIONS_LOCKED"
    case chestNotReady = "CHEST_NOT_READY"
    /// Le `requestId` a déjà servi à une AUTRE écriture : refusé sans effet, il faut un identifiant neuf.
    case requestIdConflict = "REQUEST_ID_CONFLICT"

    // MARK: La vague 2 — un code NOUVEAU par refus, jamais un code actuel réemployé.

    /// Niveau record sous 10 : la ligue publique n'est pas ouverte.
    case leagueLocked = "LEAGUE_LOCKED"
    /// Majorité non vérifiée : fermé en attendant la revue de conformité.
    case leagueMinor = "LEAGUE_MINOR"
    case leagueConsentRequired = "LEAGUE_CONSENT_REQUIRED"
    case leaguePseudonymInvalid = "LEAGUE_PSEUDONYM_INVALID"
    case leaguePseudonymTaken = "LEAGUE_PSEUDONYM_TAKEN"
    /// Un nom réservé, ou le nom d'utilisateur ou le nom civil de la personne.
    case leaguePseudonymForbidden = "LEAGUE_PSEUDONYM_FORBIDDEN"
    /// Le niveau 20 (record) manque à l'un des deux.
    case duoLocked = "DUO_LOCKED"
    case duoNotFriends = "DUO_NOT_FRIENDS"
    /// L'un des deux a déjà un duo cette semaine.
    case duoAlreadyActive = "DUO_ALREADY_ACTIVE"
    case duoNotFound = "DUO_NOT_FOUND"
    /// Le geste n'a pas de sens dans l'état actuel du duo.
    case duoTransitionRefused = "DUO_TRANSITION_REFUSED"
    /// Aucune saison ouverte, ou la saison réclamée est terminée.
    case seasonNotOpen = "SEASON_NOT_OPEN"
    case seasonStepNotFound = "SEASON_STEP_NOT_FOUND"
    case seasonStepLocked = "SEASON_STEP_LOCKED"
    case seasonStepAlreadyClaimed = "SEASON_STEP_ALREADY_CLAIMED"
    case sealAlreadyOwned = "SEAL_ALREADY_OWNED"
    case prestigeLevelTooLow = "PRESTIGE_LEVEL_TOO_LOW"
    case prestigeAtMaximum = "PRESTIGE_AT_MAXIMUM"
}
