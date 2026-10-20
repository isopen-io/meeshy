import SwiftUI
import MeeshySDK
import MeeshyUI

struct NotificationListView: View {
    @StateObject private var viewModel = NotificationListViewModel()

    var onNotificationTap: ((APINotification) -> Void)?
    var onDismiss: (() -> Void)?
    var onQuickAction: (@MainActor (NotificationQuickAction) async -> Bool)?

    init(
        onNotificationTap: ((APINotification) -> Void)? = nil,
        onDismiss: (() -> Void)? = nil,
        onQuickAction: (@MainActor (NotificationQuickAction) async -> Bool)? = nil
    ) {
        self.onNotificationTap = onNotificationTap
        self.onDismiss = onDismiss
        self.onQuickAction = onQuickAction
    }

    var body: some View {
        NotificationListScreen(
            viewModel: viewModel,
            onNotificationTap: onNotificationTap,
            onDismiss: onDismiss,
            onQuickAction: onQuickAction
        )
    }
}
