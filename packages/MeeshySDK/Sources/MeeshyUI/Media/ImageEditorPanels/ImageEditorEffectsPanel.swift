import MeeshySDK
import SwiftUI

struct ImageEditorEffectsPanel: View {
    @ObservedObject var viewModel: ImageEditorViewModel
    let accent: Color

    @ResolvedThemePalette private var theme

    private var isDark: Bool { theme.mode.isDark }

    var body: some View {
        let columns = [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())]
        return ScrollView(.vertical, showsIndicators: false) {
            LazyVGrid(columns: columns, spacing: MeeshySpacing.smPlus) {
                ForEach(ImageEffect.allCases) { effect in
                    effectCell(effect)
                }
            }
            .padding(.bottom, MeeshySpacing.xsPlus)
        }
        .frame(maxHeight: 200)
    }

    private func effectCell(_ effect: ImageEffect) -> some View {
        let isSelected = viewModel.state.effect == effect
        return Button {
            HapticFeedback.light()
            viewModel.perform(effect.displayName) {
                $0.effect = ($0.effect == effect ? .none : effect)
            }
        } label: {
            VStack(spacing: MeeshySpacing.xsPlus) {
                Image(systemName: effect.iconName)
                    .font(.system(size: MeeshyIconSize.md))
                Text(effect.displayName)
                    .font(.system(size: MeeshyFont.captionSize, weight: .semibold))
            }
            .foregroundColor(isSelected ? accent : theme.textSecondary)
            .frame(maxWidth: .infinity)
            .frame(height: 56)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.smPlus, style: .continuous)
                    .fill(isSelected ? accent.opacity(isDark ? 0.16 : 0.1) : theme.inputBackground)
            )
            .overlay(
                RoundedRectangle(cornerRadius: MeeshyRadius.smPlus, style: .continuous)
                    .strokeBorder(isSelected ? accent : .clear, lineWidth: MeeshyBorder.emphasis)
            )
        }
        .buttonStyle(.plain)
    }
}
