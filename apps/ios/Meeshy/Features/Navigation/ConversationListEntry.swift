import Foundation
import MeeshySDK

/// **Ce que les widgets et l'App Shortcut « Open Recent Conversation » ouvrent** (#7811).
///
/// `meeshy://conversations/recent` et `…/unread` étaient classés « non routés » :
/// « récente » et « non lue » désignaient une conversation que seul l'app-side
/// sait élire. Le tap ouvrait l'accueil — sans ce que la surface annonce. Les
/// deux élections sont ici, pures, et les racines ne font que les appliquer.
nonisolated enum ConversationListEntry {

    /// « Non lus » : la liste sur le MÊME filtre que la puce du même nom — le
    /// geste de la puce, rejoué, plutôt qu'une seconde orthographe.
    static let unreadFilters: Set<MeeshyConversationFilter> =
        ConversationFilterComposition.toggling(.unread, in: ConversationFilterComposition.neutral)

    /// « Récente » : la conversation au dernier message le plus récent. Jamais
    /// une archivée — archivée par soi (`userState`) ou fermée (`isActive`) :
    /// elles sont masquées de la liste, le raccourci ne les ressort pas.
    static func recentConversationId(in conversations: [MeeshyConversation]) -> String? {
        conversations
            .filter { !$0.isArchived && !$0.userState.isArchived }
            .max { $0.lastMessageAt < $1.lastMessageAt }?
            .id
    }
}
