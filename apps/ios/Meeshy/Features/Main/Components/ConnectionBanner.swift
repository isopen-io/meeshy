import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

struct ConnectionBanner: View {
    @StateObject private var statusVM = ConnectionStatusViewModel()
    @StateObject private var syncPillVM = SyncPillViewModel()
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    @State private var dotPhase: Int = 0
    private let dotTimer = Timer.publish(every: 0.5, on: .main, in: .common).autoconnect()

    private var isDisconnected: Bool {
        statusVM.status == .disconnected
    }

    private var isOffline: Bool {
        statusVM.status == .offline
    }

    private var isSyncing: Bool {
        statusVM.status == .syncing
    }

    /// Items currently held in the offline outbox queue, derived from
    /// `SyncPillViewModel.state`. When non-empty the rotating `SyncPill`
    /// replaces the generic "Synchronisation…" chip so the user sees the
    /// concrete latent operations (envoi d'audio, envoi d'image, etc.).
    private var pendingItems: [OutboxUIItem] {
        syncPillVM.state.items
    }

    var body: some View {
        Group {
            if !pendingItems.isEmpty {
                SyncPill(items: pendingItems)
            } else if isOffline {
                offlinePill
                    .transition(.opacity.combined(with: .scale(scale: 0.8)))
                    .onReceive(dotTimer) { _ in
                        dotPhase += 1
                    }
            } else if isSyncing {
                syncingPill
                    .transition(.opacity.combined(with: .scale(scale: 0.8)))
                    .onReceive(dotTimer) { _ in
                        dotPhase += 1
                    }
            } else if isDisconnected {
                reconnectingPill
                    .transition(.opacity.combined(with: .scale(scale: 0.8)))
                    .onReceive(dotTimer) { _ in
                        dotPhase += 1
                    }
            }
        }
    }

    // MARK: - Subviews

    /// Discreet inline chip shown when `NetworkMonitor` reports the device
    /// has no network. Replaces the legacy full-width red `OfflineBanner`
    /// per user feedback (2026-05-27): the offline state should feel as
    /// subtle as 'Synchronisation…' and 'Reconnexion…', not a screaming
    /// alert bar. Uses `MeeshyColors.error` on the leading dot to keep the
    /// 'offline = error' semantic without flooding the layout.
    private var offlinePill: some View {
        HStack(spacing: 6) {
            Image(systemName: "wifi.slash")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(MeeshyColors.error.opacity(pulseOpacity))
                .animation(.easeInOut(duration: 0.8).repeatForever(autoreverses: true), value: dotPhase)

            Text(String(localized: "connection.offline", defaultValue: "Hors ligne"))
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(isDark ? .white.opacity(0.7) : .primary.opacity(0.6))
                .lineLimit(1)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(
            Capsule()
                .fill(isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.05))
        )
    }

    private var reconnectingPill: some View {
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
    }

    private var syncingPill: some View {
        HStack(spacing: 6) {
            Circle()
                .fill(MeeshyColors.brandGradient)
                .frame(width: 6, height: 6)
                .opacity(pulseOpacity)
                .animation(.easeInOut(duration: 0.8).repeatForever(autoreverses: true), value: dotPhase)

            Text(String(localized: "connection.syncing", defaultValue: "Synchronisation") + animatedDots)
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(isDark ? .white.opacity(0.7) : .primary.opacity(0.6))
                .lineLimit(1)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(
            Capsule()
                .fill(isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.05))
        )
    }

    private var animatedDots: String {
        String(repeating: ".", count: (dotPhase % 3) + 1)
    }

    private var pulseOpacity: Double {
        dotPhase % 2 == 0 ? 1.0 : 0.4
    }
}
