import SwiftUI
import MeeshySDK
import MeeshyUI

/// Visual style of the leading status dot in a `SyncPillEntry`. Maps to
/// concrete `MeeshyColors` tokens at render time — kept as an opaque enum
/// here so `SyncPillEntry` stays `Equatable`/`Sendable` without depending
/// on SwiftUI `Color` / `LinearGradient` types (which are not stable
/// `Equatable` across iOS versions).
enum SyncPillDotStyle: Equatable, Sendable {
    case brand     // Indigo brand gradient — default for "in-flight" ops
    case warning   // Amber — used for offline / transient reconnection states
    case success   // Green — used for the transient "En ligne" entry that
                   // appears for ~4s after coming back from offline
    case error     // Red — used for permanently failed ops in the queue
}

/// One row of information surfaced by the rotating sync pill. Built by the
/// orchestrator (`ConnectionBanner`) from a heterogenous set of sources:
/// pending outbox items (with concrete `source` for navigation),
/// connection states (offline / disconnected / syncing — no source,
/// label is the state name).
///
/// The view layer (`SyncPill`) is agnostic to the entry's origin — it
/// just rotates through the array, renders the label, and forwards taps
/// when `source != nil`.
struct SyncPillEntry: Identifiable, Equatable, Sendable {
    let id: String
    let label: String
    /// SFSymbol name shown to the left of the label. Optional — when nil
    /// the leading slot is filled with the dotStyle's pulsing circle.
    let iconName: String?
    let dotStyle: SyncPillDotStyle
    /// Navigation target when the user taps this entry. `nil` for pure
    /// status rows (offline / reconnecting / syncing) — those swallow the
    /// tap as a manual advance instead.
    let source: OutboxUIItem.Source?
    /// Whether the trailing animated ellipsis ("…") is shown. `true` only for
    /// entries representing work actually in flight (sending, syncing,
    /// reconnecting); `false` for terminal / static states (offline, online,
    /// permanently failed) so a finished operation never reads as ongoing.
    let showsActivityDots: Bool

    init(
        id: String,
        label: String,
        iconName: String?,
        dotStyle: SyncPillDotStyle,
        source: OutboxUIItem.Source?,
        showsActivityDots: Bool = true
    ) {
        self.id = id
        self.label = label
        self.iconName = iconName
        self.dotStyle = dotStyle
        self.source = source
        self.showsActivityDots = showsActivityDots
    }
}

/// Inline rotating pill that lists every signal the user might care about
/// from the top of the screen — connection state, queued offline ops, and
/// stuck inflight work — in a single discreet chip. Matches the legacy
/// `ConnectionBanner.syncingPill` chrome (height ~22pt, font 11/medium,
/// capsule background with subtle tint).
///
/// Behaviour highlights:
/// - Rotates one entry per 2.7 s; pauses 5 s on manual tap.
/// - Auto-hides after `SyncPillRotator.maxCycles` (3) complete passes.
/// - Tap on an entry with `source != nil` invokes `onTap(source)` so the
///   caller can route to the conversation / post / story where the
///   operation is taking place.
struct SyncPill: View {
    let entries: [SyncPillEntry]
    /// Invoked when the user taps the pill and the currently visible
    /// entry has a non-nil `source`. The caller is expected to push onto
    /// the navigation stack (`Router.push(.conversation/.postDetail/...)`).
    let onTap: ((OutboxUIItem.Source) -> Void)?

    @StateObject private var rotator = SyncPillRotator()
    @Environment(\.colorScheme) private var colorScheme
    @State private var dotPhase: Int = 0
    private let dotTimer = Timer.publish(every: 0.5, on: .main, in: .common).autoconnect()

    init(
        entries: [SyncPillEntry],
        onTap: ((OutboxUIItem.Source) -> Void)? = nil
    ) {
        self.entries = entries
        self.onTap = onTap
    }

    private var isDark: Bool { colorScheme == .dark }

    /// Entry shown right now. Clamped against `entries.count` so a list
    /// that shrinks between two SwiftUI updates doesn't crash the subscript.
    private var visibleEntry: SyncPillEntry? {
        guard !entries.isEmpty else { return nil }
        let i = min(rotator.currentIndex, entries.count - 1)
        return entries[i]
    }

    /// Pulsing alpha on the leading status dot. Matches the legacy chrome
    /// (0.5 s tick, 50 % duty cycle).
    private var pulseOpacity: Double { dotPhase % 2 == 0 ? 1.0 : 0.4 }

    private var animatedDots: String {
        String(repeating: ".", count: (dotPhase % 3) + 1)
    }

    var body: some View {
        Group {
            if !entries.isEmpty {
                pillContent
                    .transition(.opacity.combined(with: .scale(scale: 0.85)))
            } else {
                EmptyView()
            }
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.85), value: entries.isEmpty)
        .onAppear { rotator.setItemCount(entries.count) }
        .adaptiveOnChange(of: entries.count) { _, newCount in
            rotator.setItemCount(newCount)
        }
        .onReceive(dotTimer) { _ in
            // Le pulse/points n'a de sens que si le pill affiche une entrée.
            // `entries` est vide la majorité du temps (connecté + synchronisé →
            // branche EmptyView). Sans ce garde, `dotPhase += 1` ré-évalue le
            // body de SyncPill 2x/s en permanence pour ne rien afficher — un
            // réveil render inutile sur l'écran principal (toujours monté via
            // ConnectionBanner). La rotation, elle, est déjà coupée par
            // SyncPillRotator quand itemCount == 0 ; on aligne le pulse dessus.
            guard !entries.isEmpty else { return }
            dotPhase += 1
        }
    }

    @ViewBuilder
    private var pillContent: some View {
        HStack(spacing: 6) {
            statusDot
            Text((visibleEntry?.label ?? "") + (visibleEntry?.showsActivityDots == true ? animatedDots : ""))
                .font(MeeshyFont.relative(11, weight: .medium))
                .foregroundStyle(isDark ? .white.opacity(0.7) : .primary.opacity(0.6))
                .lineLimit(1)
                .transition(.opacity.combined(with: .move(edge: .top)))
                .id(visibleEntry?.id ?? "empty")
            if entries.count > 1 {
                Text("\(min(rotator.currentIndex + 1, entries.count))/\(entries.count)")
                    .font(MeeshyFont.relative(10, weight: .regular))
                    .foregroundStyle(isDark ? .white.opacity(0.45) : .primary.opacity(0.4))
                    .monospacedDigit()
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(Capsule().fill(capsuleBackground))
        .contentShape(Capsule())
        .onTapGesture(perform: handleTap)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityText)
        .accessibilityHint(visibleEntry?.source != nil
            ? String(localized: "sync-pill.a11y.tap-hint",
                     defaultValue: "Touchez pour ouvrir l'emplacement de l'opération.",
                     bundle: .main)
            : "")
        .accessibilityAddTraits(visibleEntry?.source != nil ? [.isButton] : [])
    }

    /// Leading visual indicator. If the entry carries a concrete SFSymbol
    /// (e.g. `wifi.slash` for offline) we render it tinted by the dot
    /// style; otherwise we fall back to the pulsing 6×6 circle used by
    /// the legacy syncingPill.
    @ViewBuilder
    private var statusDot: some View {
        if let iconName = visibleEntry?.iconName {
            Image(systemName: iconName)
                .font(MeeshyFont.relative(11, weight: .semibold))
                .foregroundStyle(dotForeground)
                .opacity(pulseOpacity)
                .animation(.easeInOut(duration: 0.8).repeatForever(autoreverses: true), value: dotPhase)
        } else {
            dotShape
                .frame(width: 6, height: 6)
                .opacity(pulseOpacity)
                .animation(.easeInOut(duration: 0.8).repeatForever(autoreverses: true), value: dotPhase)
        }
    }

    @ViewBuilder
    private var dotShape: some View {
        switch visibleEntry?.dotStyle ?? .brand {
        case .brand:
            Circle().fill(MeeshyColors.brandGradient)
        case .warning:
            Circle().fill(MeeshyColors.warning)
        case .success:
            Circle().fill(MeeshyColors.success)
        case .error:
            Circle().fill(MeeshyColors.error)
        }
    }

    private var dotForeground: AnyShapeStyle {
        switch visibleEntry?.dotStyle ?? .brand {
        case .brand:    return AnyShapeStyle(MeeshyColors.brandGradient)
        case .warning:  return AnyShapeStyle(MeeshyColors.warning)
        case .success:  return AnyShapeStyle(MeeshyColors.success)
        case .error:    return AnyShapeStyle(MeeshyColors.error)
        }
    }

    private var capsuleBackground: Color {
        isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.05)
    }

    private func handleTap() {
        guard let entry = visibleEntry else { return }
        if let source = entry.source, let onTap {
            onTap(source)
        } else {
            // Pure status row (offline/syncing/reconnecting) — single tap
            // just advances the rotation manually.
            rotator.advance()
        }
    }

    private var accessibilityText: String {
        guard let entry = visibleEntry else { return "" }
        if entries.count == 1 {
            return entry.label
        }
        return String(
            localized: "sync-pill.a11y.summary",
            defaultValue: "\(entries.count) signaux. Actif : \(entry.label).",
            bundle: .main)
    }
}
