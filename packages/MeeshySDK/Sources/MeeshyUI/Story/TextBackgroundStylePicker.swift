import SwiftUI
import MeeshySDK

// MARK: - Text Background Style Picker

/// Three-way chip control to pick the background style of a `StoryTextObject`:
/// `Aucun` (none) / `Couleur` (solid) / `Verre` (glass).
///
/// The picker mutates the bound text object's `backgroundStyle` field directly.
/// For the solid case it preserves whatever hex was previously stored in
/// `textBg` (or defaults to a translucent black). For the glass case it
/// initializes `radius = 24` (design pixels), the default that matches the
/// `.ultraThinMaterial` look used elsewhere in the app.
public struct TextBackgroundStylePicker: View {

    @Binding public var textObject: StoryTextObject

    // No @ObservedObject on ThemeManager.shared — colorScheme is enough for
    // the dark/light text color decision; subscribing to the singleton would
    // trigger view re-evaluation on every unrelated theme @Published change
    // (forbidden for leaf views per CLAUDE.md Zero Unnecessary Re-render rule).
    @Environment(\.colorScheme) private var colorScheme

    public init(textObject: Binding<StoryTextObject>) {
        self._textObject = textObject
    }

    public var body: some View {
        VStack(spacing: 12) {
            HStack {
                Image(systemName: "square.dashed.inset.filled")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(MeeshyColors.brandGradient)
                Text(String(
                    localized: "story.textBackground.title",
                    defaultValue: "Fond du texte",
                    bundle: .module
                ))
                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                    .foregroundColor(colorScheme == .dark ? .white : MeeshyColors.indigo950)
                Spacer()
            }

            HStack(spacing: 10) {
                chip(
                    kind: .none,
                    icon: "xmark.circle",
                    label: String(
                        localized: "story.textBackground.none",
                        defaultValue: "Aucun",
                        bundle: .module
                    )
                )
                chip(
                    kind: .solid,
                    icon: "paintbrush",
                    label: String(
                        localized: "story.textBackground.solid",
                        defaultValue: "Couleur",
                        bundle: .module
                    )
                )
                chip(
                    kind: .glass,
                    icon: "square.dashed.inset.filled",
                    label: String(
                        localized: "story.textBackground.glass",
                        defaultValue: "Verre",
                        bundle: .module
                    )
                )
            }
        }
        .padding(16)
        .background(.ultraThinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .padding(.horizontal, 16)
    }

    // MARK: - Chip

    private enum ChipKind { case none, solid, glass }

    private func chip(kind: ChipKind, icon: String, label: String) -> some View {
        let isSelected = currentKind == kind
        return Button {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                select(kind)
            }
            HapticFeedback.light()
        } label: {
            HStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 14, weight: .semibold))
                Text(label)
                    .font(.system(size: 13, weight: .semibold, design: .rounded))
            }
            .foregroundColor(isSelected ? .white : (colorScheme == .dark ? .white.opacity(0.7) : MeeshyColors.indigo700))
            .padding(.horizontal, 12)
            .frame(height: 36)
            .background(
                RoundedRectangle(cornerRadius: 10)
                    .fill(isSelected ? MeeshyColors.brandPrimary : Color.white.opacity(colorScheme == .dark ? 0.12 : 0.5))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .stroke(isSelected ? MeeshyColors.indigo400.opacity(0.5) : Color.clear, lineWidth: 1.5)
            )
        }
        .accessibilityLabel(label)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }

    // MARK: - State

    private var currentKind: ChipKind {
        switch textObject.resolvedBackgroundStyle {
        case .none:  return .none
        case .solid: return .solid
        case .glass: return .glass
        }
    }

    private func select(_ kind: ChipKind) {
        switch kind {
        case .none:
            textObject.backgroundStyle = StoryTextBackgroundStyle.none
            // Also clear legacy field so the resolved style is unambiguous.
            textObject.textBg = nil
        case .solid:
            // Preserve any prior color the user picked via textBg / a prior
            // solid choice. Fall back to translucent black (design system
            // pill default) when none exists.
            let hex: String = {
                if case .solid(let existing) = textObject.resolvedBackgroundStyle { return existing }
                if let legacy = textObject.textBg { return legacy }
                return "000000"
            }()
            textObject.backgroundStyle = .solid(hex: hex)
        case .glass:
            // Default glass radius — 24 design-px sigma matches the
            // `.ultraThinMaterial` perceived blur on iPhone reference.
            if case .glass = textObject.resolvedBackgroundStyle {
                return
            }
            textObject.backgroundStyle = .glass(radius: 24)
        }
    }
}
