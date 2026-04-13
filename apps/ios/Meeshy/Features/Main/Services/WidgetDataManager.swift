import Foundation
import WidgetKit
import MeeshySDK

// MARK: - Widget-compatible Codable models (mirrors MeeshyWidgets target)

struct WidgetConversation: Codable, Identifiable {
    let id: String
    let contactName: String
    let contactAvatar: String
    let lastMessage: String
    let timestamp: Date
    let isUnread: Bool
    let isPinned: Bool
    let accentColor: String
}

struct WidgetFavoriteContact: Codable, Identifiable {
    let id: String
    let name: String
    let avatar: String
    let status: String
    let accentColor: String
}

// MARK: - WidgetDataManager

/// Bridges the NotificationCoordinator to the widget shared container + WidgetKit timeline reloader.
///
/// The manager is deliberately passive — it receives pushes from `NotificationCoordinator`
/// (the single source of truth for unread counts) and keeps the App Group store aligned.
/// No direct socket subscription, no direct badge write: this class only knows about widgets.
@MainActor
final class WidgetDataManager: NotificationWidgetSink {
    static let shared = WidgetDataManager()

    private let suiteName = "group.me.meeshy.app"
    private let conversationsKey = "recent_conversations"
    private let unreadCountKey = "unread_count"
    private let favoritesKey = "favorite_contacts"
    private let lastUpdatedKey = "widget_last_updated"

    private lazy var sharedDefaults: UserDefaults? = {
        UserDefaults(suiteName: suiteName)
    }()

    private let encoder: JSONEncoder = {
        let enc = JSONEncoder()
        enc.dateEncodingStrategy = .iso8601
        return enc
    }()

    private init() {}

    // MARK: - NotificationWidgetSink

    func publishConversations(_ conversations: [MeeshyConversation]) {
        let widgetConversations = conversations
            .sorted { ($0.isPinned ? 0 : 1, $0.lastMessageAt) < ($1.isPinned ? 0 : 1, $1.lastMessageAt) }
            .reversed()
            .prefix(10)
            .map { conv in
                WidgetConversation(
                    id: conv.id,
                    contactName: conv.name,
                    contactAvatar: conv.type == .group ? "person.3.fill" : "person.circle.fill",
                    lastMessage: formatLastMessage(conv),
                    timestamp: conv.lastMessageAt,
                    isUnread: conv.unreadCount > 0,
                    isPinned: conv.isPinned,
                    accentColor: conv.accentColor
                )
            }

        guard let defaults = sharedDefaults,
              let data = try? encoder.encode(Array(widgetConversations)) else { return }

        defaults.set(data, forKey: conversationsKey)
        defaults.set(Date().timeIntervalSince1970, forKey: lastUpdatedKey)
    }

    func publishFavoriteContacts(_ conversations: [MeeshyConversation]) {
        let favorites = conversations
            .filter { $0.isPinned && $0.type == .direct }
            .prefix(8)
            .map { conv in
                WidgetFavoriteContact(
                    id: conv.id,
                    name: conv.name,
                    avatar: "person.circle.fill",
                    status: conv.lastSeenText ?? "Offline",
                    accentColor: conv.accentColor
                )
            }

        guard let defaults = sharedDefaults,
              let data = try? encoder.encode(Array(favorites)) else { return }

        defaults.set(data, forKey: favoritesKey)
    }

    func publishUnreadCount(_ count: Int) {
        sharedDefaults?.set(max(count, 0), forKey: unreadCountKey)
    }

    func reloadTimelines() {
        WidgetCenter.shared.reloadAllTimelines()
    }

    // MARK: - Legacy shim (kept for callers still using the old API)

    func updateConversations(_ conversations: [MeeshyConversation]) {
        publishConversations(conversations)
        publishFavoriteContacts(conversations)
        let totalUnread = conversations.reduce(0) { $0 + $1.unreadCount }
        publishUnreadCount(totalUnread)
        reloadTimelines()
    }

    func updateFavoriteContacts(_ conversations: [MeeshyConversation]) {
        publishFavoriteContacts(conversations)
    }

    func updateUnreadCount(_ count: Int) {
        publishUnreadCount(count)
        reloadTimelines()
    }

    // MARK: - Private

    private func formatLastMessage(_ conv: MeeshyConversation) -> String {
        if let preview = conv.lastMessagePreview, !preview.isEmpty {
            if let sender = conv.lastMessageSenderName, conv.type != .direct {
                return "\(sender): \(preview)"
            }
            return preview
        }
        if conv.lastMessageAttachmentCount > 0 {
            return "[\(conv.lastMessageAttachmentCount) attachment\(conv.lastMessageAttachmentCount > 1 ? "s" : "")]"
        }
        return ""
    }
}
