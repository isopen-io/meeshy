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
        ComposerFraming.fitMode(of: viewModel.currentSlide.effects.backgroundTransform)
    }

    var sceneBackdrop: StoryBackdrop {
        ComposerFraming.backdrop(of: viewModel.currentSlide.effects.backgroundTransform)
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

    func applySceneFitMode(_ mode: String) {
        var slide = viewModel.currentSlide
        slide.effects.backgroundTransform = ComposerFraming.applying(
            fitMode: mode, to: slide.effects.backgroundTransform)
        viewModel.currentSlide = slide
    }

    func applySceneBackdrop(_ fond: StoryBackdrop) {
        var slide = viewModel.currentSlide
        slide.effects.backgroundTransform = ComposerFraming.applying(
            backdrop: fond, to: slide.effects.backgroundTransform)
        viewModel.currentSlide = slide
    }
}
