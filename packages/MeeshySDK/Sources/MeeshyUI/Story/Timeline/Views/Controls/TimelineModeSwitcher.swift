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

    public static func a11yLabelKey(for mode: TimelineMode) -> String {
        switch mode {
        case .quick: return "story.timeline.mode.quick"
        case .pro:   return "story.timeline.mode.pro"
        }
    }

    public var body: some View {
        HStack(spacing: 4) {
            segment(for: .quick, label: "Simple", systemImage: "square.split.2x1")
            segment(for: .pro,   label: "Pro",    systemImage: "slider.horizontal.below.rectangle")
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
    private func segment(for target: TimelineMode, label: String, systemImage: String) -> some View {
        let isActive = (mode == target)
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
        .accessibilityLabel(String(localized: String.LocalizationValue(Self.a11yLabelKey(for: target)), bundle: .module))
        .accessibilityAddTraits(isActive ? [.isSelected] : [])
    }

    private func activeForeground(isActive: Bool) -> Color {
        if isActive { return .white }
        return isDark ? MeeshyColors.indigo100 : MeeshyColors.indigo700
    }
}
