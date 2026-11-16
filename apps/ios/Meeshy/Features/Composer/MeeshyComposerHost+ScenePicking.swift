import SwiftUI
import MeeshySDK
import MeeshyUI

// **Importer plusieurs médias, une scène par média** (directive porteur 2026-09-28).
extension MeeshyComposerHost {

    /// Un brouillon, une graine, un texte : autant de raisons de NE PAS ouvrir la photothèque d'office.
    var compositionIsEmpty: Bool {
        viewModel.slides.count == 1
            && viewModel.currentSlide.sceneObjects.isEmpty
            && viewModel.slideImages.isEmpty
            && documentLocalMedia.isEmpty
            && documentText.isEmpty
            && mediaSeed == nil
            && hydration == nil
            && draftId == nil
    }

    /// **L'ouverture d'un composer vierge** (#17269), une fois le composer à l'écran :
    /// la caméra s'arme derrière, la photothèque s'ouvre à mi-hauteur devant.
    func applyOpeningPlan() async {
        guard await cancellableSleep(for: .milliseconds(450)) else { return }
        let plan = ComposerOpeningPlan.resolve(origin: intent.origin, compositionIsEmpty: compositionIsEmpty,
                                               format: selectedFormat, sceneServesCapture: sceneServesCapture,
                                               preferences: .stored())
        if plan.armsCamera, sceneCameraStage == .off { armSceneCamera() }
        guard let library = plan.library else { return }
        (openingPickFoundsScenes, viewfinderLibrary) = (true, .closed)
        if library == .halfHeight { showsOpeningLibrary = true } else { showsPhotoPicker = true }
    }

    /// Choisir ferme la photothèque et rend la scène (#17269), ou pose par-dessus (#18710).
    func closeOpeningLibraryForPick(count: Int) {
        showsOpeningLibrary = false
        let choix = ComposerOpeningPlan.libraryPick(count: count, fromViewfinder: viewfinderLibrary != .closed,
            openingPick: openingPickFoundsScenes, stage: sceneCameraStage,
            pendingSegments: sceneCapture.segments.count, editing: sceneCapture.phase.isEditing)
        viewfinderLibrary = choix == .overlay ? .overlays : .closed
        if choix == .foundsScenes(disarms: true) { disarmSceneCamera() }
    }

    /// Une SÉRIE fonde ses scènes ; un média seul suit le geste de sa porte ; la Galerie de la
    /// caméra pose par-dessus (#18710).
    func routePickedMedia(_ medias: [ComposerDocumentMedia]) {
        guard viewfinderLibrary != .overlays else {
            (openingPickFoundsScenes, viewfinderLibrary) = (false, .closed)
            return ComposerViewfinderOverlay.pose(medias, on: self)
        }
        let serie = ComposerScenePicking.foundsScenes(count: medias.count,
                                                      openingPick: openingPickFoundsScenes)
        openingPickFoundsScenes = false
        guard serie else {
            ingestIntoDocument(medias)
            return
        }
        sceneSeriesMediaURLs.formUnion(medias.map(\.url))
        ecrireDansLaListeDuDocument(medias, rail: .abandonne)
    }
}
