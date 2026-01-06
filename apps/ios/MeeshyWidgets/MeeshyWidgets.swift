import WidgetKit
import SwiftUI
import ActivityKit

// MARK: - Widget Bundle
@main
struct MeeshyWidgetBundle: WidgetBundle {
    var body: some Widget {
        RecentConversationsWidget()
        UnreadCountWidget()
        QuickReplyWidget()
        FavoriteContactsWidget()
        if #available(iOS 16.2, *) {
            MeeshyLiveActivity()
        }
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

        // Generate timeline entries for the next hour
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
        // Load from shared container
        guard let sharedDefaults = UserDefaults(suiteName: "group.com.meeshy.app") else {
            return ConversationEntry.sampleConversations
        }

        if let data = sharedDefaults.data(forKey: "recent_conversations"),
           let conversations = try? JSONDecoder().decode([Conversation].self, from: data) {
            return conversations
        }

        return ConversationEntry.sampleConversations
    }

    private func getUnreadCount() -> Int {
        guard let sharedDefaults = UserDefaults(suiteName: "group.com.meeshy.app") else {
            return 0
        }
        return sharedDefaults.integer(forKey: "unread_count")
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
            isPinned: true
        ),
        Conversation(
            id: "2",
            contactName: "Jane Smith",
            contactAvatar: "person.circle.fill",
            lastMessage: "Thanks for the files!",
            timestamp: Date().addingTimeInterval(-3600),
            isUnread: false,
            isPinned: false
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
}

struct FavoriteContact: Codable, Identifiable {
    let id: String
    let name: String
    let avatar: String
    let status: String
}

// MARK: - 1. Recent Conversations Widget
struct RecentConversationsWidget: Widget {
    let kind: String = "RecentConversations"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: ConversationProvider()) { entry in
            RecentConversationsWidgetView(entry: entry)
        }
        .configurationDisplayName("Recent Conversations")
        .description("View your recent conversations at a glance")
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
                    .foregroundColor(.blue)
                Text("\(entry.unreadCount)")
                    .font(.headline)
                    .foregroundColor(.blue)
                Spacer()
            }

            if let first = entry.conversations.first {
                VStack(alignment: .leading, spacing: 4) {
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

            Spacer()
        }
        .padding()
        .widgetURL(URL(string: "meeshy://conversations/recent"))
    }
}

struct MediumConversationView: View {
    let entry: ConversationEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Label("Conversations", systemImage: "message.fill")
                    .font(.headline)
                    .foregroundColor(.blue)
                Spacer()
                if entry.unreadCount > 0 {
                    Text("\(entry.unreadCount) unread")
                        .font(.caption)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 2)
                        .background(Color.blue.opacity(0.2))
                        .cornerRadius(8)
                }
            }

            ForEach(entry.conversations.prefix(2)) { conversation in
                Link(destination: URL(string: "meeshy://conversation/\(conversation.id)")!) {
                    HStack(spacing: 8) {
                        Image(systemName: conversation.contactAvatar)
                            .font(.title3)
                            .foregroundColor(.blue)
                            .frame(width: 30, height: 30)

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
                                .fill(Color.blue)
                                .frame(width: 8, height: 8)
                        }
                    }
                }
            }

            Spacer()
        }
        .padding()
    }
}

struct LargeConversationView: View {
    let entry: ConversationEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Label("Recent Conversations", systemImage: "message.fill")
                    .font(.headline)
                    .foregroundColor(.blue)
                Spacer()
                if entry.unreadCount > 0 {
                    Text("\(entry.unreadCount) unread")
                        .font(.caption)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 2)
                        .background(Color.blue.opacity(0.2))
                        .cornerRadius(8)
                }
            }

            ForEach(entry.conversations.prefix(5)) { conversation in
                Link(destination: URL(string: "meeshy://conversation/\(conversation.id)")!) {
                    HStack(spacing: 12) {
                        Image(systemName: conversation.contactAvatar)
                            .font(.title2)
                            .foregroundColor(.blue)
                            .frame(width: 40, height: 40)
                            .background(Color.blue.opacity(0.1))
                            .clipShape(Circle())

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
                                .fill(Color.blue)
                                .frame(width: 10, height: 10)
                        }
                    }
                    .padding(.vertical, 4)
                }
            }

            Spacer()
        }
        .padding()
    }
}

// MARK: - 2. Unread Count Widget
struct UnreadCountWidget: Widget {
    let kind: String = "UnreadCount"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: ConversationProvider()) { entry in
            UnreadCountWidgetView(entry: entry)
        }
        .configurationDisplayName("Unread Messages")
        .description("Keep track of your unread messages")
        .supportedFamilies([.systemSmall, .accessoryCircular, .accessoryRectangular, .accessoryInline])
    }
}

struct UnreadCountWidgetView: View {
    @Environment(\.widgetFamily) var family
    let entry: ConversationEntry

    var body: some View {
        switch family {
        case .systemSmall:
            SmallUnreadView(count: entry.unreadCount)
        case .accessoryCircular:
            CircularUnreadView(count: entry.unreadCount)
        case .accessoryRectangular:
            RectangularUnreadView(entry: entry)
        case .accessoryInline:
            InlineUnreadView(count: entry.unreadCount)
        default:
            EmptyView()
        }
    }
}

struct SmallUnreadView: View {
    let count: Int

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [Color.blue, Color.blue.opacity(0.7)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )

            VStack(spacing: 8) {
                Image(systemName: count > 0 ? "message.badge.filled.fill" : "message.fill")
                    .font(.largeTitle)
                    .foregroundColor(.white)

                if count > 0 {
                    Text("\(count)")
                        .font(.system(size: 36, weight: .bold, design: .rounded))
                        .foregroundColor(.white)
                    Text("Unread")
                        .font(.caption)
                        .foregroundColor(.white.opacity(0.9))
                } else {
                    Text("All Read")
                        .font(.headline)
                        .foregroundColor(.white)
                }
            }
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

// MARK: - 3. Quick Reply Widget
struct QuickReplyWidget: Widget {
    let kind: String = "QuickReply"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: ConversationProvider()) { entry in
            QuickReplyWidgetView(entry: entry)
        }
        .configurationDisplayName("Quick Reply")
        .description("Quickly reply to recent messages")
        .supportedFamilies([.systemMedium, .systemLarge])
    }
}

struct QuickReplyWidgetView: View {
    let entry: ConversationEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Label("Quick Reply", systemImage: "text.bubble.fill")
                    .font(.headline)
                    .foregroundColor(.blue)
                Spacer()
            }

            if let conversation = entry.conversations.first(where: { $0.isUnread }) ?? entry.conversations.first {
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Image(systemName: conversation.contactAvatar)
                            .foregroundColor(.blue)
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
                        QuickReplyButton(text: "👍", conversationId: conversation.id)
                        QuickReplyButton(text: "OK", conversationId: conversation.id)
                        QuickReplyButton(text: "Thanks!", conversationId: conversation.id)
                        QuickReplyButton(text: "Call me", conversationId: conversation.id)
                    }
                }
            }

            Spacer()
        }
        .padding()
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
                .background(Color.blue.opacity(0.15))
                .cornerRadius(12)
        }
    }
}

// MARK: - 4. Favorite Contacts Widget
struct FavoriteContactsWidget: Widget {
    let kind: String = "FavoriteContacts"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: FavoriteContactsProvider()) { entry in
            FavoriteContactsWidgetView(entry: entry)
        }
        .configurationDisplayName("Favorite Contacts")
        .description("Quick access to your favorite contacts")
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
        guard let sharedDefaults = UserDefaults(suiteName: "group.com.meeshy.app"),
              let data = sharedDefaults.data(forKey: "favorite_contacts"),
              let contacts = try? JSONDecoder().decode([FavoriteContact].self, from: data) else {
            return FavoriteContactsEntry.sampleContacts
        }
        return contacts
    }
}

struct FavoriteContactsEntry: TimelineEntry {
    let date: Date
    let contacts: [FavoriteContact]

    static let sampleContacts: [FavoriteContact] = [
        FavoriteContact(id: "1", name: "Mom", avatar: "person.circle.fill", status: "Online"),
        FavoriteContact(id: "2", name: "John", avatar: "person.circle.fill", status: "Away"),
        FavoriteContact(id: "3", name: "Sarah", avatar: "person.circle.fill", status: "Online"),
        FavoriteContact(id: "4", name: "Team", avatar: "person.3.fill", status: "3 members")
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
                Label("Favorites", systemImage: "star.fill")
                    .font(.headline)
                    .foregroundColor(.orange)
                Spacer()
            }

            LazyVGrid(columns: [GridItem(.adaptive(minimum: 65))], spacing: 12) {
                ForEach(entry.contacts.prefix(contactsToShow)) { contact in
                    Link(destination: URL(string: "meeshy://contact/\(contact.id)")!) {
                        VStack(spacing: 4) {
                            ZStack(alignment: .bottomTrailing) {
                                Image(systemName: contact.avatar)
                                    .font(.title2)
                                    .foregroundColor(.white)
                                    .frame(width: 50, height: 50)
                                    .background(
                                        LinearGradient(
                                            colors: [.blue, .purple],
                                            startPoint: .topLeading,
                                            endPoint: .bottomTrailing
                                        )
                                    )
                                    .clipShape(Circle())

                                if contact.status == "Online" {
                                    Circle()
                                        .fill(Color.green)
                                        .frame(width: 12, height: 12)
                                        .overlay(
                                            Circle()
                                                .stroke(Color.white, lineWidth: 2)
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
    }
}