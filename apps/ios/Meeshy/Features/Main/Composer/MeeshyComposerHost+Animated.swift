import SwiftUI
import MeeshySDK
import MeeshyUI

// **Le mode ANIMÉ de la scène plein écran** (#8415, maquette `Main.dc.html` :
// « Scène animée : chaque objet a sa piste »).
//
// La frise existait, complète, mais seul l'atelier l'atteignait — c'est-à-dire
// deux ouvertures sur toutes (vidéo caméra, reprise de brouillon). La bascule
// « Animé » de la barre haute l'ouvre sur la scène du meuble : chaque objet y
// devient une piste, avec lecture et tête. La refermer rend ses pistes à la
// slide ; publier aussi (`performSoclePublish`).
extension MeeshyComposerHost {

    var sceneAnimatedToggle: AnyView {
        let actif = viewModel.timelineIsOpen
        return AnyView(
            Button {
                toggleSceneAnimation()
            } label: {
                Label(ComposerAnimatedCopy.toggle, systemImage: "bolt.fill")
                    .font(.footnote.weight(.semibold))
                    .foregroundColor(MeeshyColors.textPrimary(isDark: true))
                    .padding(.horizontal, 14)
                    .frame(minHeight: ComposerControlMetrics.visualDiameter)
                    .contentShape(Capsule())
                    .adaptiveGlass(in: Capsule(),
                                   tint: actif ? MeeshyColors.brandPrimary : tint.color.opacity(0.55))
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(actif ? .isSelected : [])
        )
    }

    var sceneTimelinePanel: AnyView? {
        guard viewModel.timelineIsOpen else { return nil }
        return AnyView(
            SceneTimelinePanel(composer: viewModel)
                .frame(height: ComposerAnimatedMetrics.timelineHeight)
                .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
                .adaptiveGlass(in: RoundedRectangle(cornerRadius: 22, style: .continuous),
                               tint: tint.color.opacity(0.55))
                .padding(.horizontal, ComposerRailGeometry.outerMargin)
                .padding(.bottom, 4)
        )
    }

    func toggleSceneAnimation() {
        HapticFeedback.light()
        if viewModel.timelineIsOpen {
            viewModel.closeTimelinePanel()
        } else {
            // La frise prend le bas : une bande ouverte s'efface devant elle.
            requestedSceneBand = nil
            viewModel.openTimelinePanel()
        }
    }
}

nonisolated enum ComposerAnimatedMetrics {
    /// La hauteur de la frise sous la scène — assez pour la règle, la tête et
    /// trois pistes, sans passer sous la moitié de l'écran.
    static let timelineHeight: CGFloat = 300
}

nonisolated enum ComposerAnimatedCopy {
    static var toggle: String {
        String(localized: "composer.animated.toggle", defaultValue: "Animé", bundle: .main)
    }
}
