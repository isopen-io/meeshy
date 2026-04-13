import WidgetKit
import SwiftUI
import ActivityKit
import AppIntents

// MARK: - App Group Constants

private enum WidgetSharedKeys: Sendable {
    nonisolated static let suiteName = "group.me.meeshy.app"
    nonisolated static let conversations = "recent_conversations"
    nonisolated static let unreadCount = "unread_count"
    nonisolated static let pendingMarkRead = "pending_mark_read"
}

// MARK: - Brand Colors (mirrors MeeshyColors from SDK — widget can't import MeeshyUI)

private enum WidgetColors {
    static let brandPrimaryHex = "6366F1"
    static let brandDeepHex = "4338CA"
    static let successHex = "34D399"
    static let errorHex = "F87171"

    static var brandPrimary: Color { Color(hex: brandPrimaryHex) }
    static var brandDeep: Color { Color(hex: brandDeepHex) }
    static var brandGradient: LinearGradient {
        LinearGradient(colors: [brandPrimary, brandDeep], startPoint: .topLeading, endPoint: .bottomTrailing)
    }
}

// MARK: - Color(hex:) (minimal, widget-only)

private extension Color {
    init(hex: String) {
        let h = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        var rgb: UInt64 = 0
        Scanner(string: h).scanHexInt64(&rgb)
        self.init(
            red: Double((rgb >> 16) & 0xFF) / 255,
            green: Double((rgb >> 8) & 0xFF) / 255,
            blue: Double(rgb & 0xFF) / 255
        )
    }
}

// MARK: - InitialsAvatar

private struct InitialsAvatar: View {
    let name: String
    let accentColor: String
    let size: CGFloat

    private var initials: String {
        let words = name.split(separator: " ").prefix(2)
        if words.isEmpty { return "?" }
        return words.map { String($0.prefix(1)).uppercased() }.joined()
    }

    var body: some View {
        ZStack {
            Circle()
                .fill(Color(hex: accentColor))
            Text(initials)
                .font(.system(size: size * 0.4, weight: .semibold, design: .rounded))
                .foregroundColor(.white)
        }
        .frame(width: size, height: size)
    }
}

// MARK: - Mark-as-Read App Intent (iOS 17+)

@available(iOS 17.0, *)
struct MarkConversationReadIntent: AppIntent {
    nonisolated static let title: LocalizedStringResource = "Mark conversation as read"
    nonisolated static let description = IntentDescription(
        "Clears the unread badge for this conversation from the widget."
    )
    nonisolated static let openAppWhenRun: Bool = false

    @Parameter(title: "Conversation ID")
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

// MARK: - Widget Bundle
@main
struct MeeshyWidgetBundle: WidgetBundle {
    var body: some Widget {
        RecentConversationsWidget()
        UnreadCountWidget()
        QuickReplyWidget()
        FavoriteContactsWidget()
        #if canImport(ActivityKit)
        if #available(iOS 16.2, *) {
            MeeshyLiveActivity()
        }
        #endif
    }
}

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
        let entry = ConversationEntry(
            date: Date(),
            conversations: loadConversations(),
            unreadCount: getUnreadCount()
        )
        completion(entry)
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<ConversationEntry>) -> ()) {
        var entries: [ConversationEntry] = []

        let currentDate = Date()
        for minuteOffset in 0 ..< 60 where minuteOffset % 15 == 0 {
            let entryDate = Calendar.current.date(byAdding: .minute, value: minuteOffset, to: currentDate)!
            let entry = ConversationEntry(
                date: entryDate,
                conversations: loadConversations(),
                unreadCount: getUnreadCount()
            )
            entries.append(entry)
        }

        let timeline = Timeline(entries: entries, policy: .atEnd)
        completion(timeline)
    }

    private func loadConversations() -> [Conversation] {
        guard let sharedDefaults = UserDefaults(suiteName: WidgetSharedKeys.suiteName),
              let data = sharedDefaults.data(forKey: WidgetSharedKeys.conversations) else {
            return ConversationEntry.sampleConversations
        }

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        if let conversations = try? decoder.decode([Conversation].self, from: data) {
            return conversations
        }
        return ConversationEntry.sampleConversations
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
            accentColor: "4ECDC4"
        )
    ]
}

// MARK: - Data Models
struct Conversation: Codable, Identifiable {
    let id: String
    let contactName: String
    let contactAvatar: String
    let lastMessage: String
    let timestamp: Date
    let isUnread: Bool
    let isPinned: Bool
    let accentColor: String
}

struct FavoriteContact: Codable, Identifiable {
    let id: String
    let name: String
    let avatar: String
    let status: String
    let accentColor: String
}

// ============================================================================
// MARK: - 1. Recent Conversations Widget
// ============================================================================

struct RecentConversationsWidget: Widget {
    let kind: String = "RecentConversations"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: ConversationProvider()) { entry in
            RecentConversationsWidgetView(entry: entry)
        }
        .configurationDisplayName(String(localized: "widget.recentConversations.title", defaultValue: "Recent Conversations"))
        .description(String(localized: "widget.recentConversations.description", defaultValue: "View your recent conversations at a glance"))
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

struct RecentConversationsWidgetView: View {
    @Environment(\.widgetFamily) var family
    let entry: ConversationEntry

    var body: some View {
        switch family {
        case .systemSmall:
            SmallConversationView(entry: entry)
        case .systemMedium:
            MediumConversationView(entry: entry)
        case .systemLarge:
            LargeConversationView(entry: entry)
        default:
            EmptyView()
        }
    }
}

struct SmallConversationView: View {
    let entry: ConversationEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: "message.fill")
                    .foregroundColor(WidgetColors.brandPrimary)
                Text("\(entry.unreadCount)")
                    .font(.headline)
                    .foregroundColor(WidgetColors.brandPrimary)
                Spacer()
            }

            if let first = entry.conversations.first {
                HStack(spacing: 8) {
                    InitialsAvatar(name: first.contactName, accentColor: first.accentColor, size: 28)

                    VStack(alignment: .leading, spacing: 2) {
                        Text(first.contactName)
                            .font(.caption)
                            .fontWeight(.semibold)
                            .lineLimit(1)
                        Text(first.lastMessage)
                            .font(.caption2)
                            .foregroundColor(.secondary)
                            .lineLimit(2)
                    }
                }
            }

            Spacer()
        }
        .padding()
        .containerBackground(.background, for: .widget)
        .widgetURL(URL(string: "meeshy://conversations/recent"))
    }
}

struct MediumConversationView: View {
    let entry: ConversationEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Label(String(localized: "widget.conversations", defaultValue: "Conversations"), systemImage: "message.fill")
                    .font(.headline)
                    .foregroundColor(WidgetColors.brandPrimary)
                Spacer()
                if entry.unreadCount > 0 {
                    Text("\(entry.unreadCount) unread")
                        .font(.caption)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 2)
                        .background(WidgetColors.brandPrimary.opacity(0.2))
                        .cornerRadius(8)
                }
            }

            ForEach(entry.conversations.prefix(2)) { conversation in
                conversationRow(conversation)
            }

            Spacer()
        }
        .padding()
        .containerBackground(.background, for: .widget)
    }

    @ViewBuilder
    private func conversationRow(_ conversation: Conversation) -> some View {
        HStack(spacing: 8) {
            Link(destination: URL(string: "meeshy://conversation/\(conversation.id)")!) {
                HStack(spacing: 8) {
                    InitialsAvatar(name: conversation.contactName, accentColor: conversation.accentColor, size: 30)

                    VStack(alignment: .leading, spacing: 2) {
                        HStack {
                            Text(conversation.contactName)
                                .font(.caption)
                                .fontWeight(.semibold)
                                .foregroundColor(.primary)
                            if conversation.isPinned {
                                Image(systemName: "pin.fill")
                                    .font(.caption2)
                                    .foregroundColor(.orange)
                            }
                        }
                        Text(conversation.lastMessage)
                            .font(.caption2)
                            .foregroundColor(.secondary)
                            .lineLimit(1)
                    }

                    Spacer()

                    if conversation.isUnread {
                        Circle()
                            .fill(WidgetColors.brandPrimary)
                            .frame(width: 8, height: 8)
                    }
                }
            }

            if conversation.isUnread, #available(iOS 17.0, *) {
                Button(intent: MarkConversationReadIntent(conversationId: conversation.id)) {
                    Image(systemName: "checkmark.circle")
                        .font(.caption)
                        .foregroundColor(WidgetColors.brandPrimary)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Mark as read")
            }
        }
    }
}

struct LargeConversationView: View {
    let entry: ConversationEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Label(String(localized: "widget.recentConversations", defaultValue: "Recent Conversations"), systemImage: "message.fill")
                    .font(.headline)
                    .foregroundColor(WidgetColors.brandPrimary)
                Spacer()
                if entry.unreadCount > 0 {
                    Text("\(entry.unreadCount) unread")
                        .font(.caption)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 2)
                        .background(WidgetColors.brandPrimary.opacity(0.2))
                        .cornerRadius(8)
                }
            }

            ForEach(entry.conversations.prefix(5)) { conversation in
                Link(destination: URL(string: "meeshy://conversation/\(conversation.id)")!) {
                    HStack(spacing: 12) {
                        InitialsAvatar(name: conversation.contactName, accentColor: conversation.accentColor, size: 40)

                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text(conversation.contactName)
                                    .font(.subheadline)
                                    .fontWeight(.semibold)
                                    .foregroundColor(.primary)
                                if conversation.isPinned {
                                    Image(systemName: "pin.fill")
                                        .font(.caption)
                                        .foregroundColor(.orange)
                                }
                                Spacer()
                                Text(conversation.timestamp, style: .relative)
                                    .font(.caption2)
                                    .foregroundColor(.secondary)
                            }
                            Text(conversation.lastMessage)
                                .font(.caption)
                                .foregroundColor(.secondary)
                                .lineLimit(2)
                        }

                        if conversation.isUnread {
                            Circle()
                                .fill(WidgetColors.brandPrimary)
                                .frame(width: 10, height: 10)
                        }
                    }
                    .padding(.vertical, 4)
                }
            }

            Spacer()
        }
        .padding()
        .containerBackground(.background, for: .widget)
    }
}

// ============================================================================
// MARK: - 2. Unread Count Widget
// ============================================================================

struct UnreadCountWidget: Widget {
    let kind: String = "UnreadCount"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: ConversationProvider()) { entry in
            UnreadCountWidgetView(entry: entry)
        }
        .configurationDisplayName(String(localized: "widget.unreadMessages.title", defaultValue: "Unread Messages"))
        .description(String(localized: "widget.unreadMessages.description", defaultValue: "Keep track of your unread messages"))
        #if os(iOS)
        .supportedFamilies([.systemSmall, .accessoryCircular, .accessoryRectangular, .accessoryInline])
        #else
        .supportedFamilies([.systemSmall])
        #endif
    }
}

struct UnreadCountWidgetView: View {
    @Environment(\.widgetFamily) var family
    let entry: ConversationEntry

    var body: some View {
        switch family {
        case .systemSmall:
            SmallUnreadView(count: entry.unreadCount)
        #if os(iOS)
        case .accessoryCircular:
            CircularUnreadView(count: entry.unreadCount)
        case .accessoryRectangular:
            RectangularUnreadView(entry: entry)
        case .accessoryInline:
            InlineUnreadView(count: entry.unreadCount)
        #endif
        default:
            EmptyView()
        }
    }
}

struct SmallUnreadView: View {
    let count: Int

    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: count > 0 ? "message.badge.filled.fill" : "message.fill")
                .font(.largeTitle)
                .foregroundColor(.white)

            if count > 0 {
                Text("\(count)")
                    .font(.system(size: 36, weight: .bold, design: .rounded))
                    .foregroundColor(.white)
                Text(String(localized: "widget.unread", defaultValue: "Unread"))
                    .font(.caption)
                    .foregroundColor(.white.opacity(0.9))
            } else {
                Text(String(localized: "widget.allRead", defaultValue: "All Read"))
                    .font(.headline)
                    .foregroundColor(.white)
            }
        }
        .containerBackground(for: .widget) {
            WidgetColors.brandGradient
        }
        .widgetURL(URL(string: "meeshy://conversations/unread"))
    }
}

struct CircularUnreadView: View {
    let count: Int

    var body: some View {
        ZStack {
            AccessoryWidgetBackground()
            VStack(spacing: 2) {
                Image(systemName: "message.fill")
                    .font(.caption)
                Text("\(count)")
                    .font(.headline)
            }
        }
        .widgetURL(URL(string: "meeshy://conversations/unread"))
    }
}

struct RectangularUnreadView: View {
    let entry: ConversationEntry

    var body: some View {
        VStack(alignment: .leading) {
            HStack {
                Image(systemName: "message.fill")
                Text("\(entry.unreadCount) unread")
                    .font(.headline)
            }
            if let first = entry.conversations.first(where: { $0.isUnread }) {
                Text(first.contactName)
                    .font(.caption)
                    .lineLimit(1)
            }
        }
        .widgetURL(URL(string: "meeshy://conversations/unread"))
    }
}

struct InlineUnreadView: View {
    let count: Int

    var body: some View {
        HStack {
            Image(systemName: "message.fill")
            Text("\(count) unread messages")
        }
        .widgetURL(URL(string: "meeshy://conversations/unread"))
    }
}

// ============================================================================
// MARK: - 3. Quick Reply Widget
// ============================================================================

struct QuickReplyWidget: Widget {
    let kind: String = "QuickReply"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: ConversationProvider()) { entry in
            QuickReplyWidgetView(entry: entry)
        }
        .configurationDisplayName(String(localized: "widget.quickReply.title", defaultValue: "Quick Reply"))
        .description(String(localized: "widget.quickReply.description", defaultValue: "Quickly reply to recent messages"))
        .supportedFamilies([.systemMedium, .systemLarge])
    }
}

struct QuickReplyWidgetView: View {
    let entry: ConversationEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Label(String(localized: "widget.quickReply", defaultValue: "Quick Reply"), systemImage: "text.bubble.fill")
                    .font(.headline)
                    .foregroundColor(WidgetColors.brandPrimary)
                Spacer()
            }

            if let conversation = entry.conversations.first(where: { $0.isUnread }) ?? entry.conversations.first {
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 8) {
                        InitialsAvatar(name: conversation.contactName, accentColor: conversation.accentColor, size: 24)
                        Text(conversation.contactName)
                            .font(.subheadline)
                            .fontWeight(.semibold)
                    }

                    Text(conversation.lastMessage)
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .lineLimit(2)
                        .padding(.vertical, 4)

                    HStack(spacing: 8) {
                        QuickReplyButton(text: "\u{1F44D}", conversationId: conversation.id)
                        QuickReplyButton(text: "OK", conversationId: conversation.id)
                        QuickReplyButton(text: "Thanks!", conversationId: conversation.id)
                        QuickReplyButton(text: "Call me", conversationId: conversation.id)
                    }
                }
            }

            Spacer()
        }
        .padding()
        .containerBackground(.background, for: .widget)
    }
}

struct QuickReplyButton: View {
    let text: String
    let conversationId: String

    var body: some View {
        Link(destination: URL(string: "meeshy://quickreply/\(conversationId)?text=\(text.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")")!) {
            Text(text)
                .font(.caption)
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(WidgetColors.brandPrimary.opacity(0.15))
                .cornerRadius(12)
        }
    }
}

// ============================================================================
// MARK: - 4. Favorite Contacts Widget
// ============================================================================

struct FavoriteContactsWidget: Widget {
    let kind: String = "FavoriteContacts"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: FavoriteContactsProvider()) { entry in
            FavoriteContactsWidgetView(entry: entry)
        }
        .configurationDisplayName(String(localized: "widget.favoriteContacts.title", defaultValue: "Favorite Contacts"))
        .description(String(localized: "widget.favoriteContacts.description", defaultValue: "Quick access to your favorite contacts"))
        .supportedFamilies([.systemMedium, .systemLarge])
    }
}

struct FavoriteContactsProvider: TimelineProvider {
    func placeholder(in context: Context) -> FavoriteContactsEntry {
        FavoriteContactsEntry(date: Date(), contacts: FavoriteContactsEntry.sampleContacts)
    }

    func getSnapshot(in context: Context, completion: @escaping (FavoriteContactsEntry) -> ()) {
        let entry = FavoriteContactsEntry(date: Date(), contacts: loadFavorites())
        completion(entry)
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<FavoriteContactsEntry>) -> ()) {
        let entry = FavoriteContactsEntry(date: Date(), contacts: loadFavorites())
        let timeline = Timeline(entries: [entry], policy: .after(Date().addingTimeInterval(3600)))
        completion(timeline)
    }

    private func loadFavorites() -> [FavoriteContact] {
        guard let sharedDefaults = UserDefaults(suiteName: WidgetSharedKeys.suiteName),
              let data = sharedDefaults.data(forKey: "favorite_contacts") else {
            return FavoriteContactsEntry.sampleContacts
        }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        if let contacts = try? decoder.decode([FavoriteContact].self, from: data) {
            return contacts
        }
        return FavoriteContactsEntry.sampleContacts
    }
}

struct FavoriteContactsEntry: TimelineEntry {
    let date: Date
    let contacts: [FavoriteContact]

    static let sampleContacts: [FavoriteContact] = [
        FavoriteContact(id: "1", name: "Mom", avatar: "person.circle.fill", status: "Online", accentColor: "34D399"),
        FavoriteContact(id: "2", name: "John", avatar: "person.circle.fill", status: "Away", accentColor: "6366F1"),
        FavoriteContact(id: "3", name: "Sarah", avatar: "person.circle.fill", status: "Online", accentColor: "F39C12"),
        FavoriteContact(id: "4", name: "Team", avatar: "person.3.fill", status: "3 members", accentColor: "4ECDC4")
    ]
}

struct FavoriteContactsWidgetView: View {
    @Environment(\.widgetFamily) var family
    let entry: FavoriteContactsEntry

    var contactsToShow: Int {
        family == .systemMedium ? 4 : 8
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Label(String(localized: "widget.favorites", defaultValue: "Favorites"), systemImage: "star.fill")
                    .font(.headline)
                    .foregroundColor(.orange)
                Spacer()
            }

            LazyVGrid(columns: [GridItem(.adaptive(minimum: 65))], spacing: 12) {
                ForEach(entry.contacts.prefix(contactsToShow)) { contact in
                    Link(destination: URL(string: "meeshy://contact/\(contact.id)")!) {
                        VStack(spacing: 4) {
                            ZStack(alignment: .bottomTrailing) {
                                InitialsAvatar(name: contact.name, accentColor: contact.accentColor, size: 50)

                                if contact.status == "Online" {
                                    Circle()
                                        .fill(Color(hex: WidgetColors.successHex))
                                        .frame(width: 12, height: 12)
                                        .overlay(
                                            Circle()
                                                .stroke(Color(.systemBackground), lineWidth: 2)
                                        )
                                }
                            }

                            Text(contact.name)
                                .font(.caption)
                                .lineLimit(1)
                                .foregroundColor(.primary)
                        }
                    }
                }
            }

            Spacer()
        }
        .padding()
        .containerBackground(.background, for: .widget)
    }
}
