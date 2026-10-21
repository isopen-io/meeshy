import Foundation

public struct MentionedUser: Codable, Sendable {
    public let userId: String
    public let username: String
    public let displayName: String?
    public let avatar: String?
}

public final class UserDisplayNameCache: Sendable {
    public static let shared = UserDisplayNameCache()

    /// Borne de la table : au-delà, les plus anciennes entrées partent. Les
    /// noms vus pendant des heures dans de grands groupes s'accumulaient sans
    /// fin, et `allMappings()` recopie toute la table à chaque reconstruction.
    public static let defaultCapacity = 2_000

    private struct Table {
        var cache: [String: String] = [:]
        /// Ordre d'arrivée des clés, pour l'éviction.
        var order: [String] = []
        let capacity: Int

        mutating func store(_ key: String, _ value: String) {
            guard cache.updateValue(value, forKey: key) == nil else { return }
            order.append(key)
            guard cache.count > capacity else { return }
            // Évince par paquet (un quart) pour amortir le décalage du tableau.
            let overflow = cache.count - capacity + capacity / 4
            for old in order.prefix(overflow) { cache.removeValue(forKey: old) }
            order.removeFirst(min(overflow, order.count))
        }
    }

    private let table: Locked<Table>

    init(capacity: Int = UserDisplayNameCache.defaultCapacity) {
        self.table = Locked(Table(capacity: max(1, capacity)))
    }

    private func store(_ pairs: [(String, String)]) {
        table.mutate { state in
            for pair in pairs { state.store(pair.0, pair.1) }
        }
    }

    // MARK: - Lookup

    public func displayName(for username: String) -> String? {
        let key = username.lowercased()
        return table.read { $0.cache[key] }
    }

    public subscript(username: String) -> String? {
        displayName(for: username)
    }

    public func allMappings() -> [String: String] {
        table.read { $0.cache }
    }

    // MARK: - Single Entry

    public func track(username: String, displayName: String) {
        let key = username.lowercased()
        guard !username.isEmpty, !displayName.isEmpty, displayName != username else { return }
        store([(key, displayName)])
    }

    // MARK: - Batch Ingestion

    public func trackFromMessages(_ messages: [MeeshyMessage]) {
        store(messages.compactMap { msg -> (String, String)? in
            guard let username = msg.senderUsername,
                  let displayName = msg.senderName,
                  !username.isEmpty, !displayName.isEmpty,
                  displayName != username else { return nil }
            return (username.lowercased(), displayName)
        })
    }

    public func trackFromUser(_ user: MeeshyUser) {
        let displayName = user.displayName ?? {
            let parts = [user.firstName, user.lastName].compactMap { $0 }.filter { !$0.isEmpty }
            return parts.isEmpty ? nil : parts.joined(separator: " ")
        }()
        guard let displayName, displayName != user.username else { return }
        track(username: user.username, displayName: displayName)
    }

    public func trackFromMentionSuggestion(_ suggestion: MentionSuggestion) {
        guard let displayName = suggestion.displayName else { return }
        track(username: suggestion.username, displayName: displayName)
    }

    public func trackFromParticipants(_ participants: [PaginatedParticipant]) {
        store(participants.compactMap { participant -> (String, String)? in
            guard let username = participant.username,
                  let displayName = participant.displayName,
                  !username.isEmpty, !displayName.isEmpty,
                  displayName != username else { return nil }
            return (username.lowercased(), displayName)
        })
    }

    public func trackFromMentionedUsers(_ users: [MentionedUser]) {
        store(users.compactMap { user -> (String, String)? in
            guard let displayName = user.displayName,
                  !user.username.isEmpty, !displayName.isEmpty,
                  displayName != user.username else { return nil }
            return (user.username.lowercased(), displayName)
        })
    }

    // MARK: - Reset

    public func clear() {
        table.mutate { state in
            state.cache.removeAll()
            state.order.removeAll()
        }
    }
}
