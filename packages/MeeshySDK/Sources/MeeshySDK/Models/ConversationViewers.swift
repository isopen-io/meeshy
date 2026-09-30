import Foundation

/// Qui a l'écran de quelle conversation ouvert (#8892), tel que le serveur
/// l'annonce par `viewing:start` / `viewing:stop` / `viewing:snapshot`.
///
/// Indexé par conversation : chaque socket est dans TOUTES ses rooms, la liste
/// apprend donc qui est dans chaque conversation sans l'avoir ouverte. Valeur
/// immuable — chaque événement rend un nouvel état.
public struct ConversationViewers: Equatable, Sendable {
    public let usersByConversation: [String: Set<String>]

    public init(usersByConversation: [String: Set<String>] = [:]) {
        self.usersByConversation = usersByConversation.filter { !$0.value.isEmpty }
    }

    public func isHere(userId: String, conversationId: String) -> Bool {
        usersByConversation[conversationId]?.contains(userId) ?? false
    }

    public func users(in conversationId: String) -> Set<String> {
        usersByConversation[conversationId] ?? []
    }

    public func applying(_ event: ConversationViewingEvent) -> ConversationViewers {
        switch event {
        case .arrived(let change):
            return replacing(change.conversationId, with: users(in: change.conversationId).union([change.userId]))
        case .left(let change):
            return replacing(change.conversationId, with: users(in: change.conversationId).subtracting([change.userId]))
        case .snapshot(let snapshot):
            return replacing(snapshot.conversationId, with: Set(snapshot.userIds))
        }
    }

    private func replacing(_ conversationId: String, with users: Set<String>) -> ConversationViewers {
        var next = usersByConversation
        next[conversationId] = users
        return ConversationViewers(usersByConversation: next)
    }
}
