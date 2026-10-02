import SwiftUI
import MeeshySDK
import MeeshyUI

// **Ce que la scène rend au message** (#8416, #9123, #9124) — une pièce en
// attente se REMPLACE, une prise ou un média récent se POSE. Sorti de
// `ConversationView+Composer.swift`, qui montait quatre fermetures jumelles.
extension ConversationView {

    /// Une pièce DÉJÀ en attente, retouchée : le média rendu la remplace en
    /// place — jamais une seconde tuile.
    func replacePendingWithSceneMedia(id: String, _ media: ComposerReturnedMedia) {
        switch media {
        case .image(let image):
            Task {
                // **Écriture SÛRE** (#8524) : l'ancien fichier ne part qu'une
                // fois le nouveau écrit et vérifié ; sinon la pièce d'origine
                // reste celle qui partira.
                guard let ecrit = await ConversationImageRetouche.writeEdited(image) else {
                    FeedbackToastManager.shared.showError(ComposerDocumentCopy.publishError)
                    closeSceneRetouche()
                    return
                }
                let ancien = composerState.pendingMediaFiles[id]
                composerState.pendingThumbnails[id] = image
                composerState.pendingMediaFiles[id] = ecrit.url
                if let idx = composerState.pendingAttachments.firstIndex(where: { $0.id == id }) {
                    composerState.pendingAttachments[idx] = MessageAttachment(
                        id: id, fileName: ecrit.fileName, originalName: ecrit.fileName,
                        mimeType: ecrit.mimeType, fileSize: ecrit.byteCount,
                        fileUrl: ecrit.url.absoluteString,
                        width: Int(image.size.width * image.scale),
                        height: Int(image.size.height * image.scale),
                        thumbnailColor: accentColor
                    )
                }
                if let ancien, ancien != ecrit.url { try? FileManager.default.removeItem(at: ancien) }
                closeSceneRetouche()
            }
        case .video(let url):
            // La vidéo bakée remplace la pièce (#8443, #9124), par la même
            // règle que l'ancien éditeur vidéo.
            let rendu = VideoEditResult(url: url, didEdit: true, duration: 0, transcriptionText: nil,
                                        captions: [], captionLanguageCode: nil)
            if let staleURL = composerState.applyEditedVideo(attachmentId: id, result: rendu) {
                try? FileManager.default.removeItem(at: staleURL)
            }
            closeSceneRetouche()
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

    func closeSceneRetouche() {
        closePendingImageRetouche()
        scrollState.videoToEdit = nil
    }
}
