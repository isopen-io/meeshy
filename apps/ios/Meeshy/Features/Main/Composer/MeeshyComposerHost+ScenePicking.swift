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

    /// **La photothèque à l'ouverture** — après l'apparition du composer, qui
    /// doit être à l'écran pour présenter une feuille par-dessus lui.
    func presentOpeningPickerIfNeeded() async {
        try? await Task.sleep(nanoseconds: 450_000_000)
        guard ComposerScenePicking.opensOnPicker(origin: intent.origin,
                                                 compositionIsEmpty: compositionIsEmpty) else { return }
        openingPickFoundsScenes = true
        showsPhotoPicker = true
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
