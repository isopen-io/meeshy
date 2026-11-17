import Foundation
import Combine
import MeeshySDK

@MainActor
public protocol NotificationListModeling: ObservableObject {
    var notifications: [APINotification] { get }
    var filteredNotifications: [APINotification] { get }
    var isLoading: Bool { get }
    var hasMore: Bool { get }
    var loadDidFail: Bool { get }
    var selectedCategory: NotificationCategory { get }
    var unreadCount: Int { get }

    func loadInitial() async
    /// Le geste « tirer pour rafraîchir » : relit le SERVEUR, même sur un
    /// cache frais.
    func refresh() async
    func select(_ category: NotificationCategory) async
    func loadMore() async
    func markRead(_ notification: APINotification) async
    func markAllRead() async
    func deleteNotification(_ notification: APINotification) async
}

public extension NotificationListModeling {
    /// Repli rétrocompatible pour un conformant qui ne distingue pas le geste
    /// de l'ouverture.
    func refresh() async {
        await loadInitial()
    }
}
