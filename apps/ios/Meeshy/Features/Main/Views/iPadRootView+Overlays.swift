import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - iPad Root View Overlays

/// Named magic numbers for the iPad root-view audio overlay layout.
private enum AudioOverlayConstants {
    /// Padding above the bottom edge for the floating mini-player on iPad.
    /// No tab bar at the bottom on iPad, just safe-area inset, so the bar
    /// can sit closer to the edge than on iPhone.
    static let iPadBottomPadding: CGFloat = 12
}

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

            // B4 — Mini audio player on iPad. The tap routes to the
            // conversation via `navigateToConversationById` (mirrors the
            // iPhone path in RootView), which in two-column mode honors
            // `router.onRouteRequested` and opens the conversation in the
            // right column instead of pushing onto a NavigationStack.
            VStack {
                Spacer()
                MiniAudioPlayerBar(
                    onTapBody: {
                        guard let convId = ConversationAudioCoordinator.shared
                            .activeContext?.conversationId else { return }
                        navigateToConversationById(convId)
                    },
                    // iPad two-column tracks the active conversation via
                    // `activeConversation` @State rather than `router.path`.
                    // Surface that id so the bar hides when the user is
                    // already viewing the conversation driving playback.
                    currentConversationId: { activeConversation?.id }
                )
                .padding(.bottom, AudioOverlayConstants.iPadBottomPadding)
            }
            .zIndex(202)
        }
    }
}
