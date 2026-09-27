import Foundation
import MeeshySDK

/// **Ce qui reste armé dans une conversation** (#8305).
///
/// Directive porteur du 2026-09-27 : « si je sélectionne éphémère 1 min, sauf
/// désactivation tous mes prochains messages de la conversation seront en
/// éphémère 1 min ». Décision porteur : les PROTECTIONS seulement — éphémère
/// (flamme-œil comprise), flou, vue unique. Les effets décoratifs restent à
/// usage unique.
///
/// Distincte du brouillon, qui se VIDE à l'envoi : une protection armée survit
/// à l'envoi, à la fermeture de la conversation et à la relance de l'app.
struct ConversationProtectionPreference: Codable, Equatable, Sendable {
    /// `EphemeralChoice.storageValue` — la flamme-œil y vaut 0.
    var ephemeral: Int?
    var isBlurred: Bool
    var isViewOnce: Bool

    static let none = ConversationProtectionPreference(ephemeral: nil, isBlurred: false, isViewOnce: false)

    init(ephemeral: Int?, isBlurred: Bool, isViewOnce: Bool) {
        self.ephemeral = ephemeral
        self.isBlurred = isBlurred
        self.isViewOnce = isViewOnce
    }

    init(ephemeralChoice: EphemeralChoice?, isBlurred: Bool, isViewOnce: Bool) {
        self.init(ephemeral: ephemeralChoice?.storageValue, isBlurred: isBlurred, isViewOnce: isViewOnce)
    }

    var ephemeralChoice: EphemeralChoice? { ephemeral.flatMap(EphemeralChoice.init(storageValue:)) }
    var isEmpty: Bool { ephemeral == nil && !isBlurred && !isViewOnce }
}

protocol ConversationProtectionPreferenceProviding: AnyObject, Sendable {
    func preference(for conversationId: String) -> ConversationProtectionPreference
    func save(_ preference: ConversationProtectionPreference, for conversationId: String)
}

/// Une entrée par conversation armée, dans `UserDefaults` ; une conversation
/// désarmée n'occupe rien.
final class ConversationProtectionPreferenceStore: ConversationProtectionPreferenceProviding, @unchecked Sendable {
    // SE-0466 : la deinit synthétisée serait isolée au MainActor (cible app) et
    // libérerait deux fois au démontage hors tâche. Garde : MainActorDeinitSourceGuardTests.
    nonisolated deinit {}

    static let shared = ConversationProtectionPreferenceStore()

    private static let key = "meeshy.conversation.armedProtections.v1"
    private let defaults: UserDefaults
    private let lock = NSLock()

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    func preference(for conversationId: String) -> ConversationProtectionPreference {
        lock.lock(); defer { lock.unlock() }
        guard let data = table()[conversationId],
              let preference = try? JSONDecoder().decode(ConversationProtectionPreference.self, from: data) else {
            return .none
        }
        return preference
    }

    func save(_ preference: ConversationProtectionPreference, for conversationId: String) {
        lock.lock(); defer { lock.unlock() }
        var entries = table()
        if preference.isEmpty {
            guard entries.removeValue(forKey: conversationId) != nil else { return }
        } else {
            guard let data = try? JSONEncoder().encode(preference) else { return }
            entries[conversationId] = data
        }
        defaults.set(entries, forKey: Self.key)
    }

    private func table() -> [String: Data] {
        defaults.dictionary(forKey: Self.key) as? [String: Data] ?? [:]
    }
}
