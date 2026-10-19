import Foundation

/// **Les destinataires que l'app remet à l'extension de partage** (#10947).
///
/// L'extension n'a ni les caches nommés de l'app ni ses services : pour
/// afficher la liste AVANT toute requête (cache d'abord), l'app dépose dans
/// l'App Group ce qu'elle sait déjà — les conversations de sa liste (chiffrée
/// ou non, membres, pair d'une directe) et les personnes à qui écrire (amis
/// acceptés, contacts du carnet APPARIÉ). Ce fichier est compilé dans les deux
/// cibles : le contrat n'a qu'une source, il ne peut pas dériver.
///
/// Le cliché porte son propriétaire : une extension ouverte sous un autre
/// compte, ou sans session, n'en montre rien.
nonisolated struct ShareDirectorySnapshot: Codable, Equatable, Sendable {
    static let currentVersion = 1
    static let appGroupIdentifier = "group.me.meeshy.apps"
    static let defaultsKey = "share_directory"
    /// Bornes du cliché : l'App Group est lu à chaque ouverture de la feuille,
    /// sous le plafond mémoire de l'extension.
    static let maxConversations = 100
    static let maxPeople = 300

    let v: Int
    let ownerUserId: String
    let savedAt: Date
    let conversations: [ShareRecipient]
    let people: [ShareRecipient]

    static func make(ownerUserId: String, savedAt: Date, conversations: [ShareRecipient], people: [ShareRecipient]) -> ShareDirectorySnapshot {
        ShareDirectorySnapshot(
            v: currentVersion,
            ownerUserId: ownerUserId,
            savedAt: savedAt,
            conversations: Array(conversations.prefix(maxConversations)),
            people: Array(people.prefix(maxPeople))
        )
    }

    /// Le cliché ne sert que son propriétaire, dans la version qu'on sait lire.
    func isServable(to userId: String?) -> Bool {
        guard let userId, !userId.isEmpty else { return false }
        return v == Self.currentVersion && ownerUserId == userId
    }

    func encoded() -> Data? {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return try? encoder.encode(self)
    }

    static func decoded(from data: Data?) -> ShareDirectorySnapshot? {
        guard let data else { return nil }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try? decoder.decode(ShareDirectorySnapshot.self, from: data)
    }
}
