import SwiftUI
import MeeshySDK
import MeeshyUI

@MainActor
extension MeeshyComposerHost {

    /// « Modifier » une image ou une vidéo de la scène : la retouche de la caméra s'ouvre quand le
    /// média a une source locale (#12590) ; sinon l'appelant garde l'édition en place.
    func requestSceneMediaRetouch(_ id: String) -> Bool {
        guard let demande = ComposerSceneMediaRetouch.request(for: id, in: viewModel) else { return false }
        sceneMediaRetouch = demande
        return true
    }

    /// « Terminé » : le fichier retouché remplace le média à sa place — document, scène et pré-montée.
    func completeSceneMediaRetouch(_ objectId: String, _ media: ComposerReturnedMedia) {
        Task {
            let neuf = UUID().uuidString
            let editait = inlineEdit?.objectId == objectId
            let id = await ComposerSceneMediaRetouch.delivery(of: media, objectId: neuf).flatMap {
                ComposerMediaSwapRun.apply(objectId: objectId, delivered: $0, store: mediaPorterStore,
                                           preUploads: preUploads, viewModel: viewModel, newObjectId: neuf)
            }
            guard let id else { return FeedbackToastManager.shared.showError(ComposerDocumentCopy.publishError) }
            startPendingPreUploads()
            if editait { inlineEdit = nil; beginInlineEdit(id) } else if selectedSceneItemId == objectId { selectedSceneItemId = id }
            HapticFeedback.success()
        }
    }
}
