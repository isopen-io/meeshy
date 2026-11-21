import Foundation

// DEMANDER UNE POSITION (#19204, #19476) : `POST /relations/:userId/location/request { kind }`, adressée à l'émetteur.
// Aucun effet automatique : l'émetteur relance ou prolonge lui-même. Aucune position ne voyage avec la demande.

/// `SHARED_LOCATION_REQUEST_KINDS` : prolonger un partage en cours, ou redemander après sa fin.
public enum SharedLocationRequestKind: String, Sendable, Equatable, CaseIterable {
    case extend
    case reask
}

/// Ce qu'une demande a donné, rangé par ce que l'écran en DIT.
public enum SharedLocationRequestOutcome: Sendable, Equatable {
    case sent
    /// 429 — une demande est déjà partie vers cette personne dans la fenêtre : on ne harcèle pas.
    case tooSoon
    /// 403 — sous Ami, blocage, demande fermée : le bouton disparaît, sans raison.
    case closed
    /// 404 — la passerelle ne sert pas encore la demande : le bouton disparaît partout.
    case notServed
    case offline
    case failed

    public static func from(_ error: Error) -> SharedLocationRequestOutcome {
        if let urlError = error as? URLError {
            return urlError.code == .notConnectedToInternet || urlError.code == .networkConnectionLost ? .offline : .failed
        }
        guard let meeshyError = error as? MeeshyError else { return .failed }
        switch meeshyError {
        case .forbidden: return .closed
        case .rejected(let rejection) where rejection.statusCode == 429: return .tooSoon
        case .server(let statusCode, _) where statusCode == 429: return .tooSoon
        case .server(let statusCode, _) where statusCode == 404: return .notServed
        case .network: return .offline
        default: return .failed
        }
    }
}

/// Qui porte une demande de position jusqu'à la passerelle.
public protocol SharedLocationRequesting: Sendable {
    func requestSharedLocation(from userId: String, kind: SharedLocationRequestKind) async -> SharedLocationRequestOutcome
}
