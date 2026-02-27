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
}

struct WidgetFavoriteContact: Codable, Identifiable {
    let id: String
    let name: String
    let avatar: String
    let status: String
}

// MARK: - WidgetDataManager

@MainActor
final class WidgetDataManager {
    static let shared = WidgetDataManager()

    private let suiteName = "group.me.meeshy.app"
    private let conversationsKey = "recent_conversations"
    private let unreadCountKey = "unread_count"
    private let favoritesKey = "favorite_contacts"

    private lazy var sharedDefaults: UserDefaults? = {
        UserDefaults(suiteName: suiteName)
    }()

    private let encoder: JSONEncoder = {
        let enc = JSONEncoder()
        enc.dateEncodingStrategy = .iso8601
        return enc
    }()

    private init() {}

    // MARK: - Public API

    func updateConversations(_ conversations: [MeeshyConversation]) {
        let widgetConversations = conversations
            .sorted { ($0.isPinned ? 0 : 1, $0.lastMessageAt) < ($1.isPinned ? 0 : 1, $1.lastMessageAt) }
            .reversed()
            .prefix(10)
            .map { conv in
                WidgetConversation(
                    id: conv.id,
                    contactName: conv.name,
                    contactAvatar: conv.participantAvatarURL != nil ? "person.crop.circle.fill" : (conv.type == .group ? "person.3.fill" : "person.circle.fill"),
                    lastMessage: formatLastMessage(conv),
                    timestamp: conv.lastMessageAt,
                    isUnread: conv.unreadCount > 0,
                    isPinned: conv.isPinned
                )
            }

        let totalUnread = conversations.reduce(0) { $0 + $1.unreadCount }

        guard let defaults = sharedDefaults else { return }

        if let data = try? encoder.encode(Array(widgetConversations)) {
            defaults.set(data, forKey: conversationsKey)
        }
        defaults.set(totalUnread, forKey: unreadCountKey)

        reloadWidgets()
    }

    func updateFavoriteContacts(_ conversations: [MeeshyConversation]) {
        let favorites = conversations
            .filter { $0.isPinned && $0.type == .direct }
            .prefix(8)
            .map { conv in
                WidgetFavoriteContact(
                    id: conv.id,
                    name: conv.name,
                    avatar: conv.participantAvatarURL != nil ? "person.crop.circle.fill" : "person.circle.fill",
                    status: conv.lastSeenText ?? "Offline"
                )
            }

        guard let defaults = sharedDefaults,
              let data = try? encoder.encode(Array(favorites)) else { return }

        defaults.set(data, forKey: favoritesKey)
    }

    func updateUnreadCount(_ count: Int) {
        sharedDefaults?.set(count, forKey: unreadCountKey)
        reloadWidgets()
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

    private func reloadWidgets() {
        WidgetCenter.shared.reloadAllTimelines()
    }
}
