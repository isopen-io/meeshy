import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - iPad Root View Overlays

extension iPadRootView {

    var overlays: some View {
        ZStack {
            // Offline state surfaced via ConnectionBanner inline chip
            // (safe-area inset) — see iOS root pattern. Legacy
            // full-width red OfflineBanner retired 2026-05-27.

            // Toasts de retour : hôte UNIQUE au niveau de `MeeshyApp` (`.feedbackToastOverlay()`), comme sur
            // iPhone. Les monter ici aussi les doublait, avec un tap qui ignorait leur action.

            // Bandeaux « réglages en attente » et « stories en attente » — mêmes vues que l'iPhone.
            RootPendingBanners()

            RootNotificationToastOverlay(
                notificationManager: notifications.manager,
                suppressToastTap: suppressToastTap,
                onTap: handleSocketNotificationTap,
                onPreview: openNotificationPreview(for:)
            )
        }
    }
}
