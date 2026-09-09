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

            VStack {
                if let toast = toastManager.currentToast {
                    FeedbackToastView(toast: toast)
                        .transition(.feedbackToastReveal)
                        .padding(.top, MeeshySpacing.xxl)
                        .onTapGesture { toastManager.dismiss() }
                }
                Spacer()
            }
            .meeshyAnimation(MeeshyAnimation.springBouncy, value: toastManager.currentToast)
            .zIndex(200)

            RootNotificationToastOverlay(
                notificationManager: notificationManager,
                suppressToastTap: suppressToastTap,
                onTap: handleSocketNotificationTap,
                onPreview: openNotificationPreview(for:)
            )
        }
    }
}
