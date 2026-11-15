import Foundation
import MeeshySDK

protocol ConversationCacheReaderProviding {
    func currentConversation(id: String) async -> MeeshyConversation?
    func cachedThread(id: String) async -> [Message]?
}

/// Lecture CACHE-FIRST de ce que la conversation ouverte sait déjà d'elle :
/// sa ligne de liste (nom, avatar, couleur du mini-player) et son fil.
/// `.fresh` et `.stale` servent ; `.expired` et `.empty` ne rendent rien.
struct ConversationCacheReader: ConversationCacheReaderProviding {
    var loadConversations: @MainActor () async -> CacheResult<[MeeshyConversation]> = {
        await CacheCoordinator.shared.conversations.load(for: "list")
    }
    var loadThread: @MainActor (String) async -> CacheResult<[Message]> = {
        await CacheCoordinator.shared.messages.load(for: $0)
    }

    func currentConversation(id: String) async -> MeeshyConversation? {
        switch await loadConversations() {
        case .fresh(let data, _), .stale(let data, _):
            return data.first { $0.id == id }
        case .expired, .empty:
            return nil
        }
    }

    func cachedThread(id: String) async -> [Message]? {
        switch await loadThread(id) {
        case .fresh(let data, _), .stale(let data, _):
            return data
        case .expired, .empty:
            return nil
        }
    }
}
