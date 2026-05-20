import SwiftUI

/// Segmented Simple / Pro switch for the image editor. Deliberately mirrors the
/// Story timeline `TimelineModeSwitcher` — same indigo capsule, brand-gradient
/// active segment and glyph + label layout — so the Simple/Pro affordance feels
/// identical everywhere it appears in the app.
public struct ImageEditorModeSwitcher: View, Equatable {

    public static func == (lhs: ImageEditorModeSwitcher, rhs: ImageEditorModeSwitcher) -> Bool {
        lhs.mode == rhs.mode && lhs.isDark == rhs.isDark
    }

    public let mode: ImageEditorMode
    public let isDark: Bool
    public let onSelect: (ImageEditorMode) -> Void

    public init(mode: ImageEditorMode,
                isDark: Bool,
                onSelect: @escaping (ImageEditorMode) -> Void) {
        self.mode = mode
        self.isDark = isDark
        self.onSelect = onSelect
    }

    public static func a11yLabelKey(for mode: ImageEditorMode) -> String {
        switch mode {
        case .simple: return "media.editor.mode.simple"
        case .pro: return "media.editor.mode.pro"
        }
    }

    public var body: some View {
        HStack(spacing: 4) {
            segment(for: .simple, label: "Simple", systemImage: "wand.and.stars")
            segment(for: .pro, label: "Pro", systemImage: "slider.horizontal.3")
        }
        .padding(4)
        .fixedSize(horizontal: true, vertical: false)
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
        .animation(.spring(response: 0.32, dampingFraction: 0.72), value: mode)
        .accessibilityElement(children: .contain)
    }

    @ViewBuilder
    private func segment(for target: ImageEditorMode, label: String, systemImage: String) -> some View {
        let isActive = (mode == target)
        Button {
            HapticFeedback.light()
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
            .frame(minWidth: 72)
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
