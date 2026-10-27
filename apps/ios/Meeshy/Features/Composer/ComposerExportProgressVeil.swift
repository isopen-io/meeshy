import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Le voile de progression du bake** (#4996) — un type NOMMÉ hors du
/// `body`, comme `ComposerSceneDescriptionEditor` : monté en fermeture
/// d'`.overlay`, il ajoute un niveau à la profondeur de type SwiftUI de ce
/// corps, qui a déjà coûté un débordement de pile à cet écran.
///
/// Il ne reçoit que la fraction (`sceneExport.progress`) : `nil` ⇒ aucun voile.
struct ComposerExportProgressVeil: View {
    let progress: Double?

    var body: some View {
        if let fraction = progress {
            ZStack {
                Color.black.opacity(0.55).ignoresSafeArea()
                VStack(spacing: MeeshySpacing.md) {
                    ProgressView(value: fraction)
                        .progressViewStyle(.linear)
                        .tint(MeeshyColors.brandPrimary)
                        .frame(width: 180)
                    Text(ComposerExportCopy.inProgress)
                        .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .medium))
                        .foregroundStyle(.white)
                }
                .padding(MeeshySpacing.xxl)
                .adaptiveGlass(in: RoundedRectangle(cornerRadius: MeeshyRadius.lgPlus, style: .continuous))
            }
            .transition(.opacity)
            .accessibilityElement(children: .combine)
            .accessibilityLabel(Text(ComposerExportCopy.inProgress))
            .accessibilityValue(Text(LocalizedNumber.percent(Int((fraction * 100).rounded()))))
            .accessibilityAddTraits(.updatesFrequently)
        }
    }
}
