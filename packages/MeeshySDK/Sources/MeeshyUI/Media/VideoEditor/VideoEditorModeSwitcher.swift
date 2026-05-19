import SwiftUI
import MeeshySDK

/// Simple / Pro toggle for the video editor.
///
/// Visually identical to the Story timeline's `TimelineModeSwitcher` — a
/// capsule segmented control with the brand gradient marking the active
/// segment — so the two editors feel like one product.
public struct VideoEditorModeSwitcher: View, Equatable {

    public static func == (lhs: VideoEditorModeSwitcher, rhs: VideoEditorModeSwitcher) -> Bool {
        lhs.mode == rhs.mode && lhs.isDark == rhs.isDark
    }

    public let mode: VideoEditorMode
    public let isDark: Bool
    public let onSelect: (VideoEditorMode) -> Void

    public init(mode: VideoEditorMode, isDark: Bool, onSelect: @escaping (VideoEditorMode) -> Void) {
        self.mode = mode
        self.isDark = isDark
        self.onSelect = onSelect
    }

    public var body: some View {
        HStack(spacing: 4) {
            segment(for: .simple, label: "Simple", systemImage: "square.split.2x1")
            segment(for: .pro, label: "Pro", systemImage: "slider.horizontal.below.rectangle")
        }
        .padding(4)
        .background(
            Capsule().fill(
                isDark
                    ? MeeshyColors.indigo900.opacity(0.55)
                    : MeeshyColors.indigo100.opacity(0.85)
            )
        )
        .overlay(
            Capsule().strokeBorder(MeeshyColors.indigo400.opacity(0.25), lineWidth: 0.5)
        )
        .accessibilityElement(children: .contain)
    }

    @ViewBuilder
    private func segment(for target: VideoEditorMode, label: String, systemImage: String) -> some View {
        let isActive = (mode == target)
        Button {
            guard target != mode else { return }
            onSelect(target)
        } label: {
            HStack(spacing: 5) {
                Image(systemName: systemImage)
                    .font(.system(size: 11, weight: .semibold))
                Text(label)
                    .font(.system(size: 12, weight: .semibold))
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .frame(minWidth: 76)
            .foregroundStyle(foreground(isActive: isActive))
            .background(
                Capsule().fill(
                    isActive
                        ? AnyShapeStyle(MeeshyColors.brandGradient)
                        : AnyShapeStyle(Color.clear)
                )
            )
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .accessibilityAddTraits(isActive ? [.isSelected] : [])
    }

    private func foreground(isActive: Bool) -> Color {
        if isActive { return .white }
        return isDark ? MeeshyColors.indigo100 : MeeshyColors.indigo700
    }
}
