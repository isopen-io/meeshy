import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - iPad Root View Overlays

extension iPadRootView {

    var overlays: some View {
        ZStack {
            if networkMonitor.isOffline {
                VStack {
                    OfflineBanner()
                        .transition(.move(edge: .top).combined(with: .opacity))
                    Spacer()
                }
                .animation(.spring(response: 0.4, dampingFraction: 0.8), value: networkMonitor.isOffline)
                .zIndex(190)
            }

            VStack {
                if let toast = toastManager.currentToast {
                    ToastView(toast: toast)
                        .transition(.move(edge: .top).combined(with: .opacity))
                        .padding(.top, MeeshySpacing.xxl)
                        .onTapGesture { toastManager.dismiss() }
                }
                Spacer()
            }
            .animation(MeeshyAnimation.springDefault, value: toastManager.currentToast)
            .zIndex(200)

            VStack {
                if let toast = notificationManager.currentToast {
                    NotificationToastView(event: toast) {
                        notificationManager.dismissToast()
                        handleSocketNotificationTap(toast)
                    }
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
                MiniAudioPlayerBar(onTapBody: {
                    guard let convId = ConversationAudioCoordinator.shared
                        .activeContext?.conversationId else { return }
                    navigateToConversationById(convId)
                })
                .padding(.bottom, 12)
            }
            .zIndex(202)
        }
    }
}
