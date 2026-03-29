import Foundation

final class DraftStore: @unchecked Sendable {
    static let shared = DraftStore()

    private let defaults: UserDefaults
    private let prefix = "meeshy_draft_"

    init(userDefaults: UserDefaults = .standard) {
        self.defaults = userDefaults
    }

    func save(_ text: String, for conversationId: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            defaults.removeObject(forKey: key(for: conversationId))
        } else {
            defaults.set(text, forKey: key(for: conversationId))
        }
    }

    func load(for conversationId: String) -> String {
        defaults.string(forKey: key(for: conversationId)) ?? ""
    }

    func remove(for conversationId: String) {
        defaults.removeObject(forKey: key(for: conversationId))
    }

    func hasDraft(for conversationId: String) -> Bool {
        defaults.string(forKey: key(for: conversationId)) != nil
    }

    func clearAll() {
        let allKeys = defaults.dictionaryRepresentation().keys
        for k in allKeys where k.hasPrefix(prefix) {
            defaults.removeObject(forKey: k)
        }
    }

    private func key(for conversationId: String) -> String {
        "\(prefix)\(conversationId)"
    }
}
