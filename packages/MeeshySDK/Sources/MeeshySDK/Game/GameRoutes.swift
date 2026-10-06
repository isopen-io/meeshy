import Foundation

// MARK: - Les routes et refus du Jeu Meeshy (#9378)
//
// MIROIR de `packages/shared/types/game-routes.ts`. Les chemins sont ceux de la
// passerelle SANS le préfixe `/api/v1` — `GameEndpoint` (catalogue d'adresses
// typées) les complète, et `GameRoutesTests` les compare à la table TS.

public enum GameRoutes {
    /// L'en-tête par lequel un client déclare ce qu'il sait du jeu : un entier, 2 pour la vague 2.
    /// Absent, illisible ou inférieur à 2, la passerelle sert l'ancien comportement.
    public static let versionHeader = "X-Meeshy-Game-Version"
    /// La vague que ce binaire sait lire.
    public static let waveVersion = 2

    /// Lecture : la charge actuelle, plus le bloc `game` à côté de ses champs.
    public static let engagement = "/me/engagement"
    /// La frappe existe déjà ; sa réponse est étendue (`APIMeeshMintResult`).
    public static let mint = "/me/meesh/mint"
    /// Changer une mission du jour — 1 Meesh, une fois par jour, même difficulté.
    public static let missionReroll = "/me/game/missions/:missionId/reroll"
    public static let chestClaim = "/me/game/chest/claim"
    /// Acheter UN gel de Flamme (1 Meesh, 2 en réserve au plus).
    public static let flameFreezes = "/me/game/flame/freezes"
    public static let flameRelight = "/me/game/flame/relight"
    /// Marquer des moments du guide comme vus.
    public static let guideSeen = "/me/game/guide/seen"

    // MARK: La vague 2 (#9384 à #9392) — tout est NOUVEAU, rien ne remplace une route actuelle.

    /// Consentir à la ligue publique (ou retirer son consentement). POST.
    public static let leagueConsent = "/me/game/league/consent"
    /// Choisir son pseudonyme de ligue. PUT.
    public static let leaguePseudonym = "/me/game/league/pseudonym"
    /// Le classement de MON groupe cette semaine, sous pseudonymes. GET.
    public static let leagueWeek = "/me/game/league/week"
    /// La ligue Amis : le même classement, restreint aux amis acceptés. GET.
    public static let leagueFriends = "/me/game/league/friends"
    /// Inviter un ami à la mission en duo de la semaine. POST.
    public static let duoInvite = "/me/game/duo/invite"
    public static let duoAccept = "/me/game/duo/:duoId/accept"
    /// Décliner, annuler ou quitter : un seul geste. POST.
    public static let duoAbandon = "/me/game/duo/:duoId/abandon"
    /// Réclamer la récompense d'une étape de la saison. POST.
    public static let seasonClaim = "/me/game/season/steps/:step/claim"
    /// Acheter le Sceau de la saison (10 Meeshes). POST.
    public static let seasonSeal = "/me/game/season/seal"
    /// Ranger les trophées de la vitrine. PUT.
    public static let showcaseOrder = "/me/game/showcase/order"
    /// Régler qui voit la vitrine, le rang, le trésor et l'Atlas. PUT.
    public static let showcaseVisibility = "/me/game/visibility"
    /// La vitrine d'un autre membre, selon son réglage. GET.
    public static let userShowcase = "/users/:userId/game/showcase"
    /// Passer en Prestige au niveau 100. POST.
    public static let prestige = "/me/game/prestige"
    /// « Jeu masqué » et l'opposition à la ligue Amis : deux interrupteurs. PUT.
    public static let privacy = "/me/game/privacy"

    /// L'identifiant d'une mission vient d'une charge serveur : il est ENCODÉ avant
    /// d'entrer dans le chemin, un `/`, un `?` ou un `..` ne peuvent donc pas
    /// rediriger l'écriture vers une autre route (#9378).
    public static func missionRerollPath(missionId: String) -> String {
        missionReroll.replacingOccurrences(of: ":missionId", with: encodedSegment(missionId))
    }

    public static func duoAcceptPath(duoId: String) -> String {
        duoAccept.replacingOccurrences(of: ":duoId", with: encodedSegment(duoId))
    }

    public static func duoAbandonPath(duoId: String) -> String {
        duoAbandon.replacingOccurrences(of: ":duoId", with: encodedSegment(duoId))
    }

    public static func seasonClaimPath(step: Int) -> String {
        seasonClaim.replacingOccurrences(of: ":step", with: String(step))
    }

    public static func userShowcasePath(userId: String) -> String {
        userShowcase.replacingOccurrences(of: ":userId", with: encodedSegment(userId))
    }

    private static let segmentAllowed = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_~")

    private static func encodedSegment(_ value: String) -> String {
        value.addingPercentEncoding(withAllowedCharacters: segmentAllowed) ?? ""
    }
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
