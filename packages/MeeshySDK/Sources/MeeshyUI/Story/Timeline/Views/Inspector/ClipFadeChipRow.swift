import SwiftUI
import MeeshySDK

/// Rangée de puces de fondu (apparition / disparition) : `0` = off, sinon
/// l'un des presets de `ClipInspector.fadePresets`.
struct ClipFadeChipRow: View {
    let title: String
    let systemImage: String
    @Binding var value: Float
    let onCommit: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
            HStack(spacing: MeeshySpacing.xs) {
                Image(systemName: systemImage)
                    .font(.system(size: MeeshyIconSize.xxs, weight: .semibold))
                    .foregroundStyle(MeeshyColors.indigo400)
                    .accessibilityHidden(true)
                Text(title.uppercased())
                    .font(.system(size: MeeshyFont.microSize, weight: .semibold))
                    .foregroundStyle(.secondary)
            }
            HStack(spacing: MeeshySpacing.xsPlus) {
                ForEach(ClipInspector.fadePresets, id: \.self) { preset in
                    let isOn = ClipInspector.nearestFadePreset(to: value) == preset
                    Button {
                        value = preset
                        onCommit()
                    } label: {
                        Text(preset == 0
                             ? String(localized: "story.timeline.inspector.fade.off",
                                      defaultValue: "off", bundle: .module)
                             : (preset < 1 ? String(format: "%.1f s", preset)
                                           : String(format: "%.0f s", preset)))
                            .font(.caption2.weight(.semibold))
                            .monospacedDigit()
                            .padding(.horizontal, MeeshySpacing.smPlus)
                            .padding(.vertical, MeeshySpacing.xsPlus)
                            .background(Capsule().fill(
                                isOn ? MeeshyColors.indigo500 : MeeshyColors.indigo500.opacity(0.14)))
                            .foregroundStyle(isOn ? .white : MeeshyColors.indigo400)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("\(title) \(preset)s")
                    .accessibilityAddTraits(isOn ? [.isSelected] : [])
                }
            }
        }
        .accessibilityElement(children: .contain)
    }
}
