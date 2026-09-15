import Foundation
import MeeshySDK

/// **Pourquoi un contenu n'a pas pu s'ouvrir — la cause que l'écran doit DIRE (#6508).**
///
/// Le 2026-09-14, un 500 serveur (#6503) a fait afficher « vérifiez votre
/// connexion » à chaque ouverture de contenu depuis une notification : l'app ne
/// distinguait que « 404 » et « tout le reste », et « tout le reste » accusait
/// le réseau. Quatre causes, parce que l'utilisateur n'a pas la même chose à
/// faire devant chacune :
///
/// - `network` — la requête n'est pas arrivée : vérifier sa connexion, réessayer ;
/// - `server` — le serveur a répondu et a échoué (5xx, corps illisible, refus
///   inattendu) : réessayer, sans jamais parler de connexion ;
/// - `forbidden` (403) et `notFound` (404) — le serveur a répondu NON :
///   réessayer échouerait identiquement, le contenu est indisponible.
///
/// La loi lit `MeeshyError.from(_:)`, la conversion unique du SDK, et non un
/// type d'erreur particulier : `APIClient` lève `MeeshyError`, les anciens
/// témoins fabriquaient `APIError`, et la garde 404 de la cible story, écrite
/// contre le second, n'avait jamais vu un vrai 404.
///
/// `nonisolated` sur le type ET sur ses membres : le target app compile en
/// `defaultIsolation MainActor`, et une loi pure isolée cesse d'être appelable
/// depuis le bundle de tests (même note que `PostDetailAbsenceReason`).
nonisolated enum ContentFetchFailure: Equatable, Sendable {
    case network
    case server
    case forbidden
    case notFound

    /// Le serveur a répondu non : il n'y a rien à réessayer.
    nonisolated var isAbsence: Bool { self == .forbidden || self == .notFound }

    nonisolated static func classify(_ error: Error) -> ContentFetchFailure {
        switch MeeshyError.from(error) {
        case .network:
            return .network
        case .forbidden:
            return .forbidden
        case .server(let statusCode, _) where statusCode == 404:
            return .notFound
        case .server, .auth, .message, .media, .rejected, .unknown:
            return .server
        }
    }
}
