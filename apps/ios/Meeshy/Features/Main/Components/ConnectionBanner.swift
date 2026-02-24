import SwiftUI
import MeeshySDK
import MeeshyUI

struct ConnectionBanner: View {
    @ObservedObject private var socketManager = MessageSocketManager.shared
    @ObservedObject private var networkMonitor = NetworkMonitor.shared
    @ObservedObject private var theme = ThemeManager.shared
    @State private var dotPhase: Int = 0
    private let dotTimer = Timer.publish(every: 0.4, on: .main, in: .common).autoconnect()

    private var shouldShow: Bool {
        !networkMonitor.isOffline && !socketManager.isConnected
    }

    var body: some View {
        if shouldShow {
            HStack(spacing: 8) {
                ProgressView()
                    .progressViewStyle(CircularProgressViewStyle(tint: .white))
                    .scaleEffect(0.7)

                Text(String(localized: "connection.reconnecting", defaultValue: "Reconnexion en cours") + animatedDots)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(.white)
                    .lineLimit(1)

                Spacer()
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(
                LinearGradient(
                    colors: [
                        MeeshyColors.orange.opacity(0.9),
                        MeeshyColors.coral.opacity(0.85)
                    ],
                    startPoint: .leading,
                    endPoint: .trailing
                )
            )
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .shadow(color: MeeshyColors.orange.opacity(0.3), radius: 6, y: 2)
            .padding(.horizontal, 16)
            .transition(.move(edge: .top).combined(with: .opacity))
            .onReceive(dotTimer) { _ in
                dotPhase += 1
            }
        }
    }

    private var animatedDots: String {
        String(repeating: ".", count: (dotPhase % 3) + 1)
    }
}
