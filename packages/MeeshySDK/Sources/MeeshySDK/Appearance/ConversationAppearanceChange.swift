import Foundation

// MARK: - Le relais du changement d'apparence (#10631)
//
// Trois sources changent le fond d'une conversation OUVERTE : le choix local
// (optimiste, puis retour arrière sur refus), l'écho d'un autre appareil
// (`user:preferences-updated`, via le store) et la liste rafraîchie. Le fil ne
// relit pas la liste pour autant : il écoute CE relais, et le dernier état
// connu est gardé pour qu'un fil ouvert APRÈS le changement ne parte pas d'une
// valeur de navigation périmée.

public enum ConversationAppearanceChange {
    public static let notification = Notification.Name("meeshy.conversation-appearance.changed")
    public static let conversationIdKey = "conversationId"
    public static let appearanceKey = "appearance"

    private static let lock = NSLock()
    nonisolated(unsafe) private static var latestByConversation: [String: ConversationAppearance] = [:]

    public static func post(conversationId: String, appearance: ConversationAppearance) {
        lock.lock()
        latestByConversation[conversationId] = appearance
        lock.unlock()
        NotificationCenter.default.post(
            name: notification,
            object: nil,
            userInfo: [conversationIdKey: conversationId, appearanceKey: appearance]
        )
    }

    /// Le dernier choix connu de cette session pour la conversation ; `nil` si aucun changement n'a eu lieu.
    public static func latest(for conversationId: String) -> ConversationAppearance? {
        lock.lock()
        defer { lock.unlock() }
        return latestByConversation[conversationId]
    }

    public static func appearance(in notification: Notification, for conversationId: String) -> ConversationAppearance? {
        guard notification.userInfo?[conversationIdKey] as? String == conversationId else { return nil }
        return notification.userInfo?[appearanceKey] as? ConversationAppearance
    }
}
