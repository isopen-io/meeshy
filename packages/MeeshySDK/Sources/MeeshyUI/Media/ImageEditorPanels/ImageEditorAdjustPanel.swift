import MeeshySDK
import SwiftUI

struct ImageEditorAdjustPanel: View {
    @ObservedObject var viewModel: ImageEditorViewModel
    let accent: Color

    @ResolvedThemePalette private var theme

    var body: some View {
        ScrollView(.vertical, showsIndicators: false) {
            VStack(spacing: MeeshySpacing.md) {
                ForEach(visibleAdjustments) { kind in
                    adjustmentRow(kind)
                }
                if viewModel.state.adjustments.activeCount > 0 {
                    Button {
                        viewModel.perform(String(localized: "media.editor.resetAdjust", defaultValue: "Ajustements r\u{00E9}initialis\u{00E9}s", bundle: .module)) {
                            $0.adjustments = .neutral
                        }
                        HapticFeedback.light()
                    } label: {
                        Text(String(localized: "media.editor.reset", defaultValue: "R\u{00E9}initialiser", bundle: .module))
                            .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold))
                            .foregroundColor(accent)
                    }
                    .buttonStyle(.plain)
                    .padding(.top, MeeshySpacing.xxs)
                }
            }
            .padding(.bottom, MeeshySpacing.xsPlus)
        }
        .frame(maxHeight: 230)
    }

    private var visibleAdjustments: [AdjustmentKind] {
        viewModel.mode.isPro ? AdjustmentKind.toneCases : AdjustmentKind.toneCases.filter(\.isEssential)
    }

    private func adjustmentRow(_ kind: AdjustmentKind) -> some View {
        let value = viewModel.state.adjustments[kind]
        let isActive = abs(value - kind.neutralValue) > 0.0001
        return HStack(spacing: MeeshySpacing.smPlus) {
            Image(systemName: kind.icon)
                .font(.system(size: MeeshyIconSize.xs))
                .foregroundColor(isActive ? accent : theme.textMuted)
                .frame(width: 18)

            Text(kind.label)
                .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .medium))
                .foregroundColor(theme.textSecondary)
                .frame(width: 78, alignment: .leading)

            Slider(
                value: adjustmentBinding(kind),
                in: kind.range,
                onEditingChanged: { editing in
                    if !editing { viewModel.commit(kind.label) }
                }
            )
            .tint(accent)

            Text(formatAdjustment(value, kind: kind))
                .font(.system(size: MeeshyFont.captionSize, weight: .semibold).monospacedDigit())
                .foregroundColor(theme.textMuted)
                .frame(width: 34, alignment: .trailing)
        }
    }

    private func adjustmentBinding(_ kind: AdjustmentKind) -> Binding<Float> {
        Binding(
            get: { viewModel.state.adjustments[kind] },
            set: { newValue in viewModel.update { $0.adjustments[kind] = newValue } }
        )
    }

    private func formatAdjustment(_ value: Float, kind: AdjustmentKind) -> String {
        String(format: "%+.1f", value - kind.neutralValue)
    }
}
