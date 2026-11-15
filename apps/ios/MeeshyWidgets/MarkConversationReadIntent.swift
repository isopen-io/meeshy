import AppIntents
import WidgetKit

// MARK: - Mark-as-Read App Intent (iOS 17+)

struct MarkConversationReadIntent: AppIntent {
    // `LocalizedStringResource` se résout dans le bundle de la cible qui la
    // déclare — c'est le catalogue `MeeshyWidgets/Localizable.xcstrings` qui
    // lui donne ses sept langues.
    static let title = LocalizedStringResource(
        "widget.intent.markRead.title",
        defaultValue: "Mark conversation as read"
    )
    static let description = IntentDescription(
        LocalizedStringResource(
            "widget.intent.markRead.description",
            defaultValue: "Clears the unread badge for this conversation from the widget."
        )
    )
    static let openAppWhenRun: Bool = false

    @Parameter(title: LocalizedStringResource(
        "widget.intent.markRead.parameter.conversationId",
        defaultValue: "Conversation ID"
    ))
    var conversationId: String

    init() {}

    init(conversationId: String) {
        self.conversationId = conversationId
    }

    func perform() async throws -> some IntentResult {
        guard let defaults = UserDefaults(suiteName: WidgetSharedKeys.suiteName) else {
            return .result()
        }

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601

        if let data = defaults.data(forKey: WidgetSharedKeys.conversations),
           var list = try? decoder.decode([Conversation].self, from: data),
           let idx = list.firstIndex(where: { $0.id == conversationId }),
           list[idx].isUnread {
            list[idx] = Conversation(
                id: list[idx].id,
                contactName: list[idx].contactName,
                contactAvatar: list[idx].contactAvatar,
                lastMessage: list[idx].lastMessage,
                timestamp: list[idx].timestamp,
                isUnread: false,
                isPinned: list[idx].isPinned,
                accentColor: list[idx].accentColor
            )
            if let encoded = try? encoder.encode(list) {
                defaults.set(encoded, forKey: WidgetSharedKeys.conversations)
            }

            let current = defaults.integer(forKey: WidgetSharedKeys.unreadCount)
            defaults.set(max(0, current - 1), forKey: WidgetSharedKeys.unreadCount)
        }

        var queued = defaults.stringArray(forKey: WidgetSharedKeys.pendingMarkRead) ?? []
        if !queued.contains(conversationId) {
            queued.append(conversationId)
            defaults.set(queued, forKey: WidgetSharedKeys.pendingMarkRead)
        }

        WidgetCenter.shared.reloadAllTimelines()
        return .result()
    }
}
