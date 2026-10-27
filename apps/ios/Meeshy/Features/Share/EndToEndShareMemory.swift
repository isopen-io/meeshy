import Foundation

/// **Ce que l'extension de partage sait de la mémoire du bout en bout** (#12985).
///
/// La mémoire du compte (`EndToEndRegimeMemory`, « vue e2ee reste e2ee »,
/// #12949) vit dans les réglages de l'app, que l'extension ne lit pas. L'app en
/// dépose ici, dans l'App Group, la seule partie qui ferme : les identifiants
/// des conversations que ce compte a vues chiffrées de bout en bout, sans
/// aucun contenu. L'extension relaie à l'app (D7) toute cible qui y figure,
/// au lieu d'y poster le clair qu'une passerelle servant la conversation sans
/// mode accepterait.
///
/// Fail-closed : sans cliché, ou sous un autre compte, tout se relaie — l'app,
/// qui a la mémoire, décide au réveil. Ce fichier est compilé dans l'app et
/// dans l'extension : le contrat n'a qu'une source.
nonisolated struct EndToEndShareMemory: Codable, Equatable, Sendable {
    static let appGroupIdentifier = "group.me.meeshy.apps"
    static let defaultsKey = "share_e2ee_memory"
    static let currentVersion = 1

    let v: Int
    let ownerUserId: String
    let conversationIds: [String]

    init(ownerUserId: String, conversationIds: [String]) {
        self.v = Self.currentVersion
        self.ownerUserId = ownerUserId
        self.conversationIds = conversationIds.sorted()
    }

    /// Le propriétaire d'un compte de la mémoire (`<hôte>/<utilisateur>`).
    static func ownerUserId(ofAccount account: String) -> String? {
        account.split(separator: "/").last.map(String.init).flatMap { $0.isEmpty ? nil : $0 }
    }

    func write(to defaults: UserDefaults?) {
        guard let data = try? JSONEncoder().encode(self) else { return }
        defaults?.set(data, forKey: Self.defaultsKey)
    }

    static func read(from defaults: UserDefaults?) -> EndToEndShareMemory? {
        guard let data = defaults?.data(forKey: defaultsKey),
              let decoded = try? JSONDecoder().decode(EndToEndShareMemory.self, from: data),
              decoded.v == currentVersion else { return nil }
        return decoded
    }

    /// La cible doit-elle être relayée à l'app ? Oui si ce compte l'a vue
    /// chiffrée de bout en bout, et pour toute cible quand le cliché manque
    /// ou appartient à un autre compte.
    static func remembers(in defaults: UserDefaults?, userId: String?) -> @Sendable (String) -> Bool {
        guard let userId, let memory = read(from: defaults), memory.ownerUserId == userId else { return { _ in true } }
        let known = Set(memory.conversationIds)
        return { known.contains($0) }
    }
}
