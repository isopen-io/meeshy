import SwiftUI
import MeeshySDK
import MeeshyUI

// **Ce que la scène rend au message** (#8416, #9123, #9124, #9126) — une pièce
// en attente se REMPLACE, une prise ou un média récent se POSE. Sorti de
// `ConversationView+Composer.swift`, qui montait quatre fermetures jumelles.
extension ConversationView {

    /// « Éditer » sur une pièce en attente : la série est préparée (sources à
    /// 2 048 px, #8524) AVANT de présenter le composer.
    func openRetouchSeries(focusId: String) {
        let candidates = ComposerRetouchSeries.candidates(attachments: composerState.pendingAttachments,
                                                          files: composerState.pendingMediaFiles)
        guard candidates.contains(where: { $0.attachmentId == focusId }) else { return }
        Task {
            scrollState.retouchSeries = await ConversationRetouchSeries.prepare(candidates, focusId: focusId)
        }
    }

    /// Chaque pièce retouchée est remplacée À SA PLACE ; les autres restent
    /// telles quelles — jamais une seconde tuile, jamais un ré-encodage.
    func replacePendingWithRetouchedPieces(_ rendues: [ComposerRetouchedPiece]) {
        scrollState.retouchSeries = nil
        Task {
            for rendue in rendues { await replacePendingWithSceneMedia(id: rendue.attachmentId, rendue.media) }
        }
    }

    private func replacePendingWithSceneMedia(id: String, _ media: ComposerReturnedMedia) async {
        switch media {
        case .image(let image):
            // **Écriture SÛRE** (#8524) : l'ancien fichier ne part qu'une fois
            // le nouveau écrit et vérifié ; sinon la pièce d'origine reste
            // celle qui partira.
            guard let ecrit = await ConversationImageRetouche.writeEdited(image) else {
                FeedbackToastManager.shared.showError(ComposerDocumentCopy.publishError)
                return
            }
            guard let idx = composerState.pendingAttachments.firstIndex(where: { $0.id == id }) else {
                try? FileManager.default.removeItem(at: ecrit.url)
                return
            }
            let ancien = composerState.pendingMediaFiles[id]
            composerState.pendingThumbnails[id] = image
            composerState.pendingMediaFiles[id] = ecrit.url
            composerState.pendingAttachments[idx] = MessageAttachment(
                id: id, fileName: ecrit.fileName, originalName: ecrit.fileName,
                mimeType: ecrit.mimeType, fileSize: ecrit.byteCount,
                fileUrl: ecrit.url.absoluteString,
                width: Int(image.size.width * image.scale),
                height: Int(image.size.height * image.scale),
                thumbnailColor: accentColor
            )
            if let ancien, ancien != ecrit.url { try? FileManager.default.removeItem(at: ancien) }
        case .video(let url):
            // La vidéo bakée remplace la pièce (#8443, #9124), par la même
            // règle que l'ancien éditeur vidéo.
            let rendu = VideoEditResult(url: url, didEdit: true, duration: 0, transcriptionText: nil,
                                        captions: [], captionLanguageCode: nil)
            if let staleURL = composerState.applyEditedVideo(attachmentId: id, result: rendu) {
                try? FileManager.default.removeItem(at: staleURL)
            }
        }
    }

    /// Une prise de la caméra ou un média de la bande des récents : il se pose
    /// par les mêmes chemins de préparation qu'un fichier choisi.
    func stageSceneMedia(_ media: ComposerReturnedMedia) {
        switch media {
        case .image(let image): handleCameraCapture(image)
        case .video(let url): handleCameraVideo(url)
        }
    }
}
