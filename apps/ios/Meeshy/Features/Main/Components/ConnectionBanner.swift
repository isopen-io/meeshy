import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

struct ConnectionBanner: View {
    @ObservedObject private var socketManager = MessageSocketManager.shared
    @ObservedObject private var networkMonitor = NetworkMonitor.shared
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    @State private var dotPhase: Int = 0
    @State private var showAfterDelay = false
    private let dotTimer = Timer.publish(every: 0.5, on: .main, in: .common).autoconnect()

    private var isDisconnected: Bool {
        !networkMonitor.isOffline && !socketManager.isConnected
    }

    var body: some View {
        Group {
            if isDisconnected && showAfterDelay {
                HStack(spacing: 6) {
                    Circle()
                        .fill(MeeshyColors.warning)
                        .frame(width: 6, height: 6)
                        .opacity(pulseOpacity)
                        .animation(.easeInOut(duration: 1.0).repeatForever(autoreverses: true), value: dotPhase)

                    Text(String(localized: "connection.reconnecting", defaultValue: "Reconnexion") + animatedDots)
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(isDark ? .white.opacity(0.6) : .primary.opacity(0.5))
                        .lineLimit(1)
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(
                    Capsule()
                        .fill(isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.05))
                )
                .transition(.opacity.combined(with: .scale(scale: 0.8)))
                .onReceive(dotTimer) { _ in
                    dotPhase += 1
                }
            }
        }
        .task(id: isDisconnected) {
            guard isDisconnected else {
                if showAfterDelay {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        showAfterDelay = false
                    }
                }
                return
            }

            if showAfterDelay { return }

            do {
                try await Task.sleep(for: .seconds(10))
            } catch {
                return
            }

            guard !Task.isCancelled, isDisconnected else { return }
            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                showAfterDelay = true
            }
        }
    }

    private var animatedDots: String {
        String(repeating: ".", count: (dotPhase % 3) + 1)
    }

    private var pulseOpacity: Double {
        dotPhase % 2 == 0 ? 1.0 : 0.4
    }
}
