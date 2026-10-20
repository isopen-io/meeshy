import Foundation

public nonisolated enum NotificationListCopy {
    @MainActor
    public static func unreadLabel(count: Int) -> String {
        unreadLabel(count: count, in: .module)
    }

    nonisolated static func unreadLabel(count: Int, in bundle: Bundle) -> String {
        String(localized: "notifications.unreadCount", defaultValue: "\(count) non lues", bundle: bundle)
    }
}
