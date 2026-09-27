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
