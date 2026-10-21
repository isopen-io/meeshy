import Foundation

public nonisolated enum NotificationListCopy {
    @MainActor
    public static func unreadLabel(count: Int) -> String {
        unreadLabel(count: count, in: .module)
    }

    @MainActor public static var markReadFailed: String { markReadFailed(in: .module) }
    @MainActor public static var markAllReadFailed: String { markAllReadFailed(in: .module) }
    @MainActor public static var deleteFailed: String { deleteFailed(in: .module) }

    nonisolated static func unreadLabel(count: Int, in bundle: Bundle) -> String {
        String(localized: "notifications.unreadCount", defaultValue: "\(count) non lues", bundle: bundle)
    }

    nonisolated static func markReadFailed(in bundle: Bundle) -> String {
        String(localized: "notifications.markRead.failed", defaultValue: "Impossible de marquer cette notification lue", bundle: bundle)
    }

    nonisolated static func markAllReadFailed(in bundle: Bundle) -> String {
        String(localized: "notifications.markAllRead.failed", defaultValue: "Impossible de tout marquer comme lu", bundle: bundle)
    }

    nonisolated static func deleteFailed(in bundle: Bundle) -> String {
        String(localized: "notifications.delete.failed", defaultValue: "Impossible de supprimer cette notification", bundle: bundle)
    }
}
