import SwiftUI
import MeeshySDK
import MeeshyUI

/// **L'intensité du flash, en curseur vertical sous son bouton** (#8671 ;
/// porteur 2026-10-07, #9566 : « lorsqu'on active le flash le slide de
/// luminosité se place verticalement »). Il ne paraît que flash actif : glisser
/// vers le HAUT éclaire plus. VoiceOver le règle d'un balayage — un élément
/// AJUSTABLE, jamais une piste muette. La loi (`ComposerFlashIntensity`)
/// convertit la position en niveau.
///
/// **Toute interaction le dit** (#9753) : `onInteraction(true)` quand le doigt
/// se pose, `false` quand il se lève ou qu'un balayage VoiceOver le règle — la
/// barre réarme alors la minuterie qui l'efface 2 s plus tard.
struct ComposerFlashIntensitySlider: View {
    let level: Double
    let onChange: (Double) -> Void
    var onInteraction: (Bool) -> Void = { _ in }

    /// Retombe d'elle-même quand le système annule le glissé sans `onEnded`.
    @GestureState private var touching = false

    private static let trackHeight: CGFloat = 132
    private static let thumb: CGFloat = 18

    var body: some View {
        VStack(spacing: MeeshySpacing.xs) {
            Image(systemName: "sun.max.fill")
                .font(MeeshyFont.relative(MeeshyIconSize.xs, weight: .semibold))
                .foregroundStyle(Color.yellow)
            track
        }
        .padding(.vertical, MeeshySpacing.sm)
        .frame(width: MeeshyControlSize.tapTarget)
        .adaptiveLiquidGlass(in: Capsule(), interactive: true)
        .accessibilityElement()
        .accessibilityLabel(ComposerSceneCameraCopy.flashIntensityLabel)
        .accessibilityValue(ComposerSceneCameraCopy.flashIntensityValue(level))
        .accessibilityAdjustableAction { sens in
            switch sens {
            case .increment: onChange(ComposerFlashIntensity.stepped(level, up: true))
            case .decrement: onChange(ComposerFlashIntensity.stepped(level, up: false))
            @unknown default: break
            }
            onInteraction(false)
        }
        .adaptiveOnChange(of: touching) { _, tenu in onInteraction(tenu) }
    }

    private var track: some View {
        let position = ComposerFlashIntensity.thumbPosition(level)
        let course = Self.trackHeight - Self.thumb
        return ZStack(alignment: .top) {
            Capsule()
                .fill(Color.white.opacity(0.28))
                .frame(width: 4, height: Self.trackHeight)
            Capsule()
                .fill(Color.yellow)
                .frame(width: 4, height: max(Self.thumb / 2, Self.trackHeight - course * position - Self.thumb / 2))
                .offset(y: min(Self.trackHeight - Self.thumb / 2, course * position + Self.thumb / 2))
            Circle()
                .fill(Color.white)
                .frame(width: Self.thumb, height: Self.thumb)
                .shadow(color: .black.opacity(0.3), radius: 2, y: 1)
                .offset(y: course * position)
        }
        .frame(width: MeeshyControlSize.tapTarget, height: Self.trackHeight, alignment: .top)
        .clipped()
        .contentShape(Rectangle())
        .gesture(
            DragGesture(minimumDistance: 0)
                .updating($touching) { _, tenu, _ in tenu = true }
                .onChanged { valeur in
                    onChange(ComposerFlashIntensity.level(atY: valeur.location.y, height: Self.trackHeight))
                }
        )
    }
}
