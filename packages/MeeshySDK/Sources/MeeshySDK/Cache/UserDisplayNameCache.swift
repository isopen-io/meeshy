import Foundation

public struct MentionedUser: Codable, Sendable {
    public let userId: String
    public let username: String
    public let displayName: String?
    public let avatar: String?
}

public final class UserDisplayNameCache: @unchecked Sendable {
    public static let shared = UserDisplayNameCache()

    /// Borne de la table : au-delà, les plus anciennes entrées partent. Les
    /// noms vus pendant des heures dans de grands groupes s'accumulaient sans
    /// fin, et `allMappings()` recopie toute la table à chaque reconstruction.
    public static let defaultCapacity = 2_000

    private let lock = NSLock()
    private var cache: [String: String] = [:]
    /// Ordre d'arrivée des clés, pour l'éviction.
    private var order: [String] = []
    private let capacity: Int

    init(capacity: Int = UserDisplayNameCache.defaultCapacity) {
        self.capacity = max(1, capacity)
    }

    /// Range une entrée — verrou TENU par l'appelant.
    private func storeLocked(_ key: String, _ value: String) {
        if cache.updateValue(value, forKey: key) == nil {
            order.append(key)
            if cache.count > capacity {
                // Évince par paquet (un quart) pour amortir le décalage du tableau.
                let overflow = cache.count - capacity + capacity / 4
                for old in order.prefix(overflow) { cache.removeValue(forKey: old) }
                order.removeFirst(min(overflow, order.count))
            }
        }
    }

    // MARK: - Lookup

    public func displayName(for username: String) -> String? {
        lock.lock()
        defer { lock.unlock() }
        return cache[username.lowercased()]
    }

    public subscript(username: String) -> String? {
        displayName(for: username)
    }

    public func allMappings() -> [String: String] {
        lock.lock()
        defer { lock.unlock() }
        return cache
    }

    // MARK: - Single Entry

    public func track(username: String, displayName: String) {
        let key = username.lowercased()
        guard !username.isEmpty, !displayName.isEmpty, displayName != username else { return }
        lock.lock()
        storeLocked(key, displayName)
        lock.unlock()
    }

    // MARK: - Batch Ingestion

    public func trackFromMessage(_ message: MeeshyMessage) {
        guard let username = message.senderUsername,
              let displayName = message.senderName,
              displayName != username else { return }
        track(username: username, displayName: displayName)
    }

    public func trackFromMessages(_ messages: [MeeshyMessage]) {
        lock.lock()
        for msg in messages {
            guard let username = msg.senderUsername,
                  let displayName = msg.senderName,
                  !username.isEmpty, !displayName.isEmpty,
                  displayName != username else { continue }
            storeLocked(username.lowercased(), displayName)
        }
        lock.unlock()
    }

    public func trackFromAPIMessage(_ apiMessage: APIMessage) {
        guard let sender = apiMessage.sender else { return }
        let username = sender.username ?? sender.user?.username
        let displayName = sender.name
        guard let username, !username.isEmpty, displayName != username else { return }
        track(username: username, displayName: displayName)
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

    public func trackFromMentionSuggestions(_ suggestions: [MentionSuggestion]) {
        lock.lock()
        for s in suggestions {
            guard let displayName = s.displayName,
                  !s.username.isEmpty, !displayName.isEmpty,
                  displayName != s.username else { continue }
            storeLocked(s.username.lowercased(), displayName)
        }
        lock.unlock()
    }

    public func trackFromParticipant(_ participant: PaginatedParticipant) {
        guard let displayName = participant.displayName,
              let username = participant.username else { return }
        track(username: username, displayName: displayName)
    }

    public func trackFromParticipants(_ participants: [PaginatedParticipant]) {
        lock.lock()
        for p in participants {
            guard let username = p.username,
                  let displayName = p.displayName,
                  !username.isEmpty, !displayName.isEmpty,
                  displayName != username else { continue }
            storeLocked(username.lowercased(), displayName)
        }
        lock.unlock()
    }

    public func trackFromMentionedUsers(_ users: [MentionedUser]) {
        lock.lock()
        for u in users {
            guard let displayName = u.displayName,
                  !u.username.isEmpty, !displayName.isEmpty,
                  displayName != u.username else { continue }
            storeLocked(u.username.lowercased(), displayName)
        }
        lock.unlock()
    }

    // MARK: - Reset

    public func clear() {
        lock.lock()
        cache.removeAll()
        order.removeAll()
        lock.unlock()
    }
}
