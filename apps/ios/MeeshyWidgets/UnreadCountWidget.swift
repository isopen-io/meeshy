import WidgetKit
import SwiftUI

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
                .foregroundStyle(.white)

            if count > 0 {
                Text("\(count)")
                    .font(.system(size: 36, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)
                Text(String(localized: "widget.unread", defaultValue: "Unread"))
                    .font(.caption)
                    .foregroundStyle(.white.opacity(0.9))
            } else {
                Text(String(localized: "widget.allRead", defaultValue: "All Read"))
                    .font(.headline)
                    .foregroundStyle(.white)
            }
        }
        .containerBackground(for: .widget) {
            WidgetColors.brandGradient
        }
        // Ouvre la liste sur le filtre « Non lus » (`ConversationListEntry`, #7811).
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
        // Ouvre la liste sur le filtre « Non lus » (`ConversationListEntry`, #7811).
        .widgetURL(URL(string: "meeshy://conversations/unread"))
    }
}

struct RectangularUnreadView: View {
    let entry: ConversationEntry

    var body: some View {
        VStack(alignment: .leading) {
            HStack {
                Image(systemName: "message.fill")
                Text(String(localized: "widget.unreadCount", defaultValue: "\(entry.unreadCount) unread"))
                    .font(.headline)
            }
            if let first = entry.conversations.first(where: { $0.isUnread }) {
                Text(first.contactName)
                    .font(.caption)
                    .lineLimit(1)
            }
        }
        // Ouvre la liste sur le filtre « Non lus » (`ConversationListEntry`, #7811).
        .widgetURL(URL(string: "meeshy://conversations/unread"))
    }
}

struct InlineUnreadView: View {
    let count: Int

    var body: some View {
        HStack {
            Image(systemName: "message.fill")
            Text(String(localized: "widget.unreadMessagesCount", defaultValue: "\(count) unread messages"))
        }
        // Ouvre la liste sur le filtre « Non lus » (`ConversationListEntry`, #7811).
        .widgetURL(URL(string: "meeshy://conversations/unread"))
    }
}
