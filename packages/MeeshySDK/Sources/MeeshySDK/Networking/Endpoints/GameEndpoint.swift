import Foundation

// MARK: - Les adresses d'écriture du Jeu Meeshy (#9378)
//
// Écrit À LA MAIN, comme `MeeshyEndpointPolicy.swift` : le générateur ne
// supprime que les fichiers portant son en-tête. La lecture (`GET
// /me/engagement`) et la frappe (`POST /me/meesh/mint`) vivent déjà dans
// `MeEndpoint`. Quand le manifeste de la passerelle portera les cinq routes
// `/me/game/*`, `MeEndpoint` les génèrera et cette énumération se retirera —
// elle ne les redéfinit pas : `GameRoutesTests` compare ses chemins à la table
// partagée.
//
// Les refus 409 sont DÉCLARÉS typés (`rejectionPolicy == .structured`) : leur
// contrat documente le champ `code` (`GameErrorCode`) et l'écran doit dire
// POURQUOI (« pas assez de Meeshes », « gel au maximum »), pas seulement « erreur
// serveur ». Les écritures portent un `requestId` : un réessai rend le résultat
// de la première, c'est ce qui autorise la politique de réessai standard.

public enum GameEndpoint: MeeshyEndpoint, Sendable {
    case missionReroll(missionId: String)
    case chestClaim
    case flameFreezes
    case flameRelight
    case guideSeen
    // La vague 2 (#9384 à #9392).
    case leagueConsent
    case leaguePseudonym
    case leagueWeek
    case leagueFriends
    case duoInvite
    case duoAccept(duoId: String)
    case duoAbandon(duoId: String)
    case seasonClaim(step: Int)
    case seasonSeal
    case showcaseOrder
    case showcaseVisibility
    case userShowcase(userId: String)
    case prestige
    case privacy
    // Les lectures d'intégration (#9481).
    case settings
    case userGame(userId: String)

    public var path: String {
        switch self {
        case .missionReroll(let missionId): "/api/v1" + GameRoutes.missionRerollPath(missionId: missionId)
        case .chestClaim: "/api/v1/me/game/chest/claim"
        case .flameFreezes: "/api/v1/me/game/flame/freezes"
        case .flameRelight: "/api/v1/me/game/flame/relight"
        case .guideSeen: "/api/v1/me/game/guide/seen"
        case .leagueConsent: "/api/v1" + GameRoutes.leagueConsent
        case .leaguePseudonym: "/api/v1" + GameRoutes.leaguePseudonym
        case .leagueWeek: "/api/v1" + GameRoutes.leagueWeek
        case .leagueFriends: "/api/v1" + GameRoutes.leagueFriends
        case .duoInvite: "/api/v1" + GameRoutes.duoInvite
        case .duoAccept(let duoId): "/api/v1" + GameRoutes.duoAcceptPath(duoId: duoId)
        case .duoAbandon(let duoId): "/api/v1" + GameRoutes.duoAbandonPath(duoId: duoId)
        case .seasonClaim(let step): "/api/v1" + GameRoutes.seasonClaimPath(step: step)
        case .seasonSeal: "/api/v1" + GameRoutes.seasonSeal
        case .showcaseOrder: "/api/v1" + GameRoutes.showcaseOrder
        case .showcaseVisibility: "/api/v1" + GameRoutes.showcaseVisibility
        case .userShowcase(let userId): "/api/v1" + GameRoutes.userShowcasePath(userId: userId)
        case .prestige: "/api/v1" + GameRoutes.prestige
        case .privacy: "/api/v1" + GameRoutes.privacy
        case .settings: "/api/v1" + GameIntegrationRoutes.settings
        case .userGame(let userId): "/api/v1" + GameIntegrationRoutes.userGamePath(userId: userId)
        }
    }

    public var rejectionPolicy: MeeshyEndpointRejectionPolicy { .structured }
}
