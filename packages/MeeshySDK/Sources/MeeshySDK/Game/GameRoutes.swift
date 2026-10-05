import Foundation

// MARK: - Les routes et refus du Jeu Meeshy (#9378)
//
// MIROIR de `packages/shared/types/game-routes.ts`. Les chemins sont ceux de la
// passerelle SANS le préfixe `/api/v1` — `GameEndpoint` (catalogue d'adresses
// typées) les complète, et `GameRoutesTests` les compare à la table TS.

public enum GameRoutes {
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

    /// L'identifiant d'une mission vient d'une charge serveur : il est ENCODÉ avant
    /// d'entrer dans le chemin, un `/`, un `?` ou un `..` ne peuvent donc pas
    /// rediriger l'écriture vers une autre route (#9378).
    public static func missionRerollPath(missionId: String) -> String {
        missionReroll.replacingOccurrences(of: ":missionId", with: encodedSegment(missionId))
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
}
