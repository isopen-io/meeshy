import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

struct ConnectionBanner: View {
    @ObservedObject private var socketManager = MessageSocketManager.shared
    @ObservedObject private var networkMonitor = NetworkMonitor.shared
    @ObservedObject private var theme = ThemeManager.shared
    @State private var dotPhase: Int = 0
    @State private var showAfterDelay = false
    private let dotTimer = Timer.publish(every: 0.4, on: .main, in: .common).autoconnect()

    private var isDisconnected: Bool {
        !networkMonitor.isOffline && !socketManager.isConnected
    }

    var body: some View {
        Group {
            if isDisconnected && showAfterDelay {
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
                            MeeshyColors.warning.opacity(0.9),
                            MeeshyColors.error.opacity(0.85)
                        ],
                        startPoint: .leading,
                        endPoint: .trailing
                    )
                )
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .shadow(color: MeeshyColors.warning.opacity(0.3), radius: 6, y: 2)
                .padding(.horizontal, 16)
                .transition(.move(edge: .top).combined(with: .opacity))
                .onReceive(dotTimer) { _ in
                    dotPhase += 1
                }
            }
        }
        .onChange(of: isDisconnected) { _, disconnected in
            if disconnected {
                showAfterDelay = false
                Task {
                    try? await Task.sleep(for: .seconds(10))
                    if isDisconnected {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                            showAfterDelay = true
                        }
                    }
                }
            } else {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    showAfterDelay = false
                }
            }
        }
    }

    private var animatedDots: String {
        String(repeating: ".", count: (dotPhase % 3) + 1)
    }
}
