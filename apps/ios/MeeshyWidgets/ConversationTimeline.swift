import WidgetKit
import SwiftUI

// MARK: - Timeline Provider
struct ConversationProvider: TimelineProvider {
    func placeholder(in context: Context) -> ConversationEntry {
        ConversationEntry(
            date: Date(),
            conversations: ConversationEntry.sampleConversations,
            unreadCount: 3
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (ConversationEntry) -> ()) {
        // appgroup-05 — les samples ne servent QUE la galerie de widgets ;
        // partout ailleurs, la donnée réelle (éventuellement vide).
        if context.isPreview {
            completion(ConversationEntry(
                date: Date(),
                conversations: ConversationEntry.sampleConversations,
                unreadCount: 3
            ))
            return
        }
        let entry = ConversationEntry(
            date: Date(),
            conversations: loadConversations(),
            unreadCount: getUnreadCount()
        )
        completion(entry)
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<ConversationEntry>) -> ()) {
        let now = Date()
        let entry = ConversationEntry(
            date: now,
            conversations: loadConversations(),
            unreadCount: getUnreadCount()
        )
        completion(WidgetRefreshSchedule.timeline(
            single: entry,
            now: now,
            interval: WidgetRefreshSchedule.conversationsInterval
        ))
    }

    private func loadConversations() -> [Conversation] {
        // appgroup-05 — jamais de repli fabriqué : une clé absente (compte
        // déconnecté, wipe de logout) ou un décodage raté rendent une liste
        // VIDE, visible et diagnosticable — pas des conversations fictives.
        guard let sharedDefaults = UserDefaults(suiteName: WidgetSharedKeys.suiteName),
              let data = sharedDefaults.data(forKey: WidgetSharedKeys.conversations) else {
            return []
        }

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        if let conversations = try? decoder.decode([Conversation].self, from: data) {
            return conversations
        }
        return []
    }

    private func getUnreadCount() -> Int {
        guard let sharedDefaults = UserDefaults(suiteName: WidgetSharedKeys.suiteName) else {
            return 0
        }
        return sharedDefaults.integer(forKey: WidgetSharedKeys.unreadCount)
    }
}

// MARK: - Timeline Entry
struct ConversationEntry: TimelineEntry {
    let date: Date
    let conversations: [Conversation]
    let unreadCount: Int

    static let sampleConversations: [Conversation] = [
        Conversation(
            id: "1",
            contactName: "John Doe",
            contactAvatar: "person.circle.fill",
            lastMessage: "Hey, are we still on for lunch?",
            timestamp: Date(),
            isUnread: true,
            isPinned: true,
            accentColor: "6366F1"
        ),
        Conversation(
            id: "2",
            contactName: "Jane Smith",
            contactAvatar: "person.circle.fill",
            lastMessage: "Thanks for the files!",
            timestamp: Date().addingTimeInterval(-3600),
            isUnread: false,
            isPinned: false,
            accentColor: WidgetColors.indigo400Hex
        )
    ]
}

// MARK: - Empty State (appgroup-05)
/// État vide EXPLICITE : après le wipe de logout (appgroup-01) ou sur une
/// installation fraîche, le widget dit d'ouvrir l'app au lieu d'afficher des
/// conversations fabriquées.
struct WidgetEmptyState: View {
    var body: some View {
        VStack(spacing: 6) {
            Image(systemName: "message")
                .font(.title3)
                .foregroundStyle(.secondary)
            Text(String(localized: "widget.empty.openApp", defaultValue: "Open Meeshy to get started"))
                .font(.caption)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
