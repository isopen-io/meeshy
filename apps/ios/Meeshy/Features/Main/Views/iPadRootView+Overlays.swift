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

            VStack {
                if let toast = notificationManager.currentToast {
                    NotificationToastView(event: toast) {
                        if suppressToastTap { return }
                        notificationManager.dismissToast()
                        handleSocketNotificationTap(toast)
                    }
                    // Long press OR pull the toast down to open a conversation
                    // preview overlay instead of navigating.
                    .simultaneousGesture(
                        LongPressGesture(minimumDuration: 0.35).onEnded { _ in
                            openNotificationPreview(for: toast)
                        }
                    )
                    .simultaneousGesture(
                        DragGesture(minimumDistance: 24)
                            .onEnded { value in
                                if value.translation.height > 36 {
                                    openNotificationPreview(for: toast)
                                }
                            }
                    )
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .padding(.top, MeeshySpacing.xxl)
                }
                Spacer()
            }
            .animation(MeeshyAnimation.springDefault, value: notificationManager.currentToast?.id)
            .zIndex(201)
        }
    }
}
