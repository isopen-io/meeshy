#if DEBUG
import Foundation
import MeeshySDK

nonisolated enum VitrineSessionRefus: Error, Equatable {
    case serveurReel(String)
}

/// Pose (ou retire) la session du lecteur de la vitrine AVANT `checkExistingSession()` —
/// les trois clés que `restoreStoredSession(for:)` lit dans le trousseau.
nonisolated enum VitrineSession {
    static let cleUtilisateurActif = "meeshy_active_user_id"

    /// Un JWT inerte (`alg: none`) qui expire le 1er janvier 2100 : la vérification locale ne
    /// tente aucun rafraîchissement, et aucun serveur ne le reçoit jamais.
    static let jetonFictif = "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJ2aXRyaW5lIiwiZXhwIjo0MTAyNDQ0ODAwfQ.dml0cmluZQ"

    /// La vitrine ne tourne JAMAIS face à un vrai serveur : le faux jeton y serait révoqué (401),
    /// et un 403 ferait effacer les messages (`handleAccessRevoked`).
    static func verifierIsolement(origine: String) throws {
        guard let host = URL(string: origine)?.host, host == "127.0.0.1" || host == "localhost" else {
            throw VitrineSessionRefus.serveurReel(origine)
        }
    }

    static func poser(_ lecteur: MeeshyUser, keychain: any KeychainStoring = KeychainManager.shared) throws {
        let json = String(decoding: try JSONEncoder().encode(lecteur), as: UTF8.self)
        try keychain.save(jetonFictif, forKey: "meeshy_token_\(lecteur.id)", account: nil)
        try keychain.save(json, forKey: "meeshy_user_\(lecteur.id)", account: nil)
        try keychain.save(lecteur.id, forKey: cleUtilisateurActif, account: nil)
    }

    static func retirer(keychain: any KeychainStoring = KeychainManager.shared) {
        keychain.delete(forKey: cleUtilisateurActif, account: nil)
    }
}
#endif
