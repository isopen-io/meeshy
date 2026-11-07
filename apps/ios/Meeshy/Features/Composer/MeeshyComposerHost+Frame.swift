import SwiftUI
import MeeshySDK
import MeeshyUI

// **Le cadrage du fond, écrit par le panneau Cadre** (#8414). Extrait dans son
// propre fichier : `+Surfaces` et `+Intake` frôlent le plafond de 1 200 lignes.
extension MeeshyComposerHost {

    var sceneHasBackgroundMedia: Bool {
        viewModel.currentSlide.effects.mediaObjects?.contains(where: \.isBackground) ?? false
    }

    var sceneFitMode: String {
        ComposerBackdropFraming.fitMode(of: viewModel.currentSlide.effects.backgroundTransform)
    }

    var sceneBackdrop: StoryBackdrop {
        ComposerBackdropFraming.backdrop(of: viewModel.currentSlide.effects.backgroundTransform)
    }

    /// Le bouton Cadre du rail droit : le même geste ouvre et referme la bande.
    func toggleFrameBand() {
        requestedSceneBand = requestedSceneBand == .frame ? nil : .frame
    }

    /// **Un panneau occupe le bas de la scène** — une bande (Cadre, palette)
    /// ou les réglages du dessin. Le socle et la rangée basse s'effacent le
    /// temps du panneau (directive porteur 2026-09-27).
    var sceneBottomPanelIsOpen: Bool {
        ComposerSceneBand.opened(requestedSceneBand, served: openableSceneBands) != nil
            || viewModel.isDrawingActive
    }

    /// La bande se referme sur le choix : la couleur se voit déjà sur la scène.
    func pickSceneBandColor(_ hex: String) {
        documentBackground = hex
        viewModel.applyBackground(hex: hex)
        requestedSceneBand = nil
    }

    func applySceneFitMode(_ mode: String) {
        viewModel.currentSlide.effects.backgroundTransform = ComposerBackdropFraming.applying(
            fitMode: mode, to: viewModel.currentSlide.effects.backgroundTransform)
    }

    func applySceneBackdrop(_ fond: StoryBackdrop) {
        viewModel.currentSlide.effects.backgroundTransform = ComposerBackdropFraming.applying(
            backdrop: fond, to: viewModel.currentSlide.effects.backgroundTransform)
    }
}
