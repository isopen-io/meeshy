#if DEBUG
import Foundation
import MeeshySDK

nonisolated enum VitrineSessionRefus: Error, Equatable {
    case serveurReel(String)
    case sessionReelle(String)
}

/// Pose (ou retire) la session du lecteur de la vitrine AVANT `checkExistingSession()` —
/// les trois clés que `restoreStoredSession(for:)` lit dans le trousseau.
nonisolated enum VitrineSession {
    static let cleUtilisateurActif = "meeshy_active_user_id"
    static let cleComptes = "meeshy_saved_accounts"

    /// Les lecteurs que la vitrine a posés elle-même : les seuls comptes qu'elle a le droit de remplacer.
    static let cleLecteursVitrine = "meeshy_vitrine_lecteurs"

    /// Un JWT inerte (`alg: none`) qui expire le 1er janvier 2100 : la vérification locale ne
    /// tente aucun rafraîchissement, et aucun serveur ne le reçoit jamais.
    static let jetonFictif = "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJ2aXRyaW5lIiwiZXhwIjo0MTAyNDQ0ODAwfQ.dml0cmluZQ"

    /// La vitrine ne tourne JAMAIS face à un vrai serveur : le faux jeton y serait révoqué (401),
    /// et un 403 ferait effacer les messages (`handleAccessRevoked`). Une boucle locale ne suffit
    /// pas — la passerelle de dev écoute sur `localhost:3000` : seul le port 9 (« discard »),
    /// qu'aucune passerelle n'occupe, garantit un hôte mort.
    static func verifierIsolement(origine: String) throws {
        guard let url = URL(string: origine), let host = url.host,
              host == "127.0.0.1" || host == "localhost", url.port == 9 else {
            throw VitrineSessionRefus.serveurReel(origine)
        }
    }

    /// La vitrine ne remplace JAMAIS une vraie session : l'utilisateur actif et chaque compte
    /// enregistré doivent être le lecteur à poser, ou un lecteur qu'elle a posé elle-même. Des
    /// comptes illisibles valent refus.
    static func verifierProprietaire(lecteur: String, keychain: any KeychainStoring = KeychainManager.shared) throws {
        let siens = lecteursVitrine(keychain).union([lecteur])
        guard let comptes = comptesEnregistres(keychain) else {
            throw VitrineSessionRefus.sessionReelle(cleComptes)
        }
        let presents = [keychain.load(forKey: cleUtilisateurActif, account: nil)].compactMap { $0 } + comptes
        if let etranger = presents.first(where: { !siens.contains($0) }) {
            throw VitrineSessionRefus.sessionReelle(etranger)
        }
    }

    static func poser(_ lecteur: MeeshyUser, keychain: any KeychainStoring = KeychainManager.shared) throws {
        let json = String(decoding: try JSONEncoder().encode(lecteur), as: UTF8.self)
        let lecteurs = lecteursVitrine(keychain).union([lecteur.id]).sorted().joined(separator: ",")
        try keychain.save(lecteurs, forKey: cleLecteursVitrine, account: nil)
        try keychain.save(jetonFictif, forKey: "meeshy_token_\(lecteur.id)", account: nil)
        try keychain.save(json, forKey: "meeshy_user_\(lecteur.id)", account: nil)
        try keychain.save(lecteur.id, forKey: cleUtilisateurActif, account: nil)
    }

    /// Ne retire que le pointeur d'un lecteur de la vitrine : une vraie session reste en place.
    static func retirer(keychain: any KeychainStoring = KeychainManager.shared) {
        guard let actif = keychain.load(forKey: cleUtilisateurActif, account: nil),
              lecteursVitrine(keychain).contains(actif) else { return }
        keychain.delete(forKey: cleUtilisateurActif, account: nil)
    }

    private static func lecteursVitrine(_ keychain: any KeychainStoring) -> Set<String> {
        Set((keychain.load(forKey: cleLecteursVitrine, account: nil) ?? "").split(separator: ",").map(String.init))
    }

    private static func comptesEnregistres(_ keychain: any KeychainStoring) -> [String]? {
        guard let json = keychain.load(forKey: cleComptes, account: nil) else { return [] }
        return (try? JSONDecoder().decode([SavedAccount].self, from: Data(json.utf8)))?.map(\.id)
    }
}
#endif
