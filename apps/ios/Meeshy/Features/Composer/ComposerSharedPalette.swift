import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Une seule palette par panneau** (#13839, doublon 4 de l'inventaire) : la
/// couleur du texte et celle de son contour se choisissent dans la MÊME rangée,
/// la cible se désigne au-dessus. Le cadre a la sienne, seule cible de son
/// panneau. L'écriture est celle de `TextEditToolOptions` (`TextEditPalette`).
struct ComposerSharedPalette: View {
    let targets: [TextEditPaletteTarget]
    @Binding var textObject: StoryTextObject
    @State private var chosen: TextEditPaletteTarget?

    private var target: TextEditPaletteTarget { chosen ?? targets.first ?? .text }

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            if targets.count > 1 { targetChips }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: MeeshySpacing.smPlus) {
                    ForEach(TextEditPalette.colors, id: \.self) { hex in swatch(hex) }
                }
                .padding(MeeshySpacing.xs)
            }
        }
    }

    private var targetChips: some View {
        HStack(spacing: MeeshySpacing.sm) {
            ForEach(targets, id: \.self) { cible in
                let active = cible == target
                Button {
                    chosen = cible
                    HapticFeedback.light()
                } label: {
                    Text(Self.title(of: cible))
                        .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
                        .foregroundStyle(active ? Color.white : Color.white.opacity(0.7))
                        .padding(.horizontal, MeeshySpacing.md)
                        .frame(minHeight: MeeshyControlSize.compact)
                        .background(Capsule().fill(active ? MeeshyColors.brandPrimary : Color.white.opacity(0.12)))
                        .frame(minHeight: MeeshyControlSize.tapTarget)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(active ? [.isButton, .isSelected] : .isButton)
            }
        }
    }

    private func swatch(_ hex: String) -> some View {
        let selection = TextEditPalette.selected(target, in: textObject, among: TextEditPalette.colors)
        let active = selection == hex
        return Button {
            textObject = TextEditPalette.applying(hex, to: target, on: textObject)
            HapticFeedback.light()
        } label: {
            Circle()
                .fill(Color(hex: hex))
                .frame(width: 28, height: 28)
                .overlay(Circle().stroke(Color.white.opacity(active ? 1 : 0.35), lineWidth: active ? 3 : 1))
                .scaleEffect(active ? 1.12 : 1)
                .frame(minWidth: MeeshyControlSize.tapTarget, minHeight: MeeshyControlSize.tapTarget)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text("#\(hex)"))
        .accessibilityAddTraits(active ? [.isButton, .isSelected] : .isButton)
    }

    static func title(of target: TextEditPaletteTarget) -> String {
        switch target {
        case .text:   return TextEditTool.color.accessibilityLabel
        case .border: return TextEditTool.border.accessibilityLabel
        case .frame:  return TextEditTool.frame.accessibilityLabel
        }
    }
}
