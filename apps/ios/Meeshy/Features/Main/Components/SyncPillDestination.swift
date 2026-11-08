import Foundation
import MeeshySDK

/// **Où mène le toucher d'une entrée de la pastille** — une décision, un site.
///
/// Les deux racines (`RootView` iPhone, `iPadRootView+Navigation` iPad) portaient
/// chacune un `switch source` qui répondait « rien » pour une conversation hors
/// du cache, pour une story et pour une source inconnue : le doigt touchait, rien
/// ne bougeait. La loi ne voit que des identifiants et rend une destination ; les
/// racines ne font plus que la PRÉSENTER (push, panneau, viewer).
///
/// - Une story en publication mène au groupe de l'utilisateur COURANT, jamais à
///   l'id de la story ni à un autre auteur — même entrée que « Ma story ».
/// - Une conversation absente du cache passe par l'ouverture par id (mémoire,
///   puis GRDB, puis réseau), la même porte que notifications et liens.
nonisolated enum SyncPillDestination: Equatable, Sendable {
    case openConversation(id: String, highlightMessageId: String?)
    case openConversationById(id: String, highlightMessageId: String?)
    case openPost(id: String)
    case openOwnStories(userId: String)
    case none

    static func resolve(source: OutboxUIItem.Source,
                        knownConversationIds: Set<String>,
                        currentUserId: String?) -> SyncPillDestination {
        switch source {
        case .conversation(let id, let messageId):
            guard !id.isEmpty else { return .none }
            guard knownConversationIds.contains(id) else {
                return .openConversationById(id: id, highlightMessageId: messageId)
            }
            return .openConversation(id: id, highlightMessageId: messageId)
        case .post(let id):
            return .openPost(id: id)
        case .story:
            guard let currentUserId, !currentUserId.isEmpty else { return .none }
            return .openOwnStories(userId: currentUserId)
        case .unknown:
            return .none
        }
    }
}
