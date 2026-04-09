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
        }
    }
}
