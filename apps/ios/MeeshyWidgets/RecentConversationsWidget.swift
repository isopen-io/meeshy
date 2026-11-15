import WidgetKit
import SwiftUI
import AppIntents

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
                    .foregroundStyle(WidgetColors.brandPrimary)
                Text("\(entry.unreadCount)")
                    .font(.headline)
                    .foregroundStyle(WidgetColors.brandPrimary)
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
                            .foregroundStyle(.secondary)
                            .lineLimit(2)
                    }
                }
            } else {
                WidgetEmptyState()
            }

            Spacer()
        }
        .padding()
        .containerBackground(.background, for: .widget)
        // Ouvre la conversation la plus récente (`ConversationListEntry`, #7811).
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
                    .foregroundStyle(WidgetColors.brandPrimary)
                Spacer()
                if entry.unreadCount > 0 {
                    Text(String(localized: "widget.unreadCount", defaultValue: "\(entry.unreadCount) unread"))
                        .font(.caption)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 2)
                        .background(WidgetColors.brandPrimary.opacity(0.2))
                        .clipShape(.rect(cornerRadius: 8))
                }
            }

            if entry.conversations.isEmpty {
                WidgetEmptyState()
            } else {
                ForEach(entry.conversations.prefix(2)) { conversation in
                    conversationRow(conversation)
                }
            }

            Spacer()
        }
        .padding()
        .containerBackground(.background, for: .widget)
    }

    @ViewBuilder
    private func conversationRow(_ conversation: Conversation) -> some View {
        HStack(spacing: 8) {
            WidgetLink(url: WidgetDeepLink.conversation(conversation.id)) {
                HStack(spacing: 8) {
                    InitialsAvatar(name: conversation.contactName, accentColor: conversation.accentColor, size: 30)

                    VStack(alignment: .leading, spacing: 2) {
                        HStack {
                            Text(conversation.contactName)
                                .font(.caption)
                                .fontWeight(.semibold)
                                .foregroundStyle(.primary)
                            if conversation.isPinned {
                                Image(systemName: "pin.fill")
                                    .font(.caption2)
                                    .foregroundStyle(.orange)
                            }
                        }
                        Text(conversation.lastMessage)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
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

            if conversation.isUnread {
                Button(intent: MarkConversationReadIntent(conversationId: conversation.id)) {
                    Image(systemName: "checkmark.circle")
                        .font(.caption)
                        .foregroundStyle(WidgetColors.brandPrimary)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(String(localized: "widget.markAsRead", defaultValue: "Mark as read"))
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
                    .foregroundStyle(WidgetColors.brandPrimary)
                Spacer()
                if entry.unreadCount > 0 {
                    Text(String(localized: "widget.unreadCount", defaultValue: "\(entry.unreadCount) unread"))
                        .font(.caption)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 2)
                        .background(WidgetColors.brandPrimary.opacity(0.2))
                        .clipShape(.rect(cornerRadius: 8))
                }
            }

            if entry.conversations.isEmpty {
                WidgetEmptyState()
            }
            ForEach(entry.conversations.prefix(5)) { conversation in
                WidgetLink(url: WidgetDeepLink.conversation(conversation.id)) {
                    HStack(spacing: 12) {
                        InitialsAvatar(name: conversation.contactName, accentColor: conversation.accentColor, size: 40)

                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text(conversation.contactName)
                                    .font(.subheadline)
                                    .fontWeight(.semibold)
                                    .foregroundStyle(.primary)
                                if conversation.isPinned {
                                    Image(systemName: "pin.fill")
                                        .font(.caption)
                                        .foregroundStyle(.orange)
                                }
                                Spacer()
                                Text(conversation.timestamp, style: .relative)
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
                            Text(conversation.lastMessage)
                                .font(.caption)
                                .foregroundStyle(.secondary)
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
