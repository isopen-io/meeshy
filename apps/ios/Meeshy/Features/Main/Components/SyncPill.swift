import SwiftUI
import MeeshySDK
import MeeshyUI

/// Inline rotating pill that lists the operations currently held in the
/// offline queue. Matches the dimensions and chrome of the legacy
/// `ConnectionBanner.syncingPill` (height ~22pt, font 11/medium, capsule
/// background with subtle tint) so the bandeau in the safe-area inset
/// keeps the same visual weight whether one or many items are pending.
///
/// Each item in `items` is shown in turn for 2.7 seconds with a label
/// derived from `SyncPillLabels.operationLabel(for:)` — "Envoi de message",
/// "Envoi d'audio", "Synchronisation des lus", etc. — so the user sees the
/// concrete background work, not "Synchronisation" duplicated N times.
///
/// After the rotator has cycled through every item 3 complete times
/// (`SyncPillRotator.maxCycles`), the pill auto-hides via the host's
/// `hasCompletedAllCycles` binding. Re-shows automatically when the items
/// array changes (new enqueue, queue drain, item transitions to .failed).
struct SyncPill: View {
    let items: [OutboxUIItem]
    @StateObject private var rotator = SyncPillRotator()
    @Environment(\.colorScheme) private var colorScheme
    @State private var dotPhase: Int = 0
    private let dotTimer = Timer.publish(every: 0.5, on: .main, in: .common).autoconnect()

    private var isDark: Bool { colorScheme == .dark }

    /// Item shown right now. Clamped against `items.count` so a queue that
    /// shrinks (drain) between two SwiftUI updates doesn't crash the
    /// subscript.
    private var visibleItem: OutboxUIItem? {
        guard !items.isEmpty else { return nil }
        let i = min(rotator.currentIndex, items.count - 1)
        return items[i]
    }

    private var visibleLabel: String {
        guard let item = visibleItem else { return "" }
        return SyncPillLabels.operationLabel(for: item)
    }

    /// Pulsing alpha on the leading status dot, matching the existing
    /// `ConnectionBanner.syncingPill` cadence (0.5s tick, 50% duty cycle).
    private var pulseOpacity: Double { dotPhase % 2 == 0 ? 1.0 : 0.4 }

    private var animatedDots: String {
        String(repeating: ".", count: (dotPhase % 3) + 1)
    }

    var body: some View {
        Group {
            if !items.isEmpty && !rotator.hasCompletedAllCycles {
                pillContent
                    .transition(.opacity.combined(with: .scale(scale: 0.85)))
            } else {
                EmptyView()
            }
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.85), value: items.isEmpty)
        .animation(.spring(response: 0.3, dampingFraction: 0.85), value: rotator.hasCompletedAllCycles)
        .onAppear { rotator.setItemCount(items.count) }
        .adaptiveOnChange(of: items.count) { _, newCount in
            rotator.setItemCount(newCount)
        }
        .onReceive(dotTimer) { _ in dotPhase += 1 }
    }

    @ViewBuilder
    private var pillContent: some View {
        HStack(spacing: 6) {
            statusDot
            Text(visibleLabel + animatedDots)
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(isDark ? .white.opacity(0.7) : .primary.opacity(0.6))
                .lineLimit(1)
                .transition(.opacity.combined(with: .move(edge: .top)))
                .id(visibleItem?.id ?? "empty")
            if items.count > 1 {
                Text("\(min(rotator.currentIndex + 1, items.count))/\(items.count)")
                    .font(.system(size: 10, weight: .regular))
                    .foregroundStyle(isDark ? .white.opacity(0.45) : .primary.opacity(0.4))
                    .monospacedDigit()
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(Capsule().fill(capsuleBackground))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityText)
    }

    private var statusDot: some View {
        Group {
            if visibleItem?.status == .failed {
                Circle().fill(MeeshyColors.error)
            } else {
                Circle().fill(MeeshyColors.brandGradient)
            }
        }
        .frame(width: 6, height: 6)
        .opacity(pulseOpacity)
        .animation(.easeInOut(duration: 0.8).repeatForever(autoreverses: true), value: dotPhase)
    }

    private var capsuleBackground: Color {
        isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.05)
    }

    private var accessibilityText: String {
        if items.isEmpty { return "" }
        if items.count == 1 {
            return "\(visibleLabel) en cours."
        }
        return "\(items.count) opérations en attente. En cours : \(visibleLabel)."
    }
}
