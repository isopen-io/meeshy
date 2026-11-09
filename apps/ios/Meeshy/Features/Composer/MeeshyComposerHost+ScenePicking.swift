import SwiftUI
import MeeshySDK
import MeeshyUI

// **Importer plusieurs médias, une scène par média** (directive porteur
// 2026-09-28 : « lorsqu'on veut créer un post ou une story, voir réel, il faut
// TOUT de suite permettre d'importer plusieurs images/vidéos […] on créera
// autant de scènes que d'images/vidéos chargées »).
extension MeeshyComposerHost {

    /// Ce que le composer contient déjà : un brouillon restauré, une graine, un
    /// texte — autant de raisons de NE PAS ouvrir la photothèque d'office.
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
        _ = await cancellableSleep(for: .milliseconds(450))
        let plan = ComposerOpeningPlan.resolve(origin: intent.origin, compositionIsEmpty: compositionIsEmpty,
                                               format: selectedFormat, sceneServesCapture: sceneServesCapture,
                                               preferences: .stored())
        if plan.armsCamera, sceneCameraStage == .off { armSceneCamera() }
        guard let library = plan.library else { return }
        openingPickFoundsScenes = true
        if library == .halfHeight { showsOpeningLibrary = true } else { showsPhotoPicker = true }
    }

    /// Choisir dans la photothèque d'ouverture la ferme et rend la scène (#17269).
    func closeOpeningLibraryForPick() {
        showsOpeningLibrary = false
        guard ComposerOpeningPlan.disarmsCameraOnLibraryPick(openingPick: openingPickFoundsScenes, stage: sceneCameraStage,
              pendingSegments: sceneCapture.segments.count, editing: sceneCapture.phase.isEditing) else { return }
        disarmSceneCamera()
    }

    /// Une SÉRIE fonde ses scènes ; un média seul choisi par une porte suit le
    /// geste de cette porte (posé sur la scène par le rail).
    func routePickedMedia(_ medias: [ComposerDocumentMedia]) {
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
