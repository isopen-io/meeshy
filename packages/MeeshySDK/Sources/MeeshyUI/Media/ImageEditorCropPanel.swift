import MeeshySDK
import SwiftUI

// MARK: - Crop Panel

struct ImageEditorCropPanel: View {
    let mode: ImageEditorMode
    let accentColor: String
    @Binding var cropRatio: CropRatio
    @Binding var cropDirty: Bool
    let onRotate: (Bool) -> Void
    let onFlip: (Bool) -> Void

    @ResolvedThemePalette private var theme

    var body: some View {
        VStack(spacing: MeeshySpacing.mdPlus) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: MeeshySpacing.smPlus) {
                    ForEach(cropRatios, id: \.label) { ratio in
                        ratioChip(ratio)
                    }
                }
                .padding(.horizontal, MeeshySpacing.xxs)
            }

            HStack(spacing: MeeshySpacing.smPlus) {
                geometryButton("rotate.left",
                               label: String(localized: "media.editor.rotateLeft", defaultValue: "Pivoter \u{00E0} gauche", bundle: .module)) {
                    onRotate(false)
                }
                geometryButton("rotate.right",
                               label: String(localized: "media.editor.rotateRight", defaultValue: "Pivoter \u{00E0} droite", bundle: .module)) {
                    onRotate(true)
                }
                if mode.isPro {
                    geometryButton("arrow.left.arrow.right",
                                   label: String(localized: "media.editor.flipH", defaultValue: "Miroir horizontal", bundle: .module)) {
                        onFlip(true)
                    }
                    geometryButton("arrow.up.arrow.down",
                                   label: String(localized: "media.editor.flipV", defaultValue: "Miroir vertical", bundle: .module)) {
                        onFlip(false)
                    }
                }
            }

            Text(String(localized: "media.editor.cropHint",
                         defaultValue: "Faites glisser les poign\u{00E9}es pour recadrer",
                         bundle: .module))
                .font(.system(size: 11))
                .foregroundColor(theme.textMuted)
        }
    }

    private var cropRatios: [CropRatio] {
        mode.isPro
            ? [.free, .square, .ratio4x3, .ratio16x9, .ratio9x16]
            : [.free, .square, .ratio4x3, .ratio16x9]
    }

    private func ratioChip(_ ratio: CropRatio) -> some View {
        let isSelected = cropRatio == ratio
        return Button {
            HapticFeedback.light()
            cropDirty = true
            withAnimation(.spring(response: 0.26, dampingFraction: 0.82)) {
                cropRatio = ratio
            }
        } label: {
            Text(ratio.label)
                .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: isSelected ? .bold : .medium))
                .foregroundColor(isSelected ? .white : theme.textSecondary)
                .padding(.horizontal, MeeshySpacing.lg)
                .padding(.vertical, MeeshySpacing.sm)
                .background(
                    Capsule().fill(isSelected
                                   ? AnyShapeStyle(theme.buttonGradient(color: accentColor))
                                   : AnyShapeStyle(theme.inputBackground))
                )
        }
        .buttonStyle(.plain)
    }

    private func geometryButton(_ icon: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: MeeshyIconSize.sm, weight: .medium))
                .foregroundColor(theme.textPrimary)
                .frame(maxWidth: .infinity)
                .frame(height: 42)
                .background(RoundedRectangle(cornerRadius: MeeshyRadius.sm, style: .continuous).fill(theme.inputBackground))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(label))
    }
}
