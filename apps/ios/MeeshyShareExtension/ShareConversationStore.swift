import Foundation

/// Une conversation proposée comme destination de partage, telle que le widget
/// la dépose — le REPLI de l'extension quand l'app n'a pas encore déposé son
/// cliché de destinataires (`ShareDirectorySnapshot`), par exemple juste après
/// une mise à jour. Ni `recent_conversations` (dont `contactAvatar` porte un nom
/// de symbole SF, pas une URL) ni `conversation_snapshots` ne transportent de
/// photo : l'avatar de l'écran retombe alors sur les initiales.
nonisolated struct ShareTarget: Identifiable, Equatable, Sendable {
    let id: String
    let displayName: String
    let accentColorHex: String
    let unreadCount: Int
    /// Groupe, canal ou salon : tout ce qui n'est pas une conversation directe.
    var isGroup: Bool = false
}

nonisolated enum ShareConversationStore {

    /// Écrite par `WidgetDataManager.publishConversations`. Porte
    /// `conv.displayName` DÉJÀ résolu — indispensable pour les conversations
    /// directes, dont le titre canonique est nul.
    static let recentConversationsKey = "recent_conversations"

    /// Écrite par `WidgetDataManager.publishConversationSnapshots`. Sert
    /// UNIQUEMENT à enrichir (renommage local, non-lus) : son `title` est le
    /// titre serveur brut, nul en conversation directe, donc inutilisable comme
    /// source de noms.
    static let conversationSnapshotsKey = "conversation_snapshots"

    // MARK: - Miroirs de décodage
    //
    // Sous-ensembles stricts des payloads producteurs : les champs non listés
    // (timestamp, isPinned…) sont ignorés par `JSONDecoder`. Omettre
    // `timestamp` évite au passage d'avoir à répliquer la stratégie de date de
    // l'encodeur.

    private struct RecentConversation: Decodable {
        let id: String
        let contactName: String
        let accentColor: String
    }

    private struct ConversationSnapshot: Decodable {
        let type: String?
        let customName: String?
        let unreadCount: Int?
    }

    // MARK: - Fusion (pure, testable)

    static func targets(recentsData: Data?, snapshotsData: Data?) -> [ShareTarget] {
        guard let recentsData,
              let recents = try? JSONDecoder().decode([RecentConversation].self, from: recentsData)
        else { return [] }

        let snapshots = decodeSnapshots(snapshotsData)

        return recents.map { recent in
            let snapshot = snapshots[recent.id]
            return ShareTarget(
                id: recent.id,
                displayName: displayName(for: recent, snapshot: snapshot),
                accentColorHex: recent.accentColor,
                unreadCount: snapshot?.unreadCount ?? 0,
                isGroup: snapshot?.type.map { $0 != "direct" } ?? false
            )
        }
    }

    /// Des snapshots illisibles dégradent l'enrichissement, jamais la liste :
    /// mieux vaut des noms canoniques sans compteur qu'un écran vide.
    private static func decodeSnapshots(_ data: Data?) -> [String: ConversationSnapshot] {
        guard let data,
              let decoded = try? JSONDecoder().decode([String: ConversationSnapshot].self, from: data)
        else { return [:] }
        return decoded
    }

    /// Le renommage LOCAL prime sur le nom canonique — même règle que
    /// `WidgetDataManager.conversationToastPresentation`.
    private static func displayName(
        for recent: RecentConversation,
        snapshot: ConversationSnapshot?
    ) -> String {
        let custom = snapshot?.customName?.trimmingCharacters(in: .whitespacesAndNewlines)
        if let custom, !custom.isEmpty { return custom }
        return recent.contactName
    }

    // MARK: - Lecture réelle

    static func liveTargets() -> [ShareTarget] {
        let defaults = UserDefaults(suiteName: ShareSession.appGroupIdentifier)
        return targets(
            recentsData: defaults?.data(forKey: recentConversationsKey),
            snapshotsData: defaults?.data(forKey: conversationSnapshotsKey)
        )
    }
}
