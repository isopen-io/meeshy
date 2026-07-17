import SwiftUI

/// Segmented control swapping between the Quick (Simple) and Pro container
/// variants. Lives at the top of the timeline sheet so the affordance is
/// always visible — replaces the discreet `PRO ↗` chip that used to live
/// inside the transport row.
public struct TimelineModeSwitcher: View, Equatable {

    public static func == (lhs: TimelineModeSwitcher, rhs: TimelineModeSwitcher) -> Bool {
        lhs.mode == rhs.mode && lhs.isDark == rhs.isDark
    }

    public let mode: TimelineMode
    public let isDark: Bool
    public let onSelect: (TimelineMode) -> Void

    public init(mode: TimelineMode,
                isDark: Bool,
                onSelect: @escaping (TimelineMode) -> Void) {
        self.mode = mode
        self.isDark = isDark
        self.onSelect = onSelect
    }

    /// Visible segment label AND accessibility label — the same source
    /// drives both so they can never drift apart (previous bug: VoiceOver
    /// announced "Quick", from the internal `.quick` case name, while the
    /// screen showed "Simple", matching the app-wide wording used by the
    /// video editor's own mode switcher).
    private static func visibleLabel(for mode: TimelineMode) -> String {
        switch mode {
        case .quick: return String(localized: "story.timeline.mode.quickLabel", defaultValue: "Simple", bundle: .module)
        case .pro:   return String(localized: "story.timeline.mode.pro", defaultValue: "Pro", bundle: .module)
        }
    }

    /// Switch-action hint, spoken only for the currently-inactive segment
    /// (hinting "switch to Pro" on a Pro button that's already selected
    /// doesn't make sense). Catalog entries existed but were never wired to
    /// any view — dead localized strings until now.
    private static func switchHint(for mode: TimelineMode) -> String {
        switch mode {
        case .quick: return String(localized: "story.timeline.mode.switchToQuick", defaultValue: "Switch to Quick", bundle: .module)
        case .pro:   return String(localized: "story.timeline.mode.switchToPro", defaultValue: "Switch to Pro", bundle: .module)
        }
    }

    public var body: some View {
        HStack(spacing: 4) {
            segment(for: .quick, systemImage: "square.split.2x1")
            segment(for: .pro,   systemImage: "slider.horizontal.below.rectangle")
        }
        .padding(4)
        .background(
            Capsule()
                .fill(isDark
                      ? MeeshyColors.indigo900.opacity(0.55)
                      : MeeshyColors.indigo100.opacity(0.85))
        )
        .overlay(
            Capsule()
                .strokeBorder(MeeshyColors.indigo400.opacity(0.25), lineWidth: 0.5)
        )
        .accessibilityElement(children: .contain)
    }

    @ViewBuilder
    private func segment(for target: TimelineMode, systemImage: String) -> some View {
        let isActive = (mode == target)
        let label = Self.visibleLabel(for: target)
        Button { onSelect(target) } label: {
            HStack(spacing: 5) {
                Image(systemName: systemImage)
                    .font(.system(size: 11, weight: .semibold))
                Text(label)
                    .font(.system(size: 12, weight: .semibold))
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .frame(minWidth: 76)
            .foregroundStyle(activeForeground(isActive: isActive))
            .background(
                Capsule()
                    .fill(isActive
                          ? AnyShapeStyle(MeeshyColors.brandGradient)
                          : AnyShapeStyle(Color.clear))
            )
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .accessibilityHint(isActive ? "" : Self.switchHint(for: target))
        .accessibilityAddTraits(isActive ? [.isSelected] : [])
    }

    private func activeForeground(isActive: Bool) -> Color {
        if isActive { return .white }
        return isDark ? MeeshyColors.indigo100 : MeeshyColors.indigo700
    }
}
