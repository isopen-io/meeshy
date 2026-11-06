import Foundation

/// **Chaque conversation se souvient si sa barre est repliée** (#16341).
///
/// Le repli (#9955) vivait dans un `@State` : quitter la conversation
/// l'oubliait. Il est désormais retenu PAR conversation, et survit au
/// redémarrage. Une conversation jamais touchée garde le défaut : dépliée.
protocol ConversationComposerFoldMemoryProviding {
    func isFolded(conversationId: String) -> Bool
    func remember(folded: Bool, conversationId: String)
}

final class ConversationComposerFoldMemory: ConversationComposerFoldMemoryProviding {
    static let shared = ConversationComposerFoldMemory()
    static let storageKey = "conversation.composer.folded"
    /// Borne : seules les conversations repliées sont écrites, les plus
    /// récentes en tête — la liste ne grandit pas sans fin.
    static let capacity = 500

    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    nonisolated deinit {}

    private var folded: [String] {
        defaults.stringArray(forKey: Self.storageKey) ?? []
    }

    func isFolded(conversationId: String) -> Bool {
        !conversationId.isEmpty && folded.contains(conversationId)
    }

    func remember(folded isFolded: Bool, conversationId: String) {
        guard !conversationId.isEmpty else { return }
        let others = folded.filter { $0 != conversationId }
        let next = isFolded ? Array(([conversationId] + others).prefix(Self.capacity)) : others
        defaults.set(next, forKey: Self.storageKey)
    }
}
