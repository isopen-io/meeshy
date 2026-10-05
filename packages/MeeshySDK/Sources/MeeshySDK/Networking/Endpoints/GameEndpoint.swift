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

    public var path: String {
        switch self {
        case .missionReroll(let missionId): "/api/v1/me/game/missions/\(missionId)/reroll"
        case .chestClaim: "/api/v1/me/game/chest/claim"
        case .flameFreezes: "/api/v1/me/game/flame/freezes"
        case .flameRelight: "/api/v1/me/game/flame/relight"
        case .guideSeen: "/api/v1/me/game/guide/seen"
        }
    }

    public var rejectionPolicy: MeeshyEndpointRejectionPolicy { .structured }
}
