import Foundation
import MeeshySDK

/// La conversation de l'appel, lue dans le cache local SEULEMENT — jamais une attente réseau.
@MainActor
protocol CallConversationCacheProviding: AnyObject {
    func cachedConversation(id: String) async -> MeeshyConversation?
}

@MainActor
final class CallConversationCache: CallConversationCacheProviding {
    static let shared = CallConversationCache()

    nonisolated deinit {}

    /// La liste en cache, fraîche ou périmée : une conversation périmée garde son nom et son accent.
    func cachedConversation(id: String) async -> MeeshyConversation? {
        switch await CacheCoordinator.shared.conversations.load(for: "list") {
        case .fresh(let list, _), .stale(let list, _):
            return list.first { $0.id == id }
        case .expired, .empty:
            return nil
        }
    }
}

/// Ce qu'un cadre écrit hors des visages, résolu pour l'appel en cours (#8743).
@MainActor
protocol CallFrameTextsProviding: AnyObject {
    func immediateTexts(for call: CallFrameCallContext) -> CallFrameTexts
    func texts(for call: CallFrameCallContext) async -> CallFrameTexts
}

/// **CACHE-FIRST** : le nom du groupe, son type et son accent viennent de la conversation en
/// cache ; à défaut, de ce que le maillage sait déjà. Aucune requête ne part d'ici.
@MainActor
final class CallFrameTextsResolver: CallFrameTextsProviding {
    static let shared = CallFrameTextsResolver()

    private let cache: any CallConversationCacheProviding
    private let now: () -> Date

    nonisolated deinit {}

    init(cache: any CallConversationCacheProviding = CallConversationCache.shared, now: @escaping () -> Date = Date.init) {
        self.cache = cache
        self.now = now
    }

    /// Ce qu'on sait sans rien lire : le cadre s'affiche tout de suite, le cache l'affine ensuite.
    func immediateTexts(for call: CallFrameCallContext) -> CallFrameTexts {
        CallFrameTextsRule.texts(conversation: nil, context: call, date: CallFrameTextsRule.dateText(now()))
    }

    func texts(for call: CallFrameCallContext) async -> CallFrameTexts {
        guard let id = call.conversationId, !id.isEmpty else { return immediateTexts(for: call) }
        let conversation = await cache.cachedConversation(id: id)
        return CallFrameTextsRule.texts(conversation: conversation, context: call, date: CallFrameTextsRule.dateText(now()))
    }
}
