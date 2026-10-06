import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Le curseur vertical de la luminosité, sous le flash** (#9351, décision
/// porteur 2026-10-05). Glisser vers le haut éclaire ; VoiceOver le règle par
/// tiers d'EV. La loi (`ComposerExposureRule`) convertit la position en EV.
struct ComposerExposureSlider: View {
    let bias: Float
    let onChange: (Float) -> Void

    private static let trackHeight: CGFloat = 132
    private static let thumb: CGFloat = 18

    var body: some View {
        VStack(spacing: MeeshySpacing.xs) {
            Image(systemName: "sun.max.fill")
                .font(MeeshyFont.relative(MeeshyIconSize.xs, weight: .semibold))
                .foregroundStyle(bias == ComposerExposureRule.neutral ? Color.white : Color.yellow)
            track
        }
        .padding(.vertical, MeeshySpacing.sm)
        .frame(width: MeeshyControlSize.tapTarget)
        .adaptiveLiquidGlass(in: Capsule(), interactive: true)
        .accessibilityElement()
        .accessibilityLabel(ComposerSceneCameraCopy.exposureLabel)
        .accessibilityValue(ComposerExposureRule.spokenValue(bias))
        .accessibilityAdjustableAction { sens in
            switch sens {
            case .increment: onChange(ComposerExposureRule.stepped(bias, up: true))
            case .decrement: onChange(ComposerExposureRule.stepped(bias, up: false))
            @unknown default: break
            }
        }
    }

    private var track: some View {
        let position = ComposerExposureRule.thumbPosition(bias)
        let course = Self.trackHeight - Self.thumb
        return ZStack(alignment: .top) {
            Capsule()
                .fill(Color.white.opacity(0.28))
                .frame(width: 4, height: Self.trackHeight)
            Circle()
                .fill(Color.white)
                .frame(width: Self.thumb, height: Self.thumb)
                .shadow(color: .black.opacity(0.3), radius: 2, y: 1)
                .offset(y: course * position)
        }
        .frame(width: MeeshyControlSize.tapTarget, height: Self.trackHeight)
        .contentShape(Rectangle())
        .gesture(
            DragGesture(minimumDistance: 0)
                .onChanged { valeur in
                    onChange(ComposerExposureRule.bias(atY: valeur.location.y, height: Self.trackHeight))
                }
        )
    }
}
